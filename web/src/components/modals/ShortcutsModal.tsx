import { Fragment } from 'react';
import Modal from '../Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { name: 'Rename Symbol',           keys: ['N'] },
  { name: 'Add Comment',             keys: [';'] },
  { name: 'Toggle Pseudocode View',  keys: ['F5'] },
  { name: 'Toggle Graph / Text View',keys: ['Space'] },
  { name: 'Re-analyze Binary',       keys: ['F9'] },
  { name: 'Jump to Address / Node',  keys: ['Ctrl', 'G'] },
  { name: 'Emulator Step Into',      keys: ['F7'] },
  { name: 'Toggle Bookmark',         keys: ['M'] },
  { name: 'Go Back (History)',        keys: ['Alt', '◀'] },
  { name: 'Go Forward (History)',     keys: ['Alt', '▶'] },
  { name: 'Toggle Sidebar',          keys: ['Alt', '1'] },
];

export default function ShortcutsModal({ isOpen, onClose }: Props) {
  return (
    <Modal isOpen={isOpen} title="Keyboard Shortcuts" onClose={onClose} width={440}>
      <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
        <div className="text-[var(--ida-text-dim)] leading-relaxed">
          Use these global hotkeys to navigate the workstation and accelerate your analysis:
        </div>
        <div className="flex flex-col gap-1 bg-[var(--ida-bg)] p-3 rounded border border-[var(--ida-border)]">
          {SHORTCUTS.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center py-2 border-b border-[var(--ida-border)]/30 last:border-b-0">
              <span className="text-[var(--ida-text)] font-medium">{item.name}</span>
              <div className="flex items-center gap-1">
                {item.keys.map((k, kIdx) => (
                  <Fragment key={kIdx}>
                    {kIdx > 0 && <span className="text-[var(--ida-text-dim)]">+</span>}
                    <kbd className="px-1.5 py-0.5 rounded bg-[var(--ida-panel-2)] border border-[var(--ida-border)] text-[var(--ida-yellow)] font-mono text-[10px] font-medium tracking-wide">
                      {k}
                    </kbd>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-3">
          <button
            className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text)] border border-[var(--ida-border)] rounded-md font-medium cursor-pointer transition-colors duration-100 select-none text-[11px] font-mono leading-none"
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </Modal>
  );
}
