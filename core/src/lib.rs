use wasm_bindgen::prelude::*;
use goblin::Object;

pub mod types;
pub mod utils;
pub mod decompiler;
pub mod disassembler;
pub mod heuristics;
pub mod emulation;

#[cfg(test)]
mod tests;

use types::*;
use utils::*;
use decompiler::*;
use disassembler::*;
use heuristics::*;

#[wasm_bindgen]
pub fn analyze_shellcode(hex_input: &str, bits: u32, base_ip: u64) -> Result<JsValue, JsValue> {
    let bytes = parse_hex(hex_input).map_err(|e| JsValue::from_str(&e))?;
    
    if bytes.is_empty() {
        return Err(JsValue::from_str("Empty or invalid hex string"));
    }

    let strings = extract_strings(&bytes, 4); // Standard minimum length of 4 for comprehensive string recovery
    let (disassembly, pseudo_c, xrefs, cfg) = disassemble_and_cfg(&bytes, bits, base_ip);
    let heuristics = check_heuristics(&bytes);

    let result = AnalysisResult {
        strings,
        disassembly,
        pseudo_c,
        xrefs,
        heuristics,
        cfg,
    };

    Ok(serde_wasm_bindgen::to_value(&result)?)
}

#[wasm_bindgen]
pub fn parse_executable_file(file_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let mut info = FileFormatInfo {
        is_executable: false,
        format: "Unknown/Raw Shellcode".to_string(),
        arch: "Unknown".to_string(),
        entry_point: 0,
        sections: vec![],
        text_section_hex: None,
        imports: vec![],
        exports: vec![],
        text_base_ip: 0,
    };
    
    match Object::parse(file_bytes) {
        Ok(Object::PE(pe)) => {
            info.is_executable = true;
            info.format = "PE (Windows)".to_string();
            let is_arm64 = pe.header.coff_header.machine == 0xAA64;
            info.arch = if is_arm64 {
                "arm64".to_string()
            } else if pe.is_64 {
                "x86_64".to_string()
            } else {
                "x86".to_string()
            };
            info.entry_point = pe.entry as u64;
            
            for import in &pe.imports {
                info.imports.push(format!("{}!{}", import.dll, import.name));
            }
            
            for export in &pe.exports {
                if let Some(name) = export.name {
                    info.exports.push(format!("0x{:X}: {}", export.rva, name));
                }
            }
            
            let mut text_section = None;
            for section in &pe.sections {
                let name = String::from_utf8_lossy(&section.name).trim_matches('\0').to_string();
                info.sections.push(name.clone());
                if name.to_lowercase() == ".text" || name.to_lowercase() == "code" {
                    text_section = Some(section.clone());
                }
            }
            if text_section.is_none() {
                for section in &pe.sections {
                    let start_rva = section.virtual_address as u64;
                    let size = section.virtual_size as u64;
                    if pe.entry as u64 >= start_rva && (pe.entry as u64) < start_rva + size {
                        text_section = Some(section.clone());
                        break;
                    }
                }
            }
            if text_section.is_none() {
                text_section = pe.sections.iter().find(|s| s.size_of_raw_data > 0).cloned();
            }

            if let Some(section) = text_section {
                info.text_base_ip = section.virtual_address as u64;
                let start = section.pointer_to_raw_data as usize;
                let size = section.size_of_raw_data as usize;
                if start + size <= file_bytes.len() {
                    let text_bytes = &file_bytes[start..start+size];
                    info.text_section_hex = Some(text_bytes.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" "));
                }
            }
        },
        Ok(Object::Elf(elf)) => {
            info.is_executable = true;
            info.format = "ELF (Linux)".to_string();
            let is_arm64 = elf.header.e_machine == 183;
            info.arch = if is_arm64 {
                "arm64".to_string()
            } else if elf.is_64 {
                "x86_64".to_string()
            } else {
                "x86".to_string()
            };
            info.entry_point = elf.entry;
            
            for import in elf.dynsyms.iter() {
                if let Some(name) = elf.dynstrtab.get_at(import.st_name) {
                    if !name.is_empty() {
                        info.imports.push(name.to_string());
                    }
                }
            }
            
            let mut text_section = None;
            for section in &elf.section_headers {
                if let Some(name) = elf.shdr_strtab.get_at(section.sh_name) {
                    let name_str = name.to_string();
                    info.sections.push(name_str.clone());
                    if name_str.to_lowercase() == ".text" || name_str.to_lowercase() == "code" {
                        text_section = Some(section.clone());
                    }
                }
            }
            if text_section.is_none() {
                for section in &elf.section_headers {
                    let start_addr = section.sh_addr;
                    let size = section.sh_size;
                    if elf.entry >= start_addr && elf.entry < start_addr + size {
                        text_section = Some(section.clone());
                        break;
                    }
                }
            }
            if text_section.is_none() {
                text_section = elf.section_headers.iter().find(|s| s.sh_size > 0).cloned();
            }

            if let Some(section) = text_section {
                info.text_base_ip = section.sh_addr;
                let start = section.sh_offset as usize;
                let size = section.sh_size as usize;
                if start + size <= file_bytes.len() {
                    let text_bytes = &file_bytes[start..start+size];
                    info.text_section_hex = Some(text_bytes.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" "));
                }
            }
        },
        Ok(Object::Mach(mach)) => {
            info.is_executable = true;
            info.format = "Mach-O (macOS)".to_string();
            match mach {
                goblin::mach::Mach::Binary(macho) => {
                    let is_arm64 = macho.header.cputype == goblin::mach::constants::cputype::CPU_TYPE_ARM64;
                    info.arch = if is_arm64 {
                        "arm64".to_string()
                    } else if macho.is_64 {
                        "x86_64".to_string()
                    } else {
                        "x86".to_string()
                    };
                    info.entry_point = macho.entry;
                    
                    let mut code_offset: Option<usize> = None;
                    let mut code_size: Option<usize> = None;

                    for segment in &macho.segments {
                        for section_res in segment {
                            if let Ok((section, _)) = section_res {
                                if let Ok(name) = section.name() {
                                    let name_str = name.to_string();
                                    info.sections.push(name_str.clone());
                                    if name_str == "__text" || name_str.to_lowercase() == "code" {
                                        code_offset = Some(section.offset as usize);
                                        code_size = Some(section.size as usize);
                                    }
                                }
                            }
                        }
                    }
                    if code_offset.is_none() {
                        for segment in &macho.segments {
                            for section_res in segment {
                                if let Ok((section, _)) = section_res {
                                    let start_addr = section.addr;
                                    let size = section.size;
                                    if macho.entry >= start_addr && macho.entry < start_addr + size {
                                        code_offset = Some(section.offset as usize);
                                        code_size = Some(section.size as usize);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if code_offset.is_none() {
                        for segment in &macho.segments {
                            for section_res in segment {
                                if let Ok((section, _)) = section_res {
                                    if section.size > 0 {
                                        code_offset = Some(section.offset as usize);
                                        code_size = Some(section.size as usize);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if let (Some(start), Some(size)) = (code_offset, code_size) {
                        if start + size <= file_bytes.len() {
                            let text_bytes = &file_bytes[start..start+size];
                            info.text_section_hex = Some(text_bytes.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" "));
                        }
                    }

                    if let Ok(imports) = macho.imports() {
                        for import in imports {
                            info.imports.push(import.name.to_string());
                        }
                    }

                    if let Ok(exports) = macho.exports() {
                        for export in exports {
                            info.exports.push(format!("0x{:X}: {}", export.offset, export.name));
                        }
                    }
                },
                goblin::mach::Mach::Fat(fat) => {
                    info.arch = "Universal / Fat".to_string();
                    let mut found_macho: Option<(goblin::mach::MachO, &[u8])> = None;
                    // Iterate through container architectures to find the x86_64 segment
                    if let Ok(arches) = fat.arches() {
                        for arch in &arches {
                            if arch.cputype == goblin::mach::constants::cputype::CPU_TYPE_X86_64 {
                                let start = arch.offset as usize;
                                let end = (arch.offset + arch.size) as usize;
                                if start < file_bytes.len() && end <= file_bytes.len() {
                                    let arch_bytes = &file_bytes[start..end];
                                    if let Ok(macho) = goblin::mach::MachO::parse(arch_bytes, 0) {
                                        found_macho = Some((macho, arch_bytes));
                                    }
                                }
                                break;
                            }
                        }
                    }

                    if let Some((macho, arch_bytes)) = found_macho {
                        info.arch = "Universal (x86_64 unpacked)".to_string();
                        info.entry_point = macho.entry;
                        
                        for segment in &macho.segments {
                            for section_res in segment {
                                if let Ok((section, _)) = section_res {
                                    if let Ok(name) = section.name() {
                                        let name_str = name.to_string();
                                        info.sections.push(name_str.clone());
                                        if name_str == "__text" {
                                            let start = section.offset as usize;
                                            let size = section.size as usize;
                                            if start + size <= arch_bytes.len() {
                                                let text_bytes = &arch_bytes[start..start+size];
                                                info.text_section_hex = Some(text_bytes.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" "));
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if let Ok(imports) = macho.imports() {
                            for import in imports {
                                info.imports.push(import.name.to_string());
                            }
                        }

                        if let Ok(exports) = macho.exports() {
                            for export in exports {
                                info.exports.push(format!("0x{:X}: {}", export.offset, export.name));
                            }
                        }
                    }
                }
            }
        },
        _ => {}
    }

    // Automatically guarantee that the main entry point is listed in exports (e.g. main/DllMain/_start)
    if info.entry_point != 0 {
        let entry_hex_prefix = format!("0x{:X}:", info.entry_point);
        let has_entry = info.exports.iter().any(|e| e.to_uppercase().starts_with(&entry_hex_prefix.to_uppercase()));
        if !has_entry {
            let name = if info.format.contains("PE") {
                if let Ok(Object::PE(pe)) = Object::parse(file_bytes) {
                    if pe.header.coff_header.characteristics & 0x2000 != 0 {
                        "DllMain"
                    } else {
                        "main"
                    }
                } else {
                    "main"
                }
            } else if info.format.contains("ELF") {
                "_start"
            } else {
                "main"
            };
            info.exports.push(format!("0x{:X}: {}", info.entry_point, name));
        }
    }

    Ok(serde_wasm_bindgen::to_value(&info)?)
}
#[wasm_bindgen]
pub fn register_flirt_signature(pattern_str: &str, name: &str) -> Result<bool, JsValue> {
    let mut pattern = Vec::new();
    // Parse space-separated or raw hex tokens like: 55 89 e5 ?? 83 ec ??
    let tokens = pattern_str.split_whitespace();
    for token in tokens {
        if token == "??" || token == "?" {
            pattern.push(None);
        } else {
            let byte = u8::from_str_radix(token, 16)
                .map_err(|_| JsValue::from_str("Invalid hex token in FLIRT signature"))?;
            pattern.push(Some(byte));
        }
    }
    if pattern.is_empty() {
        return Err(JsValue::from_str("Signature pattern cannot be empty"));
    }
    
    CUSTOM_SIGNATURES.with(|sigs| {
        sigs.borrow_mut().push(DynamicSignature {
            pattern,
            name: name.to_string(),
        });
    });
    
    Ok(true)
}

pub(crate) fn search_binary_pattern_internal(file_bytes: &[u8], pattern_str: &str) -> Result<Vec<u64>, String> {
    let mut pattern = Vec::new();
    let tokens = pattern_str.split_whitespace();
    for token in tokens {
        if token == "??" || token == "?" {
            pattern.push(None);
        } else {
            let byte = u8::from_str_radix(token, 16)
                .map_err(|_| "Invalid hex token in search pattern".to_string())?;
            pattern.push(Some(byte));
        }
    }
    if pattern.is_empty() {
        return Err("Search pattern cannot be empty".to_string());
    }

    let mut matches = Vec::new();
    let pat_len = pattern.len();
    if file_bytes.len() >= pat_len {
        for i in 0..=(file_bytes.len() - pat_len) {
            let mut matches_pattern = true;
            for j in 0..pat_len {
                if let Some(pat_byte) = pattern[j] {
                    if file_bytes[i + j] != pat_byte {
                        matches_pattern = false;
                        break;
                    }
                }
            }
            if matches_pattern {
                matches.push(i as u64);
                if matches.len() >= 100 { // Cap at 100 results for performance
                    break;
                }
            }
        }
    }

    Ok(matches)
}

#[wasm_bindgen]
pub fn search_binary_pattern(file_bytes: &[u8], pattern_str: &str) -> Result<JsValue, JsValue> {
    let matches = search_binary_pattern_internal(file_bytes, pattern_str)
        .map_err(|e| JsValue::from_str(&e))?;
    Ok(serde_wasm_bindgen::to_value(&matches)?)
}

