import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
}

export default function Modal({ isOpen, title, onClose, children, width = 480 }: ModalProps) {
  // Listen for Escape key to close the modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] backdrop-blur-[2px] transition-all duration-150"
      onClick={onClose}
    >
      <div
        className="w-full bg-[var(--ida-panel)] border border-[var(--ida-border)] shadow-[0_20px_50px_rgba(0,0,0,0.6)] rounded overflow-hidden flex flex-col animate-[modalSlideIn_0.15s_ease-out] max-h-[85vh] max-w-[90vw]"
        style={{ width }}
        onClick={e => e.stopPropagation()}
      >
        {/* Native-feeling Desktop Titlebar Header */}
        <div className="flex justify-between items-center px-[18px] py-3 bg-[var(--ida-panel-2)] border-b border-[var(--ida-border)] select-none shrink-0">
          <span className="text-[var(--ida-text)] font-mono text-[11px] font-bold tracking-wide">
            {title}
          </span>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-[var(--ida-text-dim)] hover:text-white cursor-pointer text-[12px] transition-colors p-0.5 flex items-center justify-center outline-none"
            title="Close"
          >
            ✕
          </button>
        </div>
        
        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-[var(--ida-text)] text-[11px]">
          {children}
        </div>
      </div>
      <style>{`
        @keyframes modalSlideIn {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}
