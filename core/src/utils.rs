pub fn parse_hex(hex_str: &str) -> Result<Vec<u8>, String> {
    let mut all_bytes = Vec::new();
    let lines = hex_str.lines();
    let mut parsed_with_pattern = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let words: Vec<&str> = trimmed.split_whitespace().collect();
        if words.is_empty() {
            continue;
        }

        let mut active_offset_bytes = Vec::new();
        let mut has_offset_on_line = false;

        for i in 0..words.len() {
            let word = words[i];
            let clean: String = word.chars()
                .filter(|&c| c != ':' && c != '-')
                .map(|c| c.to_ascii_uppercase())
                .collect();
            let w = clean.clone();

            // Check if this word is a valid offset candidate
            let mut is_offset = false;
            let is_hex_address = clean.chars().all(|c| c.is_ascii_hexdigit()) && clean.len() >= 4 && clean.len() <= 16;
            let is_prefix_offset = w.starts_with("0X") && clean.len() >= 4;

            if is_hex_address || is_prefix_offset {
                // Lookahead to see if it is followed by valid hex bytes
                let mut valid_hex_bytes_count = 0;
                let look_ahead_limit = std::cmp::min(words.len(), i + 5);
                for next_idx in i + 1..look_ahead_limit {
                    let next_word = words[next_idx].replace(':', "").replace('-', "").to_uppercase();
                    if !next_word.is_empty() && next_word.len() == 2 && next_word.chars().all(|c| c.is_ascii_hexdigit()) {
                        valid_hex_bytes_count += 1;
                    }
                }

                // If followed by hex bytes or it is the first word on a line with lookahead
                if valid_hex_bytes_count >= 2 || (i == 0 && valid_hex_bytes_count >= 1) {
                    is_offset = true;
                }
            }

            if is_offset {
                // Flush previous offset bytes
                if !active_offset_bytes.is_empty() {
                    all_bytes.extend(active_offset_bytes);
                    active_offset_bytes = Vec::new();
                }
                has_offset_on_line = true;
                parsed_with_pattern = true;
                continue;
            }

            if has_offset_on_line {
                if active_offset_bytes.len() >= 16 {
                    continue; // Skip ASCII representation or overflow tokens
                }

                if clean.len() == 2 && clean.chars().all(|c| c.is_ascii_hexdigit()) {
                    if let Ok(byte) = u8::from_str_radix(&clean, 16) {
                        active_offset_bytes.push(byte);
                    }
                } else if clean.len() > 2 && clean.len() % 2 == 0 && clean.len() <= 16 && clean.chars().all(|c| c.is_ascii_hexdigit()) {
                    for k in (0..clean.len()).step_by(2) {
                        if active_offset_bytes.len() < 16 {
                            if let Ok(byte) = u8::from_str_radix(&clean[k..k+2], 16) {
                                active_offset_bytes.push(byte);
                            }
                        }
                    }
                }
            }
        }

        if !active_offset_bytes.is_empty() {
            all_bytes.extend(active_offset_bytes);
        }
    }

    // Fallback: If no structured hex line matches were found, try matching any raw hex byte sequences
    if !parsed_with_pattern || all_bytes.is_empty() {
        let words = hex_str.trim().split_whitespace();
        for w in words {
            let clean = w.replace(':', "").replace('-', "");
            if clean.len() == 2 && clean.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(byte) = u8::from_str_radix(&clean, 16) {
                    all_bytes.push(byte);
                }
            } else if clean.len() > 2 && clean.len() % 2 == 0 && clean.chars().all(|c| c.is_ascii_hexdigit()) && !w.to_uppercase().starts_with("0X") {
                for i in (0..clean.len()).step_by(2) {
                    if let Ok(byte) = u8::from_str_radix(&clean[i..i+2], 16) {
                        all_bytes.push(byte);
                    }
                }
            }
        }
    }

    // Double fallback: character-by-character cleaning
    if all_bytes.is_empty() {
        let clean_hex: String = hex_str.chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect();
        if clean_hex.len() >= 2 {
            for i in (0..clean_hex.len() - 1).step_by(2) {
                if let Ok(byte) = u8::from_str_radix(&clean_hex[i..i+2], 16) {
                    all_bytes.push(byte);
                }
            }
        }
    }

    if all_bytes.is_empty() {
        return Err("No valid hex bytes could be parsed from the input.".to_string());
    }

    Ok(all_bytes)
}


pub fn is_valid_human_string(s: &str) -> bool {
    let junk_patterns = [
        "D$", "l$", "T$", "L$", "|$", "\\$",
        "A^A_]", "[_^", "ffff", "MZu", "u\"", "u!",
        "1fA;", "CCG", "H;A", "H9D", "H3D"
    ];
    
    for junk in junk_patterns.iter() {
        if s.contains(junk) {
            return false;
        }
    }
    
    // Whitelist alphanumeric characters and standard symbols used in IP addresses, URLs, and paths
    let valid_count = s.chars().filter(|c| {
        c.is_ascii_alphanumeric() || 
        *c == ' ' || *c == '_' || *c == '/' || *c == '\\' || 
        *c == '.' || *c == ':' || *c == '-' || *c == '%' || 
        *c == '?' || *c == '=' || *c == '&'
    }).count();
    
    let ratio = (valid_count as f64) / (s.len() as f64);
    
    if ratio < 0.50 {
        return false;
    }
    
    true
}

pub fn extract_strings(bytes: &[u8], min_len: usize) -> Vec<String> {
    let mut strings = Vec::new();
    let mut current_string = String::new();
    
    for &b in bytes {
        if b >= 0x20 && b <= 0x7E { // Printable ASCII range
            current_string.push(b as char);
        } else {
            if current_string.len() >= min_len {
                if is_valid_human_string(&current_string) {
                    strings.push(current_string.clone());
                }
            }
            current_string.clear();
        }
    }
    if current_string.len() >= min_len {
        if is_valid_human_string(&current_string) {
            strings.push(current_string);
        }
    }
    
    // Also remove duplicates and sort by length for better readability
    strings.sort();
    strings.dedup();
    
    strings
}


