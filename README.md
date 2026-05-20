# WebDasm

WebDasm is a client-side reverse engineering and binary analysis tool. It runs entirely in the browser using a Rust/WebAssembly analysis engine and a React frontend. Since there is no backend server, your binaries are never uploaded anywhere.

## Features

- **Disassembly:** x86/x64 disassembly powered by `iced-x86`.
- **Control Flow Graph (CFG):** Basic block detection and interactive CFG rendering via Cytoscape.js.
- **Binary Parsing:** Supports PE, ELF, Mach-O, and raw shellcode/hex strings.
- **x86 Emulator:** Instruction-level step-by-step emulation with register and stack tracking.
- **Decompiler:** Basic pseudo-C code generation from assembly.
- **Heuristics:** Detects common exploit patterns like PEB access (fs:[0x30]), CPUID/RDTSC usage, and INT3 padding.
- **Signatures:** FLIRT-style byte pattern matching.

## Architecture

The project is split into two parts:

- `core/`: The analysis engine written in Rust. Compiled to WebAssembly via `wasm-pack`.
- `web/`: The frontend UI built with React, Vite, and Tailwind CSS. Analysis runs inside a Web Worker to prevent UI blocking.

## Building and Running

You will need Node.js and Rust installed, along with `wasm-pack`.

1. **Build the WASM core:**
```bash
cd core
wasm-pack build --target web
```

2. **Run the React frontend:**
```bash
cd web
npm install
npm run dev
```
Then open `http://localhost:5173`.

## Shortcuts

- `N`: Rename symbol/address
- `;`: Add inline comment
- `F5`: Toggle Disassembly / Pseudocode
- `Ctrl+G`: Jump to address
- `Shift+Click`: Quick comment

## License

MIT
