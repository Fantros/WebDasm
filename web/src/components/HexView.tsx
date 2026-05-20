import React, { useRef, useCallback, useEffect } from 'react';
import { useApp } from '../store';

const escapeHtml = (text: string) => 
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Virtual scroller for large hex data
function VirtualHexScroller({ rawHex }: { rawHex: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 20;
  const totalLines = Math.ceil(rawHex.length / 32);

  const render = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const scrollTop = container.scrollTop;
    const viewH = container.clientHeight || 400;

    let start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10);
    let end = Math.min(totalLines, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + 10);

    content.style.transform = `translateY(${start * ROW_HEIGHT}px)`;

    let html = '';
    for (let i = start; i < end; i++) {
      const startChar = i * 32;
      const chunk = rawHex.substring(startChar, startChar + 32);
      const offset = (startChar / 2).toString(16).padStart(8, '0').toUpperCase();

      let hexBytes = '';
      let ascii = '';
      for (let j = 0; j < chunk.length; j += 2) {
        const byteHex = chunk.substring(j, j + 2);
        hexBytes += byteHex + ' ';
        const val = parseInt(byteHex, 16);
        ascii += (val >= 32 && val <= 126) ? String.fromCharCode(val) : '.';
      }

      html += `<div class="flex flex-nowrap whitespace-nowrap h-[20px] px-4 flex items-center min-w-[580px] hover:bg-[var(--ida-menu-hover)] hover:text-white">
        <div class="w-20 text-[var(--ida-number)] shrink-0">${offset}</div>
        <div class="w-[380px] text-[var(--ida-text)] font-mono whitespace-pre shrink-0 tracking-wider">${hexBytes.toUpperCase().padEnd(48, ' ')}</div>
        <div class="text-[var(--ida-yellow)] whitespace-pre">${escapeHtml(ascii)}</div>
      </div>`;
    }
    content.innerHTML = html;
  }, [rawHex, totalLines]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Trigger render on scroll
    container.addEventListener('scroll', render);

    // Trigger render on resize / tab switch / layout reflow in real-time
    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(container);

    // Initial sequential renders to ensure complete layout paint
    render();
    const timer1 = setTimeout(render, 30);
    const timer2 = setTimeout(render, 150);

    return () => {
      container.removeEventListener('scroll', render);
      resizeObserver.disconnect();
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [render]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      {/* Spacer for correct scrollbar height */}
      <div className="absolute top-0 invisible w-[1px]" style={{ height: totalLines * ROW_HEIGHT }} />
      <div ref={contentRef} className="absolute top-0 left-0 right-0" />
    </div>
  );
}

function parseSmartHex(input: string): string {
  if (!input) return '';

  const lines = input.split(/\r?\n/);
  const allBytes: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/);
    let startIdx = 0;

    // Skip offset if present (e.g. "00000000" or "0x0000" or "0000:")
    if (words.length > 1) {
      const cleanFirst = words[0].replace(/[:-]/g, '');
      const isFirstHexAddress = /^[0-9A-F]{4,16}$/i.test(cleanFirst) || words[0].toUpperCase().startsWith("0X");
      if (isFirstHexAddress) {
        const cleanNext = words[1].replace(/[:-]/g, '').toUpperCase();
        if (/^[0-9A-F]{2}$/.test(cleanNext)) {
          startIdx = 1;
        }
      }
    }

    const limitBytes = startIdx === 1;
    let byteCount = 0;
    for (let i = startIdx; i < words.length; i++) {
      if (limitBytes && byteCount >= 16) break;
      const clean = words[i].replace(/[:-]/g, '').toUpperCase();
      if (/^[0-9A-F]{2}$/.test(clean)) {
        allBytes.push(clean);
        byteCount++;
      } else if (clean.length > 2 && clean.length % 2 === 0 && /^[0-9A-F]+$/.test(clean)) {
        for (let k = 0; k < clean.length; k += 2) {
          if (!limitBytes || byteCount < 16) {
            allBytes.push(clean.substring(k, k + 2));
            byteCount++;
          }
        }
      }
    }
  }

  // Fallback: If nothing was parsed, just extract all raw hex digit pairs
  if (allBytes.length === 0) {
    const clean = input.replace(/[^a-fA-F0-9]/gi, '');
    for (let i = 0; i < clean.length - 1; i += 2) {
      allBytes.push(clean.substring(i, i + 2).toUpperCase());
    }
  }

  return allBytes.join('');
}

export default function HexView() {
  const { state, dispatch } = useApp();
  const [showGrid, setShowGrid] = React.useState(false);

  const rawHex = parseSmartHex(state.hexInput);

  return (
    <div className="flex-1 flex flex-col bg-[var(--ida-bg)] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-1.5 border-b border-[var(--ida-border)] shrink-0">
        <span className="text-[var(--ida-yellow)] text-[11px] font-bold">Raw Hex View</span>
        <div className="flex gap-1.5">
          <button 
            className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-2 py-0.5 text-[10px] cursor-pointer transition-colors duration-100" 
            onClick={() => setShowGrid(g => !g)}
          >
            {showGrid ? 'Input View' : 'Grid View'}
          </button>
        </div>
      </div>

      {!showGrid ? (
        <>
          {/* Hex Input Textarea */}
          <textarea
            value={state.hexInput}
            onChange={e => dispatch({ type: 'SET_HEX_INPUT', payload: e.target.value })}
            placeholder="Paste hex bytes here (e.g. 90 90 90 31 c0 ...)"
            className="flex-[0_0_160px] resize-none p-4 text-[12px] leading-relaxed border-b border-[var(--ida-border)] border-t-0 border-l-0 border-r-0 text-[var(--ida-number)] bg-[var(--ida-bg)] outline-none font-mono"
          />

          {/* Byte Stats */}
          <div className="px-4 py-2 text-[11px] text-[var(--ida-text-dim)] border-b border-[var(--ida-border)] shrink-0 flex gap-4">
            <span>Bytes: <span className="text-[var(--ida-number)]">{rawHex.length / 2 | 0}</span></span>
          </div>

          {/* Hex Grid View (when grid is off, show empty or placeholder) */}
          <div className="flex-1 flex items-center justify-center text-[var(--ida-text-dim)] text-[11px]">
            Switch to Grid View to inspect bytes
          </div>
        </>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center px-4 h-[24px] border-b border-[var(--ida-border)] shrink-0 text-[11px] bg-[var(--ida-panel-2)]">
            <div className="w-20 text-[var(--ida-number)] shrink-0">Offset</div>
            <div className="w-[380px] text-[var(--ida-keyword)] shrink-0 whitespace-pre font-mono">
              {'00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F'}
            </div>
            <div className="text-[var(--ida-comment)] font-mono">ASCII</div>
          </div>
          {rawHex.length > 0 ? (
            <VirtualHexScroller rawHex={rawHex} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--ida-text-dim)]">
              No data loaded
            </div>
          )}
        </>
      )}
    </div>
  );
}
