import Modal from '../Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: Props) {
  return (
    <Modal isOpen={isOpen} title="About WebDasm" onClose={onClose} width={380}>
      <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
        <div className="flex flex-col gap-1 pb-2 border-b border-[var(--ida-border)]">
          <span className="font-bold text-[var(--ida-yellow)] text-xs tracking-tight">WebDasm Workstation</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 text-[9px] font-medium bg-[var(--ida-bg)] text-[var(--ida-text)] rounded border border-[var(--ida-border)]">v2.0.2 Stable</span>
            <span className="text-[10px] text-[var(--ida-text-dim)]">React WebAssembly Core</span>
          </div>
        </div>
        <p className="m-0 leading-relaxed text-[var(--ida-text)]">
          A high-performance static analysis and binary reverse engineering platform.
          Executables are parsed, disassembled, and cross-referenced entirely on the
          client-side using WebAssembly.
        </p>
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
