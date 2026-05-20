import { useState, useCallback, useRef } from 'react';
import { useApp } from '../store';

export function useNavigationHistory() {
  const { dispatch } = useApp();
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const isNavigating = useRef(false);

  /**
   * Call this when a new address is selected organically (not via back/forward).
   * Uses functional updater to avoid stale closure issues with historyIdx.
   */
  const pushAddress = useCallback(
    (address: string) => {
      if (isNavigating.current) {
        isNavigating.current = false;
        return;
      }
      setHistoryIdx(prevIdx => {
        setHistory(prev => {
          if (prev[prevIdx] === address) return prev;
          const next = prev.slice(0, prevIdx + 1);
          next.push(address);
          return next;
        });
        return prevIdx + 1 < 0 ? 0 : prevIdx + 1;
      });
    },
    []
  );

  const handleBack = useCallback(() => {
    setHistoryIdx(prevIdx => {
      if (prevIdx <= 0) return prevIdx;
      const nextIdx = prevIdx - 1;
      isNavigating.current = true;
      setHistory(hist => {
        const addr = hist[nextIdx];
        if (addr) {
          dispatch({ type: 'SET_SELECTED_ADDRESS', payload: addr });
          window.dispatchEvent(
            new CustomEvent('jump-to-node', { detail: { address: addr, forceGraph: true } })
          );
        }
        return hist;
      });
      return nextIdx;
    });
  }, [dispatch]);

  const handleForward = useCallback(() => {
    setHistoryIdx(prevIdx => {
      setHistory(hist => {
        if (prevIdx >= hist.length - 1) return hist;
        const nextIdx = prevIdx + 1;
        isNavigating.current = true;
        const addr = hist[nextIdx];
        if (addr) {
          dispatch({ type: 'SET_SELECTED_ADDRESS', payload: addr });
          window.dispatchEvent(
            new CustomEvent('jump-to-node', { detail: { address: addr, forceGraph: true } })
          );
        }
        return hist;
      });
      return prevIdx + 1 < 0 ? 0 : prevIdx + 1;
    });
  }, [dispatch]);

  return {
    history,
    historyIdx,
    isNavigating,
    pushAddress,
    handleBack,
    handleForward,
  };
}
