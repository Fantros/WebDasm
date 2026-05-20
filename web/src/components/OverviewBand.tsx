import React, { useMemo } from 'react';
import { useApp } from '../store';

export default function OverviewBand() {
  const { state } = useApp();

  const segmentsParsed = useMemo(() => {
    if (!state.currentSegments || state.currentSegments.length === 0) {
      // Fallback for raw shellcode
      const length = state.globalBytes?.length || 0x1000;
      const baseIp = state.fileBaseIp || 0;
      return [
        { name: '.text (Shellcode)', start: baseIp, end: baseIp + length, color: 'bg-emerald-600/80', textColor: 'text-emerald-400' }
      ];
    }

    return state.currentSegments.map((segStr, idx) => {
      // Parse ranges (e.g. ".text [0x401000 - 0x402500]")
      const hexMatches = segStr.match(/0x([0-9a-fA-F]+)/g);
      let start = state.fileBaseIp;
      let end = state.fileBaseIp + 0x1000;
      if (hexMatches && hexMatches.length >= 2) {
        start = parseInt(hexMatches[0], 16);
        end = parseInt(hexMatches[1], 16);
      } else if (hexMatches && hexMatches.length === 1) {
        start = parseInt(hexMatches[0], 16);
        end = start + 0x1000;
      }

      // Color coding matching professional reverse engineering palettes
      let color = 'bg-zinc-600';
      let textColor = 'text-zinc-400';
      if (segStr.toLowerCase().includes('.text') || segStr.toLowerCase().includes('code')) {
        color = 'bg-cyan-600/80';
        textColor = 'text-cyan-400';
      } else if (segStr.toLowerCase().includes('.rdata') || segStr.toLowerCase().includes('const')) {
        color = 'bg-amber-600/80';
        textColor = 'text-amber-400';
      } else if (segStr.toLowerCase().includes('.data') || segStr.toLowerCase().includes('bss')) {
        color = 'bg-fuchsia-600/80';
        textColor = 'text-fuchsia-400';
      } else if (segStr.toLowerCase().includes('.idata') || segStr.toLowerCase().includes('import')) {
        color = 'bg-rose-600/80';
        textColor = 'text-rose-400';
      } else if (segStr.toLowerCase().includes('.edata') || segStr.toLowerCase().includes('export')) {
        color = 'bg-emerald-600/80';
        textColor = 'text-emerald-400';
      }

      // Clean segment name
      const name = segStr.split(/[\[\s\()]/)[0] || `.seg_${idx}`;

      return { name, start, end, color, textColor };
    });
  }, [state.currentSegments, state.globalBytes, state.fileBaseIp]);

  const totalRange = useMemo(() => {
    if (segmentsParsed.length === 0) return { start: 0, end: 1, size: 1 };
    const start = Math.min(...segmentsParsed.map(s => s.start));
    const end = Math.max(...segmentsParsed.map(s => s.end));
    return { start, end, size: Math.max(1, end - start) };
  }, [segmentsParsed]);

  const [hoveredSeg, setHoveredSeg] = React.useState<typeof segmentsParsed[0] | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const hoverVal = totalRange.start + percent * totalRange.size;

    // Find closest segment
    const matched = segmentsParsed.find(s => hoverVal >= s.start && hoverVal <= s.end) || segmentsParsed[0];
    if (matched) {
      setHoveredSeg(matched);
      setTooltipPos({ x: e.clientX - 10, y: rect.bottom + window.scrollY + 6 });
    }
  };

  const handleMouseLeave = () => {
    setHoveredSeg(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const targetAddrVal = totalRange.start + percent * totalRange.size;
    const targetHex = Math.round(targetAddrVal).toString(16).toUpperCase();
    window.dispatchEvent(new CustomEvent('jump-to-node', { detail: { address: targetHex, forceGraph: true } }));
  };

  return (
    <div className="h-[26px] bg-[var(--ida-panel)] border-b border-[var(--ida-border)] flex items-center px-2.5 select-none relative z-40 shrink-0 text-[10px] font-mono text-[var(--ida-text)] justify-between gap-4">
      {/* Navigation Bar Title */}
      <div className="flex items-center gap-1.5 text-[var(--ida-text-dim)] font-bold uppercase text-[9px] shrink-0">
        <span>Overview:</span>
      </div>

      {/* Color segmented strip */}
      <div 
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="flex-1 h-[12px] bg-[var(--ida-bg)] rounded border border-[var(--ida-border)] overflow-hidden flex cursor-pointer relative group"
      >
        {segmentsParsed.map((seg, idx) => {
          const widthPct = ((seg.end - seg.start) / totalRange.size) * 100;
          return (
            <div 
              key={idx}
              style={{ width: `${widthPct}%` }}
              className={`${seg.color} h-full transition-all duration-150 relative border-r border-[var(--ida-bg)]/30 hover:brightness-125`}
            />
          );
        })}

        {/* Current selected address cursor head overlay */}
        {state.selectedAddress && (() => {
          const addrVal = parseInt(state.selectedAddress, 16);
          if (addrVal >= totalRange.start && addrVal <= totalRange.end) {
            const leftPct = ((addrVal - totalRange.start) / totalRange.size) * 100;
            return (
              <div 
                style={{ left: `${leftPct}%` }}
                className="absolute top-0 bottom-0 w-[2px] bg-[var(--ida-yellow)] shadow-[0_0_8px_rgba(241,196,15,0.9)] z-10 pointer-events-none"
              />
            );
          }
          return null;
        })()}
      </div>

      {/* Hover tooltip metadata preview card */}
      {hoveredSeg && (
        <div 
          className="fixed bg-[var(--ida-panel)] border border-[var(--ida-border)] shadow-[0_4px_20px_rgba(0,0,0,0.7)] text-[var(--ida-text)] rounded p-2 z-[99999] min-w-[280px] pointer-events-none transition-all duration-75 select-none text-left"
          style={{ top: tooltipPos.y, left: Math.max(10, Math.min(window.innerWidth - 300, tooltipPos.x)) }}
        >
          <div className="font-bold border-b border-[var(--ida-border)] pb-1 mb-1.5 flex justify-between items-center text-[10px]">
            <span className="text-[var(--ida-yellow)] uppercase">Segment Details</span>
            <span className="text-[var(--ida-text-dim)] font-normal text-[8.5px]">0x{hoveredSeg.start.toString(16).toUpperCase()} - 0x{hoveredSeg.end.toString(16).toUpperCase()}</span>
          </div>
          
          <div className="flex flex-col gap-1 text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-[var(--ida-text-dim)]">Name:</span>
              <span className="font-bold text-white font-mono">{hoveredSeg.name}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-[var(--ida-text-dim)]">Size:</span>
              <span className="font-mono text-[var(--ida-number)]">0x{(hoveredSeg.end - hoveredSeg.start).toString(16).toUpperCase()} bytes</span>
            </div>

            <div className="flex justify-between">
              <span className="text-[var(--ida-text-dim)]">Permission:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {hoveredSeg.name.includes('.text') ? 'R X (CODE)' : hoveredSeg.name.includes('.data') ? 'RW (DATA)' : 'R (CONST)'}
              </span>
            </div>

            <div className="mt-1 border-t border-[var(--ida-border)] pt-1 text-[8.5px] text-[var(--ida-text-dim)] leading-relaxed italic text-center">
              💡 Click to jump disassembly layout focus here
            </div>
          </div>
        </div>
      )}

      {/* Legend / Info strip */}
      <div className="flex items-center gap-3 shrink-0 overflow-x-auto overflow-y-hidden py-0.5">
        {segmentsParsed.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${seg.color}`} />
            <span className={seg.textColor}>{seg.name}</span>
          </div>
        ))}
        {state.selectedAddress && (
          <div className="ml-2 pl-2 border-l border-[var(--ida-border)] text-[var(--ida-yellow)] font-bold">
            Cursor: 0x{state.selectedAddress}
          </div>
        )}
      </div>
    </div>
  );
}
