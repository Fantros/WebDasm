use iced_x86::{Decoder, Formatter, IntelFormatter};
use crate::types::*;
use crate::decompiler::*;

#[derive(Clone)]
#[allow(dead_code)]
struct Arm64Instruction {
    ip: u64,
    bytes: [u8; 4],
    mnemonic: String,
    op0: String,
    op1: String,
    target: u64,
}

fn decode_arm64(bytes: &[u8], base_ip: u64) -> Vec<Arm64Instruction> {
    let mut instrs = Vec::new();
    let mut offset = 0;
    while offset + 4 <= bytes.len() {
        let ip = base_ip + offset as u64;
        let b = [
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ];
        
        let val = u32::from_le_bytes(b);
        
        #[allow(unused_assignments)]
        let mut mnem = "unknown".to_string();
        let mut op0 = String::new();
        let mut op1 = String::new();
        let mut target = 0u64;

        if val == 0xd65f03c0 {
            mnem = "ret".to_string();
        } else if val == 0xd503201f {
            mnem = "nop".to_string();
        } else if (val & 0xfc000000) == 0x14000000 {
            mnem = "b".to_string();
            let imm26 = val & 0x03ffffff;
            let signed_imm = if (imm26 & 0x02000000) != 0 {
                (imm26 | 0xfc000000) as i32
            } else {
                imm26 as i32
            };
            let byte_offset = (signed_imm * 4) as i64;
            let dest = (ip as i64).wrapping_add(byte_offset) as u64;
            op0 = format!("0x{:X}", dest);
            target = dest;
        } else if (val & 0xfc000000) == 0x94000000 {
            mnem = "bl".to_string();
            let imm26 = val & 0x03ffffff;
            let signed_imm = if (imm26 & 0x02000000) != 0 {
                (imm26 | 0xfc000000) as i32
            } else {
                imm26 as i32
            };
            let byte_offset = (signed_imm * 4) as i64;
            let dest = (ip as i64).wrapping_add(byte_offset) as u64;
            op0 = format!("0x{:X}", dest);
            target = dest;
        } else if (val & 0xff000000) == 0x34000000 || (val & 0xff000000) == 0xb4000000 {
            let is_64 = (val & 0x80000000) != 0;
            mnem = "cbz".to_string();
            let rt = val & 0x1f;
            let imm19 = (val >> 5) & 0x7ffff;
            let signed_imm = if (imm19 & 0x40000) != 0 {
                (imm19 | 0xfff80000) as i32
            } else {
                imm19 as i32
            };
            let byte_offset = (signed_imm * 4) as i64;
            let dest = (ip as i64).wrapping_add(byte_offset) as u64;
            let reg_prefix = if is_64 { "x" } else { "w" };
            op0 = format!("{}{}", reg_prefix, rt);
            op1 = format!("0x{:X}", dest);
            target = dest;
        } else if (val & 0xff000000) == 0x35000000 || (val & 0xff000000) == 0xb5000000 {
            let is_64 = (val & 0x80000000) != 0;
            mnem = "cbnz".to_string();
            let rt = val & 0x1f;
            let imm19 = (val >> 5) & 0x7ffff;
            let signed_imm = if (imm19 & 0x40000) != 0 {
                (imm19 | 0xfff80000) as i32
            } else {
                imm19 as i32
            };
            let byte_offset = (signed_imm * 4) as i64;
            let dest = (ip as i64).wrapping_add(byte_offset) as u64;
            let reg_prefix = if is_64 { "x" } else { "w" };
            op0 = format!("{}{}", reg_prefix, rt);
            op1 = format!("0x{:X}", dest);
            target = dest;
        } else if (val & 0xff000000) == 0x11000000 || (val & 0xff000000) == 0x91000000 {
            let is_64 = (val & 0x80000000) != 0;
            mnem = "add".to_string();
            let rd = val & 0x1f;
            let rn = (val >> 5) & 0x1f;
            let imm12 = (val >> 10) & 0xfff;
            let reg_prefix = if is_64 { "x" } else { "w" };
            op0 = format!("{}{}", reg_prefix, rd);
            op1 = format!("{}{}, #{}", reg_prefix, rn, imm12);
        } else if (val & 0xff000000) == 0x51000000 || (val & 0xff000000) == 0xd1000000 {
            let is_64 = (val & 0x80000000) != 0;
            mnem = "sub".to_string();
            let rd = val & 0x1f;
            let rn = (val >> 5) & 0x1f;
            let imm12 = (val >> 10) & 0xfff;
            let reg_prefix = if is_64 { "x" } else { "w" };
            op0 = format!("{}{}", reg_prefix, rd);
            op1 = format!("{}{}, #{}", reg_prefix, rn, imm12);
        } else if (val & 0xff800000) == 0x52800000 || (val & 0xff800000) == 0xd2800000 {
            let is_64 = (val & 0x80000000) != 0;
            mnem = "mov".to_string();
            let rd = val & 0x1f;
            let imm16 = (val >> 5) & 0xffff;
            let reg_prefix = if is_64 { "x" } else { "w" };
            op0 = format!("{}{}", reg_prefix, rd);
            op1 = format!("#{}", imm16);
        } else if (val & 0x3f000000) == 0x28000000 {
            let is_store = (val & 0x40000000) == 0;
            mnem = if is_store { "stp".to_string() } else { "ldp".to_string() };
            let rt = val & 0x1f;
            let rt2 = (val >> 10) & 0x1f;
            let rn = (val >> 5) & 0x1f;
            op0 = format!("x{}, x{}", rt, rt2);
            op1 = format!("[x{}]", rn);
        } else if (val & 0x3b000000) == 0x39000000 {
            let is_store = (val & 0x00400000) == 0;
            mnem = if is_store { "str".to_string() } else { "ldr".to_string() };
            let rt = val & 0x1f;
            let rn = (val >> 5) & 0x1f;
            op0 = format!("x{}", rt);
            op1 = format!("[x{}]", rn);
        } else {
            mnem = "word".to_string();
            op0 = format!("0x{:08X}", val);
        }

        instrs.push(Arm64Instruction {
            ip,
            bytes: b,
            mnemonic: mnem,
            op0,
            op1,
            target,
        });

        offset += 4;
    }
    instrs
}

pub fn disassemble_and_cfg(bytes: &[u8], bits: u32, base_ip: u64) -> (Vec<String>, Vec<String>, Vec<Xref>, CfgGraph) {
    let mut instructions = Vec::new();
    let mut pseudo_c = Vec::new();
    
    let mut cfg = CfgGraph {
        nodes: Vec::new(),
        edges: Vec::new(),
    };

    let mut xrefs = std::collections::HashMap::new();
    let mut prev_ip = None;



    if bits == 128 {
        // ARM64 Decoding and Analysis Pipeline
        let arm_instrs = decode_arm64(bytes, base_ip);
        
        for instr in &arm_instrs {
            let op_str = if instr.op1.is_empty() {
                instr.op0.clone()
            } else {
                format!("{}, {}", instr.op0, instr.op1)
            };
            let output = format!("{:<6} {}", instr.mnemonic, op_str);
            let mut resolved = String::new();
            
            let ip_offset = instr.ip as usize;
            if ip_offset < bytes.len() {
                if let Some(flirt_name) = match_flirt(&bytes[ip_offset..]) {
                    resolved = format!(" ; FLIRT matched: {}", flirt_name);
                }
            }

            let line = format!("{:08X} | {}{}", instr.ip, output, resolved);
            instructions.push(line);
            
            let is_branch = instr.mnemonic == "b" || 
                            instr.mnemonic == "cbz" || instr.mnemonic == "cbnz";
            
            let target = instr.target;

            let node_id = format!("{:X}", instr.ip);
            cfg.nodes.push(CfgNode {
                id: node_id.clone(),
                label: format!("{}\n{}", node_id, output),
            });

            if let Some(prev) = prev_ip {
                cfg.edges.push(CfgEdge {
                    source: prev,
                    target: node_id.clone(),
                    label: "".to_string(),
                });
            }

            if is_branch && target != 0 {
                let target_hex = format!("{:X}", target);
                cfg.edges.push(CfgEdge {
                    source: node_id.clone(),
                    target: target_hex.clone(),
                    label: "branch".to_string(),
                });
            }

            if instr.mnemonic == "b" || instr.mnemonic == "ret" {
                prev_ip = None;
            } else {
                prev_ip = Some(node_id);
            }

            if is_branch && target != 0 {
                let target_hex = format!("{:X}", target);
                xrefs.entry(target_hex).or_insert_with(Vec::new).push(format!("{:08X}", instr.ip));
            }
        }

        let mut ast = Vec::new();
        let mut reg_state = std::collections::HashMap::new();
        
        let mut i = 0;
        let len = arm_instrs.len();
        while i < len {
            let instr = &arm_instrs[i];
            let mnem = instr.mnemonic.as_str();
            
            match mnem {
                "mov" => {
                    let val = reg_state.get(&instr.op1).cloned().unwrap_or(instr.op1.clone());
                    if instr.op0.starts_with("x") || instr.op0.starts_with("w") {
                        reg_state.insert(instr.op0.clone(), val);
                    } else {
                        ast.push(AstNode::Assignment {
                            target: instr.op0.clone(),
                            expr: val,
                        });
                    }
                }
                "add" | "sub" => {
                    let op_char = if mnem == "add" { "+" } else { "-" };
                    let parts: Vec<&str> = instr.op1.split(',').map(|s| s.trim()).collect();
                    if parts.len() >= 2 {
                        let val1 = reg_state.get(parts[0]).cloned().unwrap_or(parts[0].to_string());
                        let val2 = parts[1].to_string();
                        let expr = format!("({} {} {})", val1, op_char, val2);
                        reg_state.insert(instr.op0.clone(), expr);
                    }
                }
                "bl" => {
                    let mut call_name = format!("sub_{:X}", instr.target);
                    let ip_offset = instr.target as usize;
                    if ip_offset < bytes.len() {
                        if let Some(flirt_name) = match_flirt(&bytes[ip_offset..]) {
                            call_name = flirt_name;
                        }
                    }
                    ast.push(AstNode::Call {
                        func: format!("{}()", call_name),
                    });
                }
                "ret" => {
                    let ret_val = reg_state.get("x0").or_else(|| reg_state.get("w0")).cloned();
                    ast.push(AstNode::Return { val: ret_val });
                }
                "cbz" | "cbnz" => {
                    let cond_op = if mnem == "cbz" { "==" } else { "!=" };
                    let cond = format!("{} {} 0", instr.op0, cond_op);
                    
                    let target = instr.target;
                    let mut body_instrs = Vec::new();
                    let mut next_i = i + 1;
                    while next_i < len && arm_instrs[next_i].ip < target {
                        body_instrs.push(arm_instrs[next_i].clone());
                        next_i += 1;
                    }
                    
                    let mut body_ast = Vec::new();
                    for binstr in &body_instrs {
                        if binstr.mnemonic == "mov" {
                            body_ast.push(AstNode::Assignment { target: binstr.op0.clone(), expr: binstr.op1.clone() });
                        } else if binstr.mnemonic == "bl" {
                            body_ast.push(AstNode::Call { func: format!("sub_{:X}()", binstr.target) });
                        }
                    }
                    ast.push(AstNode::If { cond, body: body_ast });
                    i = next_i - 1;
                }
                _ => {
                    let op_str = if instr.op1.is_empty() {
                        instr.op0.clone()
                    } else {
                        format!("{}, {}", instr.op0, instr.op1)
                    };
                    ast.push(AstNode::Comment(format!("{} {}", instr.mnemonic, op_str)));
                }
            }
            i += 1;
        }

        pseudo_c.push("void entry_point() {".to_string());
        for node in ast {
            for line in node.to_string(4).lines() {
                pseudo_c.push(line.to_string());
            }
        }
        pseudo_c.push("}".to_string());

        let mut xref_list = Vec::new();
        for (target, sources) in xrefs {
            xref_list.push(Xref { target, sources });
        }

        return (instructions, pseudo_c, xref_list, cfg);
    }

    let mut decoder = Decoder::with_ip(bits, bytes, base_ip, iced_x86::DecoderOptions::NONE);
    let mut formatter = IntelFormatter::new();
    
    let mut cfg = CfgGraph {
        nodes: Vec::new(),
        edges: Vec::new(),
    };

    let mut xrefs = std::collections::HashMap::new();
    let mut prev_ip = None;



    // Phase 1: Decode all instructions
    let mut decoded_instructions = Vec::new();
    while decoder.can_decode() {
        decoded_instructions.push(decoder.decode());
    }

    // Phase 2: Form disassembly view, CFG and XREFs
    for instr in &decoded_instructions {
        let mut output = String::new();
        formatter.format(instr, &mut output);
        
        let mut resolved = String::new();
        
        // Apply Micro-FLIRT signature matching
        let ip_offset = instr.ip() as usize;
        if ip_offset < bytes.len() {
            if let Some(flirt_name) = match_flirt(&bytes[ip_offset..]) {
                resolved = format!(" ; FLIRT matched: {}", flirt_name);
            }
        }

        if instr.mnemonic() == iced_x86::Mnemonic::Push && instr.op0_kind() == iced_x86::OpKind::Immediate32 {
            if let Some(api) = resolve_api_hash(instr.immediate32() as u32) {
                resolved = format!(" ; -> resolves to {}", api);
            }
        }

        let line = format!("{:08X} | {}{}", instr.ip(), output, resolved);
        instructions.push(line.clone());
        
        // Branching logic (Jump targets & XREFS)
        let is_branch = match instr.mnemonic() {
            iced_x86::Mnemonic::Je | iced_x86::Mnemonic::Jne | iced_x86::Mnemonic::Jmp | 
            iced_x86::Mnemonic::Jb | iced_x86::Mnemonic::Ja => true,
            _ => false
        };
        let target = instr.near_branch_target();

        let node_id = format!("{:X}", instr.ip());
        cfg.nodes.push(CfgNode {
            id: node_id.clone(),
            label: format!("{}\n{}", node_id, output),
        });

        // Add Edge from previous instruction (Sequential flow)
        if let Some(prev) = prev_ip {
            cfg.edges.push(CfgEdge {
                source: prev,
                target: node_id.clone(),
                label: "".to_string(),
            });
        }

        if is_branch && target != 0 {
            let target_hex = format!("{:X}", target);
            cfg.edges.push(CfgEdge {
                source: node_id.clone(),
                target: target_hex.clone(),
                label: "branch".to_string(),
            });
        }

        if instr.mnemonic() == iced_x86::Mnemonic::Jmp || instr.mnemonic() == iced_x86::Mnemonic::Ret {
            prev_ip = None; // Breaks sequential flow
        } else {
            prev_ip = Some(node_id);
        }

        // Add XREF globally (no limit!)
        if is_branch && target != 0 {
            let target_hex = format!("{:X}", target);
            xrefs.entry(target_hex).or_insert_with(Vec::new).push(format!("{:08X}", instr.ip()));
        }
        
        // Scan for memory operand data XREFs (variables, strings, pointers)
        for op_idx in 0..instr.op_count() {
            if instr.op_kind(op_idx) == iced_x86::OpKind::Memory {
                let displ = instr.memory_displacement64();
                if displ != 0 {
                    let target_hex = format!("{:X}", displ);
                    xrefs.entry(target_hex).or_insert_with(Vec::new).push(format!("{:08X}", instr.ip()));
                }
            }
        }
    }

    // Phase 3: Recursive AST Decompilation & Formatting
    let ast_nodes = decompile_ast(&decoded_instructions, bytes, &mut formatter);
    pseudo_c.push("void entry_point() {".to_string());
    for node in ast_nodes {
        for line in node.to_string(4).lines() {
            pseudo_c.push(line.to_string());
        }
    }
    pseudo_c.push("}".to_string());
    
    let mut xref_list = Vec::new();
    for (target, sources) in xrefs {
        xref_list.push(Xref { target, sources });
    }

    (instructions, pseudo_c, xref_list, cfg)
}

