pub fn check_heuristics(bytes: &[u8]) -> Vec<String> {
    let mut results = Vec::new();
    let hex_str = bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>();
    
    if hex_str.contains("64a130000000") || hex_str.contains("648b0d30000000") || hex_str.contains("648b1d30000000") {
        results.push("PEB Access (fs:[0x30]) detected. Common in Windows shellcode to locate kernel32.dll.".to_string());
    }
    if hex_str.contains("65488b042560000000") || hex_str.contains("65488b142560000000") {
        results.push("PEB Access (gs:[0x60]) detected. (64-bit Windows)".to_string());
    }
    if hex_str.contains("0fa2") {
        results.push("CPUID instruction detected. Often used for VM evasion/Anti-sandbox.".to_string());
    }
    if hex_str.contains("0f31") {
        results.push("RDTSC instruction detected. Often used for timing analysis/Anti-debugging.".to_string());
    }
    if hex_str.contains("cd80") || hex_str.contains("0f05") {
        results.push("Syscall/Int 0x80 detected. Direct system calls used.".to_string());
    }
    
    let int3_count = bytes.iter().filter(|&&b| b == 0xcc).count();
    if int3_count > 5 {
        results.push(format!("Multiple INT3 (0xCC) padding/breakpoints detected ({} times).", int3_count));
    }

    if results.is_empty() {
        results.push("No obvious heuristics matched.".to_string());
    }
    
    results
}

