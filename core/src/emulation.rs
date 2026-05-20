use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use iced_x86::{Decoder, DecoderOptions, Instruction, Register, Mnemonic, OpKind};
use crate::utils::parse_hex;
use crate::types::*;


fn get_reg_val(regs: &HashMap<String, u64>, reg: Register) -> u64 {
    match reg {
        Register::RAX => *regs.get("RAX").unwrap_or(&0),
        Register::EAX => (*regs.get("RAX").unwrap_or(&0)) & 0xFFFFFFFF,
        Register::AX => (*regs.get("RAX").unwrap_or(&0)) & 0xFFFF,
        Register::AL => (*regs.get("RAX").unwrap_or(&0)) & 0xFF,
        Register::AH => ((*regs.get("RAX").unwrap_or(&0)) >> 8) & 0xFF,
        
        Register::RBX => *regs.get("RBX").unwrap_or(&0),
        Register::EBX => (*regs.get("RBX").unwrap_or(&0)) & 0xFFFFFFFF,
        Register::BX => (*regs.get("RBX").unwrap_or(&0)) & 0xFFFF,
        Register::BL => (*regs.get("RBX").unwrap_or(&0)) & 0xFF,
        Register::BH => ((*regs.get("RBX").unwrap_or(&0)) >> 8) & 0xFF,

        Register::RCX => *regs.get("RCX").unwrap_or(&0),
        Register::ECX => (*regs.get("RCX").unwrap_or(&0)) & 0xFFFFFFFF,
        Register::CX => (*regs.get("RCX").unwrap_or(&0)) & 0xFFFF,
        Register::CL => (*regs.get("RCX").unwrap_or(&0)) & 0xFF,
        Register::CH => ((*regs.get("RCX").unwrap_or(&0)) >> 8) & 0xFF,

        Register::RDX => *regs.get("RDX").unwrap_or(&0),
        Register::EDX => (*regs.get("RDX").unwrap_or(&0)) & 0xFFFFFFFF,
        Register::DX => (*regs.get("RDX").unwrap_or(&0)) & 0xFFFF,
        Register::DL => (*regs.get("RDX").unwrap_or(&0)) & 0xFF,
        Register::DH => ((*regs.get("RDX").unwrap_or(&0)) >> 8) & 0xFF,

        Register::RSI => *regs.get("RSI").unwrap_or(&0),
        Register::ESI => (*regs.get("RSI").unwrap_or(&0)) & 0xFFFFFFFF,
        Register::SI => (*regs.get("RSI").unwrap_or(&0)) & 0xFFFF,

        Register::RDI => *regs.get("RDI").unwrap_or(&0),
        Register::EDI => (*regs.get("RDI").unwrap_or(&0)) & 0xFFFFFFFF,
        Register::DI => (*regs.get("RDI").unwrap_or(&0)) & 0xFFFF,

        Register::RBP => *regs.get("RBP").unwrap_or(&0),
        Register::EBP => (*regs.get("RBP").unwrap_or(&0)) & 0xFFFFFFFF,

        Register::RSP => *regs.get("RSP").unwrap_or(&0),
        Register::ESP => (*regs.get("RSP").unwrap_or(&0)) & 0xFFFFFFFF,

        Register::RIP => *regs.get("RIP").unwrap_or(&0),
        Register::EIP => (*regs.get("RIP").unwrap_or(&0)) & 0xFFFFFFFF,

        _ => 0,
    }
}

fn set_reg_val(regs: &mut HashMap<String, u64>, reg: Register, val: u64) {
    match reg {
        Register::RAX => { regs.insert("RAX".to_string(), val); },
        Register::EAX => { regs.insert("RAX".to_string(), val & 0xFFFFFFFF); },
        Register::AX => {
            let current = regs.get("RAX").cloned().unwrap_or(0);
            regs.insert("RAX".to_string(), (current & !0xFFFF) | (val & 0xFFFF));
        },
        Register::AL => {
            let current = regs.get("RAX").cloned().unwrap_or(0);
            regs.insert("RAX".to_string(), (current & !0xFF) | (val & 0xFF));
        },

        Register::RBX => { regs.insert("RBX".to_string(), val); },
        Register::EBX => { regs.insert("RBX".to_string(), val & 0xFFFFFFFF); },
        Register::BX => {
            let current = regs.get("RBX").cloned().unwrap_or(0);
            regs.insert("RBX".to_string(), (current & !0xFFFF) | (val & 0xFFFF));
        },
        Register::BL => {
            let current = regs.get("RBX").cloned().unwrap_or(0);
            regs.insert("RBX".to_string(), (current & !0xFF) | (val & 0xFF));
        },

        Register::RCX => { regs.insert("RCX".to_string(), val); },
        Register::ECX => { regs.insert("RCX".to_string(), val & 0xFFFFFFFF); },
        Register::CX => {
            let current = regs.get("RCX").cloned().unwrap_or(0);
            regs.insert("RCX".to_string(), (current & !0xFFFF) | (val & 0xFFFF));
        },
        Register::CL => {
            let current = regs.get("RCX").cloned().unwrap_or(0);
            regs.insert("RCX".to_string(), (current & !0xFF) | (val & 0xFF));
        },

        Register::RDX => { regs.insert("RDX".to_string(), val); },
        Register::EDX => { regs.insert("RDX".to_string(), val & 0xFFFFFFFF); },
        Register::DX => {
            let current = regs.get("RDX").cloned().unwrap_or(0);
            regs.insert("RDX".to_string(), (current & !0xFFFF) | (val & 0xFFFF));
        },
        Register::DL => {
            let current = regs.get("RDX").cloned().unwrap_or(0);
            regs.insert("RDX".to_string(), (current & !0xFF) | (val & 0xFF));
        },

        Register::RSI => { regs.insert("RSI".to_string(), val); },
        Register::ESI => { regs.insert("RSI".to_string(), val & 0xFFFFFFFF); },
        Register::RDI => { regs.insert("RDI".to_string(), val); },
        Register::EDI => { regs.insert("RDI".to_string(), val & 0xFFFFFFFF); },
        Register::RBP => { regs.insert("RBP".to_string(), val); },
        Register::EBP => { regs.insert("RBP".to_string(), val & 0xFFFFFFFF); },
        Register::RSP => { regs.insert("RSP".to_string(), val); },
        Register::ESP => { regs.insert("RSP".to_string(), val & 0xFFFFFFFF); },
        Register::RIP => { regs.insert("RIP".to_string(), val); },
        Register::EIP => { regs.insert("RIP".to_string(), val & 0xFFFFFFFF); },
        _ => {}
    }
}

fn get_operand_value(
    regs: &HashMap<String, u64>,
    stack: &HashMap<u64, u64>,
    instr: &Instruction,
    op_idx: u32,
) -> u64 {
    let op_kind = instr.op_kind(op_idx);
    match op_kind {
        OpKind::Register => get_reg_val(regs, instr.op_register(op_idx)),
        OpKind::Immediate8 => instr.immediate8() as u64,
        OpKind::Immediate16 => instr.immediate16() as u64,
        OpKind::Immediate32 => instr.immediate32() as u64,
        OpKind::Immediate64 => instr.immediate64(),
        OpKind::Immediate8to16 => instr.immediate8to16() as u64,
        OpKind::Immediate8to32 => instr.immediate8to32() as u64,
        OpKind::Immediate8to64 => instr.immediate8to64() as u64,
        OpKind::Immediate32to64 => instr.immediate32to64() as u64,
        OpKind::Memory => {
            let base = instr.memory_base();
            let index = instr.memory_index();
            let scale = instr.memory_index_scale();
            let disp = instr.memory_displacement64();
            
            let base_val = if base != Register::None { get_reg_val(regs, base) } else { 0 };
            let index_val = if index != Register::None { get_reg_val(regs, index) } else { 0 };
            let addr = base_val.wrapping_add(index_val.wrapping_mul(scale as u64)).wrapping_add(disp);
            *stack.get(&addr).unwrap_or(&0)
        },
        _ => 0,
    }
}

fn set_operand_value(
    regs: &mut HashMap<String, u64>,
    stack: &mut HashMap<u64, u64>,
    instr: &Instruction,
    op_idx: u32,
    val: u64,
) {
    let op_kind = instr.op_kind(op_idx);
    match op_kind {
        OpKind::Register => {
            set_reg_val(regs, instr.op_register(op_idx), val);
        },
        OpKind::Memory => {
            let base = instr.memory_base();
            let index = instr.memory_index();
            let scale = instr.memory_index_scale();
            let disp = instr.memory_displacement64();
            
            let base_val = if base != Register::None { get_reg_val(regs, base) } else { 0 };
            let index_val = if index != Register::None { get_reg_val(regs, index) } else { 0 };
            let addr = base_val.wrapping_add(index_val.wrapping_mul(scale as u64)).wrapping_add(disp);
            stack.insert(addr, val);
        },
        _ => {}
    }
}

#[wasm_bindgen]
pub fn emulate_instruction_step(
    hex_input: &str,
    current_rip: u64,
    regs_val: JsValue,
    stack_val: JsValue,
    bits: u32,
) -> Result<JsValue, JsValue> {
    let bytes = parse_hex(hex_input).map_err(|e| JsValue::from_str(&e))?;
    let mut regs: HashMap<String, u64> = serde_wasm_bindgen::from_value(regs_val)
        .map_err(|_| JsValue::from_str("Invalid registers value"))?;
    
    // Parse stack
    let raw_stack: HashMap<String, u64> = serde_wasm_bindgen::from_value(stack_val)
        .map_err(|_| JsValue::from_str("Invalid stack value"))?;
    let mut stack: HashMap<u64, u64> = HashMap::new();
    for (k, v) in raw_stack {
        if let Ok(addr) = k.parse::<u64>() {
            stack.insert(addr, v);
        }
    }

    // Determine the base virtual address dynamically.
    // If current_rip is large (e.g., >= 0x1000), it's a PE/ELF binary, so we map instructions
    // starting at the base address. Otherwise it's 0 for raw shellcode.
    let base_ip = if current_rip >= 0x1000 {
        // Find base_ip by aligning current_rip down to 0x1000 boundary or use a heuristic.
        // PE text sections typically start at 0x1000, 0x1400, or 0x401000.
        // We will decode using Decoder::with_ip starting at base_ip.
        if current_rip >= 0x400000 {
            // High base PE
            if current_rip >= 0x140000000 {
                0x140000000 // PE32+ default base
            } else {
                0x400000 // PE32 default base
            }
        } else {
            // Low ELF base or specific PE section virtual address (like 0x1000)
            if current_rip >= 0x1400 {
                // If the user's entry point is 0x1400, the section base is likely 0x1000
                0x1000
            } else {
                0x1000
            }
        }
    } else {
        0x0
    };

    // Start Decoder with high-performance O(1) offset lookup
    let offset = if current_rip >= base_ip {
        (current_rip - base_ip) as usize
    } else {
        0
    };

    let mut found_instr = None;
    if offset < bytes.len() {
        let mut decoder = Decoder::with_ip(bits, &bytes[offset..], current_rip, DecoderOptions::NONE);
        if decoder.can_decode() {
            found_instr = Some(decoder.decode());
        }
    }

    if found_instr.is_none() {
        // Fallback: decode from start of section only if offset lookup failed
        let mut decoder = Decoder::with_ip(bits, &bytes, base_ip, DecoderOptions::NONE);
        while decoder.can_decode() {
            let current_ip = decoder.ip();
            let instr = decoder.decode();
            if current_ip == current_rip {
                found_instr = Some(instr);
                break;
            }
        }
    }

    let instr = match found_instr {
        Some(i) => i,
        None => {
            if current_rip == 0 {
                return Err(JsValue::from_str("Null pointer execution! The program attempted to jump to address 0x0 (likely due to an unresolved import, uninitialized function pointer, or corrupted stack return address)."));
            } else {
                return Err(JsValue::from_str(&format!("[Error] Execution crashed: No instruction found at address 0x{:X} (RIP is out of executable boundaries or pointing to unmapped memory).", current_rip)));
            }
        }
    };

    let mnem = instr.mnemonic();
    let mut log_msg = format!("0x{:X}: {}", current_rip, instr);
    let mut next_rip = current_rip + instr.len() as u64;

    // Fetch flags
    let mut zf = *regs.get("ZF").unwrap_or(&0);
    let mut sf = *regs.get("SF").unwrap_or(&0);
    let mut cf = *regs.get("CF").unwrap_or(&0);

    match mnem {
        Mnemonic::Mov => {
            let val = get_operand_value(&regs, &stack, &instr, 1);
            set_operand_value(&mut regs, &mut stack, &instr, 0, val);
            log_msg += &format!("  ; Set destination = 0x{:X}", val);
        }
        Mnemonic::Add => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let src_val = get_operand_value(&regs, &stack, &instr, 1);
            let res = dest_val.wrapping_add(src_val);
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            log_msg += &format!("  ; Result = 0x{:X}", res);
        }
        Mnemonic::Sub => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let src_val = get_operand_value(&regs, &stack, &instr, 1);
            let res = dest_val.wrapping_sub(src_val);
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            log_msg += &format!("  ; Result = 0x{:X}", res);
        }
        Mnemonic::Xor => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let src_val = get_operand_value(&regs, &stack, &instr, 1);
            let res = dest_val ^ src_val;
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            zf = if res == 0 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            log_msg += &format!("  ; Result = 0x{:X} (ZF={})", res, zf);
        }
        Mnemonic::And => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let src_val = get_operand_value(&regs, &stack, &instr, 1);
            let res = dest_val & src_val;
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            zf = if res == 0 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            log_msg += &format!("  ; Result = 0x{:X} (ZF={})", res, zf);
        }
        Mnemonic::Or => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let src_val = get_operand_value(&regs, &stack, &instr, 1);
            let res = dest_val | src_val;
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            zf = if res == 0 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            log_msg += &format!("  ; Result = 0x{:X} (ZF={})", res, zf);
        }
        Mnemonic::Inc => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let res = dest_val.wrapping_add(1);
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            zf = if res == 0 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            log_msg += &format!("  ; Result = 0x{:X} (ZF={})", res, zf);
        }
        Mnemonic::Dec => {
            let dest_val = get_operand_value(&regs, &stack, &instr, 0);
            let res = dest_val.wrapping_sub(1);
            set_operand_value(&mut regs, &mut stack, &instr, 0, res);
            zf = if res == 0 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            log_msg += &format!("  ; Result = 0x{:X} (ZF={})", res, zf);
        }
        Mnemonic::Push => {
            let val = get_operand_value(&regs, &stack, &instr, 0);
            let sp_reg = if bits == 64 { Register::RSP } else { Register::ESP };
            let current_sp = get_reg_val(&regs, sp_reg);
            let new_sp = current_sp.wrapping_sub(if bits == 64 { 8 } else { 4 });
            set_reg_val(&mut regs, sp_reg, new_sp);
            stack.insert(new_sp, val);
            log_msg += &format!("  ; Pushed 0x{:X} onto Stack", val);
        }
        Mnemonic::Pop => {
            let sp_reg = if bits == 64 { Register::RSP } else { Register::ESP };
            let current_sp = get_reg_val(&regs, sp_reg);
            let val = *stack.get(&current_sp).unwrap_or(&0);
            stack.remove(&current_sp);
            let new_sp = current_sp.wrapping_add(if bits == 64 { 8 } else { 4 });
            set_reg_val(&mut regs, sp_reg, new_sp);
            set_operand_value(&mut regs, &mut stack, &instr, 0, val);
            log_msg += &format!("  ; Popped 0x{:X} from Stack", val);
        }
        Mnemonic::Cmp => {
            let val1 = get_operand_value(&regs, &stack, &instr, 0);
            let val2 = get_operand_value(&regs, &stack, &instr, 1);
            zf = if val1 == val2 { 1 } else { 0 };
            sf = if val1 < val2 { 1 } else { 0 };
            cf = if val1 < val2 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            regs.insert("SF".to_string(), sf);
            regs.insert("CF".to_string(), cf);
            log_msg += &format!("  ; Compare: 0x{:X} vs 0x{:X} (ZF={}, SF={}, CF={})", val1, val2, zf, sf, cf);
        }
        Mnemonic::Test => {
            let val1 = get_operand_value(&regs, &stack, &instr, 0);
            let val2 = get_operand_value(&regs, &stack, &instr, 1);
            let res = val1 & val2;
            zf = if res == 0 { 1 } else { 0 };
            sf = if (res as i64) < 0 { 1 } else { 0 };
            regs.insert("ZF".to_string(), zf);
            regs.insert("SF".to_string(), sf);
            log_msg += &format!("  ; Test: 0x{:X} & 0x{:X} = 0x{:X} (ZF={})", val1, val2, res, zf);
        }
        Mnemonic::Jmp => {
            let target = instr.near_branch_target();
            if target < 0x1000 {
                // Indirect jump (e.g. jmp qword ptr [1D6C10h] or jmp rax)
                if instr.op0_kind() == iced_x86::OpKind::Memory {
                    let mem_addr = instr.memory_displacement64();
                    let ptr_val = get_operand_value(&regs, &stack, &instr, 0);
                    if ptr_val < 0x1000 {
                        next_rip = current_rip + instr.len() as u64;
                        log_msg += &format!("  ; [Mocked Import Jump] Bypassing unresolved external IAT jump at 0x{:X}", mem_addr);
                    } else {
                        next_rip = ptr_val;
                        log_msg += &format!("  ; Jumped to indirect pointer 0x{:X}", ptr_val);
                    }
                } else {
                    let reg_val = get_operand_value(&regs, &stack, &instr, 0);
                    if reg_val < 0x1000 {
                        next_rip = current_rip + instr.len() as u64;
                        log_msg += &format!("  ; [Mocked Jump] Bypassing unresolved/mock register jump (target: 0x{:X})", reg_val);
                    } else {
                        next_rip = reg_val;
                        log_msg += &format!("  ; Jumped to register 0x{:X}", reg_val);
                    }
                }
            } else {
                next_rip = target;
                log_msg += &format!("  ; Jumped to 0x{:X}", target);
            }
        }
        Mnemonic::Je => {
            let target = instr.near_branch_target();
            if zf == 1 {
                next_rip = target;
                log_msg += &format!("  ; Branch Taken: Jumped to 0x{:X}", target);
            } else {
                log_msg += "  ; Branch Not Taken";
            }
        }
        Mnemonic::Jne => {
            let target = instr.near_branch_target();
            if zf == 0 {
                next_rip = target;
                log_msg += &format!("  ; Branch Taken: Jumped to 0x{:X}", target);
            } else {
                log_msg += "  ; Branch Not Taken";
            }
        }
        Mnemonic::Jg => {
            let target = instr.near_branch_target();
            if zf == 0 && sf == 0 {
                next_rip = target;
                log_msg += &format!("  ; Branch Taken: Jumped to 0x{:X}", target);
            } else {
                log_msg += "  ; Branch Not Taken";
            }
        }
        Mnemonic::Jl => {
            let target = instr.near_branch_target();
            if sf == 1 {
                next_rip = target;
                log_msg += &format!("  ; Branch Taken: Jumped to 0x{:X}", target);
            } else {
                log_msg += "  ; Branch Not Taken";
            }
        }
        Mnemonic::Ja => {
            let target = instr.near_branch_target();
            if cf == 0 && zf == 0 {
                next_rip = target;
                log_msg += &format!("  ; Branch Taken: Jumped to 0x{:X}", target);
            } else {
                log_msg += "  ; Branch Not Taken";
            }
        }
        Mnemonic::Jb => {
            let target = instr.near_branch_target();
            if cf == 1 {
                next_rip = target;
                log_msg += &format!("  ; Branch Taken: Jumped to 0x{:X}", target);
            } else {
                log_msg += "  ; Branch Not Taken";
            }
        }
        Mnemonic::Call => {
            let target = instr.near_branch_target();
            if target < 0x1000 {
                // Indirect call (e.g. call qword ptr [1D6C10h] or call rax)
                let ptr_val = get_operand_value(&regs, &stack, &instr, 0);
                if ptr_val < 0x1000 {
                    next_rip = current_rip + instr.len() as u64;
                    // Set RAX/EAX to 1 (Windows API success code)
                    regs.insert("RAX".to_string(), 1);
                    regs.insert("EAX".to_string(), 1);
                    
                    let mem_addr = if instr.op0_kind() == iced_x86::OpKind::Memory {
                        instr.memory_displacement64()
                    } else {
                        0
                    };
                    if mem_addr != 0 {
                        log_msg += &format!("  ; [Mocked Import Call] Bypassing unresolved external API at 0x{:X} (Simulated return RAX = 1)", mem_addr);
                    } else {
                        log_msg += &format!("  ; [Mocked Register Call] Bypassing unresolved indirect call to 0x{:X} (Simulated return RAX = 1)", ptr_val);
                    }
                } else {
                    let sp_reg = if bits == 64 { Register::RSP } else { Register::ESP };
                    let current_sp = get_reg_val(&regs, sp_reg);
                    let new_sp = current_sp.wrapping_sub(if bits == 64 { 8 } else { 4 });
                    set_reg_val(&mut regs, sp_reg, new_sp);
                    stack.insert(new_sp, current_rip + instr.len() as u64);
                    next_rip = ptr_val;
                    log_msg += &format!("  ; Call indirect: Pushed Return Address 0x{:X}, Jumped to 0x{:X}", current_rip + instr.len() as u64, ptr_val);
                }
            } else {
                let sp_reg = if bits == 64 { Register::RSP } else { Register::ESP };
                let current_sp = get_reg_val(&regs, sp_reg);
                let new_sp = current_sp.wrapping_sub(if bits == 64 { 8 } else { 4 });
                set_reg_val(&mut regs, sp_reg, new_sp);
                stack.insert(new_sp, current_rip + instr.len() as u64);
                next_rip = target;
                log_msg += &format!("  ; Call: Pushed Return Address 0x{:X}, Jumped to 0x{:X}", current_rip + instr.len() as u64, target);
            }
        }
        Mnemonic::Ret => {
            let sp_reg = if bits == 64 { Register::RSP } else { Register::ESP };
            let current_sp = get_reg_val(&regs, sp_reg);
            let ret_addr = *stack.get(&current_sp).unwrap_or(&0);
            stack.remove(&current_sp);
            let new_sp = current_sp.wrapping_add(if bits == 64 { 8 } else { 4 });
            set_reg_val(&mut regs, sp_reg, new_sp);
            next_rip = ret_addr;
            log_msg += &format!("  ; Ret: Returned to 0x{:X}", ret_addr);
        }
        _ => {
            log_msg += "  ; Simulating fallthrough step";
        }
    }

    // Set updated RIP/EIP in register state
    let rip_reg = if bits == 64 { Register::RIP } else { Register::EIP };
    set_reg_val(&mut regs, rip_reg, next_rip);

    // Convert stack to string keys for JSON serialization
    let mut string_stack = HashMap::new();
    for (k, v) in stack {
        string_stack.insert(k.to_string(), v);
    }

    let result = EmulationStepResult {
        regs,
        stack: string_stack,
        log: log_msg,
        next_rip,
    };

    Ok(serde_wasm_bindgen::to_value(&result)?)
}

