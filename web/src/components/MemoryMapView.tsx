import { useApp } from '../store';

export default function MemoryMapView() {
  const { state } = useApp();

  if (state.currentSegments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--ida-text-dim)] text-[11px] italic">
        No segments mapped.
      </div>
    );
  }

  let baseAddr = 0x140000000;

  return (
    <div className="flex-1 overflow-y-auto p-1">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="bg-[var(--ida-menu-bg)] px-1.5 py-0.75 border border-[var(--ida-border)] font-semibold text-left text-[var(--ida-text)]">Start</th>
            <th className="bg-[var(--ida-menu-bg)] px-1.5 py-0.75 border border-[var(--ida-border)] font-semibold text-left text-[var(--ida-text)]">End</th>
            <th className="bg-[var(--ida-menu-bg)] px-1.5 py-0.75 border border-[var(--ida-border)] font-semibold text-left text-[var(--ida-text)]">Segment</th>
            <th className="bg-[var(--ida-menu-bg)] px-1.5 py-0.75 border border-[var(--ida-border)] font-semibold text-left text-[var(--ida-text)]">Class</th>
            <th className="bg-[var(--ida-menu-bg)] px-1.5 py-0.75 border border-[var(--ida-border)] font-semibold text-left text-[var(--ida-text)]">Perm</th>
            <th className="bg-[var(--ida-menu-bg)] px-1.5 py-0.75 border border-[var(--ida-border)] font-semibold text-left text-[var(--ida-text)]">Size</th>
          </tr>
        </thead>
        <tbody>
          {state.currentSegments.map((seg, i) => {
            const size = 0x1000 + (i * 0x500);
            const start = baseAddr;
            const end = start + size;
            baseAddr = end;

            const perms = seg.includes('.text') ? 'R . X' : seg.includes('.rdata') ? 'R . .' : 'R W .';
            const cls = seg.includes('.text') ? 'CODE' : seg.includes('.rdata') ? 'CONST' : 'DATA';

            return (
              <tr key={i} className="hover:bg-[var(--ida-menu-hover)] hover:text-white transition-colors duration-75">
                <td className="px-1.5 py-0.5 border-b border-[var(--ida-border)] font-mono text-[var(--ida-yellow)]">
                  {start.toString(16).padStart(16, '0').toUpperCase()}
                </td>
                <td className="px-1.5 py-0.5 border-b border-[var(--ida-border)] font-mono text-[var(--ida-yellow)]">
                  {end.toString(16).padStart(16, '0').toUpperCase()}
                </td>
                <td className="px-1.5 py-0.5 border-b border-[var(--ida-border)] text-[var(--ida-string)] font-semibold">{seg}</td>
                <td className="px-1.5 py-0.5 border-b border-[var(--ida-border)] text-[var(--ida-text)]">{cls}</td>
                <td className="px-1.5 py-0.5 border-b border-[var(--ida-border)] font-mono text-[var(--ida-number)]">{perms}</td>
                <td className="px-1.5 py-0.5 border-b border-[var(--ida-border)] text-[var(--ida-text-dim)]">0x{size.toString(16).toUpperCase()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
