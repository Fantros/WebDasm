use std::cell::RefCell;
use iced_x86::{Formatter, IntelFormatter};

pub fn resolve_api_hash(hash: u32) -> Option<&'static str> {
    match hash {
        0x0726774C => Some("LoadLibraryA"),
        0xE553A458 => Some("VirtualAlloc"),
        0x0C35B9B0 => Some("VirtualProtect"),
        0x8A8E618A => Some("CreateThread"),
        0x16B3FE72 => Some("CreateProcessA"),
        0x56A2B5F0 => Some("ExitProcess"),
        0x0A2A1DE0 => Some("WriteProcessMemory"),
        0x7802F749 => Some("VirtualAllocEx"),
        0x5C808544 => Some("VirtualFree"),
        0x3C19E536 => Some("NtWriteVirtualMemory"),
        0xF1E2D4A1 => Some("NtAllocateVirtualMemory"),
        0x4B3A8B3C => Some("NtProtectVirtualMemory"),
        0x03CA8B25 => Some("NtResumeThread"),
        0x906E5EB =>  Some("NtDelayExecution"),
        _ => None
    }
}


pub struct DynamicSignature {
    pub pattern: Vec<Option<u8>>,
    pub name: String,
}

thread_local! {
    pub static CUSTOM_SIGNATURES: RefCell<Vec<DynamicSignature>> = RefCell::new(Vec::new());
}

struct FlirtSignature {
    pattern: &'static [Option<u8>],
    name: &'static str,
}

// Micro-FLIRT signatures database with Option<u8> (None represents wildcard ??)
const FLIRT_SIGNATURES: &[FlirtSignature] = &[
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x83), Some(0xEC), None, Some(0x89), Some(0x7D), Some(0xFC)], 
        name: "sys_malloc" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x57), Some(0x56), Some(0x53), Some(0x83), Some(0xEC), None], 
        name: "sys_printf" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x8D), Some(0x45), Some(0x08), Some(0x50), Some(0xE8), None, None, None, None], 
        name: "sys_strcpy" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x57), Some(0x56), Some(0x8B), Some(0x7D), Some(0x08), Some(0x8B), Some(0x75), Some(0x0C)], 
        name: "sys_memcpy" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x8B), Some(0x4D), Some(0x0C), Some(0x8B), Some(0x45), Some(0x08)], 
        name: "sys_memset" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x8B), Some(0x4D), Some(0x08), Some(0x31), Some(0xC0), Some(0x80), Some(0x39), Some(0x00)], 
        name: "sys_strlen" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x56), Some(0x8B), Some(0x75), Some(0x08), Some(0x8B), Some(0x7D), Some(0x0C)], 
        name: "sys_strcmp" 
    },
    FlirtSignature { 
        pattern: &[Some(0x55), Some(0x89), Some(0xE5), Some(0x53), Some(0x8B), Some(0x5D), Some(0x08), Some(0x31), Some(0xC0)], 
        name: "sys_rc4_init" 
    },
    FlirtSignature { 
        pattern: &[Some(0x68), None, None, None, None, Some(0x64), Some(0xA1), Some(0x00), Some(0x00), Some(0x00), Some(0x00), Some(0x50)], 
        name: "win_seh_prologue" 
    },
    FlirtSignature { 
        pattern: &[Some(0x8B), Some(0xE5), Some(0x5D), Some(0xC3)], 
        name: "win_seh_epilogue" 
    },
    FlirtSignature { 
        pattern: &[Some(0x3B), Some(0x0D), None, None, None, None, Some(0x75), Some(0x02), Some(0xF3), Some(0xC3)], 
        name: "win_security_cookie" 
    },
    FlirtSignature { 
        pattern: &[Some(0x8B), Some(0x0D), None, None, None, None, Some(0x65), Some(0x33), Some(0x0C), Some(0x25), Some(0x14), Some(0x00), Some(0x00), Some(0x00)], 
        name: "gcc_stack_chk_fail" 
    },
    FlirtSignature { 
        pattern: &[Some(0x8B), Some(0xFF), Some(0x55), Some(0x89), Some(0xEC)], 
        name: "win_api_stub" 
    },
    FlirtSignature { 
        pattern: &[Some(0x90), Some(0x90), Some(0x55), Some(0x89), Some(0xE5), Some(0x5D), Some(0xC3)], 
        name: "sys_nop_pad" 
    },
];

pub fn match_flirt(bytes: &[u8]) -> Option<String> {
    // 1. Match custom user-imported signatures
    let matched_custom = CUSTOM_SIGNATURES.with(|sigs| {
        for sig in sigs.borrow().iter() {
            if bytes.len() >= sig.pattern.len() {
                let mut matches = true;
                for i in 0..sig.pattern.len() {
                    if let Some(expected) = sig.pattern[i] {
                        if bytes[i] != expected {
                            matches = false;
                            break;
                        }
                    }
                }
                if matches {
                    return Some(sig.name.clone());
                }
            }
        }
        None
    });

    if matched_custom.is_some() {
        return matched_custom;
    }

    // 2. Match built-in signatures
    for sig in FLIRT_SIGNATURES {
        if bytes.len() >= sig.pattern.len() {
            let mut matches = true;
            for i in 0..sig.pattern.len() {
                if let Some(expected) = sig.pattern[i] {
                    if bytes[i] != expected {
                        matches = false;
                        break;
                    }
                }
            }
            if matches {
                return Some(sig.name.to_string());
            }
        }
    }
    None
}

#[derive(Clone)]
#[allow(dead_code)]
pub enum AstNode {
    Assignment { target: String, expr: String },
    If { cond: String, body: Vec<AstNode> },
    While { cond: String, body: Vec<AstNode> },
    Call { func: String },
    Return { val: Option<String> },
    Comment(String),
}

impl AstNode {
    pub fn to_string(&self, indent: usize) -> String {
        let pad = " ".repeat(indent);
        match self {
            AstNode::Assignment { target, expr } => {
                format!("{}{} = {};", pad, target, expr)
            }
            AstNode::If { cond, body } => {
                let mut s = format!("{}if ({}) {{\n", pad, cond);
                for node in body {
                    s.push_str(&node.to_string(indent + 4));
                    s.push('\n');
                }
                s.push_str(&format!("{}}}", pad));
                s
            }
            AstNode::While { cond, body } => {
                let mut s = format!("{}while ({}) {{\n", pad, cond);
                for node in body {
                    s.push_str(&node.to_string(indent + 4));
                    s.push('\n');
                }
                s.push_str(&format!("{}}}", pad));
                s
            }
            AstNode::Call { func } => {
                format!("{}{};", pad, func)
            }
            AstNode::Return { val } => {
                if let Some(v) = val {
                    format!("{}return {};", pad, v)
                } else {
                    format!("{}return;", pad)
                }
            }
            AstNode::Comment(c) => {
                format!("{}// {}", pad, c)
            }
        }
    }
}

pub fn decompile_ast(
    instructions: &[iced_x86::Instruction],
    bytes: &[u8],
    formatter: &mut IntelFormatter,
) -> Vec<AstNode> {
    let mut ast = Vec::new();
    let mut reg_state: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    
    let is_register = |op: &str| -> bool {
        matches!(op, "eax" | "ebx" | "ecx" | "edx" | "rax" | "rbx" | "rcx" | "rdx" | "esi" | "edi" | "rsi" | "rdi")
    };

    let clean_op = |mut op: String| -> String {
        op = op.replace("ebp-", "var_")
               .replace("ebp+", "arg_")
               .replace("esp+", "var_")
               .replace("esp-", "var_")
               .replace("[", "")
               .replace("]", "")
               .replace("dword ptr ", "")
               .replace("word ptr ", "")
               .replace("byte ptr ", "")
               .replace("qword ptr ", "");
        op
    };

    let mut i = 0;
    let len = instructions.len();
    
    while i < len {
        let instr = &instructions[i];
        let mnem = instr.mnemonic();
        
        let mut op0 = String::new();
        let _ = formatter.format_operand(instr, &mut op0, 0);
        let mut op1 = String::new();
        let _ = formatter.format_operand(instr, &mut op1, 1);
        
        let op0_clean = clean_op(op0.clone());
        let op1_clean = clean_op(op1.clone());
        
        use iced_x86::Mnemonic::*;
        match mnem {
            Mov | Lea => {
                let val = reg_state.get(&op1_clean).cloned().unwrap_or(op1_clean.clone());
                if is_register(&op0_clean) {
                    reg_state.insert(op0_clean.clone(), val);
                } else {
                    ast.push(AstNode::Assignment {
                        target: op0_clean.clone(),
                        expr: val,
                    });
                }
            }
            Add => {
                let val1 = reg_state.get(&op0_clean).cloned().unwrap_or(op0_clean.clone());
                let val2 = reg_state.get(&op1_clean).cloned().unwrap_or(op1_clean.clone());
                let expr = format!("({} + {})", val1, val2);
                if is_register(&op0_clean) {
                    reg_state.insert(op0_clean.clone(), expr);
                } else {
                    ast.push(AstNode::Assignment {
                        target: op0_clean.clone(),
                        expr,
                    });
                }
            }
            Sub => {
                let val1 = reg_state.get(&op0_clean).cloned().unwrap_or(op0_clean.clone());
                let val2 = reg_state.get(&op1_clean).cloned().unwrap_or(op1_clean.clone());
                let expr = format!("({} - {})", val1, val2);
                if is_register(&op0_clean) {
                    reg_state.insert(op0_clean.clone(), expr);
                } else {
                    ast.push(AstNode::Assignment {
                        target: op0_clean.clone(),
                        expr,
                    });
                }
            }
            Xor => {
                if op0_clean == op1_clean {
                    reg_state.insert(op0_clean.clone(), "0".to_string());
                } else {
                    let val1 = reg_state.get(&op0_clean).cloned().unwrap_or(op0_clean.clone());
                    let val2 = reg_state.get(&op1_clean).cloned().unwrap_or(op1_clean.clone());
                    let expr = format!("({} ^ {})", val1, val2);
                    reg_state.insert(op0_clean.clone(), expr);
                }
            }
            Push => {
                let val = reg_state.get(&op0_clean).cloned().unwrap_or(op0_clean.clone());
                let mut resolved_comment = None;
                if instr.op0_kind() == iced_x86::OpKind::Immediate32 {
                    if let Some(api) = resolve_api_hash(instr.immediate32() as u32) {
                        resolved_comment = Some(format!("resolves to {}", api));
                    }
                }
                ast.push(AstNode::Call {
                    func: format!("push({})", val),
                });
                if let Some(comment) = resolved_comment {
                    ast.push(AstNode::Comment(comment));
                }
            }
            Pop => {
                ast.push(AstNode::Assignment {
                    target: op0_clean.clone(),
                    expr: "pop()".to_string(),
                });
            }
            Call => {
                let target = instr.near_branch_target();
                let mut call_name = format!("sub_{:X}", target);
                let ip_offset = target as usize;
                if ip_offset < bytes.len() {
                    if let Some(flirt_name) = match_flirt(&bytes[ip_offset..]) {
                        call_name = flirt_name;
                    }
                }
                ast.push(AstNode::Call {
                    func: format!("{}()", call_name),
                });
            }
            Ret => {
                let ret_val = reg_state.get("eax").or_else(|| reg_state.get("rax")).cloned();
                ast.push(AstNode::Return { val: ret_val });
            }
            Cmp => {
                let val1 = reg_state.get(&op0_clean).cloned().unwrap_or(op0_clean.clone());
                let val2 = reg_state.get(&op1_clean).cloned().unwrap_or(op1_clean.clone());
                reg_state.insert("last_cmp_0".to_string(), val1);
                reg_state.insert("last_cmp_1".to_string(), val2);
            }
            Je | Jne => {
                let cond_op = if mnem == Je { "==" } else { "!=" };
                let val0 = reg_state.get("last_cmp_0").cloned().unwrap_or("var_0".to_string());
                let val1 = reg_state.get("last_cmp_1").cloned().unwrap_or("0".to_string());
                let cond = format!("{} {} {}", val0, cond_op, val1);
                
                let target = instr.near_branch_target();
                let mut body_instrs = Vec::new();
                let mut next_i = i + 1;
                while next_i < len && instructions[next_i].ip() < target {
                    body_instrs.push(instructions[next_i].clone());
                    next_i += 1;
                }
                
                let body = decompile_ast(&body_instrs, bytes, formatter);
                ast.push(AstNode::If { cond, body });
                i = next_i - 1;
            }
            _ => {
                let mut out_str = String::new();
                formatter.format(instr, &mut out_str);
                ast.push(AstNode::Comment(out_str));
            }
        }
        i += 1;
    }
    ast
}

