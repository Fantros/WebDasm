import { useState, useEffect, useRef } from 'react';
import { useApp } from '../store';
import { useWasm } from '../hooks/useWasm';
import Modal from './Modal';

interface ConsoleLog {
  type: 'info' | 'error' | 'success' | 'log';
  text: string;
  time: string;
}

const DEFAULT_SCRIPT = `// ── WebDasm JavaScript Scripting ──
// Use JavaScript to automate malware analysis, binary patching, and annotations!
//
// API Basics:
// - WebDasm.log("msg"): Print to console output
// - WebDasm.getByte("0x00"): Read a single byte
// - WebDasm.rename("0x00", "name"): Rename an address/symbol
// - WebDasm.comment("0x00", "text"): Add a comment at an address
//
// Click the "📖 Scripting Help" button above to view full API documentation!

WebDasm.log("WebDasm JavaScript Automation Engine Active!");
const disasm = WebDasm.getDisassembly();
WebDasm.log("Disassembled lines: " + disasm.length);
`;

export default function ScriptConsole() {
  const { state, dispatch } = useApp();
  const { patchBytes } = useWasm();
  const [script, setScript] = useState<string>(DEFAULT_SCRIPT);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [logs, setLogs] = useState<ConsoleLog[]>([
    { type: 'info', text: 'WebDasm JavaScript API Engine Initialized. Ready for automation.', time: new Date().toLocaleTimeString() }
  ]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const addConsoleLog = (type: ConsoleLog['type'], text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { type, text, time }]);
  };

  // Synchronize textarea scrolling with line number gutter
  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Compute number of lines in current script
  const lineCount = script.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  // Expose WebDasm API to window dynamically
  useEffect(() => {
    (window as any).WebDasm = {
      log: (msg: string) => {
        addConsoleLog('log', String(msg));
      },
      rename: (addr: string, name: string) => {
        dispatch({ type: 'SET_RENAME', payload: { addr: addr.replace('0x', '').toUpperCase(), name } });
      },
      comment: (addr: string, comment: string) => {
        dispatch({ type: 'SET_COMMENT', payload: { addr: addr.replace('0x', '').toUpperCase(), comment } });
      },
      bookmark: (addr: string) => {
        dispatch({ type: 'TOGGLE_BOOKMARK', payload: addr.replace('0x', '').toUpperCase() });
      },
      override: (addr: string, type: 'code' | 'data' | 'string' | 'undefined') => {
        dispatch({ type: 'SET_OVERRIDE', payload: { addr: addr.replace('0x', '').toUpperCase(), type } });
      },
      patchBytes: (addr: string, hexPatch: string) => {
        patchBytes(addr.replace('0x', '').toUpperCase(), hexPatch);
      },
      getByte: (addr: string) => {
        const offset = parseInt(addr.replace('0x', ''), 16);
        const globalBytes = stateRef.current.globalBytes;
        if (globalBytes && offset >= 0 && offset < globalBytes.length) {
          return globalBytes[offset];
        }
        return null;
      },
      getBytes: (addr: string, len: number) => {
        const offset = parseInt(addr.replace('0x', ''), 16);
        const globalBytes = stateRef.current.globalBytes;
        if (globalBytes && offset >= 0 && offset + len <= globalBytes.length) {
          return Array.from(globalBytes.slice(offset, offset + len));
        }
        return null;
      },
      getSymbol: (addr: string) => {
        const cleanAddr = addr.replace('0x', '').toUpperCase();
        return stateRef.current.renameMap[cleanAddr] || null;
      },
      getComment: (addr: string) => {
        const cleanAddr = addr.replace('0x', '').toUpperCase();
        return stateRef.current.commentMap[cleanAddr] || null;
      },
      getHeuristics: () => stateRef.current.heuristics,
      getEntropy: () => ({
        avg: stateRef.current.avgEntropy,
        scores: stateRef.current.entropyScores,
      }),
      getDisassembly: () => stateRef.current.currentDisasm,
      getPseudocode: () => stateRef.current.currentPseudoC,
      registerSignature: (pattern: string, name: string) => {
        if ((window as any).WebDasm_wasmRegister) {
          const success = (window as any).WebDasm_wasmRegister(pattern, name);
          if (success) {
            addConsoleLog('success', `FLIRT Pattern '${pattern}' registered as '${name}'`);
          } else {
            addConsoleLog('error', `Failed to register FLIRT Pattern '${pattern}'`);
          }
          return success;
        } else {
          addConsoleLog('error', 'WASM engine not ready yet.');
          return false;
        }
      }
    };

    return () => {
      delete (window as any).WebDasm;
    };
  }, [dispatch, patchBytes]);

  const runScript = () => {
    addConsoleLog('info', 'Executing sandbox automation...');
    try {
      const executor = new Function('log', 'WebDasm', script);
      executor(
        (msg: string) => addConsoleLog('log', String(msg)),
        (window as any).WebDasm
      );
      addConsoleLog('success', 'Script task finished successfully.');
    } catch (err: any) {
      addConsoleLog('error', `Script Runtime Exception: ${err.message}`);
    }
  };

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex-1 flex h-full bg-[var(--ida-bg)] overflow-hidden">
      {/* ── IDE Editor Panel (Left) ── */}
      <div className="flex-[1.2] flex flex-col border-r border-[var(--ida-border)]">
        {/* Editor Toolbar */}
        <div className="px-3 py-1.5 bg-[var(--ida-panel)] border-b border-[var(--ida-border)] flex justify-between items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--ida-yellow)] flex items-center gap-1">
              📝 JavaScript Editor
            </span>
            <button
              className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-2 py-0.5 text-[10px] cursor-pointer flex items-center gap-1 transition-colors duration-100"
              onClick={() => setIsHelpOpen(true)}
              title="Show WebDasm JavaScript API Documentation"
            >
              📖 Scripting Help
            </button>
          </div>
          <button
            className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-2 py-0.5 text-[10px] cursor-pointer flex items-center gap-1 transition-colors duration-100"
            onClick={runScript}
          >
            ▶ Run Script
          </button>
        </div>

        {/* Textarea with simulated Gutter */}
        <div className="flex flex-1 overflow-hidden bg-[var(--ida-bg)]">
          {/* Scrollable Line Numbers Gutter */}
          <div
            ref={gutterRef}
            className="w-10 overflow-hidden bg-[var(--ida-panel-2)] border-r border-[var(--ida-border)] flex flex-col py-4 select-none text-right"
          >
            {lineNumbers.map(ln => (
              <div
                key={ln}
                className="text-[11px] font-mono text-[var(--ida-text-dim)] pr-2 leading-[1.6] h-[17.6px]"
              >
                {ln}
              </div>
            ))}
          </div>

          {/* Interactive Textarea */}
          <textarea
            ref={textareaRef}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            className="flex-1 bg-transparent text-[var(--ida-text)] border-0 outline-none px-4 py-4 font-mono text-[11.5px] leading-[1.6] resize-none overflow-y-auto whitespace-pre tab-2"
          />
        </div>
      </div>

      {/* ── Cyberpunk Terminal Output Panel (Right) ── */}
      <div className="flex-1 flex flex-col bg-[var(--ida-bg)]">
        {/* Terminal Header */}
        <div className="px-3 py-1.5 bg-[var(--ida-panel)] border-b border-[var(--ida-border)] flex justify-between items-center shrink-0">
          <span className="text-[11px] font-bold text-[var(--ida-text-dim)] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#23C16B]" />
            WebDasm Engine shell output
          </span>
          <button
            className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-2 py-0.5 text-[10px] cursor-pointer transition-colors duration-100"
            onClick={() => setLogs([])}
          >
            Clear Terminal
          </button>
        </div>

        {/* Console Log Rows */}
        <div className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-[var(--ida-text-dim)] text-center mt-8">Shell feed is empty. Ready for execution.</div>
          ) : (
            logs.map((log, i) => {
              let borderColor = 'var(--ida-border)';
              let textGlow = 'var(--ida-text)';
              let badge = 'INFO';
              let badgeColor = 'var(--ida-accent)';

              if (log.type === 'error') {
                borderColor = 'var(--ida-error)';
                textGlow = 'var(--ida-error)';
                badge = 'FAIL';
                badgeColor = 'var(--ida-error)';
              } else if (log.type === 'success') {
                borderColor = 'var(--ida-success)';
                textGlow = 'var(--ida-success)';
                badge = 'DONE';
                badgeColor = 'var(--ida-success)';
              } else if (log.type === 'log') {
                borderColor = 'var(--ida-purple)';
                textGlow = 'var(--ida-purple)';
                badge = 'USER';
                badgeColor = 'var(--ida-purple)';
              }

              return (
                <div
                  key={i}
                  className="mb-1.5 p-1 bg-white/2 rounded-r flex flex-col gap-0.5"
                  style={{ borderLeft: `3px solid ${borderColor}` }}
                >
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-[var(--ida-text-dim)]">{log.time}</span>
                    <span 
                      className="px-1 rounded font-bold text-[9px] text-white"
                      style={{ background: badgeColor }}
                    >
                      {badge}
                    </span>
                  </div>
                  <div style={{ color: textGlow }} className="whitespace-pre-wrap break-all">{log.text}</div>
                </div>
              );
            })
          )}
          
          {/* Blinking dynamic prompt */}
          <div className="flex items-center gap-1.5 text-[var(--ida-accent)] mt-3">
            <span>webdasm@wasm-core:~$</span>
            <span className="inline-block w-1.5 h-3 bg-[var(--ida-accent)] animate-[blink_1s_step-end_infinite]" />
          </div>
          
          <div ref={consoleEndRef} />
        </div>
      </div>
      
      {/* Keyframe blinking style block */}
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>

      {/* ── WebDasm Scripting Help Modal Popup ── */}
      <Modal
        isOpen={isHelpOpen}
        title="WebDasm Scripting Help"
        onClose={() => setIsHelpOpen(false)}
      >
        <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
          <div className="text-[var(--ida-text-dim)] leading-relaxed mb-1">
            WebDasm scripting API allows automation directly inside the workstation console:
          </div>
          
          <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1 text-[11px] font-mono scrollbar-thin">
            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.log(<span className="text-[var(--ida-string)]">msg</span>)</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">output</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Prints a message directly to the execution console output.</div>
            </div>

            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.getByte(<span className="text-[var(--ida-string)]">addrStr</span>)</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">read</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Reads single byte at address string (e.g. <code className="text-[var(--ida-text-dim)]">"0x10"</code>).</div>
            </div>

            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.getBytes(<span className="text-[var(--ida-string)]">addrStr, len</span>)</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">read</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Reads an array of bytes starting from address.</div>
            </div>

            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.rename(<span className="text-[var(--ida-string)]">addrStr, name</span>)</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">write</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Renames function or variable symbol at address.</div>
            </div>

            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.comment(<span className="text-[var(--ida-string)]">addrStr, text</span>)</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">write</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Sets comment string on a disassembled line.</div>
            </div>

            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.patchBytes(<span className="text-[var(--ida-string)]">addrStr, hexStr</span>)</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">patch</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Hotpatches raw memory bytes at hex address.</div>
            </div>

            <div className="bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] p-2.5 rounded border border-[var(--ida-border)] hover:border-[var(--ida-yellow)]/50 transition-all duration-150 group">
              <div className="flex justify-between items-center">
                <code className="text-[var(--ida-yellow)] font-bold text-[11.5px] group-hover:text-white transition-colors duration-150">WebDasm.getDisassembly()</code>
                <span className="text-[9px] text-[var(--ida-text-dim)] bg-[var(--ida-panel-2)] px-1 py-0.5 rounded">read</span>
              </div>
              <div className="text-[var(--ida-text-dim)] text-[11px] mt-1.5 leading-relaxed">Returns array of current disassembly lines.</div>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text-dim)] hover:text-white border border-[var(--ida-border)] rounded-md transition-colors duration-100 cursor-pointer select-none text-[11px] font-mono leading-none"
              onClick={() => setIsHelpOpen(false)}
            >
              Close Documentation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
