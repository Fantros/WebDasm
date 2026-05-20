import { useEffect, useCallback, useRef } from 'react';
import { useApp } from '../store';
import type { AnalysisResult, FileFormatInfo, WddbDatabase } from '../types';
import WasmWorker from '../workers/wasm.worker?worker';

// Main-thread WASM module for synchronous tasks (like emulator)
let wasmModule: any = null;
let wasmLoaded = false;

// Worker for heavy asynchronous tasks (analyze, parse)
const worker = new WasmWorker();
let nextMsgId = 1;
const callbacks = new Map<number, {resolve: Function, reject: Function}>();

worker.onmessage = (e) => {
  const { id, type, result, error } = e.data;
  const cb = callbacks.get(id);
  if (cb) {
    callbacks.delete(id);
    if (type === 'SUCCESS') cb.resolve(result);
    else cb.reject(new Error(error));
  }
};

function runWorkerTask(type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextMsgId++;
    callbacks.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export function useWasm() {
  const { state, dispatch, addLog } = useApp();

  const hexInputRef = useRef(state.hexInput);
  hexInputRef.current = state.hexInput;

  // ── Load Synchronous WASM ──────────────────────────────────────────────
  useEffect(() => {
    async function loadWasm() {
      if (wasmLoaded) return;
      wasmLoaded = true;
      try {
        const mod = await import(/* @vite-ignore */ '../../core/pkg/webdasm.js');
        await mod.default();
        wasmModule = mod;
        
        (window as any).WebDasm_wasmRegister = (pattern: string, name: string) => {
          if (wasmModule) {
            return wasmModule.register_flirt_signature(pattern, name);
          }
          return false;
        };
        
        (window as any).WebDasm_emulateStep = (hex: string, rip: number, regs: any, stack: any, bits: number) => {
          if (wasmModule && wasmModule.emulate_instruction_step) {
            try {
              const cleanRegs: any = {};
              for (const k in regs) cleanRegs[k] = BigInt(regs[k] || 0);
              const cleanStack: any = {};
              for (const k in stack) cleanStack[k] = BigInt(stack[k] || 0);

              const stepRes = wasmModule.emulate_instruction_step(hex, BigInt(rip), cleanRegs, cleanStack, bits);
              if (stepRes) {
                const jsRegs: any = {};
                if (stepRes.regs instanceof Map) stepRes.regs.forEach((v: any, k: any) => jsRegs[k] = Number(v));
                else if (stepRes.regs) for (const k in stepRes.regs) jsRegs[k] = Number(stepRes.regs[k]);

                const jsStack: any = {};
                if (stepRes.stack instanceof Map) stepRes.stack.forEach((v: any, k: any) => jsStack[k] = Number(v));
                else if (stepRes.stack) for (const k in stepRes.stack) jsStack[k] = Number(stepRes.stack[k]);

                return { regs: jsRegs, stack: jsStack, log: stepRes.log, next_rip: Number(stepRes.next_rip) };
              }
            } catch (err) {
              console.error("Error in WebDasm_emulateStep WASM bridge:", err);
            }
          }
          return null;
        };
        dispatch({ type: 'SET_WASM_READY', payload: true });
        addLog('success', 'Synchronous WASM engine & Web Worker loaded successfully.');
      } catch (e) {
        wasmLoaded = false;
        addLog('error', `Failed to load WASM module: ${e}`);
        console.error(e);
      }
    }
    loadWasm();
  }, []);

  // ── Core analysis offloaded to Web Worker ──
  const analyzeHex = useCallback(async (hexInput: string, baseIpOverride?: number, archOverride?: string) => {
    const hex = hexInput.trim();
    if (!hex) {
      addLog('error', 'Input is empty. Paste hex bytes or open a file.');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      let bits = 32;
      const effectiveArch = archOverride !== undefined ? archOverride : state.fileArch;
      if (effectiveArch.toLowerCase().includes('arm64') || effectiveArch.includes('64')) {
        bits = 64;
      }
      const baseIp = baseIpOverride !== undefined ? baseIpOverride : state.fileBaseIp;
      
      const result: AnalysisResult = await runWorkerTask('ANALYZE', { hex, bits, baseIp });

      dispatch({
        type: 'SET_ANALYSIS_RESULT',
        payload: {
          currentStrings: result.strings,
          currentXrefs: result.xrefs || [],
          currentDisasm: result.disassembly,
          currentPseudoC: result.pseudo_c || [],
          heuristics: result.heuristics,
          cfgData: result.cfg,
        },
      });

      addLog('success', `Analysis complete in worker — ${result.disassembly.length} instructions`);
    } catch (e) {
      addLog('error', `Analysis failed: ${e}`);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.fileArch, state.fileBaseIp, dispatch, addLog]);

  const analyze = useCallback(() => {
    return analyzeHex(hexInputRef.current);
  }, [analyzeHex]);

  const handleFile = useCallback(async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    addLog('info', `Loading: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    if (file.name.toLowerCase().endsWith('.wddb')) {
      try {
        const text = await file.text();
        const db: WddbDatabase = JSON.parse(text);
        if (db.magic !== 'WDDB') throw new Error('Invalid WDDB signature.');
        dispatch({
          type: 'RESTORE_WDDB',
          payload: {
            globalBytes: new Uint8Array(db.bytes),
            renameMap: db.renameMap || {},
            commentMap: db.commentMap || {},
            typeMap: db.typeMap || {},
            currentStrings: db.currentStrings || [],
            currentImports: db.currentImports || [],
            currentExports: db.currentExports || [],
            currentSegments: db.currentSegments || [],
            currentXrefs: db.currentXrefs || [],
            currentDisasm: db.currentDisasm || [],
            currentPseudoC: db.currentPseudoC || [],
            fileType: db.fileType || 'WDDB',
            fileArch: db.fileArch || '-',
            fileEntry: db.fileEntry || '-',
            hexInput: db.hexInput || '',
            graphElements: db.graphElements || [],
          },
        });
        addLog('success', 'Restored .WDDB database successfully!');
      } catch (e) {
        addLog('error', `Failed to load WDDB: ${e}`);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    dispatch({ type: 'SET_GLOBAL_BYTES', payload: bytes });

    try {
      const info: FileFormatInfo = await runWorkerTask('PARSE_FILE', { bytes });
      let hexToAnalyze: string;

      if (info.is_executable && info.text_section_hex) {
        dispatch({
          type: 'SET_FILE_INFO',
          payload: {
            fileType: info.format,
            fileArch: info.arch,
            fileEntry: '0x' + info.entry_point.toString(16),
            fileBaseIp: info.text_base_ip,
          },
        });
        dispatch({
          type: 'SET_ANALYSIS_RESULT',
          payload: {
            currentImports: info.imports,
            currentExports: info.exports,
            currentSegments: info.sections,
          },
        });
        hexToAnalyze = info.text_section_hex;
        dispatch({ type: 'SET_HEX_INPUT', payload: hexToAnalyze });
        addLog('info', `Parsed ${info.format} (${info.arch}) — entry: 0x${info.entry_point.toString(16)}`);
      } else {
        const hexArr = new Array(bytes.length);
        const hexChars = '0123456789abcdef';
        for (let i = 0; i < bytes.length; i++) {
          const b = bytes[i];
          hexArr[i] = hexChars[b >> 4] + hexChars[b & 15];
        }
        hexToAnalyze = hexArr.join(' ');
        
        dispatch({ type: 'SET_HEX_INPUT', payload: hexToAnalyze });
        dispatch({
          type: 'SET_FILE_INFO',
          payload: { fileType: 'RAW SHELLCODE', fileArch: 'x86/x64', fileEntry: '0x0', fileBaseIp: 0 },
        });
        addLog('info', 'No known executable format detected — treating as raw shellcode.');
      }
      
      await analyzeHex(hexToAnalyze, info.text_base_ip || 0, info.arch || 'x86/x64');

    } catch (e) {
      addLog('error', `Worker Error: ${e}`);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [analyzeHex, dispatch, addLog]);

  const patchBytes = useCallback((addrStr: string, hexBytes: string) => {
    if (!wasmModule) return;
    const cleanAddr = addrStr.replace('0x', '').toUpperCase();
    const offset = parseInt(cleanAddr, 16);
    if (isNaN(offset)) return;

    const currentHexStr = state.hexInput.trim();
    if (!currentHexStr) return;

    let allBytes = currentHexStr.replace(/[^a-fA-F0-9]/g, '');
    let patchStr = hexBytes.replace(/[^a-fA-F0-9]/g, '');
    if (patchStr.length % 2 !== 0) patchStr = '0' + patchStr;

    const startIdx = offset * 2;
    if (startIdx >= allBytes.length) {
      addLog('error', `Patch offset out of bounds!`);
      return;
    }

    const newHex = allBytes.substring(0, startIdx) + patchStr + allBytes.substring(startIdx + patchStr.length);
    let formattedHex = '';
    for (let i = 0; i < newHex.length; i += 2) {
      formattedHex += newHex.substring(i, i + 2) + ' ';
    }

    dispatch({ type: 'SET_HEX_INPUT', payload: formattedHex.trim() });
    
    setTimeout(() => {
      analyze();
      addLog('success', `Patched bytes at 0x${cleanAddr}`);
    }, 100);
  }, [state.hexInput, dispatch, analyze, addLog]);

  const saveWddb = useCallback(() => {
    const db: WddbDatabase = {
      magic: 'WDDB',
      version: 2,
      fileType: state.fileType,
      fileArch: state.fileArch,
      fileEntry: state.fileEntry,
      bytes: Array.from(state.globalBytes || new Uint8Array()),
      renameMap: state.renameMap,
      commentMap: state.commentMap,
      typeMap: state.typeMap,
      currentStrings: state.currentStrings,
      currentImports: state.currentImports,
      currentExports: state.currentExports,
      currentSegments: state.currentSegments,
      currentXrefs: state.currentXrefs,
      currentDisasm: state.currentDisasm,
      currentPseudoC: state.currentPseudoC,
      hexInput: state.hexInput,
      graphElements: state.graphElements,
      bookmarks: state.bookmarks,
      overrides: state.overrides,
      structs: state.structs,
      structOverrides: state.structOverrides,
    };

    const json = JSON.stringify(db);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace_${Date.now()}.wddb`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('success', 'Exported .WDDB database.');
  }, [state, addLog]);

  const exportBin = useCallback(() => {
    if (!state.globalBytes || state.globalBytes.length === 0) {
      const cleanHex = state.hexInput.replace(/[^a-fA-F0-9]/g, '');
      if (!cleanHex) {
        addLog('error', 'No binary data to export.');
        return;
      }
      const bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
      }
      const blob = new Blob([bytes as any], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'patched_binary.bin';
      a.click();
      return;
    }

    const blob = new Blob([state.globalBytes as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exported_binary.bin`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('success', 'Exported modified binary.');
  }, [state.globalBytes, state.hexInput, addLog]);

  const searchPattern = useCallback((patternStr: string): number[] => {
    if (!wasmModule) return [];
    let bytes = state.globalBytes;
    if (!bytes || bytes.length === 0) {
      const cleanHex = state.hexInput.replace(/[^a-fA-F0-9]/g, '');
      if (!cleanHex) return [];
      bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
      }
    }
    try {
      const res = wasmModule.search_binary_pattern(bytes, patternStr);
      if (res) {
        return Array.isArray(res) ? res : Array.from(res);
      }
    } catch (e) {
      console.error("Error searching pattern in WASM:", e);
    }
    return [];
  }, [state.globalBytes, state.hexInput]);

  return { analyze, handleFile, saveWddb, exportBin, patchBytes, searchPattern };
}
