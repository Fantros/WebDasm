import type { AnalysisResult, FileFormatInfo } from '../types';

let wasmModule: any = null;

// Initialize WASM inside the worker
async function initWasm() {
  if (wasmModule) return;
  // @ts-ignore - Vite worker import syntax for wasm
  const mod = await import('../../../core/pkg/webdasm.js');
  await mod.default();
  wasmModule = mod;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    await initWasm();

    if (type === 'ANALYZE') {
      const { hex, bits, baseIp } = payload;
      const result: AnalysisResult = wasmModule.analyze_shellcode(hex, bits, BigInt(baseIp));
      self.postMessage({ id, type: 'SUCCESS', result });
    } else if (type === 'PARSE_FILE') {
      const { bytes } = payload;
      const result: FileFormatInfo = wasmModule.parse_executable_file(bytes);
      self.postMessage({ id, type: 'SUCCESS', result });
    }
  } catch (error: any) {
    self.postMessage({ id, type: 'ERROR', error: error.message || String(error) });
  }
};
