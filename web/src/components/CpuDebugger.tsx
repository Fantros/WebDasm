import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../store';

interface RegisterState {
  [key: string]: number;
}

export default function CpuDebugger() {
  const { state, dispatch } = useApp();
  const [isPlaying, setIsPlaying] = useState(false);
  const [executionTrace, setExecutionTrace] = useState<string[]>([]);
  const [stackMem, setStackMem] = useState<Record<number, number>>({});
  const [playSpeed, setPlaySpeed] = useState(50); // 50ms default speed for fast, comfortable tracing
  const traceEndRef = useRef<HTMLDivElement>(null);

  // Detect architecture mode
  const isArm64 = state.fileArch.toLowerCase().includes('arm64');

  // Initialize registers and previous state to track real-time changes (x64dbg style)
  const [registers, setRegisters] = useState<RegisterState>({});
  const [prevRegisters, setPrevRegisters] = useState<RegisterState>({});

  // Sleek Panel-Level Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Global window listener to close context menu on standard clicks
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const resetDebugger = useCallback(() => {
    const initialRegs: RegisterState = {};
    if (isArm64) {
      // Initialize ARM64 Registers
      for (let i = 0; i <= 8; i++) initialRegs[`X${i}`] = 0;
      initialRegs['SP'] = 0x7FFFF000;
      initialRegs['PC'] = parseInt(state.fileEntry, 16) || 0;
      initialRegs['LR'] = 0;
    } else {
      // Initialize x86/x64 Registers
      const x86Regs = ['RAX', 'RBX', 'RCX', 'RDX', 'RSI', 'RDI', 'RBP', 'RSP', 'RIP'];
      x86Regs.forEach(r => {
        initialRegs[r] = r === 'RSP' ? 0x7FFFF000 : (r === 'RIP' ? (parseInt(state.fileEntry, 16) || 0) : 0);
      });
      initialRegs['CF'] = 0;
      initialRegs['ZF'] = 0;
      initialRegs['SF'] = 0;
    }
    setRegisters(initialRegs);
    setPrevRegisters({});
    setStackMem({});
    setExecutionTrace([`[System] Debugger initialized for ${isArm64 ? 'ARM64 (AArch64)' : 'x86/x64'} mode. Entry point: ${state.fileEntry}`]);
    setIsPlaying(false);
  }, [isArm64, state.fileEntry]);

  // Reset when architecture or entry point changes
  useEffect(() => {
    resetDebugger();
  }, [state.fileArch, state.fileEntry, resetDebugger]);

  // Pre-index disassembly list into an O(1) hash map for ultra-fast loop lookups
  const disassemblyMap = useMemo(() => {
    const map = new Map<number, { addr: number; asm: string }>();
    for (const line of state.currentDisasm) {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const addrHex = parts[0].trim();
        const addr = parseInt(addrHex, 16);
        if (!isNaN(addr)) {
          map.set(addr, {
            addr,
            asm: parts[1].trim(),
          });
        }
      }
    }
    return map;
  }, [state.currentDisasm]);

  // Find instruction by IP/PC address
  const getInstructionByAddress = useCallback((addr?: number) => {
    const pcVal = addr !== undefined ? addr : (registers[isArm64 ? 'PC' : 'RIP'] || 0);
    return disassemblyMap.get(pcVal) || null;
  }, [registers, disassemblyMap, isArm64]);

  // Keep compatibility alias
  const getInstructionAtPc = useCallback(() => getInstructionByAddress(), [getInstructionByAddress]);

  const stepInto = useCallback(() => {
    setPrevRegisters({ ...registers });
    const currentInstr = getInstructionAtPc();
    if (!currentInstr) {
      const pcVal = registers[isArm64 ? 'PC' : 'RIP'] || 0;
      if (pcVal === 0) {
        setExecutionTrace(prev => [...prev, `✨ Program finished execution successfully (Returned with ${isArm64 ? 'X0' : 'RAX'} = 0x${(registers[isArm64 ? 'X0' : 'RAX'] || 0).toString(16).toUpperCase()})`]);
        dispatch({ type: 'ADD_LOG', payload: { type: 'success', text: `✨ DLL/Binary execution completed successfully.`, timestamp: new Date() } });
      } else {
        setExecutionTrace(prev => [...prev, `[Error] No instruction found at address 0x${pcVal.toString(16).toUpperCase()}`]);
      }
      setIsPlaying(false);
      return;
    }

    const asm = currentInstr.asm.toLowerCase();
    const pcKey = isArm64 ? 'PC' : 'RIP';
    const spKey = isArm64 ? 'SP' : 'RSP';

    let nextRegs = { ...registers };
    let nextStack = { ...stackMem };
    let logMsg = `0x${currentInstr.addr.toString(16).toUpperCase()}: ${currentInstr.asm}`;

    // Simple Instruction Simulator Parser
    try {
      if (isArm64) {
        // --- ARM64 SIMULATION ---
        if (asm.startsWith('mov ')) {
          // e.g. "mov x0, #10"
          const tokens = asm.substring(4).split(',').map(s => s.trim());
          if (tokens.length === 2) {
            const dest = tokens[0].toUpperCase();
            const srcStr = tokens[1].replace('#', '');
            let srcVal = srcStr.startsWith('0x') ? parseInt(srcStr, 16) : parseInt(srcStr, 10);
            if (isNaN(srcVal) && nextRegs[tokens[1].toUpperCase()] !== undefined) {
              srcVal = nextRegs[tokens[1].toUpperCase()];
            }
            if (!isNaN(srcVal)) {
              nextRegs[dest] = srcVal;
              logMsg += `  ; ${dest} = ${srcVal}`;
            }
          }
          nextRegs[pcKey] += 4;
        } else if (asm.startsWith('add ')) {
          // e.g. "add x0, x0, #1" or "add x0, x1"
          const tokens = asm.substring(4).split(',').map(s => s.trim());
          if (tokens.length >= 2) {
            const dest = tokens[0].toUpperCase();
            const op1 = nextRegs[tokens[1].toUpperCase()] || 0;
            const op2Str = (tokens[2] || tokens[1]).replace('#', '');
            let op2 = op2Str.startsWith('0x') ? parseInt(op2Str, 16) : parseInt(op2Str, 10);
            if (isNaN(op2) && nextRegs[op2Str.toUpperCase()] !== undefined) {
              op2 = nextRegs[op2Str.toUpperCase()];
            }
            const resVal = op1 + (isNaN(op2) ? 0 : op2);
            nextRegs[dest] = resVal;
            logMsg += `  ; ${dest} = ${resVal}`;
          }
          nextRegs[pcKey] += 4;
        } else if (asm.startsWith('sub ')) {
          const tokens = asm.substring(4).split(',').map(s => s.trim());
          if (tokens.length >= 2) {
            const dest = tokens[0].toUpperCase();
            const op1 = nextRegs[tokens[1].toUpperCase()] || 0;
            const op2Str = (tokens[2] || tokens[1]).replace('#', '');
            let op2 = op2Str.startsWith('0x') ? parseInt(op2Str, 16) : parseInt(op2Str, 10);
            if (isNaN(op2) && nextRegs[op2Str.toUpperCase()] !== undefined) {
              op2 = nextRegs[op2Str.toUpperCase()];
            }
            const resVal = op1 - (isNaN(op2) ? 0 : op2);
            nextRegs[dest] = resVal;
            logMsg += `  ; ${dest} = ${resVal}`;
          }
          nextRegs[pcKey] += 4;
        } else if (asm.startsWith('b ') || asm.startsWith('bl ')) {
          // Unconditional Branch / Call
          const isCall = asm.startsWith('bl ');
          const destStr = asm.split(/\s+/)[1].trim();
          let destPc = destStr.startsWith('0x') ? parseInt(destStr, 16) : parseInt(destStr, 10);
          if (isNaN(destPc)) {
            // Check symbol maps
            const cleanSym = destStr.toUpperCase();
            const foundSym = Object.entries(state.renameMap).find(([_, name]) => name.toUpperCase() === cleanSym);
            if (foundSym) destPc = parseInt(foundSym[0], 16);
          }
          if (isCall) {
            nextRegs['LR'] = nextRegs[pcKey] + 4;
          }
          if (!isNaN(destPc)) {
            nextRegs[pcKey] = destPc;
            logMsg += isCall ? `  ; Branching Call to 0x${destPc.toString(16).toUpperCase()}` : `  ; Branch to 0x${destPc.toString(16).toUpperCase()}`;
          } else {
            nextRegs[pcKey] += 4;
          }
        } else if (asm === 'ret') {
          nextRegs[pcKey] = nextRegs['LR'] || 0;
          logMsg += `  ; Returning to LR: 0x${nextRegs[pcKey].toString(16).toUpperCase()}`;
        } else {
          // Standard incremental PC step
          nextRegs[pcKey] += 4;
        }
      } else {
        // --- x86/x64 SIMULATION ---
        const bits = state.fileArch.includes('64') ? 64 : 32;
        if ((window as any).WebDasm_emulateStep) {
          try {
            const stepRes = (window as any).WebDasm_emulateStep(
              state.hexInput,
              currentInstr.addr,
              registers,
              stackMem,
              bits
            );
            if (stepRes) {
              nextRegs = { ...stepRes.regs };
              nextStack = { ...stepRes.stack };
              logMsg = stepRes.log;
            } else {
              nextRegs[pcKey] += 1;
            }
          } catch (e) {
            logMsg += `  ; [Emulator Error: ${e}]`;
            nextRegs[pcKey] += 1;
          }
        } else {
          // Fallback simulation if WASM is not loaded yet
          const getVal = (arg: string) => {
            const cleanArg = arg.trim().toUpperCase();
            if (nextRegs[cleanArg] !== undefined) return nextRegs[cleanArg];
            if (arg.startsWith('0x')) return parseInt(arg, 16);
            const parsed = parseInt(arg, 10);
            return isNaN(parsed) ? 0 : parsed;
          };

          if (asm.startsWith('mov ')) {
            const tokens = asm.substring(4).split(',').map(s => s.trim());
            if (tokens.length === 2) {
              const dest = tokens[0].toUpperCase();
              const val = getVal(tokens[1]);
              if (nextRegs[dest] !== undefined) {
                nextRegs[dest] = val;
                logMsg += `  ; ${dest} = ${val}`;
              }
            }
            nextRegs[pcKey] += 5;
          } else if (asm.startsWith('add ')) {
            const tokens = asm.substring(4).split(',').map(s => s.trim());
            if (tokens.length === 2) {
              const dest = tokens[0].toUpperCase();
              const val = getVal(tokens[1]);
              if (nextRegs[dest] !== undefined) {
                nextRegs[dest] += val;
                logMsg += `  ; ${dest} = ${nextRegs[dest]}`;
              }
            }
            nextRegs[pcKey] += 3;
          } else if (asm.startsWith('sub ')) {
            const tokens = asm.substring(4).split(',').map(s => s.trim());
            if (tokens.length === 2) {
              const dest = tokens[0].toUpperCase();
              const val = getVal(tokens[1]);
              if (nextRegs[dest] !== undefined) {
                nextRegs[dest] -= val;
                logMsg += `  ; ${dest} = ${nextRegs[dest]}`;
              }
            }
            nextRegs[pcKey] += 3;
          } else if (asm.startsWith('xor ')) {
            const tokens = asm.substring(4).split(',').map(s => s.trim());
            if (tokens.length === 2) {
              const dest = tokens[0].toUpperCase();
              const val = getVal(tokens[1]);
              if (nextRegs[dest] !== undefined) {
                nextRegs[dest] ^= val;
                nextRegs['ZF'] = nextRegs[dest] === 0 ? 1 : 0;
                logMsg += `  ; ${dest} = ${nextRegs[dest]} (ZF=${nextRegs['ZF']})`;
              }
            }
            nextRegs[pcKey] += 2;
          } else if (asm.startsWith('push ')) {
            const val = getVal(asm.substring(5));
            nextRegs[spKey] -= 8;
            nextStack[nextRegs[spKey]] = val;
            logMsg += `  ; Pushed ${val} onto stack [RSP=0x${nextRegs[spKey].toString(16).toUpperCase()}]`;
            nextRegs[pcKey] += 1;
          } else if (asm.startsWith('jmp ')) {
            const target = asm.substring(4).trim();
            const targetAddr = getVal(target);
            nextRegs[pcKey] = targetAddr;
            logMsg += `  ; Jumped to 0x${targetAddr.toString(16).toUpperCase()}`;
          } else {
            nextRegs[pcKey] += 1;
          }
        }
      }
    } catch (err) {
      logMsg += `  ; [SimError: ${err}]`;
      nextRegs[pcKey] += isArm64 ? 4 : 1;
    }

    setRegisters(nextRegs);
    setStackMem(nextStack);
    setExecutionTrace(prev => [...prev, logMsg]);

    // Select the current execution row in standard UI
    const hexAddr = nextRegs[pcKey].toString(16).toUpperCase().padStart(8, '0');
    dispatch({ type: 'SET_SELECTED_ADDRESS', payload: hexAddr });
  }, [registers, stackMem, getInstructionAtPc, isArm64, dispatch, state.renameMap, state.fileArch, state.hexInput]);

  // Real-time run emulator scheduler loop
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      stepInto();
    }, playSpeed);
    return () => clearInterval(timer);
  }, [isPlaying, stepInto, playSpeed]);

  // Keyboard hotkeys for native debugger feel
  useEffect(() => {
    function handleKeys(e: KeyboardEvent) {
      if (e.key === 'F7') {
        e.preventDefault();
        stepInto();
      }
    }
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [stepInto]);

  // Keep trace logs auto-scrolled to latest steps
  useEffect(() => {
    if (traceEndRef.current) {
      traceEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [executionTrace.length]);

  return (
    <div 
      className="flex-1 flex flex-col h-full px-4 bg-[var(--ida-bg)] overflow-hidden relative"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({
          x: e.clientX,
          y: e.clientY
        });
      }}
      title="Right-click anywhere to open debugger controls context menu"
    >

      {/* ── Control Header Bar ── */}
      <div
        className="flex items-center gap-2.5 py-2 border-b border-[var(--ida-border)] shrink-0"
      >
        <button
          className={`flex items-center gap-1.5 h-6 px-3.5 rounded text-[10px] cursor-pointer transition-colors duration-100 select-none ${isPlaying
            ? 'bg-amber-700 hover:bg-amber-600 border border-amber-600 text-white font-medium'
            : 'bg-[var(--ida-panel-2)] hover:bg-[var(--ida-menu-hover)] hover:text-white border border-[var(--ida-border)] text-[var(--ida-text)] font-medium'
            }`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? '⏸ Pause' : '▶ Run'}
        </button>
        <button
          className="bg-[var(--ida-panel-2)] hover:bg-[var(--ida-menu-hover)] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--ida-border)] text-[var(--ida-text)] h-6 px-3.5 flex items-center gap-1.5 rounded text-[10px] cursor-pointer transition-colors duration-100 select-none"
          onClick={stepInto}
          disabled={isPlaying}
        >
          Step Into (F7)
        </button>

        {/* Speed Slider Slider Pill */}
        <div
          className="flex items-center gap-2 h-6 px-2.5 bg-[var(--ida-panel-2)] rounded border border-[var(--ida-border)]"
        >
          <span className="text-[9px] text-[var(--ida-yellow)] font-bold select-none">Speed</span>
          <input
            type="range"
            min="1"
            max="1000"
            value={1001 - playSpeed}
            onChange={(e) => setPlaySpeed(1001 - parseInt(e.target.value))}
            className="w-[75px] h-[2.5px] cursor-pointer accent-[var(--ida-yellow)]"
            title="Adjust execution speed"
          />
          <span className="text-[8.5px] text-[var(--ida-text-dim)] font-mono w-6 text-right select-none">
            {playSpeed}ms
          </span>
        </div>
        <button
          className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 border border-[var(--ida-border)] text-[var(--ida-text)] h-6 px-3.5 flex items-center gap-1.5 rounded text-[10px] cursor-pointer transition-colors duration-100 select-none"
          onClick={resetDebugger}
        >
          🔄 Reset Emulator
        </button>
      </div>

      {/* ── Main debugger grid layout ── */}
      <div className="my-2 flex-1 grid grid-cols-[330px_230px_1fr] gap-3 overflow-hidden min-h-0">

        {/* Panel A: High-Density Register Grid */}
        <div className="border border-[var(--ida-border)] rounded-md flex flex-col bg-[var(--ida-bg)] p-3 overflow-hidden">
          <div className="border-b border-[var(--ida-border)] pb-1.5 mb-2 text-[10px] text-[var(--ida-text-dim)] font-bold tracking-wider shrink-0 flex justify-between">
            <span>CPU REGISTERS</span>
            <span className="text-[var(--ida-yellow)]">{isArm64 ? 'AARCH64' : 'X86/X64'}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 overflow-y-auto flex-1 py-0.5 pr-1 min-h-0">
            {Object.entries(registers).map(([reg, val]) => {
              const isSpecial = reg === 'RIP' || reg === 'PC' || reg === 'RSP' || reg === 'SP';
              const isFlag = reg === 'CF' || reg === 'ZF' || reg === 'SF';
              const isModified = prevRegisters[reg] !== undefined && prevRegisters[reg] !== val;

              return (
                <div 
                  key={reg} 
                  className={`flex items-center justify-between px-2 py-1 rounded transition-all duration-150 border ${
                    isModified 
                      ? 'bg-rose-950/20 border-rose-500/50 text-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.15)]'
                      : isSpecial 
                        ? 'bg-[var(--ida-panel)] border-[var(--ida-yellow)]/30 hover:border-[var(--ida-yellow)]/50' 
                        : 'bg-[var(--ida-panel)] border-[var(--ida-border)]/40 hover:border-[var(--ida-border)]/60'
                  }`}
                >
                  <span className={`text-[10px] font-bold font-mono truncate w-7 ${
                    isModified 
                      ? 'text-rose-400 font-extrabold'
                      : isSpecial 
                        ? 'text-[var(--ida-yellow)]' 
                        : 'text-[var(--ida-keyword)]'
                  }`}>
                    {reg}
                  </span>
                  <span className={`text-[11px] font-mono font-semibold truncate text-right ${
                    isModified ? 'text-rose-400 font-bold' : 'text-[var(--ida-number)]'
                  }`}>
                    {isFlag ? val : `0x${val.toString(16).toUpperCase()}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel B: Compact Sparse Stack View */}
        <div className="border border-[var(--ida-border)] rounded-md flex flex-col bg-[var(--ida-bg)] p-3 overflow-hidden">
          <div className="border-b border-[var(--ida-border)] pb-1.5 mb-2 text-[10px] text-[var(--ida-text-dim)] font-bold tracking-wider shrink-0">
            SPARSE STACK MEMORY
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] pr-1">
            {Object.keys(stackMem).length === 0 ? (
              <div className="text-[var(--ida-text-dim)] text-[10px] text-center mt-8 italic">
                Stack is empty. Execute PUSH.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {Object.entries(stackMem)
                  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                  .map(([addr, val]) => (
                    <div key={addr} className="flex justify-between py-0.5 px-2 bg-[var(--ida-panel)]/50 rounded border border-[var(--ida-border)]">
                      <span className="text-[var(--ida-text-dim)] font-medium">0x{parseInt(addr).toString(16).toUpperCase()}</span>
                      <span className="text-[var(--ida-number)] font-semibold">0x{val.toString(16).toUpperCase()}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel C: Instruction execution trace log */}
        <div className="border border-[var(--ida-border)] rounded-md flex flex-col bg-[var(--ida-bg)] p-3 overflow-hidden">
          <div className="border-b border-[var(--ida-border)] pb-1.5 mb-2 text-[10px] text-[var(--ida-text-dim)] font-bold tracking-wider shrink-0 flex justify-between">
            <span>CPU INSTRUCTION EXECUTION TRACE LOG</span>
            <span className="text-[var(--ida-text-dim)] text-[9px] font-mono">F7 step-into enabled</span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] text-[var(--ida-text)] flex flex-col gap-1.5 pr-1">
            {executionTrace.slice(-250).map((msg, i, arr) => {
              const isSys = msg.startsWith('[System]');
              const isErr = msg.startsWith('[Error]');
              const isFinished = msg.includes('Program finished');
              
              let rowColor = 'text-[var(--ida-text)]';
              if (isSys) rowColor = 'text-[var(--ida-success)] font-semibold';
              else if (isErr) rowColor = 'text-[var(--ida-error)] font-semibold';
              else if (isFinished) rowColor = 'text-[var(--ida-yellow)] font-bold';

              return (
                <div 
                  key={i} 
                  className={`whitespace-pre-wrap px-2 py-1 rounded transition-colors duration-700 ${rowColor} ${
                    msg.includes(';') ? 'border-l-2 border-[var(--ida-yellow)]/60 bg-[var(--ida-yellow)]/5' : 'border-l-0'
                  } ${i === arr.length - 1 ? 'bg-white/5 font-medium' : 'bg-transparent'}`}
                >
                  <span className="text-[var(--ida-text-dim)] mr-2.5 select-none">{String(i + 1).padStart(3, '0')}</span>
                  {msg}
                </div>
              );
            })}
            <div ref={traceEndRef} />
          </div>
        </div>

      </div>

      {/* Sleek Custom CPU Debugger Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-[var(--ida-panel)] border border-[var(--ida-border)] shadow-[0_6px_24px_rgba(0,0,0,0.6)] rounded font-mono text-[11px] py-1 z-[10000] min-w-[250px] select-none text-left"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[var(--ida-text-dim)] font-bold border-b border-[var(--ida-border)] text-[8.5px] tracking-wider uppercase">
            CPU Debugger Actions
          </div>
          
          <button
            className="w-full text-left px-3 py-2 text-[var(--ida-text)] hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-yellow)] flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]"
            onClick={() => {
              dispatch({ type: 'SET_POPOUT_VIEW', payload: 'debugger' });
              setContextMenu(null);
            }}
          >
            🖥️ Pop out to Independent Window
          </button>

          <button
            className="w-full text-left px-3 py-2 text-[var(--ida-text)] hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-yellow)] flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]"
            onClick={() => {
              stepInto();
              setContextMenu(null);
            }}
          >
            🏃 Step Into (F7)
          </button>

          <button
            className="w-full text-left px-3 py-2 text-[var(--ida-text)] hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-yellow)] flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]"
            onClick={() => {
              resetDebugger();
              setContextMenu(null);
            }}
          >
            🔄 Reset Emulator State
          </button>

          <div className="border-t border-[var(--ida-border)] my-1" />

          <button
            className="w-full text-left px-3 py-2 text-[var(--ida-text-dim)] hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-yellow)] flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]"
            onClick={() => setContextMenu(null)}
          >
            ✕ Close Menu
          </button>
        </div>
      )}
    </div>
  );
}
