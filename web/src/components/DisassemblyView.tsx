import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useApp } from '../store';
import { useWasm } from '../hooks/useWasm';
import Modal from './Modal';

const ROW_HEIGHT = 20;

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  addr: string;
  token?: { name: string; type: string } | null;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ADDR_REGEX = /^([0-9A-F]{8})\s+\|/;
const INSTR_REGEX = /\b(mov|push|pop|call|ret|jmp|je|jne|jz|jnz|jb|ja|jl|jg|cmp|test|add|sub|xor|and|or|inc|dec|lea|nop|int|syscall|rdtsc|cpuid)\b/gi;
const HEX_REGEX = /\b(0x[0-9a-fA-F]+|[0-9a-fA-F]{2,8}h)\b/g;
const REG_REGEX = /\b(eax|ebx|ecx|edx|esi|edi|esp|ebp|eip|rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|rip|al|ah|bl|bh|cl|ch|dl|dh)\b/gi;

function colorizeAsm(line: string): string {
  let colored = line.replace(ADDR_REGEX, '<span style="color:var(--ida-number);">$1</span> |');
  colored = colored.replace(INSTR_REGEX, '<span style="color:var(--ida-keyword);">$1</span>');
  colored = colored.replace(HEX_REGEX, '<span style="color:var(--ida-number);">$1</span>');
  colored = colored.replace(REG_REGEX, '<span style="color:var(--ida-string);">$1</span>');
  return colored;
}

const PSEUDO_KW_REGEX = /\b(void|int|char|if|else|goto|return|push|pop|for|while)\b/g;
const PSEUDO_COMMENT_REGEX = /(\/\/[^<]*)/g;

function colorizePseudoC(
  line: string,
  typeMap: Record<string, string>,
  selectedTokenName: string | null,
  renameMap: Record<string, string> = {}
): string {
  const declMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_*]*)\s+([a-zA-Z_][a-zA-Z0-9_]*);/);
  if (declMatch) {
    const indent = declMatch[1];
    const originalType = declMatch[2];
    const varName = declMatch[3];
    const activeType = typeMap[varName] || originalType;

    return `${indent}<span class="c-token type" data-token-type="type" data-token-name="${varName}" style="color:var(--ida-keyword);cursor:pointer;">${activeType}</span> <span class="c-token var" data-token-type="var" data-token-name="${varName}" style="color:var(--ida-yellow);cursor:pointer;">${varName}</span>;`;
  }

  let colored = line.replace(PSEUDO_KW_REGEX, '<span style="color:var(--ida-keyword);">$1</span>');
  colored = colored.replace(HEX_REGEX, '<span style="color:var(--ida-number);">$1</span>');

  const varRegex = /\b(v[0-9]+|var_[0-9a-fA-F]+|sub_[0-9a-fA-F]+|rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|rip|eax|ebx|ecx|edx|esi|edi|esp|ebp|eip|x0|w0|x1|w1|x2|w2|x3|w3|x4|w4|x5|w5|x6|w6|x7|w7|x8|w8)\b/g;
  colored = colored.replace(varRegex, '<span class="c-token var" data-token-type="var" data-token-name="$1" style="color:var(--ida-yellow);cursor:pointer;">$1</span>');

  const renameNames = Object.values(renameMap).filter(Boolean);
  if (renameNames.length > 0) {
    const escapedNames = renameNames.map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const renameRegex = new RegExp(`\\b(${escapedNames.join('|')})\\b`, 'g');
    colored = colored.replace(renameRegex, '<span class="c-token var" data-token-type="var" data-token-name="$1" style="color:var(--ida-yellow);cursor:pointer;">$1</span>');
  }

  const funcCallRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  colored = colored.replace(funcCallRegex, (match, funcName) => {
    if (['if', 'while', 'for', 'switch', 'var'].includes(funcName)) return match;
    return `<span class="c-token var" data-token-type="var" data-token-name="${funcName}" style="color:var(--ida-yellow);cursor:pointer;">${funcName}</span>(`;
  });

  colored = colored.replace(PSEUDO_COMMENT_REGEX, '<span style="color:var(--ida-comment);">$1</span>');

  if (selectedTokenName) {
    const escapedSelected = selectedTokenName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const selRegex = new RegExp(`data-token-name="${escapedSelected}"`, 'g');
    colored = colored.replace(selRegex, `data-token-name="${selectedTokenName}" class="c-token selected-token" style="background:#505050;color:#FFF !important;font-weight:600;border-radius:2px;padding:0 2px;border:1px solid var(--ida-yellow);"`);
  }

  return colored;
}

export default function DisassemblyView({ isPseudo = false }: { isPseudo?: boolean }) {
  const { state, dispatch, applyRenames } = useApp();
  const { analyze } = useWasm();
  const parentRef = useRef<HTMLDivElement>(null);

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, addr: '', token: null });
  const [selectedToken, setSelectedToken] = useState<{ name: string; type: string } | null>(null);

  const [flirtModal, setFlirtModal] = useState({ visible: false, addr: '', bytes: [] as string[], wildcards: [] as boolean[], name: '' });

  const openFlirtModal = (addr: string) => {
    const offset = parseInt(addr, 16);
    if (!state.globalBytes || offset >= state.globalBytes.length) {
      alert("No binary loaded or address out of bounds.");
      return;
    }
    const size = Math.min(8, state.globalBytes.length - offset);
    const slice = Array.from(state.globalBytes.slice(offset, offset + size));
    const hexBytes = slice.map(b => b.toString(16).toUpperCase().padStart(2, '0'));
    setFlirtModal({ visible: true, addr, bytes: hexBytes, wildcards: new Array(size).fill(false), name: `fn_flirt_${addr}` });
  };

  const handleToggleWildcard = (index: number) => {
    setFlirtModal(prev => {
      const nextW = [...prev.wildcards];
      nextW[index] = !nextW[index];
      return { ...prev, wildcards: nextW };
    });
  };

  const handleAdjustFlirtSize = (diff: number) => {
    const offset = parseInt(flirtModal.addr, 16);
    if (!state.globalBytes) return;

    const currentSize = flirtModal.bytes.length;
    let newSize = Math.max(2, Math.min(16, currentSize + diff));
    if (offset + newSize > state.globalBytes.length) newSize = state.globalBytes.length - offset;

    const slice = Array.from(state.globalBytes.slice(offset, offset + newSize));
    const hexBytes = slice.map(b => b.toString(16).toUpperCase().padStart(2, '0'));

    setFlirtModal(prev => ({
      ...prev,
      bytes: hexBytes,
      wildcards: new Array(newSize).fill(false).map((_, i) => prev.wildcards[i] || false),
    }));
  };

  const handleSaveFlirt = () => {
    const patternStr = flirtModal.bytes.map((b, i) => flirtModal.wildcards[i] ? "??" : b).join(" ");
    if (!flirtModal.name.trim()) return alert("Signature name cannot be empty.");
    
    if ((window as any).WebDasm_wasmRegister) {
      const success = (window as any).WebDasm_wasmRegister(patternStr, flirtModal.name.trim());
      if (success) {
        dispatch({ type: 'ADD_LOG', payload: { type: 'success', text: `[FLIRT] Registered custom signature '${flirtModal.name.trim()}'`, timestamp: new Date() } });
        setFlirtModal(prev => ({ ...prev, visible: false }));
        analyze();
      } else alert("Failed to register signature to WASM core.");
    } else alert("WASM core is not ready yet.");
  };

  const resolveSymbolAddress = useCallback((name: string): string => {
    if (!name) return '';
    if (name.startsWith('sub_')) return name.replace('sub_', '');
    const renameEntry = Object.entries(state.renameMap).find(([_, rname]) => rname === name);
    if (renameEntry) return renameEntry[0];

    for (const line of state.currentDisasm) {
      const match = line.match(/^([0-9A-F]{8})/i);
      if (match && line.includes(`; FLIRT matched: ${name}`)) return match[1];
    }
    return '';
  }, [state.renameMap, state.currentDisasm]);

  const lines = isPseudo ? state.currentPseudoC : state.currentDisasm;

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const promptRename = useCallback((addr: string) => {
    const current = state.renameMap[addr] || '';
    const newName = window.prompt(`Rename '${addr}' to:`, current);
    if (newName === null) return;
    if (newName.trim() === '') dispatch({ type: 'DELETE_RENAME', payload: addr });
    else dispatch({ type: 'SET_RENAME', payload: { addr, name: newName.trim() } });
  }, [state.renameMap, dispatch]);

  const promptComment = useCallback((addr: string) => {
    const current = state.commentMap[addr] || '';
    const comment = window.prompt(`Add comment to '${addr}':`, current);
    if (comment === null) return;
    if (comment.trim() === '') dispatch({ type: 'DELETE_COMMENT', payload: addr });
    else dispatch({ type: 'SET_COMMENT', payload: { addr, comment: comment.trim() } });
  }, [state.commentMap, dispatch]);

  // Click handler via event delegation
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('c-token')) {
      const tokenType = target.dataset.tokenType || '';
      const tokenName = target.dataset.tokenName || '';
      const targetAddr = resolveSymbolAddress(tokenName);

      if (targetAddr) {
        window.dispatchEvent(new CustomEvent('jump-to-node', { detail: targetAddr }));
        return;
      }

      setSelectedToken({ name: tokenName, type: tokenType });
      dispatch({ type: 'ADD_LOG', payload: { type: 'info', text: `[Decompiler] Selected ${tokenType} token '${tokenName}'`, timestamp: new Date() } });
      return;
    }

    setSelectedToken(null);
    const row = target.closest('[data-addr]') as HTMLElement;
    if (!row) return;
    const addr = row.dataset.addr || '';
    dispatch({ type: 'SET_SELECTED_ADDRESS', payload: addr });
    if (e.shiftKey && addr) promptComment(addr);
  }, [dispatch, resolveSymbolAddress, promptComment]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;
    if (target.classList.contains('c-token')) {
      const tokenName = target.dataset.tokenName || '';
      const targetAddr = resolveSymbolAddress(tokenName);

      if (targetAddr) {
        window.dispatchEvent(new CustomEvent('jump-to-node', { detail: targetAddr }));
        return;
      }

      const current = state.renameMap[tokenName] || tokenName;
      const newName = window.prompt(`Rename variable '${tokenName}' to:`, current);
      if (newName === null) return;
      if (newName.trim() === '') dispatch({ type: 'DELETE_RENAME', payload: tokenName });
      else dispatch({ type: 'SET_RENAME', payload: { addr: tokenName, name: newName.trim() } });
      setSelectedToken(null);
      return;
    }

    const row = target.closest('[data-addr]') as HTMLElement;
    if (!row) return;
    const addr = row.dataset.addr || '';
    if (addr) promptRename(addr);
  }, [resolveSymbolAddress, state.renameMap, dispatch, promptRename]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;

    if (isPseudo && target.classList.contains('c-token')) {
      const tokenName = target.dataset.tokenName || '';
      const tokenType = target.dataset.tokenType || '';
      if (tokenName) {
        setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, addr: '', token: { name: tokenName, type: tokenType } });
        return;
      }
    }

    const row = target.closest('[data-addr]') as HTMLElement;
    const addr = row?.dataset.addr || '';

    if (isPseudo) {
      setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, addr: addr || state.selectedAddress || '', token: null });
    } else {
      if (!addr) return;
      setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, addr, token: null });
    }
  }, [isPseudo, state.selectedAddress]);

  // Scroll to selected address
  useEffect(() => {
    if (!state.selectedAddress || !parentRef.current) return;
    const targetAddr = state.selectedAddress.replace('0x', '').replace(/^0+/, '').trim().toUpperCase();
    
    const index = lines.findIndex(line => {
      const match = line.match(/^([0-9A-F]+)/i);
      if (!match) return false;
      return match[1].replace(/^0+/, '').toUpperCase() === targetAddr;
    });

    if (index !== -1) {
      rowVirtualizer.scrollToIndex(index, { align: 'center' });
    }
  }, [state.selectedAddress, lines, rowVirtualizer]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu.visible) return;
    const handler = () => setCtxMenu(c => ({ ...c, visible: false }));
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu.visible]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isPseudo && selectedToken) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault(); e.stopPropagation();
          const current = state.renameMap[selectedToken.name] || selectedToken.name;
          const newName = window.prompt(`Rename variable '${selectedToken.name}' to:`, current);
          if (newName !== null) {
            if (newName.trim() === '') dispatch({ type: 'DELETE_RENAME', payload: selectedToken.name });
            else dispatch({ type: 'SET_RENAME', payload: { addr: selectedToken.name, name: newName.trim() } });
          }
          setSelectedToken(null);
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault(); e.stopPropagation();
          const current = state.typeMap[selectedToken.name] || 'int';
          const newType = window.prompt(`Set type of '${selectedToken.name}':`, current);
          if (newType !== null) dispatch({ type: 'SET_VAR_TYPE', payload: { name: selectedToken.name, typeStr: newType.trim() } });
          setSelectedToken(null);
          return;
        }
      }

      if (!state.selectedAddress) return;
      const addr = state.selectedAddress;
      if (e.key === 'n' || e.key === 'N') promptRename(addr);
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); dispatch({ type: 'TOGGLE_BOOKMARK', payload: addr }); }
      if (e.key === ';') { e.preventDefault(); promptComment(addr); }
      if (e.key === 'c' || e.key === 'C') dispatch({ type: 'SET_OVERRIDE', payload: { addr, type: 'code' } });
      if (e.key === 'd' || e.key === 'D') dispatch({ type: 'SET_OVERRIDE', payload: { addr, type: 'data' } });
      if (e.key === 'a' || e.key === 'A') dispatch({ type: 'SET_OVERRIDE', payload: { addr, type: 'string' } });
      if (e.key === 'u' || e.key === 'U') dispatch({ type: 'SET_OVERRIDE', payload: { addr, type: 'undefined' } });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.selectedAddress, state.renameMap, state.commentMap, state.typeMap, selectedToken, isPseudo, dispatch, promptRename, promptComment]);

  return (
    <div className="flex-1 overflow-hidden relative bg-[var(--ida-bg)]" onClick={handleClick} onDoubleClick={handleDblClick} onContextMenu={handleContextMenu}>
      {lines.length === 0 ? (
        <div className="text-[var(--ida-text-dim)] italic text-center mt-10 text-[11px]">
          {!isPseudo ? 'Awaiting analysis...' : 'Press F5 or switch to Pseudocode tab.'}
        </div>
      ) : (
        <div ref={parentRef} className="h-full overflow-y-auto">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const rawLine = lines[virtualRow.index];
              const line = applyRenames(rawLine);
              let addr = '';
              let lineHtml = '';
              let bgStyle = '';
              let rowClass = 'h-5 leading-5 px-2 cursor-pointer flex items-center whitespace-nowrap overflow-hidden text-ellipsis transition-colors duration-75 hover:bg-[var(--ida-menu-hover)] hover:text-white ';

              if (!isPseudo) {
                const addrMatch = line.match(/^([0-9A-F]{8})/);
                addr = addrMatch ? addrMatch[1] : '';
                const comment = addr && state.commentMap[addr] ? ` <span style="color:var(--ida-comment);font-style:italic;">; ${escHtml(state.commentMap[addr])}</span>` : '';
                const isSelected = addr && addr === state.selectedAddress;
                const isBookmarked = addr && state.bookmarks.includes(addr);

                if (isSelected) bgStyle = '#2D4F6B';
                else if (isBookmarked) bgStyle = '#4D2222';

                const borderStyle = isBookmarked ? 'border-l-[3px] border-[var(--ida-red)] pl-[5px]' : 'pl-[8px]';
                const bookmarkIcon = isBookmarked ? '<span style="color:var(--ida-red);margin-right:4px;">★</span>' : '';
                rowClass += isSelected ? 'bg-[var(--ida-accent)]/20 border-l-[3px] border-[var(--ida-accent)] ' : borderStyle;

                const isDataOverride = addr && state.overrides[addr] === 'data';
                const isStringOverride = addr && state.overrides[addr] === 'string';
                const structName = addr && state.structOverrides[addr];
                const structDef = structName ? state.structs[structName] : null;

                if (structDef) {
                  let structHtml = `<div style="font-family: 'JetBrains Mono', monospace; width:100%;">`;
                  structHtml += `<span style="color: var(--ida-text-dim);">${addr}</span> | <span style="color: var(--ida-keyword); font-weight: bold;">struct</span> <span style="color: var(--ida-yellow); font-weight: bold;">${structDef.name}</span> {<br/>`;
                  structDef.members.forEach(member => {
                    const memberAddr = (parseInt(addr, 16) + member.offset).toString(16).toUpperCase().padStart(8, '0');
                    structHtml += `<span style="color: var(--ida-text-dim);">${memberAddr}</span> |   <span style="color: var(--ida-keyword);">${escHtml(member.type)}</span> <span style="color: var(--ida-text); font-weight: bold;">${escHtml(member.name)}</span>; <span style="color: var(--ida-comment);">// +0x${member.offset.toString(16).toUpperCase()}</span><br/>`;
                  });
                  structHtml += `<span style="color: var(--ida-text-dim);">${addr}</span> | } <span style="color: var(--ida-text); font-weight: bold;">${structDef.name.toLowerCase()}_${addr}</span>;</div>`;
                  lineHtml = structHtml;
                } else if (isDataOverride) {
                  const offset = parseInt(addr, 16);
                  const byteVal = state.globalBytes && offset < state.globalBytes.length ? state.globalBytes[offset] : 0;
                  lineHtml = `<span style="color:#569CD6;">${addr}</span> | <span style="color:#569CD6;font-weight:600;">db</span> <span style="color:#B5CEA8;">0x${byteVal.toString(16).padStart(2, '0').toUpperCase()}</span> <span style="color:#608B4E;font-style:italic;">; forced data</span>`;
                } else if (isStringOverride) {
                  lineHtml = `<span style="color:#569CD6;">${addr}</span> | <span style="color:#569CD6;font-weight:600;">db</span> <span style="color:#D69D85;">"..."</span> <span style="color:#608B4E;font-style:italic;">; forced string</span>`;
                } else if (line.includes('; ->')) {
                  const [main, ref] = line.split('; ->');
                  lineHtml = `<span style="color:var(--ida-text);">${escHtml(main)}</span><span style="color:var(--ida-comment);"> ; -&gt; ${escHtml(ref)}</span>`;
                } else if (line.includes('Truncated')) {
                  lineHtml = `<span style="color:var(--ida-red);font-style:italic;">${escHtml(line)}</span>`;
                } else {
                  lineHtml = colorizeAsm(escHtml(line));
                }

                return (
                  <div key={virtualRow.index} className={rowClass} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`, backgroundColor: bgStyle }} data-addr={addr} data-idx={virtualRow.index} dangerouslySetInnerHTML={{ __html: `${bookmarkIcon}${lineHtml}${comment}` }} />
                );
              } else {
                // Pseudo-C
                let rowAddr = '';
                const funcMatches = [...rawLine.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)];
                for (const match of funcMatches) {
                  if (['if', 'while', 'for', 'switch'].includes(match[1])) continue;
                  const resolved = resolveSymbolAddress(match[1]);
                  if (resolved) { rowAddr = resolved; break; }
                }

                const isSelected = rowAddr && rowAddr.toUpperCase() === state.selectedAddress?.toUpperCase();
                bgStyle = isSelected ? 'rgba(0,122,204,0.2)' : 'transparent';
                rowClass += isSelected ? 'bg-[var(--ida-accent)]/20 border-l-[3px] border-[var(--ida-accent)] ' : '';
                lineHtml = colorizePseudoC(escHtml(line), state.typeMap, selectedToken ? selectedToken.name : null, state.renameMap);

                return (
                  <div key={virtualRow.index} className={rowClass} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`, backgroundColor: bgStyle, color: 'var(--ida-yellow)' }} data-addr={rowAddr} dangerouslySetInnerHTML={{ __html: lineHtml }} />
                );
              }
            })}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu.visible && (
        <div className="fixed bg-[var(--ida-menu-bg)] border border-[var(--ida-border)] min-w-[180px] z-[9999] shadow-[0_4px_16px_rgba(0,0,0,0.6)]" style={{ top: ctxMenu.y, left: ctxMenu.x }} onMouseDown={e => e.stopPropagation()}>
          {ctxMenu.token ? (
            <>
              <div className="px-3 py-1.5 text-[11px] text-[var(--ida-yellow)] border-b border-[var(--ida-border)] font-mono">
                Variable: {ctxMenu.token.name} ({state.typeMap[ctxMenu.token.name] || 'int'})
              </div>
              <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => {
                setCtxMenu(c => ({ ...c, visible: false }));
                const current = state.renameMap[ctxMenu.token!.name] || ctxMenu.token!.name;
                const newName = window.prompt(`Rename variable '${ctxMenu.token!.name}' to:`, current);
                if (newName !== null) {
                  if (newName.trim() === '') dispatch({ type: 'DELETE_RENAME', payload: ctxMenu.token!.name });
                  else dispatch({ type: 'SET_RENAME', payload: { addr: ctxMenu.token!.name, name: newName.trim() } });
                }
              }}><span>Rename Variable</span><span className="kbd">N</span></div>
            </>
          ) : (
            <>
              <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => { promptRename(ctxMenu.addr); setCtxMenu(c => ({ ...c, visible: false })); }}><span>Rename</span><span className="kbd">N</span></div>
              <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => { dispatch({ type: 'TOGGLE_BOOKMARK', payload: ctxMenu.addr }); setCtxMenu(c => ({ ...c, visible: false })); }}><span>Toggle Bookmark</span><span className="kbd">M</span></div>
              <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => { promptComment(ctxMenu.addr); setCtxMenu(c => ({ ...c, visible: false })); }}><span>Add Comment</span><span className="kbd">;</span></div>
              <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => { window.dispatchEvent(new CustomEvent('jump-to-node', { detail: ctxMenu.addr })); setCtxMenu(c => ({ ...c, visible: false })); }}><span>Jump to in Graph</span><span className="kbd">G</span></div>
              <div className="border-t border-[var(--ida-border)] my-0.5" />
              <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white text-[var(--ida-green)]" onClick={() => { openFlirtModal(ctxMenu.addr); setCtxMenu(c => ({ ...c, visible: false })); }}><span>🔬 Create FLIRT Signature...</span></div>
            </>
          )}
        </div>
      )}

      {/* FLIRT Modal */}
      <Modal isOpen={flirtModal.visible} title="Create FLIRT Signature" onClose={() => setFlirtModal(prev => ({ ...prev, visible: false }))}>
        <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
          <div className="text-[var(--ida-text-dim)]">Address: <span className="text-[var(--ida-yellow)]">0x{flirtModal.addr}</span></div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[var(--ida-text-dim)]">Pattern Bytes:</div>
            <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--ida-bg)] border border-[var(--ida-border)] rounded">
              {flirtModal.bytes.map((byte, idx) => (
                <button key={idx} onClick={() => handleToggleWildcard(idx)} className={`font-mono text-[10px] px-2 py-0.5 rounded cursor-pointer border ${flirtModal.wildcards[idx] ? 'bg-[var(--ida-panel-2)] text-[var(--ida-text-dim)]' : 'bg-[var(--ida-success)]/20 text-[var(--ida-success)]'}`}>
                  {flirtModal.wildcards[idx] ? "??" : byte}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 items-center text-[var(--ida-text-dim)]">
            <span>Adjust Size:</span>
            <button className="px-2 py-0.5 rounded bg-[var(--ida-panel-2)] border" onClick={() => handleAdjustFlirtSize(-1)}>−</button>
            <span className="text-[var(--ida-text)]">{flirtModal.bytes.length} bytes</span>
            <button className="px-2 py-0.5 rounded bg-[var(--ida-panel-2)] border" onClick={() => handleAdjustFlirtSize(1)}>+</button>
          </div>
          <div className="flex justify-end gap-2.5 pt-3">
            <button className="h-8 px-4 rounded border text-[var(--ida-text-dim)] hover:text-white cursor-pointer" onClick={() => setFlirtModal(prev => ({ ...prev, visible: false }))}>Cancel</button>
            <button className="h-8 px-4 rounded bg-[var(--ida-accent)] text-white font-bold cursor-pointer" onClick={handleSaveFlirt}>Save Signature</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
