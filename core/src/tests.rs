#[cfg(test)]
mod tests {
    #[test]
    fn test_parse_hex() {
        let hex = "55 89 e5 90";
        let parsed = crate::parse_hex(hex).unwrap();
        assert_eq!(parsed, vec![0x55, 0x89, 0xe5, 0x90]);

        // Test smart parser resilience (skips trailing odd-length token "9")
        let hex_partial = "55 89 e5 9";
        let parsed_partial = crate::parse_hex(hex_partial).unwrap();
        assert_eq!(parsed_partial, vec![0x55, 0x89, 0xe5]);

        // Test completely invalid input
        let hex_invalid = "XYZ";
        assert!(crate::parse_hex(hex_invalid).is_err());
    }


    #[test]
    fn test_extract_strings() {
        // Minimum length is 8
        let bytes = b"valid_string_value_goes_here\x00junk";
        let strings: Vec<String> = crate::extract_strings(bytes, 8);
        assert!(strings.contains(&"valid_string_value_goes_here".to_string()));
    }

    #[test]
    fn test_disassemble_32bit() {
        let bytes = vec![0x90, 0x55, 0x89, 0xE5, 0xC3]; // NOP, PUSH EBP, MOV EBP, ESP, RET
        let (disasm, pseudo, _xrefs, cfg): (Vec<String>, Vec<String>, Vec<crate::Xref>, crate::CfgGraph) = crate::disassemble_and_cfg(&bytes, 32, 0);
        assert!(disasm.len() >= 4);
        assert!(pseudo.len() >= 4);
        assert!(cfg.nodes.len() >= 4);
    }

    #[test]
    fn test_check_heuristics() {
        let bytes = vec![0x64, 0xA1, 0x30, 0x00, 0x00, 0x00]; // PEB access
        let results: Vec<String> = crate::check_heuristics(&bytes);
        assert!(results.iter().any(|r: &String| r.contains("PEB Access")));
    }

    #[test]
    fn test_data_xrefs() {
        // mov eax, [0x401000] in 32-bit: A1 00 10 40 00
        let bytes = vec![0xA1, 0x00, 0x10, 0x40, 0x00];
        let (_, _, xrefs, _): (Vec<String>, Vec<String>, Vec<crate::Xref>, crate::CfgGraph) = crate::disassemble_and_cfg(&bytes, 32, 0);
        assert!(!xrefs.is_empty());
        assert!(xrefs.iter().any(|x| x.target == "401000"));
    }

    #[test]
    fn test_search_binary_pattern() {
        let bytes = vec![0x90, 0x90, 0x55, 0x89, 0xE5, 0xC3];
        let matches = crate::search_binary_pattern_internal(&bytes, "55 ?? E5").unwrap();
        assert_eq!(matches, vec![2]);
    }

    #[test]
    fn test_disassemble_arm64() {
        // mov x0, #10 (0xd2800140), nop (0xd503201f), ret (0xd65f03c0)
        let bytes = vec![0x40, 0x01, 0x80, 0xd2, 0x1f, 0x20, 0x03, 0xd5, 0xc0, 0x03, 0x5f, 0xd6];
        let (disasm, pseudo, _xrefs, cfg): (Vec<String>, Vec<String>, Vec<crate::Xref>, crate::CfgGraph) = crate::disassemble_and_cfg(&bytes, 128, 0);
        
        assert_eq!(disasm.len(), 3);
        assert!(disasm[0].contains("mov"));
        assert!(disasm[1].contains("nop"));
        assert!(disasm[2].contains("ret"));
        
        assert!(pseudo.len() >= 3);
        // Assert copy propagation holds w0/x0 to return value!
        assert!(pseudo.iter().any(|line| line.contains("return #10;")));
        assert_eq!(cfg.nodes.len(), 3);
    }
}
