import { useState } from 'react';
import { useApp } from '../store';
import type { StructDefinition, StructMember } from '../types';
import Modal from './Modal';

export default function StructsView() {
  const { state, dispatch } = useApp();
  const [selectedStruct, setSelectedStruct] = useState<string | null>(null);
  
  // Custom Modal toggles & states
  const [cModalVisible, setCModalVisible] = useState(false);
  const [cCodeText, setCCodeText] = useState(`struct Player {
  int id;
  char name[32];
  float score;
  void* weapon;
};`);

  const [addStructVisible, setAddStructVisible] = useState(false);
  const [newStructName, setNewStructName] = useState('');
  const [newStructSize, setNewStructSize] = useState('16');

  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [newMemberOffset, setNewMemberOffset] = useState('');
  const [newMemberType, setNewMemberType] = useState('int');
  const [newMemberName, setNewMemberName] = useState('');

  const handleParseCStruct = () => {
    const cleanCode = cCodeText.replace(/\s+/g, ' ').trim();
    const match = cleanCode.match(/struct\s+(\w+)\s*\{([^}]+)\}/);
    if (!match) {
      alert("Could not parse structure definition. Please check syntax (e.g. 'struct MyStruct { int a; char b[16]; };')");
      return;
    }
    
    const structName = match[1];
    const body = match[2];
    const members: StructMember[] = [];
    let currentOffset = 0;
    
    const declarations = body.split(';');
    for (let decl of declarations) {
      decl = decl.trim();
      if (!decl) continue;
      
      const declMatch = decl.match(/^([\w\s\*]+?)\s+(\w+)(?:\[(\d+)\])?$/);
      if (!declMatch) continue;
      
      let typePart = declMatch[1].trim();
      const name = declMatch[2].trim();
      const arraySizeStr = declMatch[3];
      
      const isPointer = typePart.includes('*');
      const baseType = typePart.replace(/\*/g, '').trim();
      
      // 64-bit sistemlerde pointer = 8 byte
      let baseSize = 4;
      if (isPointer) {
        baseSize = 8;
      } else {
        switch (baseType.toLowerCase()) {
          case 'char':
          case 'byte':
          case 'uint8_t':
          case 'int8_t':
            baseSize = 1;
            break;
          case 'short':
          case 'word':
          case 'uint16_t':
          case 'int16_t':
            baseSize = 2;
            break;
          case 'int':
          case 'dword':
          case 'uint32_t':
          case 'int32_t':
          case 'float':
            baseSize = 4;
            break;
          case 'double':
          case 'uint64_t':
          case 'int64_t':
            baseSize = 8;
            break;
        }
      }
      
      let totalSize = baseSize;
      let typeStr = typePart;
      if (arraySizeStr) {
        const count = parseInt(arraySizeStr, 10);
        totalSize = baseSize * count;
        typeStr = `${typePart}[${count}]`;
      }
      
      if (baseSize > 1) {
        const padding = (baseSize - (currentOffset % baseSize)) % baseSize;
        currentOffset += padding;
      }
      
      members.push({
        offset: currentOffset,
        type: typeStr,
        name
      });
      currentOffset += totalSize;
    }
    
    if (members.length === 0) {
      alert("No valid members parsed. Check your struct layout.");
      return;
    }
    
    const newStruct: StructDefinition = {
      name: structName,
      size: currentOffset,
      members
    };
    
    dispatch({ type: 'ADD_STRUCT', payload: newStruct });
    setSelectedStruct(structName);
    setCModalVisible(false);
  };

  const submitAddStruct = () => {
    const nameClean = newStructName.trim();
    if (!nameClean) {
      alert("Structure name cannot be empty!");
      return;
    }
    if (state.structs[nameClean]) {
      alert("Structure already exists!");
      return;
    }
    const size = parseInt(newStructSize || "16", 10);
    if (isNaN(size) || size <= 0) {
      alert("Invalid size! Must be a positive integer.");
      return;
    }

    const newStruct: StructDefinition = {
      name: nameClean,
      size,
      members: []
    };
    dispatch({ type: 'ADD_STRUCT', payload: newStruct });
    setSelectedStruct(nameClean);
    setAddStructVisible(false);
    setNewStructName('');
    setNewStructSize('16');
  };

  const triggerAddMember = (structName: string) => {
    const structDef = state.structs[structName];
    if (!structDef) return;
    
    let nextOffset = 0;
    if (structDef.members.length > 0) {
      const lastMember = structDef.members[structDef.members.length - 1];
      const lastSize = lastMember.type.includes('[') ? parseInt(lastMember.type.match(/\d+/)?.[0] || '1', 10) : 4;
      nextOffset = lastMember.offset + lastSize;
    }
    if (nextOffset >= structDef.size) nextOffset = 0;

    setNewMemberOffset(String(nextOffset));
    setNewMemberType('int');
    setNewMemberName(`field_${nextOffset}`);
    setAddMemberVisible(true);
  };

  const submitAddMember = () => {
    if (!selectedStruct) return;
    const structDef = state.structs[selectedStruct];
    if (!structDef) return;

    const offset = parseInt(newMemberOffset || "0", 10);
    if (isNaN(offset) || offset < 0 || offset >= structDef.size) {
      alert(`Invalid offset! Must be between 0 and ${structDef.size - 1}`);
      return;
    }

    const typeClean = newMemberType.trim();
    if (!typeClean) {
      alert("Type cannot be empty!");
      return;
    }

    const nameClean = newMemberName.trim();
    if (!nameClean) {
      alert("Name cannot be empty!");
      return;
    }

    const newMember: StructMember = { offset, type: typeClean, name: nameClean };
    const updatedStruct: StructDefinition = {
      ...structDef,
      members: [...structDef.members.filter(m => m.offset !== offset), newMember].sort((a, b) => a.offset - b.offset)
    };

    dispatch({ type: 'ADD_STRUCT', payload: updatedStruct });
    setAddMemberVisible(false);
  };

  const deleteStruct = (name: string) => {
    if (window.confirm(`Delete structure ${name}?`)) {
      dispatch({ type: 'DELETE_STRUCT', payload: name });
      if (selectedStruct === name) setSelectedStruct(null);
    }
  };

  const activeStruct = selectedStruct ? state.structs[selectedStruct] : null;

  return (
    <div className="flex flex-col h-full text-[var(--ida-text)]">
      <div className="p-2 border-b border-[var(--ida-border)] flex justify-between items-center bg-[var(--ida-panel)] shrink-0">
        <span className="text-[11px] font-mono font-semibold">Structures ({Object.keys(state.structs).length})</span>
        <div className="flex gap-1">
          <button 
            className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-1.5 py-0.5 text-[10px] cursor-pointer" 
            onClick={() => setCModalVisible(true)} 
            title="Parse a C header struct definition directly"
          >
            ⌨ Parse C
          </button>
          <button 
            className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-1.5 py-0.5 text-[10px] cursor-pointer" 
            onClick={() => setAddStructVisible(true)}
          >
            + Add
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left Side: Struct Names list */}
        <div className="w-2/5 border-r border-[var(--ida-border)] overflow-y-auto bg-[var(--ida-bg)]">
          {Object.keys(state.structs).length === 0 ? (
            <div className="text-[var(--ida-text-dim)] p-3 text-[11px] text-center">No structures defined yet.</div>
          ) : (
            Object.keys(state.structs).map(name => (
              <div
                key={name}
                onClick={() => setSelectedStruct(name)}
                className={`px-3 py-1.5 cursor-pointer text-xs font-mono flex justify-between items-center border-b border-[var(--ida-border)] ${
                  selectedStruct === name ? 'bg-[var(--ida-panel-2)] font-bold border-l-2 border-[var(--ida-accent)]' : 'bg-transparent hover:bg-[var(--ida-panel-2)]/50'
                }`}
              >
                <span>{name} ({state.structs[name].size}B)</span>
                <span
                  className="text-[var(--ida-red)] cursor-pointer px-1 hover:text-red-400 font-sans"
                  onClick={(e) => { e.stopPropagation(); deleteStruct(name); }}
                >
                  ✕
                </span>
              </div>
            ))
          )}
        </div>

        {/* Right Side: Struct Members detail */}
        <div className="flex-1 overflow-y-auto p-2 bg-[var(--ida-bg)]">
          {activeStruct ? (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-mono text-[13px] text-[var(--ida-keyword)]">
                  struct {activeStruct.name}
                </span>
                <button 
                  className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-[var(--ida-text)] border border-[var(--ida-border)] rounded px-2 py-0.5 text-[10px] cursor-pointer" 
                  onClick={() => triggerAddMember(activeStruct.name)}
                >
                  + Add Member
                </button>
              </div>

              {/* Display full struct visualization */}
              <div className="bg-[var(--ida-panel-2)] border border-[var(--ida-border)] rounded p-3 font-mono text-xs leading-relaxed">
                <div>struct {activeStruct.name} &#123;</div>
                
                {Array.from({ length: activeStruct.size }).map((_, offset) => {
                  const member = activeStruct.members.find(m => m.offset === offset);
                  if (member) {
                    return (
                      <div key={offset} className="pl-4 text-[var(--ida-success)]">
                        <span className="text-[var(--ida-text-dim)] mr-2">+0x{offset.toString(16).toUpperCase()}</span>
                        {member.type} <span className="text-[var(--ida-string)]">{member.name}</span>;
                      </div>
                    );
                  }
                  
                  const isSwallowed = activeStruct.members.some(m => {
                    const typeSize = m.type.includes('[') ? parseInt(m.type.match(/\d+/)?.[0] || '1', 10) : 4;
                    return offset > m.offset && offset < m.offset + typeSize;
                  });

                  if (!isSwallowed) {
                    return (
                      <div key={offset} className="pl-4 text-[var(--ida-text-dim)]">
                        <span className="text-[var(--ida-text-dim)] mr-2">+0x{offset.toString(16).toUpperCase()}</span>
                        db ?;
                      </div>
                    );
                  }
                  return null;
                })}

                <div>&#125;;</div>
              </div>
            </div>
          ) : (
            <div className="text-[var(--ida-text-dim)] text-center mt-8 text-xs">
              Select a structure to view and edit its members.
            </div>
          )}
        </div>
      </div>

      {/* ── popup modal 1: Parse C Struct (TIL Loader) ── */}
      <Modal
        isOpen={cModalVisible}
        title="Parse C Struct"
        onClose={() => setCModalVisible(false)}
      >
        <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
          <div className="text-[var(--ida-text-dim)] leading-relaxed">
            Enter standard C structure code below. Offset values & boundary alignments will be auto-calculated.
          </div>
          <div>
            <textarea
              value={cCodeText}
              onChange={(e) => setCCodeText(e.target.value)}
              rows={8}
              placeholder={`struct Example {\n    int id;\n    char name[16];\n    void* ptr;\n};`}
              className="w-full p-3 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none resize-y transition-colors duration-100"
            />
          </div>
          <div className="flex justify-end gap-2.5 items-center pt-3">
            <button 
              className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text-dim)] hover:text-white border border-[var(--ida-border)] rounded-md transition-colors duration-100 cursor-pointer select-none text-[11px] font-mono leading-none" 
              onClick={() => setCModalVisible(false)}
            >
              Cancel
            </button>
            <button 
              className="h-8 px-4 flex items-center justify-center bg-[var(--ida-accent)] hover:bg-[var(--ida-accent-hover)] text-white border-none rounded-md font-bold cursor-pointer transition-colors duration-100 select-none text-[11px] font-mono leading-none" 
              onClick={handleParseCStruct}
            >
              Parse & Import
            </button>
          </div>
        </div>
      </Modal>

      {/* ── popup modal 2: Add Struct ── */}
      <Modal
        isOpen={addStructVisible}
        title="Create New Structure"
        onClose={() => setAddStructVisible(false)}
      >
        <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[var(--ida-text-dim)] font-medium">Structure Name:</span>
            <input
              type="text"
              placeholder="e.g. MyStruct"
              value={newStructName}
              onChange={e => setNewStructName(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none transition-colors duration-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[var(--ida-text-dim)] font-medium">Total Size in Bytes:</span>
            <input
              type="number"
              value={newStructSize}
              onChange={e => setNewStructSize(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none transition-colors duration-100"
            />
          </div>
          <div className="flex justify-end gap-2.5 items-center pt-3">
            <button 
              className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text-dim)] hover:text-white border border-[var(--ida-border)] rounded-md transition-colors duration-100 cursor-pointer select-none text-[11px] font-mono leading-none" 
              onClick={() => setAddStructVisible(false)}
            >
              Cancel
            </button>
            <button 
              className="h-8 px-4 flex items-center justify-center bg-[var(--ida-accent)] hover:bg-[var(--ida-accent-hover)] text-white border-none rounded-md font-bold cursor-pointer transition-colors duration-100 select-none text-[11px] font-mono leading-none" 
              onClick={submitAddStruct}
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      {/* ── popup modal 3: Add Member ── */}
      <Modal
        isOpen={addMemberVisible}
        title={`Add Struct Member`}
        onClose={() => setAddMemberVisible(false)}
      >
        <div className="flex flex-col gap-4 font-mono text-[11px] text-[var(--ida-text)]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[var(--ida-text-dim)] font-medium">Member Offset (e.g. 4):</span>
            <input
              type="number"
              value={newMemberOffset}
              onChange={e => setNewMemberOffset(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none transition-colors duration-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[var(--ida-text-dim)] font-medium">Member Type (e.g. int, char[16], void*):</span>
            <input
              type="text"
              value={newMemberType}
              onChange={e => setNewMemberType(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none transition-colors duration-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[var(--ida-text-dim)] font-medium">Member Name:</span>
            <input
              type="text"
              placeholder="e.g. field_4"
              value={newMemberName}
              onChange={e => setNewMemberName(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--ida-bg)] text-[var(--ida-text)] border border-[var(--ida-border)] focus:border-[var(--ida-accent)] rounded font-mono text-[11px] outline-none transition-colors duration-100"
            />
          </div>
          <div className="flex justify-end gap-2.5 items-center pt-3">
            <button 
              className="h-8 px-4 flex items-center justify-center bg-transparent hover:bg-[var(--ida-menu-hover)] text-[var(--ida-text-dim)] hover:text-white border border-[var(--ida-border)] rounded-md transition-colors duration-100 cursor-pointer select-none text-[11px] font-mono leading-none" 
              onClick={() => setAddMemberVisible(false)}
            >
              Cancel
            </button>
            <button 
              className="h-8 px-4 flex items-center justify-center bg-[var(--ida-accent)] hover:bg-[var(--ida-accent-hover)] text-white border-none rounded-md font-bold cursor-pointer transition-colors duration-100 select-none text-[11px] font-mono leading-none" 
              onClick={submitAddMember}
            >
              Add Member
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
