import { useEffect } from 'react';
import { useApp } from '../store';

interface KeyboardShortcutsOptions {
  openJumpModal: () => void;
  handleBack: () => void;
  handleForward: () => void;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  analyze: () => void;
}

export function useKeyboardShortcuts({
  openJumpModal,
  handleBack,
  handleForward,
  setSidebarCollapsed,
  analyze,
}: KeyboardShortcutsOptions) {
  const { state, dispatch } = useApp();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F9 = analyze
      if (e.key === 'F9') {
        e.preventDefault();
        analyze();
        return;
      }
      // F5 = toggle pseudocode
      if (e.key === 'F5') {
        e.preventDefault();
        dispatch({
          type: 'SET_CENTER_TAB',
          payload: state.activeCenterTab === 'pseudo' ? 'idaview' : 'pseudo',
        });
        return;
      }
      // Space = toggle graph / text view
      if (e.key === ' ' || e.code === 'Space') {
        if (document.activeElement?.tagName === 'INPUT') return;
        if (document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        dispatch({ type: 'SET_CENTER_TAB', payload: 'idaview' });
        dispatch({ type: 'SET_IDA_VIEW_MODE', payload: state.idaViewMode === 'graph' ? 'text' : 'graph' });
        return;
      }
      // Alt+1 = toggle sidebar
      if (e.altKey && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
        return;
      }
      // Ctrl/Cmd+G = jump to address
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        openJumpModal();
        return;
      }
      // Alt+Left = navigate back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
        return;
      }
      // Alt+Right = navigate forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleForward();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    state.activeCenterTab,
    state.idaViewMode,
    dispatch,
    openJumpModal,
    handleBack,
    handleForward,
    setSidebarCollapsed,
    analyze,
  ]);

  // Global drag-and-drop file handler on window
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    return () => {
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);

  // Global jump-to-node event handler
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      let addrRaw = '';
      let forceGraph = false;

      if (typeof detail === 'object' && detail !== null) {
        addrRaw = detail.address || '';
        forceGraph = !!detail.forceGraph;
      } else {
        addrRaw = String(detail);
      }

      if (!addrRaw) return;

      const cleanHex = addrRaw.replace('0x', '').replace('0X', '').trim().toUpperCase();
      const paddedHex = cleanHex.padStart(8, '0');

      dispatch({ type: 'SET_SELECTED_ADDRESS', payload: paddedHex });
      dispatch({ type: 'SET_CENTER_TAB', payload: 'idaview' });
      if (forceGraph) {
        dispatch({ type: 'SET_IDA_VIEW_MODE', payload: 'graph' });
      }
    };
    window.addEventListener('jump-to-node', handler);
    return () => window.removeEventListener('jump-to-node', handler);
  }, [dispatch]);
}
