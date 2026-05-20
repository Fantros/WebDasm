import { useApp } from '../store';

export default function StatusBar() {
  const { state } = useApp();

  return (
    <div className="h-[22px] bg-[var(--ida-accent)] flex items-center px-3 gap-4 text-[11px] text-white shrink-0">
      <div className="flex items-center gap-1.5">
        <span>⬤</span>
        <span>{state.wasmReady ? 'WASM Ready' : 'Loading WASM...'}</span>
      </div>
      <span className="opacity-40">|</span>
      <div className="flex items-center gap-1.5">
        <span>{state.fileType}</span>
        {state.fileArch !== '-' && <><span>·</span><span>{state.fileArch}</span></>}
      </div>
      {state.currentDisasm.length > 0 && (
        <>
          <span className="opacity-40">|</span>
          <div className="flex items-center gap-1.5">
            <span>{state.currentDisasm.length} insns</span>
          </div>
        </>
      )}
      {state.selectedAddress && (
        <>
          <span className="opacity-40">|</span>
          <div className="flex items-center gap-1.5">
            <span>Cursor: <span className="text-[#DCDCAA]">0x{state.selectedAddress}</span></span>
          </div>
        </>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 text-[10px]">
        <span>N=Rename</span>
        <span className="opacity-40">|</span>
        <span>;=Comment</span>
        <span className="opacity-40">|</span>
        <span>G=Jump</span>
        <span className="opacity-40">|</span>
        <span>F5=Pseudocode</span>
      </div>
    </div>
  );
}
