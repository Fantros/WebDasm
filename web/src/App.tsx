import "./App.css";

import { useEffect, useState } from 'react';
import { useApp } from './store';
import { useWasm } from './hooks/useWasm';
import { useNavigationHistory } from './hooks/useNavigationHistory';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTabManager } from './hooks/useTabManager';
import { useTheme } from './hooks/useTheme';

import MenuBar from './components/MenuBar';
import LeftSidebar from './components/LeftSidebar';
import CFGView from './components/CFGView';
import HexView from './components/HexView';
import DisassemblyView from './components/DisassemblyView';
import OutputLog from './components/OutputLog';
import MemoryMapView from './components/MemoryMapView';
import StatusBar from './components/StatusBar';
import ScriptConsole from './components/ScriptConsole';
import CpuDebugger from './components/CpuDebugger';
import PopoutWindow from './components/PopoutWindow';
import OverviewBand from './components/OverviewBand';

// Modals
import AboutModal from './components/modals/AboutModal';
import ShortcutsModal from './components/modals/ShortcutsModal';
import JumpToModal from './components/modals/JumpToModal';
import ThemeModal from './components/modals/ThemeModal';
import { ErrorBoundary } from './components/ErrorBoundary';

// High-fidelity Floating/Floated View Placeholder (dock back indicator)
function FloatedViewPlaceholder({ viewName, onDock }: { viewName: string; onDock: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--ida-bg)] font-mono text-center select-none min-h-[160px]">
      <div className="text-3xl mb-3 animate-pulse text-[var(--ida-yellow)]">🖥️</div>
      <div className="text-xs font-bold text-[var(--ida-yellow)] uppercase tracking-wider mb-1">
        {viewName} is Floating
      </div>
      <div className="text-[var(--ida-text-dim)] text-[10px] max-w-[280px] mb-4 leading-relaxed">
        This view is currently detached into an independent desktop monitor. Close the floating window or click below to dock it back here.
      </div>
      <button
        onClick={onDock}
        className="px-3 py-1 bg-[var(--ida-panel-2)] hover:bg-[var(--ida-menu-hover)] hover:text-white border border-[var(--ida-border)] text-[var(--ida-text)] rounded font-bold cursor-pointer text-[9px] uppercase tracking-wide transition-all duration-150 active:scale-95"
      >
        ⚓ Dock View Back
      </button>
    </div>
  );
}

export default function App() {
  const { state, dispatch } = useApp();
  const { analyze, handleFile, saveWddb, exportBin } = useWasm();
  
  // Custom Hooks for Logic Separation
  const { history, historyIdx, pushAddress, handleBack, handleForward } = useNavigationHistory();
  const {
    centerTabOrder, bottomTabOrder, closedTabs, draggingTab, contextMenu,
    openTab, closeTab, restoreAllTabs, handleDragStart, handleDragOver, handleDragEnd, handleTabDrop,
    handleTabContextMenu, closeContextMenu
  } = useTabManager();
  useTheme(); // Initializes themes

  // UI State
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Address change tracker
  useEffect(() => {
    if (state.selectedAddress) {
      pushAddress(state.selectedAddress);
    }
  }, [state.selectedAddress, pushAddress]);

  // Mouse listeners for resizing Left Sidebar dynamically
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Global window listener to close context menu
  useEffect(() => {
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  }, [closeContextMenu]);

  // Keyboard Shortcuts Hook
  useKeyboardShortcuts({
    openJumpModal: () => setIsJumpOpen(true),
    handleBack,
    handleForward,
    setSidebarCollapsed,
    analyze,
  });

  // Drag-and-drop on entire window for files
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) handleFile(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFile]);

  const handleContentDrop = (e: React.DragEvent, targetType: 'center' | 'bottom') => {
    e.preventDefault();
    const tabId = e.dataTransfer.getData('text/plain');
    const sourceTabType = e.dataTransfer.getData('tabType');

    if (sourceTabType !== targetType) return;

    let payload = tabId;
    if (tabId === 'idaview') {
      payload = state.idaViewMode === 'graph' ? 'cfg' : 'disasm';
    } else if (tabId === 'pseudo') {
      payload = 'decompiler';
    }
    dispatch({ type: 'SET_POPOUT_VIEW', payload });
    handleDragEnd();
  };

  const menus = [
    {
      label: 'File',
      items: [
        { label: 'Open PE/ELF/MACH File...', shortcut: 'Ctrl+O', action: () => document.getElementById('binary-file-input')?.click() },
        { label: 'Open Workspace (.WDDB)...', shortcut: 'Ctrl+L', action: () => document.getElementById('wddb-file-input')?.click() },
        { label: 'Save Workspace (.WDDB)', shortcut: 'Ctrl+S', action: saveWddb },
        { label: 'Export Binary...', action: exportBin },
        { separator: true } as any,
        { label: 'Exit', action: () => window.close() },
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Left Sidebar', shortcut: 'Alt+1', action: () => setSidebarCollapsed(prev => !prev) },
        { separator: true } as any,
        { label: 'IDA View-A (Graph/Text)', action: () => openTab('idaview') },
        { label: 'Hex View', action: () => openTab('hex') },
        { label: 'Pseudocode-A (F5)', shortcut: 'F5', action: () => openTab('pseudo') },
        { separator: true } as any,
        { label: 'Show Output Log', action: () => openTab('output') },
        { label: 'Show Script Console', action: () => openTab('console') },
        { label: 'Show Program Segmentation', action: () => openTab('memmap') },
        { label: 'Show CPU Register Debugger', action: () => openTab('debugger') },
        { separator: true } as any,
        { label: 'Restore All Closed Tabs', action: restoreAllTabs },
      ]
    },
    {
      label: 'Jump',
      items: [
        { label: 'Jump to Address...', shortcut: 'Ctrl+G', action: () => setIsJumpOpen(true) },
        { separator: true } as any,
        { label: 'Go Back (History)', shortcut: 'Alt+◀', action: handleBack, disabled: historyIdx <= 0 },
        { label: 'Go Forward (History)', shortcut: 'Alt+▶', action: handleForward, disabled: historyIdx >= history.length - 1 },
        { separator: true } as any,
        { label: 'Reset Graph View', action: () => window.dispatchEvent(new Event('reset-cfg')) },
      ]
    },
    {
      label: 'Analysis',
      items: [
        { label: 'Analyze / Re-analyze', shortcut: 'F9', action: analyze },
        { separator: true } as any,
        { label: 'XREFs', action: () => dispatch({ type: 'SET_LEFT_TAB', payload: 'functions' }) },
        { label: 'Strings', action: () => dispatch({ type: 'SET_LEFT_TAB', payload: 'strings' }) },
        { label: 'Imports', action: () => dispatch({ type: 'SET_LEFT_TAB', payload: 'imports' }) },
        { label: 'Exports', action: () => dispatch({ type: 'SET_LEFT_TAB', payload: 'exports' }) },
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'About WebDasm', action: () => setIsAboutOpen(true) },
        { label: 'Keyboard Shortcuts', action: () => setIsShortcutsOpen(true) },
        { separator: true } as any,
        { label: 'Color Theme...', action: () => setIsThemeOpen(true) },
        { separator: true } as any,
        { label: 'GitHub Repository', action: () => window.open('https://github.com/Fantros/WebDasm', '_blank') },
      ]
    }
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--ida-bg)]">
      {/* Hidden File inputs */}
      <input id="binary-file-input" type="file" accept=".exe,.dll,.elf,.so,.dylib,.macho,.bin,*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <input id="wddb-file-input" type="file" accept=".wddb" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

      <MenuBar menus={menus} onBack={handleBack} onForward={handleForward} backDisabled={historyIdx <= 0} forwardDisabled={historyIdx >= history.length - 1} />
      <OverviewBand />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar wrapper */}
        <div className="flex relative select-none min-h-0 shrink-0">
          <LeftSidebar width={sidebarWidth} collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && (
            <div 
              onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
              className="w-[2px] bg-transparent hover:bg-[var(--ida-yellow)]/30 border-r border-[var(--ida-border)] cursor-col-resize shrink-0 transition-colors duration-100 flex items-center justify-center relative z-50 group"
            >
              <div 
                onClick={(e) => { e.stopPropagation(); setSidebarCollapsed(true); }}
                className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-[14px] h-[28px] bg-[var(--ida-panel-2)] hover:bg-[var(--ida-menu-hover)] border border-[var(--ida-border)] text-[var(--ida-text-dim)] rounded flex items-center justify-center cursor-pointer select-none text-[8px] transition-all opacity-0 group-hover:opacity-100 z-50 hover:text-white"
              >◀</div>
            </div>
          )}
          {sidebarCollapsed && (
            <div 
              onClick={() => setSidebarCollapsed(false)}
              className="w-[8px] bg-[var(--ida-bg)] hover:bg-[var(--ida-panel-2)] border-r border-[var(--ida-border)] flex items-center justify-center cursor-pointer select-none text-[8px] text-[var(--ida-yellow)] font-bold transition-all z-50 shrink-0 animate-pulse"
            >▶</div>
          )}
        </div>

        {/* Center Panel */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex h-[26px] bg-[var(--ida-panel-2)] border-b border-[var(--ida-border)] shrink-0 select-none overflow-x-auto overflow-y-hidden">
            {centerTabOrder.filter(tabId => !closedTabs.includes(tabId)).map((tabId) => {
              if (tabId === 'idaview') {
                return (
                  <div
                    key="idaview" draggable={true} onDragStart={(e) => handleDragStart(e, 'idaview', 'center')} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDrop={(e) => handleTabDrop(e, 'idaview', 'center')}
                    className={`flex items-center px-3 h-full border-r border-[var(--ida-border)] font-mono text-[11px] cursor-grab active:cursor-grabbing transition-all duration-100 select-none whitespace-nowrap shrink-0 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-text)] ${state.activeCenterTab === 'idaview' ? 'bg-[var(--ida-tab-active)] text-[var(--ida-yellow)] font-medium' : 'bg-[var(--ida-tab-inactive)] text-[var(--ida-text-dim)]'} ${draggingTab?.tabId === 'idaview' ? 'opacity-40 border-l-2 border-l-[var(--ida-yellow)] bg-[var(--ida-bg)]' : ''} flex items-center gap-1.5`}
                    onClick={() => dispatch({ type: 'SET_CENTER_TAB', payload: 'idaview' })} onContextMenu={(e) => handleTabContextMenu(e, 'idaview', 'center')}
                  >
                    <span className="text-[var(--ida-keyword)]">{state.idaViewMode === 'graph' ? '⎈' : '≡'}</span> IDA View-A
                    {(state.popoutViews.includes('cfg') || state.popoutViews.includes('disasm')) && <span className="text-[9px] text-emerald-400 font-bold ml-1 animate-pulse">🖥️</span>}
                    <div
                      className="flex gap-1 bg-[var(--ida-panel)] rounded p-0.5 ml-2 border border-[var(--ida-border)] cursor-pointer items-center"
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_CENTER_TAB', payload: 'idaview' }); dispatch({ type: 'SET_IDA_VIEW_MODE', payload: state.idaViewMode === 'graph' ? 'text' : 'graph' }); }}
                      draggable={false}
                    >
                      <span className={`text-[9px] px-1 rounded transition-all duration-150 font-bold ${state.idaViewMode === 'graph' ? 'bg-[var(--ida-yellow)] text-black' : 'bg-transparent text-[var(--ida-text-dim)]'}`}>Graph</span>
                      <span className={`text-[9px] px-1 rounded transition-all duration-150 font-bold ${state.idaViewMode === 'text' ? 'bg-[var(--ida-yellow)] text-black' : 'bg-transparent text-[var(--ida-text-dim)]'}`}>Text</span>
                    </div>
                  </div>
                );
              }
              if (tabId === 'pseudo') {
                return (
                  <div
                    key="pseudo" draggable={true} onDragStart={(e) => handleDragStart(e, 'pseudo', 'center')} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDrop={(e) => handleTabDrop(e, 'pseudo', 'center')}
                    className={`flex items-center px-3 h-full border-r border-[var(--ida-border)] font-mono text-[11px] cursor-grab active:cursor-grabbing transition-all duration-100 select-none whitespace-nowrap shrink-0 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-text)] ${state.activeCenterTab === 'pseudo' ? 'bg-[var(--ida-tab-active)] text-[var(--ida-yellow)] font-medium' : 'bg-[var(--ida-tab-inactive)] text-[var(--ida-text-dim)]'} ${draggingTab?.tabId === 'pseudo' ? 'opacity-40 border-l-2 border-l-[var(--ida-yellow)] bg-[var(--ida-bg)]' : ''}`}
                    onClick={() => dispatch({ type: 'SET_CENTER_TAB', payload: 'pseudo' })} onContextMenu={(e) => handleTabContextMenu(e, 'pseudo', 'center')}
                  >
                    Pseudocode-A
                    {state.popoutViews.includes('decompiler') && <span className="text-[9px] text-emerald-400 font-bold ml-1 animate-pulse">🖥️</span>}
                    <span onClick={(e) => { e.stopPropagation(); closeTab('pseudo', 'center'); }} className="ml-2 text-zinc-500 hover:text-rose-400 cursor-pointer text-[9px] font-bold p-0.5 rounded hover:bg-zinc-800 transition-colors">✕</span>
                  </div>
                );
              }
              if (tabId === 'hex') {
                return (
                  <div
                    key="hex" draggable={true} onDragStart={(e) => handleDragStart(e, 'hex', 'center')} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDrop={(e) => handleTabDrop(e, 'hex', 'center')}
                    className={`flex items-center px-3 h-full border-r border-[var(--ida-border)] font-mono text-[11px] cursor-grab active:cursor-grabbing transition-all duration-100 select-none whitespace-nowrap shrink-0 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-text)] ${state.activeCenterTab === 'hex' ? 'bg-[var(--ida-tab-active)] text-[var(--ida-yellow)] font-medium' : 'bg-[var(--ida-tab-inactive)] text-[var(--ida-text-dim)]'} ${draggingTab?.tabId === 'hex' ? 'opacity-40 border-l-2 border-l-[var(--ida-yellow)] bg-[var(--ida-bg)]' : ''}`}
                    onClick={() => dispatch({ type: 'SET_CENTER_TAB', payload: 'hex' })} onContextMenu={(e) => handleTabContextMenu(e, 'hex', 'center')}
                  >
                    Hex View-1
                    {state.popoutViews.includes('hex') && <span className="text-[9px] text-emerald-400 font-bold ml-1 animate-pulse">🖥️</span>}
                    <span onClick={(e) => { e.stopPropagation(); closeTab('hex', 'center'); }} className="ml-2 text-zinc-500 hover:text-rose-400 cursor-pointer text-[9px] font-bold p-0.5 rounded hover:bg-zinc-800 transition-colors">✕</span>
                  </div>
                );
              }
              return null;
            })}
            <span className="flex-1" />
          </div>

          {/* Center Content */}
          <div 
            className={`flex-1 overflow-hidden flex transition-all duration-300 relative ${draggingTab?.tabType === 'center' ? 'border-2 border-dashed border-[var(--ida-yellow)] bg-[var(--ida-yellow)]/5 m-1 rounded-lg' : ''}`}
            onDragOver={handleDragOver} onDrop={(e) => handleContentDrop(e, 'center')}
          >
            {draggingTab?.tabType === 'center' && (
              <div className="absolute inset-0 bg-[var(--ida-bg)]/80 backdrop-blur-[1px] flex flex-col items-center justify-center font-mono pointer-events-none z-50">
                <span className="text-3xl mb-2 animate-bounce">⚓</span>
                <span className="text-[11px] text-[var(--ida-yellow)] font-bold tracking-wider uppercase">Drop Tab here to undock (float)</span>
              </div>
            )}
            
            <ErrorBoundary name="CenterTab">
              {state.activeCenterTab === 'idaview' && (
                (state.popoutViews.includes('cfg') || state.popoutViews.includes('disasm')) ? (
                  <FloatedViewPlaceholder viewName="IDA View-A" onDock={() => { dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'cfg' }); dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'disasm' }); }} />
                ) : (
                  state.idaViewMode === 'graph' ? <CFGView /> : <DisassemblyView isPseudo={false} />
                )
              )}
              {state.activeCenterTab === 'pseudo' && (
                state.popoutViews.includes('decompiler') ? (
                  <FloatedViewPlaceholder viewName="Pseudocode SSA C View" onDock={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'decompiler' })} />
                ) : (
                  <DisassemblyView isPseudo={true} />
                )
              )}
              {state.activeCenterTab === 'hex' && (
                state.popoutViews.includes('hex') ? (
                  <FloatedViewPlaceholder viewName="Hex View-1" onDock={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'hex' })} />
                ) : (
                  <HexView />
                )
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* ── Bottom Panel ── */}
      <div className="h-[250px] border-t border-[var(--ida-border)] bg-[var(--ida-panel)] flex flex-col shrink-0">
        <div className="flex h-[26px] bg-[var(--ida-panel-2)] border-b border-[var(--ida-border)] shrink-0 select-none overflow-x-auto overflow-y-hidden">
          {bottomTabOrder.filter(tabId => !closedTabs.includes(tabId)).map((tabId) => {
            const tabsDef: Record<string, string> = { output: 'Output', console: 'Console', memmap: 'Program Segmentation', debugger: 'CPU Register Debugger' };
            const title = tabsDef[tabId];
            if (!title) return null;
            return (
              <div
                key={tabId} draggable={true} onDragStart={(e) => handleDragStart(e, tabId, 'bottom')} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDrop={(e) => handleTabDrop(e, tabId, 'bottom')}
                className={`flex items-center px-3 h-full border-r border-[var(--ida-border)] font-mono text-[11px] cursor-grab active:cursor-grabbing transition-all duration-100 select-none whitespace-nowrap shrink-0 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-text)] ${state.activeBottomTab === tabId ? 'bg-[var(--ida-tab-active)] text-[var(--ida-yellow)] font-medium' : 'bg-[var(--ida-tab-inactive)] text-[var(--ida-text-dim)]'} ${draggingTab?.tabId === tabId ? 'opacity-40 border-l-2 border-l-[var(--ida-yellow)] bg-[var(--ida-bg)]' : ''}`}
                onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', payload: tabId as any })} onContextMenu={(e) => handleTabContextMenu(e, tabId, 'bottom')}
              >
                {title}
                {state.popoutViews.includes(tabId) && <span className="text-[9px] text-emerald-400 font-bold ml-1 animate-pulse">🖥️</span>}
                <span onClick={(e) => { e.stopPropagation(); closeTab(tabId, 'bottom'); }} className="ml-2 text-zinc-500 hover:text-rose-400 cursor-pointer text-[9px] font-bold p-0.5 rounded hover:bg-zinc-800 transition-colors">✕</span>
              </div>
            );
          })}
          <span className="flex-1" />
        </div>

        <div 
          className={`flex-1 overflow-hidden flex bg-[var(--ida-bg)] transition-all duration-300 relative ${draggingTab?.tabType === 'bottom' ? 'border-2 border-dashed border-[var(--ida-yellow)] bg-[var(--ida-yellow)]/5 m-1 rounded-lg' : ''}`}
          onDragOver={handleDragOver} onDrop={(e) => handleContentDrop(e, 'bottom')}
        >
          {draggingTab?.tabType === 'bottom' && (
            <div className="absolute inset-0 bg-[var(--ida-bg)]/80 backdrop-blur-[1px] flex flex-col items-center justify-center font-mono pointer-events-none z-50">
              <span className="text-3xl mb-2 animate-bounce">⚓</span>
              <span className="text-[11px] text-[var(--ida-yellow)] font-bold tracking-wider uppercase">Drop Tab here to undock (float)</span>
            </div>
          )}

          <ErrorBoundary name="BottomTab">
            {state.activeBottomTab === 'output' && (state.popoutViews.includes('output') ? <FloatedViewPlaceholder viewName="Output Console" onDock={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'output' })} /> : <OutputLog />)}
            {state.activeBottomTab === 'console' && (state.popoutViews.includes('console') ? <FloatedViewPlaceholder viewName="Script Console" onDock={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'console' })} /> : <ScriptConsole />)}
            {state.activeBottomTab === 'memmap' && (state.popoutViews.includes('memmap') ? <FloatedViewPlaceholder viewName="Program Segmentation" onDock={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'memmap' })} /> : <MemoryMapView />)}
            {state.activeBottomTab === 'debugger' && (state.popoutViews.includes('debugger') ? <FloatedViewPlaceholder viewName="CPU Register Debugger" onDock={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: 'debugger' })} /> : <CpuDebugger />)}
          </ErrorBoundary>
        </div>
      </div>

      <StatusBar />

      {/* Loading Overlay */}
      {state.isLoading && (
        <div className="fixed inset-0 bg-[rgba(30,30,30,0.92)] z-[9999] flex items-center justify-center backdrop-blur-[2px]">
          <div className="font-mono text-[13px] text-[var(--ida-yellow)] border border-[var(--ida-border)] py-7 px-9 bg-[var(--ida-panel)] text-center shadow-[0_0_30px_rgba(0,0,0,0.7)] min-w-[300px]">
            <div className="text-2xl mb-3">⌛</div>
            <div>Autoanalysis in progress...</div>
            <div className="text-[11px] text-zinc-500 mt-1">WASM engine processing binary</div>
            <div className="w-full h-1 bg-[var(--ida-bg)] border border-[var(--ida-border)] overflow-hidden mt-4 rounded-[2px] relative">
              <div className="absolute h-full w-1/3 bg-[var(--ida-accent)] rounded-[2px] animate-scan" />
            </div>
          </div>
        </div>
      )}

      {/* Popout Windows */}
      {state.popoutViews.map(view => (
        <PopoutWindow key={view} title={`WebDasm - Floating Portal: ${view.toUpperCase()}`} onClose={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: view })}>
          <div className="flex flex-col h-full overflow-hidden p-3 bg-[var(--ida-bg)]">
            <div className="flex items-center gap-3 pb-2 border-b border-[var(--ida-border)] mb-2 shrink-0 select-none">
              <span className="font-bold text-[var(--ida-yellow)] text-xs flex items-center gap-1.5 font-mono uppercase tracking-wider">🖥️ WebDasm Floating View: {view}</span>
              <span className="flex-1" />
              <button onClick={() => dispatch({ type: 'CLOSE_POPOUT_VIEW', payload: view })} className="bg-[#C0392B] hover:bg-[#A93226] text-white border-none rounded px-3 py-1 text-[10px] font-bold cursor-pointer transition-colors duration-100 font-mono tracking-wider uppercase">✕ Dock Back</button>
            </div>
            <div className="flex-1 overflow-hidden flex bg-[var(--ida-panel)] border border-[var(--ida-border)] rounded p-2">
              <ErrorBoundary name={`Popout:${view}`}>
                {view === 'decompiler' && <DisassemblyView isPseudo={true} />}
                {view === 'hex' && <HexView />}
                {view === 'debugger' && <CpuDebugger />}
                {view === 'disasm' && <DisassemblyView isPseudo={false} />}
                {view === 'cfg' && <CFGView />}
                {view === 'output' && <OutputLog />}
                {view === 'console' && <ScriptConsole />}
                {view === 'memmap' && <MemoryMapView />}
              </ErrorBoundary>
            </div>
          </div>
        </PopoutWindow>
      ))}

      {/* High-end Tab Context Menu */}
      {contextMenu.visible && (
        <div className="fixed bg-[var(--ida-panel)] border border-[var(--ida-border)] shadow-[0_6px_24px_rgba(0,0,0,0.6)] rounded font-mono text-[11px] py-1 z-[10000] min-w-[210px] select-none text-left" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <div className="px-3 py-1.5 text-zinc-500 font-bold border-b border-zinc-800/80 text-[8.5px] tracking-wider uppercase">Tab Options: {contextMenu.tabId}</div>
          <button
            className="w-full text-left px-3 py-2 text-zinc-200 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-yellow)] flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]"
            onClick={() => {
              let payload: any = contextMenu.tabId;
              if (contextMenu.tabId === 'idaview') payload = state.idaViewMode === 'graph' ? 'cfg' : 'disasm';
              else if (contextMenu.tabId === 'pseudo') payload = 'decompiler';
              dispatch({ type: 'SET_POPOUT_VIEW', payload });
              closeContextMenu();
            }}
          >🖥️ Pop out to Independent Window</button>
          {contextMenu.tabId === 'idaview' && (
            <button
              className="w-full text-left px-3 py-2 text-zinc-200 hover:bg-[var(--ida-menu-hover)] hover:text-[var(--ida-yellow)] flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]"
              onClick={() => { dispatch({ type: 'SET_IDA_VIEW_MODE', payload: state.idaViewMode === 'graph' ? 'text' : 'graph' }); closeContextMenu(); }}
            >🔁 Toggle Graph / Text View</button>
          )}
          <div className="border-t border-zinc-800/60 my-1" />
          <button className="w-full text-left px-3 py-2 text-zinc-400 hover:bg-[var(--ida-menu-hover)] hover:text-zinc-200 flex items-center gap-2 cursor-pointer bg-transparent border-0 font-mono text-[11px]" onClick={closeContextMenu}>✕ Cancel Menu</button>
        </div>
      )}

      {/* Modals */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <JumpToModal isOpen={isJumpOpen} onClose={() => setIsJumpOpen(false)} initialAddress={state.selectedAddress || ''} />
      <ThemeModal isOpen={isThemeOpen} onClose={() => setIsThemeOpen(false)} />
    </div>
  );
}
