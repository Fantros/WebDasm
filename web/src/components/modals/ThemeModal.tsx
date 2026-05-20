import Modal from '../Modal';
import { useTheme, THEME_CATALOG } from '../../hooks/useTheme';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ThemeModal({ isOpen, onClose }: Props) {
  const { activeThemeId, switchTheme } = useTheme();

  return (
    <Modal isOpen={isOpen} title="Theme Selection" onClose={onClose} width={440}>
      <div className="flex flex-col gap-3 font-mono text-[11px] text-[var(--ida-text)]">
        <div className="text-[var(--ida-text-dim)] leading-relaxed mb-2">
          Select a UI theme. This changes colors and editor syntax highlighting globally:
        </div>
        <div className="grid grid-cols-1 gap-2">
          {THEME_CATALOG.map(th => {
            const isActive = activeThemeId === th.id;
            return (
              <div
                key={th.id}
                onClick={() => { switchTheme(th.id); onClose(); }}
                className={`flex justify-between items-center px-4 py-3 rounded-md cursor-pointer border transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--ida-accent)]/10 border-[var(--ida-accent)] shadow-[0_0_12px_rgba(var(--ida-accent-rgb),0.15)]'
                    : 'bg-[var(--ida-bg)] border-[var(--ida-border)] hover:border-[var(--ida-text-dim)] hover:bg-[var(--ida-panel-2)]'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className={`font-bold ${isActive ? 'text-[var(--ida-accent)]' : 'text-[var(--ida-text)]'}`}>{th.name}</span>
                  <span className="text-[9.5px] text-[var(--ida-text-dim)]">{th.desc}</span>
                </div>
                <div className="flex gap-1.5 p-1.5 bg-black/20 rounded">
                  {th.colors.map((c, i) => (
                    <div key={i} className="w-3.5 h-3.5 rounded-sm border border-white/10 shadow-sm" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-4 border-t border-[var(--ida-border)]/50 mt-2">
          <button
            className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text)] border border-[var(--ida-border)] rounded-md font-medium cursor-pointer transition-colors duration-100 select-none text-[11px] font-mono leading-none"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
