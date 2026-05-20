import { useState, useRef, useEffect } from 'react';
import { useApp } from '../store';
import { useWasm } from '../hooks/useWasm';

interface MenuDropdownItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

interface MenuItem {
  label: string;
  items: MenuDropdownItem[];
}

interface MenuBarProps {
  menus: MenuItem[];
  onBack?: () => void;
  onForward?: () => void;
  backDisabled?: boolean;
  forwardDisabled?: boolean;
}

export default function MenuBar({
  menus,
  onBack,
  onForward,
  backDisabled,
  forwardDisabled
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useApp();
  const { searchPattern } = useWasm();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = () => {
    const query = state.searchQuery.trim();
    if (!query) return;

    let results: string[] = [];

    // Detect if search query matches a Hex Byte Pattern (e.g., "55 89 e5 ??" or "5589e5")
    const isHexPattern = /^[a-fA-F0-9\s\?]+$/.test(query) && (query.includes(" ") || query.includes("?") || query.length >= 4);

    if (isHexPattern) {
      dispatch({ type: 'ADD_LOG', payload: { type: 'info', text: `[SEARCH] Query '${query}' identified as Hex/Wildcard Pattern. Scanning binary...`, timestamp: new Date() } });
      const matches = searchPattern(query);
      for (const offset of matches) {
        results.push(`[HEX MATCH] Offset 0x${offset.toString(16).toUpperCase()} (${offset})`);
      }
    }

    // Classic ASM, Strings, Imports search
    const queryLower = query.toLowerCase();
    for (const line of state.currentDisasm) {
      if (line.toLowerCase().includes(queryLower)) results.push(`[ASM] ${line}`);
    }
    for (const s of state.currentStrings) {
      if (s.toLowerCase().includes(queryLower)) results.push(`[STR] "${s}"`);
    }
    for (const imp of state.currentImports) {
      if (imp.toLowerCase().includes(queryLower)) results.push(`[IMP] ${imp}`);
    }

    dispatch({ type: 'SET_BOTTOM_TAB', payload: 'output' });

    if (results.length === 0) {
      dispatch({ type: 'ADD_LOG', payload: { type: 'error', text: `[SEARCH] No matches for '${query}'`, timestamp: new Date() } });
    } else {
      dispatch({ type: 'ADD_LOG', payload: { type: 'search', text: `[SEARCH] Found ${results.length} matches for '${query}':`, timestamp: new Date() } });
      const limit = Math.min(results.length, 50);
      for (let i = 0; i < limit; i++) {
        dispatch({ type: 'ADD_LOG', payload: { type: 'info', text: `  → ${results[i]}`, timestamp: new Date() } });
      }
      if (results.length > 50) {
        dispatch({ type: 'ADD_LOG', payload: { type: 'info', text: `  ... and ${results.length - 50} more`, timestamp: new Date() } });
      }
    }
  };

  return (
    <div className="h-[24px] bg-[var(--ida-menu-bg)] border-b border-[var(--ida-border)] flex items-center px-1.5 shrink-0 select-none relative z-[100] justify-between" ref={barRef}>
      <div className="flex items-center">
        {onBack && onForward && (
          <div className="flex items-center gap-2.5 px-2 border-r border-[var(--ida-border)] mr-1.5">
            <button
              onClick={onBack}
              disabled={backDisabled}
              className={`cursor-pointer transition-all duration-100 hover:text-white select-none ${backDisabled ? 'opacity-30 cursor-not-allowed text-[var(--ida-text-dim)]' : 'text-[var(--ida-yellow)] hover:scale-110 active:scale-95'}`}
              title="Go Back (Alt + Left Arrow)"
              style={{ fontSize: '10px', background: 'none', border: 'none', padding: 0 }}
            >
              ◀
            </button>
            <button
              onClick={onForward}
              disabled={forwardDisabled}
              className={`cursor-pointer transition-all duration-100 hover:text-white select-none ${forwardDisabled ? 'opacity-30 cursor-not-allowed text-[var(--ida-text-dim)]' : 'text-[var(--ida-yellow)] hover:scale-110 active:scale-95'}`}
              title="Go Forward (Alt + Right Arrow)"
              style={{ fontSize: '10px', background: 'none', border: 'none', padding: 0 }}
            >
              ▶
            </button>
          </div>
        )}
        {menus.map(menu => (
          <div
            key={menu.label}
            className={`inline-flex items-center py-[2px] px-[8px] mx-[2px] font-sans text-[11px] cursor-pointer rounded-[2px] text-[var(--ida-text)] transition-colors duration-100 select-none hover:bg-[var(--ida-menu-hover)] hover:text-white relative ${openMenu === menu.label ? 'z-[9999]' : ''}`}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => openMenu !== null && setOpenMenu(menu.label)}
          >
            {menu.label}
            {openMenu === menu.label && (
              <div className="absolute top-full left-0 bg-[var(--ida-panel-2)] border border-[var(--ida-border)] min-w-[220px] z-[9999] shadow-[0_6px_20px_rgba(0,0,0,0.65)] animate-fade-in">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} className="border-t border-[var(--ida-border)]" />
                  ) : (
                    <div
                      key={i}
                      className="px-3 py-1 flex justify-between items-center text-[11px] cursor-pointer whitespace-nowrap text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onMouseUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onMouseUpCapture={() => {
                        if (item.action) {
                          item.action();
                        }
                        setOpenMenu(null);
                      }}
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.shortcut && <span className="text-[10px] text-[var(--ida-text-dim)] ml-8 font-mono">{item.shortcut}</span>}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Search Bar & File Info strip on the right side of the MenuBar */}
      <div className="flex items-center gap-3 mr-3">
        {/* Sleek integrated search bar */}
        <div className="flex items-center py-1">
          <input
            type="text"
            placeholder="Search Asm, Strings, Imports..."
            value={state.searchQuery}
            onChange={e => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-[170px] px-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] font-mono text-[11px] outline-none transition-colors duration-150"
          />
          <button
            onClick={handleSearch}
            className="inline-flex items-center px-2 bg-[var(--ida-panel-2)] border border-[var(--ida-border)] text-[var(--ida-text)] font-mono text-[11px] cursor-pointer transition-colors duration-100 select-none whitespace-nowrap hover:bg-[var(--ida-menu-hover)] hover:text-white"
          >
            🔍
          </button>
        </div>

        <div className="w-[1px] h-[14px] bg-[var(--ida-border)]" />

        {/* File Info */}
        <div className="flex items-center gap-3 text-[11px] text-[var(--ida-text-dim)]">
          <span>
            File: <span className="text-[var(--ida-yellow)] font-bold">{state.fileType}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span>|</span>
            <span>Arch:</span>
            <select
              value={state.fileArch}
              onChange={e => dispatch({
                type: 'SET_FILE_INFO',
                payload: { fileType: state.fileType, fileArch: e.target.value, fileEntry: state.fileEntry, fileBaseIp: state.fileBaseIp }
              })}
              className="bg-[var(--ida-bg)] text-[var(--ida-yellow)] border border-[var(--ida-border)] rounded-[6px] px-2 pr-6 font-mono text-[11px] outline-none cursor-pointer appearance-none"
              style={{
                backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="%23DCDCAA"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.75 9.98a.75.75 0 011.1.02L10 15.148l2.65-2.91a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.02-1.1z" clip-rule="evenodd"/></svg>')`,
                backgroundSize: '10px',
                backgroundPosition: 'right 6px center',
                backgroundRepeat: 'no-repeat'
              }}
            >
              <option value="x86/x64">x86_64</option>
              <option value="x86">x86</option>
              <option value="arm64">ARM64</option>
              {state.fileArch !== 'x86/x64' && state.fileArch !== 'x86' && state.fileArch !== 'arm64' && (
                <option value={state.fileArch}>{state.fileArch}</option>
              )}
            </select>
          </span>
          <span>
            | Entry: <span className="text-[var(--ida-keyword)] font-semibold">{state.fileEntry}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
