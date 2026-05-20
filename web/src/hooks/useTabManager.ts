import { useState, useCallback } from 'react';
import { useApp } from '../store';
import type { CenterTab, BottomTab } from '../types';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tabId: string;
  tabType: 'center' | 'bottom';
}

export function useTabManager() {
  const { dispatch } = useApp();

  const [centerTabOrder, setCenterTabOrder] = useState<string[]>(['idaview', 'pseudo', 'hex']);
  const [bottomTabOrder, setBottomTabOrder] = useState<string[]>(['output', 'console', 'memmap', 'debugger']);
  const [closedTabs, setClosedTabs] = useState<string[]>([]);
  const [draggingTab, setDraggingTab] = useState<{ tabId: string; tabType: 'center' | 'bottom' } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, tabId: '', tabType: 'center',
  });

  const openTab = useCallback((tabId: string) => {
    setClosedTabs(prev => prev.filter(x => x !== tabId));
    if (['idaview', 'pseudo', 'hex'].includes(tabId)) {
      dispatch({ type: 'SET_CENTER_TAB', payload: tabId as CenterTab });
    } else {
      dispatch({ type: 'SET_BOTTOM_TAB', payload: tabId as BottomTab });
    }
  }, [dispatch]);

  const closeTab = useCallback((tabId: string, tabType: 'center' | 'bottom') => {
    setClosedTabs(prev => [...prev, tabId]);
    if (tabType === 'center') {
      dispatch({ type: 'SET_CENTER_TAB', payload: 'idaview' });
    } else {
      const fallbacks = tabType === 'bottom'
        ? ['output', 'console', 'memmap', 'debugger'].filter(t => t !== tabId)
        : [];
      if (fallbacks[0]) dispatch({ type: 'SET_BOTTOM_TAB', payload: fallbacks[0] as BottomTab });
    }
  }, [dispatch]);

  const restoreAllTabs = useCallback(() => setClosedTabs([]), []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string, tabType: 'center' | 'bottom') => {
    setDraggingTab({ tabId, tabType });
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.setData('tabType', tabType);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingTab(null);
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string, tabType: 'center' | 'bottom') => {
    e.preventDefault();
    const sourceTabId = e.dataTransfer.getData('text/plain');
    const sourceTabType = e.dataTransfer.getData('tabType') as 'center' | 'bottom';
    if (sourceTabType !== tabType || sourceTabId === targetTabId) return;

    const reorder = (items: string[]) => {
      const next = [...items];
      const srcIdx = next.indexOf(sourceTabId);
      const tgtIdx = next.indexOf(targetTabId);
      if (srcIdx !== -1 && tgtIdx !== -1) {
        next.splice(srcIdx, 1);
        next.splice(tgtIdx, 0, sourceTabId);
      }
      return next;
    };

    if (tabType === 'center') setCenterTabOrder(reorder);
    else setBottomTabOrder(reorder);
    setDraggingTab(null);
  }, []);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string, tabType: 'center' | 'bottom') => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, tabId, tabType });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
  }, []);

  return {
    centerTabOrder,
    bottomTabOrder,
    closedTabs,
    draggingTab,
    contextMenu,
    openTab,
    closeTab,
    restoreAllTabs,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleTabDrop,
    handleTabContextMenu,
    closeContextMenu,
    setContextMenu,
  };
}
