import { useState } from 'react';
import Modal from '../Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialAddress?: string;
}

export default function JumpToModal({ isOpen, onClose, initialAddress = '' }: Props) {
  const [input, setInput] = useState(initialAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    window.dispatchEvent(
      new CustomEvent('jump-to-node', { detail: val.replace('0x', '').toUpperCase() })
    );
    onClose();
  };

  return (
    <Modal isOpen={isOpen} title="Jump to Address" onClose={onClose} width={380}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-mono text-[11px]">
        <div className="text-[var(--ida-text-dim)] leading-relaxed">
          Enter target hexadecimal address, function offset, or symbol name:
        </div>
        <input
          type="text"
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="e.g. 1000, 0x401000, sub_4012C0"
          className="w-full px-3 py-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none transition-colors duration-100"
        />
        <div className="flex justify-end gap-2.5 items-center pt-3">
          <button
            type="button"
            className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text-dim)] hover:text-white border border-[var(--ida-border)] rounded-md transition-colors duration-100 cursor-pointer select-none text-[11px] font-mono leading-none"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-8 px-4 flex items-center justify-center bg-[var(--ida-accent)] hover:bg-[var(--ida-accent-hover)] text-white border-none rounded-md font-bold cursor-pointer transition-colors duration-100 select-none text-[11px] font-mono leading-none"
          >
            Jump
          </button>
        </div>
      </form>
    </Modal>
  );
}
