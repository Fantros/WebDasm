import React from 'react';
import { useApp } from '../store';
import type { LogMessage } from '../store';

function logColorClass(type: LogMessage['type']): string {
  switch (type) {
    case 'error': return 'text-[var(--ida-red)]';
    case 'warning': return 'text-[var(--ida-warning)]';
    case 'success': return 'text-[var(--ida-success)]';
    case 'search': return 'text-[var(--ida-keyword)]';
    default: return 'text-[var(--ida-text)]';
  }
}

function logPrefix(type: LogMessage['type']): string {
  switch (type) {
    case 'error': return '[ERROR]';
    case 'warning': return '[!]';
    case 'success': return '[+]';
    case 'search': return '[SEARCH]';
    default: return '[*]';
  }
}

export default function OutputLog() {
  const { state, dispatch } = useApp();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [state.logMessages.length]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Log header with clear button */}
      <div className="flex justify-between items-center px-2 h-[22px] border-b border-[var(--ida-border)] bg-[var(--ida-panel-2)] shrink-0">
        <span className="text-[10px] text-[var(--ida-text-dim)]">Output Log</span>
        <div className="flex gap-2">
          <button 
            className="bg-[var(--ida-panel-2)] hover:bg-[var(--ida-menu-hover)] hover:text-white text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-1.5 py-0.5 text-[10px] cursor-pointer" 
            onClick={() => dispatch({ type: 'CLEAR_LOG' })}
            title="Clear Output Log"
          >
            🚫 Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.logMessages.slice(-200).map(msg => (
          <div key={msg.id} className="mb-0.5 flex gap-2 text-[11px]">
            <span className="text-[var(--ida-text-dim)] shrink-0 text-[10px]">
              {msg.timestamp.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={logColorClass(msg.type)}>
              <span className="font-semibold">{logPrefix(msg.type)}</span>{' '}
              {msg.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
