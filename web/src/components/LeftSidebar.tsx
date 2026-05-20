import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../store';
import type { SidebarTab } from '../types';
import StructsView from './StructsView';

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'functions', label: 'XREFs' },
  { id: 'strings', label: 'Strings' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'structs', label: 'Structs' },
  { id: 'imports', label: 'Imports' },
  { id: 'exports', label: 'Exports' },
  { id: 'segments', label: 'Segments' },
];

const ROW_HEIGHT = 22;

function VirtualList({ itemCount, renderItem }: { itemCount: number; renderItem: (index: number) => React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const viewH = containerRef.current?.clientHeight || 800;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10);
  const endIndex = Math.min(itemCount, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + 10);

  const visibleItems = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleItems.push(
      <div key={i} className="absolute left-0 right-0 flex items-center" style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}>
        {renderItem(i)}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      <div className="absolute top-0 invisible w-[1px]" style={{ height: itemCount * ROW_HEIGHT }} />
      {visibleItems}
    </div>
  );
}

export default function LeftSidebar({ width, collapsed }: { width: number; collapsed: boolean }) {
  const { state, dispatch, applyRenames } = useApp();

  const jumpToSidebarItem = useCallback((itemText: string) => {
    if (!itemText) return;

    // 1. Check if the text is or starts with a hex address (e.g. "0x1400", "00401000", "0X401000")
    const cleanItem = itemText.trim().replace('0x', '').replace('0X', '');
    const isPureHex = /^[0-9A-Fa-f]+$/.test(cleanItem);

    if (isPureHex && cleanItem.length >= 2) {
      window.dispatchEvent(new CustomEvent('jump-to-node', { detail: { address: cleanItem, forceGraph: true } }));
      return;
    }

    // 1.5 Check if the text contains a hex address prefix (e.g. "0x1400: MyExport")
    const hexMatch = itemText.match(/^(0x[0-9A-Fa-f]+)/);
    if (hexMatch) {
      window.dispatchEvent(new CustomEvent('jump-to-node', { detail: { address: hexMatch[1], forceGraph: true } }));
      return;
    }

    // 2. Otherwise, check if it's in the renameMap
    for (const [addr, name] of Object.entries(state.renameMap)) {
      if (name === itemText || itemText.includes(name)) {
        window.dispatchEvent(new CustomEvent('jump-to-node', { detail: { address: addr, forceGraph: true } }));
        return;
      }
    }

    // 3. Search in disassembly listing for matching labels or text
    const cleanQuery = itemText.replace(/"/g, '').trim();
    for (const line of state.currentDisasm) {
      if (line.includes(cleanQuery)) {
        const lineAddrMatch = line.match(/^([0-9A-F]{8})/i);
        if (lineAddrMatch) {
          window.dispatchEvent(new CustomEvent('jump-to-node', { detail: { address: lineAddrMatch[1], forceGraph: true } }));
          return;
        }
      }
    }

    console.warn(`Could not resolve jump target for: ${itemText}`);
  }, [state.renameMap, state.currentDisasm]);

  const flatXrefs = useMemo(() => {
    const flat: { type: 'target' | 'source'; target?: string; src?: string }[] = [];
    for (const xref of state.currentXrefs) {
      flat.push({ type: 'target', target: xref.target });
      for (const src of xref.sources) {
        flat.push({ type: 'source', src });
      }
    }
    return flat;
  }, [state.currentXrefs]);

  const renderContent = () => {
    const { activeLeftTab } = state;

    if (activeLeftTab === 'strings') {
      if (state.currentStrings.length === 0) return <Empty text="No strings found." />;
      return (
        <VirtualList
          itemCount={state.currentStrings.length}
          renderItem={(i) => (
            <div
              className="px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-string)] w-full"
              onClick={() => jumpToSidebarItem(state.currentStrings[i])}
            >
              &quot;{state.currentStrings[i]}&quot;
            </div>
          )}
        />
      );
    }

    if (activeLeftTab === 'imports') {
      if (state.currentImports.length === 0) return <Empty text="No imports found." />;
      return (
        <VirtualList
          itemCount={state.currentImports.length}
          renderItem={(i) => (
            <div
              className="px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-yellow)] w-full"
              onClick={() => jumpToSidebarItem(state.currentImports[i])}
            >
              {state.currentImports[i]}
            </div>
          )}
        />
      );
    }

    if (activeLeftTab === 'exports') {
      if (state.currentExports.length === 0) return <Empty text="No exports found." />;
      return (
        <VirtualList
          itemCount={state.currentExports.length}
          renderItem={(i) => (
            <div
              className="px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-keyword)] font-semibold w-full"
              onClick={() => jumpToSidebarItem(state.currentExports[i])}
            >
              {state.currentExports[i]}
            </div>
          )}
        />
      );
    }

    if (activeLeftTab === 'segments') {
      if (state.currentSegments.length === 0) return <Empty text="No segments found." />;
      return (
        <VirtualList
          itemCount={state.currentSegments.length}
          renderItem={(i) => {
            const seg = state.currentSegments[i];
            const perms = seg.includes('.text') ? 'R.X' : seg.includes('.rdata') ? 'R..' : 'RW.';
            return (
              <div
                className="px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-number)] flex justify-between w-full"
                onClick={() => jumpToSidebarItem(seg)}
              >
                <span className="font-semibold">{seg}</span>
                <span className="text-[10px] text-[var(--ida-comment)]">{perms}</span>
              </div>
            );
          }}
        />
      );
    }

    if (activeLeftTab === 'bookmarks') {
      if (state.bookmarks.length === 0) return <Empty text="No bookmarks yet. Press 'M' in disassembly to add one." />;
      return (
        <VirtualList
          itemCount={state.bookmarks.length}
          renderItem={(i) => {
            const addr = state.bookmarks[i];
            const name = applyRenames(addr);
            return (
              <div
                className="px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-red)] font-semibold w-full flex items-center gap-1.5"
                onClick={() => jumpToSidebarItem(addr)}
              >
                <span>★</span> {name}
              </div>
            );
          }}
        />
      );
    }

    if (activeLeftTab === 'structs') {
      return <StructsView />;
    }

    // functions = XREFs
    if (flatXrefs.length === 0) return <Empty text="No XREFs detected." />;
    return (
      <VirtualList
        itemCount={flatXrefs.length}
        renderItem={(i) => {
          const item = flatXrefs[i];
          if (item.type === 'target') {
            const targetName = applyRenames(item.target!);
            return (
              <div
                className={`px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-keyword)] font-semibold w-full ${i > 0 ? 'border-t border-[var(--ida-border)]' : ''}`}
                onClick={() => jumpToSidebarItem(item.target!)}
              >
                ƒ {targetName}
              </div>
            );
          } else {
            const srcName = applyRenames(`loc_${item.src}`);
            return (
              <div
                className="px-2 cursor-pointer transition-colors duration-100 whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text)] pl-6 text-[11px] w-full"
                onClick={() => jumpToSidebarItem(item.src!)}
              >
                ↳ XREF from {srcName}
              </div>
            );
          }
        }}
      />
    );
  };

  const getCount = () => {
    switch (state.activeLeftTab) {
      case 'strings': return state.currentStrings.length;
      case 'bookmarks': return state.bookmarks.length;
      case 'imports': return state.currentImports.length;
      case 'exports': return state.currentExports.length;
      case 'segments': return state.currentSegments.length;
      case 'functions': return state.currentXrefs.length;
      case 'structs': return Object.keys(state.structs).length;
    }
  };

  return (
    <div 
      style={{ width: collapsed ? 0 : width }}
      className={`border-r border-[var(--ida-border)] bg-[var(--ida-panel)] flex flex-col shrink-0 overflow-hidden transition-all duration-150 ${collapsed ? 'border-r-0' : ''}`}
    >
      {/* Tabs */}
      <div className="flex h-[26px] bg-[var(--ida-panel-2)] border-b border-[var(--ida-border)] shrink-0 select-none overflow-x-auto overflow-y-hidden">
        {TABS.map(t => {
          const isActive = state.activeLeftTab === t.id;
          return (
            <div
              key={t.id}
              className={`flex items-center px-3 h-full border-r border-[var(--ida-border)] font-mono text-[11px] cursor-pointer transition-colors duration-100 select-none whitespace-nowrap shrink-0 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-text)] ${isActive
                ? 'bg-[var(--ida-tab-active)] text-[var(--ida-yellow)] font-medium'
                : 'bg-[var(--ida-tab-inactive)] text-[var(--ida-text-dim)]'
                }`}
              onClick={() => dispatch({ type: 'SET_LEFT_TAB', payload: t.id })}
            >
              {t.label}
            </div>
          );
        })}
      </div>


      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {renderContent()}
      </div>

      {/* Footer */}
      <div
        className="border-t border-[var(--ida-border)] px-2 text-[11px] text-[var(--ida-text-dim)] flex justify-between bg-[var(--ida-panel-2)] shrink-0 select-none"
      >
        <span>Count:</span>
        <span className="text-[var(--ida-yellow)] font-bold">{getCount()}</span>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-[var(--ida-text-dim)] italic text-center mt-10 text-[11px]">
      {text}
    </div>
  );
}
