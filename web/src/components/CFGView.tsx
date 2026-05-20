import { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';
import { useApp } from '../store';

cytoscape.use(dagre);

interface CyCtxMenu {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

interface BasicBlock {
  id: string;
  instructions: { ip: string; text: string }[];
}

interface PartitionData {
  disasmMap: Map<string, string>;
  edgesBySource: Map<string, any[]>;
  blocks: BasicBlock[];
  insToBlockMap: Map<string, string>;
  blockById: Map<string, BasicBlock>;
  blockToSubroutine: Map<string, string>;
  subroutineBlocks: Map<string, Set<string>>;
}

function getEdgeType(lastInsText: string, edgeLabel: string): 'yes' | 'no' | 'unconditional' | 'normal' {
  const text = lastInsText.toLowerCase().trim();
  const isCondJump = (text.startsWith('j') && !text.startsWith('jmp')) || 
                     text.startsWith('b.') || 
                     text.startsWith('cbz') || 
                     text.startsWith('cbnz') || 
                     text.startsWith('tbz') || 
                     text.startsWith('tbnz');
  const isUncondJump = text.startsWith('jmp') || 
                       text === 'b' || text.startsWith('b ') ||
                       text.startsWith('br') || text.startsWith('blr');

  if (isCondJump) {
    return edgeLabel === 'branch' ? 'yes' : 'no';
  } else if (isUncondJump) {
    return 'unconditional';
  }
  return 'normal';
}

function getComputedColor(varName: string, fallback: string): string {
  const color = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return color || fallback;
}

function normalizeAddr(addr: string): string {
  if (!addr) return '';
  const clean = addr.toLowerCase().replace('0x', '').replace('sub_', '').replace('loc_', '').replace(/^0+/, '').trim();
  return clean.toUpperCase() || '0';
}

function getCyStyles() {
  const bg = getComputedColor('--ida-panel', '#202020');
  const border = getComputedColor('--ida-border', '#444444');
  const text = getComputedColor('--ida-text', '#D4D4D4');
  const accent = getComputedColor('--ida-accent', '#007ACC');
  const labelBg = getComputedColor('--ida-bg', '#1A1A1A');

  return [
    {
      selector: 'node',
      style: {
        'background-color': bg,
        'border-width': 1,
        'border-color': border,
        'label': 'data(label)',
        'color': text,
        'font-family': 'Consolas, "Courier New", monospace',
        'font-size': '11px',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-justification': 'left',
        'width': 'label',
        'height': 'label',
        'padding': '14px',
        'shape': 'rectangle', // Sharp classic rectangles like IDA Pro!
      } as any
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 2.5,
        'border-color': accent,
      } as any
    },
    {
      selector: 'node[isExternal = "true"]',
      style: {
        'background-color': getComputedColor('--ida-panel-2', '#1F2937'),
        'border-color': border,
        'opacity': 0.8,
      } as any
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 2.5,
        'border-color': getComputedColor('--ida-yellow', '#FFC107'), // Glowing yellow block outline on highlight like IDA Pro!
        'border-style': 'solid',
      } as any
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': border,
        'target-arrow-color': border,
        'target-arrow-shape': 'triangle',
        'curve-style': 'taxi', // Orthogonal right-angle routing like IDA Pro!
        'taxi-direction': 'vertical',
        'taxi-turn': '15px',
        'arrow-scale': 0.9,
        'label': 'data(label)',
        'font-size': '9px',
        'color': text,
        'text-background-color': labelBg,
        'text-background-opacity': 1,
        'text-background-padding': '2px',
      } as any
    },
    {
      selector: 'edge[type = "yes"]',
      style: {
        'line-color': '#22C55E', // Green for Taken branch (Yes)
        'target-arrow-color': '#22C55E',
      } as any
    },
    {
      selector: 'edge[type = "no"]',
      style: {
        'line-color': '#EF4444', // Red for Fall-through (No)
        'target-arrow-color': '#EF4444',
      } as any
    },
    {
      selector: 'edge[type = "unconditional"]',
      style: {
        'line-color': '#3B82F6', // Blue for Unconditional branch
        'target-arrow-color': '#3B82F6',
      } as any
    },
    {
      selector: 'edge[type = "normal"]',
      style: {
        'line-color': border,
        'target-arrow-color': border,
      } as any
    },
    {
      selector: 'edge[label="call"]',
      style: { 'line-color': getComputedColor('--ida-keyword', '#CE9178'), 'target-arrow-color': getComputedColor('--ida-keyword', '#CE9178'), 'line-style': 'dashed' } as any
    },
    {
      selector: 'edge[label="xref"]',
      style: { 'line-color': getComputedColor('--ida-string', '#9CDCFE'), 'target-arrow-color': getComputedColor('--ida-string', '#9CDCFE'), 'line-style': 'dotted' } as any
    },
    {
      selector: 'node.collapsed',
      style: {
        'background-color': labelBg,
        'border-color': getComputedColor('--ida-accent', '#FF8C00'),
        'border-width': 2,
        'label': 'data(label) (Collapsed)',
        'shape': 'ellipse',
      } as any
    },
    {
      selector: 'edge.hidden',
      style: {
        'display': 'none'
      } as any
    },
  ];
}

export default function CFGView() {
  const { state, dispatch, applyRenames } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const miniMapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CyCtxMenu>({ visible: false, x: 0, y: 0, nodeId: null });
  const lastRenderedKeyRef = useRef<string>('');
  
  // 'block' for standard CFG, 'call' for Proximity Call Graph!
  const [graphViewMode, setGraphViewMode] = useState<'block' | 'call'>('block');

  // Handle outside click to close menu
  useEffect(() => {
    if (!ctxMenu.visible) return;
    const handler = () => setCtxMenu(c => ({ ...c, visible: false }));
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu.visible]);

  // ──────────────── 0. PRE-COMPUTE SUBROUTINES MEMO (O(N)) ────────────────
  const partitionData = useMemo<PartitionData | null>(() => {
    if (!state.cfgData) return null;

    const disasmMap = new Map<string, string>();
    for (const line of state.currentDisasm) {
      const parts = line.split('|');
      if (parts[0]) {
        const cleanAddr = parts[0].trim();
        const norm = normalizeAddr(cleanAddr);
        const text = parts[1] ? parts[1].trim() : '';
        disasmMap.set(norm, text);
      }
    }

    const edgesBySource = new Map<string, any[]>();
    for (const edge of state.cfgData.edges) {
      const normSrc = normalizeAddr(edge.source);
      if (!edgesBySource.has(normSrc)) {
        edgesBySource.set(normSrc, []);
      }
      edgesBySource.get(normSrc)!.push(edge);
    }

    const leaders = new Set<string>();
    if (state.cfgData.nodes.length > 0) {
      leaders.add(state.cfgData.nodes[0].id);
    }

    const branchTargets = new Set<string>();
    for (const edge of state.cfgData.edges) {
      if (edge.label === 'branch' || edge.label === 'call') {
        branchTargets.add(edge.target);
      }
    }

    for (let i = 0; i < state.cfgData.nodes.length; i++) {
      const node = state.cfgData.nodes[i];
      const labelParts = node.label.split('\n');
      const instrText = labelParts[1] ? labelParts[1].toLowerCase() : '';
      
      if (instrText.startsWith('jmp') || instrText.startsWith('ret') || instrText.startsWith('b ') || instrText.startsWith('bl ') || instrText.startsWith('call')) {
        if (i + 1 < state.cfgData.nodes.length) {
          leaders.add(state.cfgData.nodes[i + 1].id);
        }
      }
    }

    for (const target of branchTargets) {
      leaders.add(target);
    }

    const blocks: BasicBlock[] = [];
    let currentBlock: BasicBlock | null = null;

    for (const node of state.cfgData.nodes) {
      const labelParts = node.label.split('\n');
      const instrText = labelParts[1] || '';
      
      if (leaders.has(node.id) || !currentBlock) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = {
          id: node.id,
          instructions: []
        };
      }
      currentBlock.instructions.push({ ip: node.id, text: instrText });
    }
    if (currentBlock) {
      blocks.push(currentBlock);
    }

    const insToBlockMap = new Map<string, string>();
    const blockById = new Map<string, BasicBlock>();
    for (const block of blocks) {
      blockById.set(normalizeAddr(block.id), block);
      for (const ins of block.instructions) {
        insToBlockMap.set(normalizeAddr(ins.ip), block.id);
      }
    }

    const subroutineEntrypoints = new Set<string>();
    if (blocks.length > 0) {
      subroutineEntrypoints.add(normalizeAddr(blocks[0].id));
    }
    const fileEntryNorm = normalizeAddr(state.fileEntry || '');
    if (fileEntryNorm && blockById.has(fileEntryNorm)) {
      subroutineEntrypoints.add(fileEntryNorm);
    }

    for (const edge of state.cfgData.edges) {
      if (edge.label === 'call') {
        subroutineEntrypoints.add(normalizeAddr(edge.target));
      }
    }

    for (const xref of state.currentXrefs) {
      subroutineEntrypoints.add(normalizeAddr(xref.target));
    }

    for (const exp of state.currentExports) {
      subroutineEntrypoints.add(normalizeAddr(exp));
    }

    const blockToSubroutine = new Map<string, string>();
    const subroutineBlocks = new Map<string, Set<string>>();

    const queue: { blockId: string; subId: string }[] = [];
    for (const entry of subroutineEntrypoints) {
      if (blockById.has(entry)) {
        blockToSubroutine.set(entry, entry);
        subroutineBlocks.set(entry, new Set([entry]));
        queue.push({ blockId: entry, subId: entry });
      }
    }

    while (queue.length > 0) {
      const { blockId, subId } = queue.shift()!;
      const block = blockById.get(blockId);
      if (!block || block.instructions.length === 0) continue;

      const lastIns = block.instructions[block.instructions.length - 1];
      const normLastInsIp = normalizeAddr(lastIns.ip);

      const outgoing = edgesBySource.get(normLastInsIp) || [];
      for (const edge of outgoing) {
        if (edge.label !== 'call') {
          const normTarget = normalizeAddr(edge.target);
          const targetBlockId = normalizeAddr(insToBlockMap.get(normTarget) || '');
          if (targetBlockId && !blockToSubroutine.has(targetBlockId)) {
            blockToSubroutine.set(targetBlockId, subId);
            subroutineBlocks.get(subId)!.add(targetBlockId);
            queue.push({ blockId: targetBlockId, subId });
          }
        }
      }

      const lastInsText = lastIns.text.toLowerCase();
      const isFlowBreak = lastInsText.startsWith('jmp') || 
                          lastInsText.startsWith('ret') || 
                          lastInsText.startsWith('b ') ||
                          lastInsText.startsWith('bl ');

      if (!isFlowBreak) {
        const blockIdx = blocks.findIndex(b => normalizeAddr(b.id) === blockId);
        if (blockIdx !== -1 && blockIdx + 1 < blocks.length) {
          const nextBlock = blocks[blockIdx + 1];
          const nextBlockId = normalizeAddr(nextBlock.id);
          if (!blockToSubroutine.has(nextBlockId)) {
            blockToSubroutine.set(nextBlockId, subId);
            subroutineBlocks.get(subId)!.add(nextBlockId);
            queue.push({ blockId: nextBlockId, subId });
          }
        }
      }
    }

    for (const block of blocks) {
      const normId = normalizeAddr(block.id);
      if (!blockToSubroutine.has(normId)) {
        blockToSubroutine.set(normId, normId);
        subroutineBlocks.set(normId, new Set([normId]));
      }
    }

    return {
      disasmMap,
      edgesBySource,
      blocks,
      insToBlockMap,
      blockById,
      blockToSubroutine,
      subroutineBlocks
    };
  }, [state.cfgData, state.currentDisasm, state.currentXrefs, state.currentImports, state.currentExports, state.fileEntry]);

  // ──────────────── 1. IDENTIFY ACTIVE SUBROUTINE MEMO (O(1)) ────────────────
  const activeSubId = useMemo<string>(() => {
    if (!partitionData) return '';
    const { insToBlockMap, blockToSubroutine, blocks, subroutineBlocks } = partitionData;

    const activeAddrNorm = normalizeAddr(state.selectedAddress || '');
    let subId = '';

    let activeBlockId = insToBlockMap.get(activeAddrNorm);
    if (activeBlockId) {
      subId = blockToSubroutine.get(normalizeAddr(activeBlockId)) || '';
    }

    if (!subId) {
      const matchBlock = blocks.find(b => normalizeAddr(b.id) === activeAddrNorm);
      if (matchBlock) {
        subId = blockToSubroutine.get(normalizeAddr(matchBlock.id)) || '';
      }
    }

    if (!subId && subroutineBlocks.size > 0) {
      subId = Array.from(subroutineBlocks.keys())[0];
    }

    return subId;
  }, [partitionData, state.selectedAddress]);

  // Build graph when partitionData or activeSubId changes
  useEffect(() => {
    if (!state.cfgData || !containerRef.current || !partitionData) return;

    const {
      disasmMap,
      edgesBySource,
      blocks,
      insToBlockMap,
      blockById,
      blockToSubroutine,
      subroutineBlocks
    } = partitionData;

    // ──────────────── 2. CACHED RENDERING GUARD ────────────────
    const currentKey = `${graphViewMode}_${activeSubId}_${state.cfgData?.nodes?.length || 0}_${state.cfgData?.edges?.length || 0}_${Object.keys(state.renameMap).length}_${Object.keys(state.commentMap).length}`;
    if (currentKey === lastRenderedKeyRef.current && cyRef.current) {
      return; // Skip rebuild and layout completely!
    }
    lastRenderedKeyRef.current = currentKey;

    const elements: cytoscape.ElementDefinition[] = [];
    const nodeIds = new Set<string>();

    if (graphViewMode === 'call') {
      // ──────────────── PROXIMITY CALL GRAPH GENERATOR ────────────────
      const subCallees = new Map<string, Set<string>>(); // subId -> Set of targetSubIds
      const subCallers = new Map<string, Set<string>>(); // subId -> Set of sourceSubIds

      for (const subId of subroutineBlocks.keys()) {
        subCallees.set(subId, new Set());
        subCallers.set(subId, new Set());
      }

      const addCallRelation = (fromSub: string, toSub: string) => {
        if (fromSub === toSub) return;
        if (!subCallees.has(fromSub)) subCallees.set(fromSub, new Set());
        if (!subCallers.has(toSub)) subCallers.set(toSub, new Set());
        subCallees.get(fromSub)!.add(toSub);
        subCallers.get(toSub)!.add(fromSub);
      };

      for (const edge of state.cfgData.edges) {
        const srcBlock = normalizeAddr(insToBlockMap.get(normalizeAddr(edge.source)) || edge.source);
        const tgtBlock = normalizeAddr(insToBlockMap.get(normalizeAddr(edge.target)) || edge.target);
        const fromSub = blockToSubroutine.get(srcBlock);
        const toSub = blockToSubroutine.get(tgtBlock);

        if (fromSub && toSub && fromSub !== toSub) {
          addCallRelation(fromSub, toSub);
        }
      }

      for (const xref of state.currentXrefs) {
        const targetSub = normalizeAddr(xref.target);
        if (blockById.has(targetSub) && !subroutineBlocks.has(targetSub)) {
          subroutineBlocks.set(targetSub, new Set([targetSub]));
        }

        for (const source of xref.sources) {
          const srcBlock = normalizeAddr(insToBlockMap.get(normalizeAddr(source)) || source);
          const fromSub = blockToSubroutine.get(srcBlock);
          if (fromSub && targetSub && fromSub !== targetSub) {
            addCallRelation(fromSub, targetSub);
          }
        }
      }

      // 1-Degree Proximity Neighborhood Slicing
      const proximityNodes = new Set<string>();
      if (activeSubId) {
        proximityNodes.add(activeSubId);
        
        const callers = subCallers.get(activeSubId) || new Set();
        for (const caller of callers) {
          proximityNodes.add(caller);
        }

        const callees = subCallees.get(activeSubId) || new Set();
        for (const callee of callees) {
          proximityNodes.add(callee);
        }
      }

      const getSubroutineName = (subId: string) => {
        const cleanSubId = subId.toUpperCase();
        const renamed = state.renameMap[subId] || 
                        state.renameMap[cleanSubId] || 
                        state.renameMap[`0x${cleanSubId}`] || 
                        state.renameMap[`sub_${cleanSubId}`];
        if (renamed) return renamed;

        const matchedImport = state.currentImports.find(imp => imp.toUpperCase().includes(cleanSubId));
        if (matchedImport) return matchedImport;

        const matchedExport = state.currentExports.find(exp => exp.toUpperCase().includes(cleanSubId));
        if (matchedExport) return matchedExport;

        return `sub_${cleanSubId}`;
      };

      proximityNodes.forEach(subId => {
        const subName = getSubroutineName(subId);
        const isImport = state.currentImports.some(imp => imp.toUpperCase().includes(subId.toUpperCase()));
        const isExport = state.currentExports.some(exp => exp.toUpperCase().includes(subId.toUpperCase()));

        let label = '';
        if (subId === activeSubId) {
          label = `⭐ [ACTIVE SUBROUTINE]\n${subName}\n(Address: 0x${subId})`;
        } else if (isImport) {
          label = `🔌 [IMPORT]\n${subName}`;
        } else if (isExport) {
          label = `📤 [EXPORT]\n${subName}\n(Address: 0x${subId})`;
        } else {
          label = `ƒ [SUBROUTINE]\n${subName}\n(Address: 0x${subId})`;
        }

        elements.push({
          data: {
            id: subId,
            label,
            isExternal: isImport ? "true" : "false"
          }
        });
      });

      const addedCallEdges = new Set<string>();
      proximityNodes.forEach(fromSub => {
        const callees = subCallees.get(fromSub);
        if (!callees) return;

        callees.forEach(toSub => {
          if (proximityNodes.has(toSub)) {
            const edgeId = `${fromSub}->${toSub}`;
            if (!addedCallEdges.has(edgeId)) {
              addedCallEdges.add(edgeId);
              elements.push({
                data: {
                  id: edgeId,
                  source: fromSub,
                  target: toSub,
                  label: 'call',
                  type: 'normal'
                }
              });
            }
          }
        });
      });

      if (elements.length === 0 && activeSubId) {
        elements.push({
          data: {
            id: activeSubId,
            label: `⭐ [ACTIVE SUBROUTINE]\n${getSubroutineName(activeSubId)}\n(Address: 0x${activeSubId})`,
            isExternal: "false"
          }
        });
      }
    } else {
      // ──────────────── STANDARD BASIC BLOCK FLOW GRAPH ────────────────
      const slicedBlocks = subroutineBlocks.get(activeSubId) || new Set<string>();

      const externalNodes = new Set<string>();
      const xrefEdgesToCreate: { source: string; target: string }[] = [];

      for (const xref of state.currentXrefs) {
        const targetBlockId = insToBlockMap.get(normalizeAddr(xref.target));
        const normTargetBlock = normalizeAddr(targetBlockId || '');

        if (normTargetBlock && slicedBlocks.has(normTargetBlock)) {
          for (const source of xref.sources) {
            let sourceBlockId = insToBlockMap.get(normalizeAddr(source));
            let normSourceBlock = normalizeAddr(sourceBlockId || '');

            if (!normSourceBlock) {
              const matchedText = disasmMap.get(normalizeAddr(source));
              sourceBlockId = source;
              normSourceBlock = normalizeAddr(sourceBlockId);
              blocks.push({
                id: sourceBlockId,
                instructions: [{ ip: sourceBlockId, text: matchedText || `loc_${sourceBlockId}` }]
              });
              insToBlockMap.set(normSourceBlock, sourceBlockId);
              blockById.set(normSourceBlock, blocks[blocks.length - 1]);
            }

            if (sourceBlockId && targetBlockId && normSourceBlock && normSourceBlock !== normTargetBlock) {
              if (!slicedBlocks.has(normSourceBlock)) {
                externalNodes.add(normSourceBlock);
              }
              xrefEdgesToCreate.push({ source: sourceBlockId, target: targetBlockId });
            }
          }
        }
      }

      for (const block of blocks) {
        const normBlockId = normalizeAddr(block.id);
        if (!slicedBlocks.has(normBlockId) && !externalNodes.has(normBlockId)) continue;
        if (nodeIds.has(block.id)) continue;
        nodeIds.add(block.id);

        const label = block.instructions
          .map(ins => {
            const cleanInsIp = ins.ip.toUpperCase();
            const resolvedText = applyRenames(ins.text);
            const comment = state.commentMap[cleanInsIp] 
              ? `   ; ${state.commentMap[cleanInsIp]}`
              : '';
            return `${ins.ip}:  ${resolvedText}${comment}`;
          })
          .join('\n');

        const cleanBlockId = block.id.toUpperCase();
        const blockTitle = state.renameMap[block.id] || 
                           state.renameMap[cleanBlockId] || 
                           state.renameMap[`0x${cleanBlockId}`] || 
                           state.renameMap[`sub_${cleanBlockId}`] || 
                           block.id;

        const isExternal = externalNodes.has(normBlockId);

        elements.push({
          data: {
            id: block.id,
            label: `${blockTitle}\n${label}`,
            isExternal: isExternal ? 'true' : 'false'
          }
        });
      }

      const addedEdges = new Set<string>();

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const normBlockId = normalizeAddr(block.id);
        if (!slicedBlocks.has(normBlockId)) continue;
        if (block.instructions.length === 0) continue;
        const lastIns = block.instructions[block.instructions.length - 1];
        const lastInsIp = lastIns.ip;

        const outgoingEdges = edgesBySource.get(normalizeAddr(lastInsIp)) || [];

        for (const edge of outgoingEdges) {
          const targetBlockId = insToBlockMap.get(normalizeAddr(edge.target));
          const normTargetBlock = normalizeAddr(targetBlockId || '');
          if (normTargetBlock && normTargetBlock !== normBlockId && slicedBlocks.has(normTargetBlock)) {
            const edgeId = `${block.id}->${targetBlockId}`;
            if (!addedEdges.has(edgeId)) {
              addedEdges.add(edgeId);
              const edgeType = getEdgeType(lastIns.text, edge.label || 'branch');
              elements.push({
                data: {
                  id: edgeId,
                  source: block.id,
                  target: targetBlockId,
                  label: edge.label || 'branch',
                  type: edgeType
                }
              });
            }
          }
        }

        const lastInsText = lastIns.text.toLowerCase();
        const isFlowBreak = lastInsText.startsWith('jmp') || 
                            lastInsText.startsWith('ret') || 
                            lastInsText.startsWith('b ') ||
                            lastInsText.startsWith('bl ');

        if (!isFlowBreak && i + 1 < blocks.length) {
          const nextBlock = blocks[i + 1];
          const normNextBlock = normalizeAddr(nextBlock.id);
          if (slicedBlocks.has(normNextBlock)) {
            const edgeId = `${block.id}->${nextBlock.id}`;
            if (!addedEdges.has(edgeId) && insToBlockMap.has(normNextBlock)) {
              addedEdges.add(edgeId);
              const edgeType = getEdgeType(lastIns.text, '');
              elements.push({
                data: {
                  id: edgeId,
                  source: block.id,
                  target: nextBlock.id,
                  label: '',
                  type: edgeType
                }
              });
            }
          }
        }
      }

      for (const edge of xrefEdgesToCreate) {
        const edgeId = `${edge.source}->${edge.target}`;
        if (!addedEdges.has(edgeId)) {
          addedEdges.add(edgeId);
          elements.push({
            data: {
              id: edgeId,
              source: edge.source,
              target: edge.target,
              label: 'xref',
              type: 'normal'
            }
          });
        }
      }
    }

    // Restore from .wddb if graphElements provided
    if (state.graphElements.length > 0 && elements.length === 0) {
      if (cyRef.current) cyRef.current.destroy();
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: state.graphElements,
        style: getCyStyles(),
        layout: { name: 'preset' },
        wheelSensitivity: 0.3,
      });
      return;
    }

    if (cyRef.current) {
      cyRef.current.json({ elements });
      cyRef.current.layout({
        name: 'dagre',
        rankDir: 'TB',
        padding: 30,
        spacingFactor: 1.4,
      } as any).run();
    } else {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements,
        style: getCyStyles(),
        layout: {
          name: 'dagre',
          rankDir: 'TB',
          padding: 30,
          spacingFactor: 1.4,
        } as any,
        wheelSensitivity: 0.3,
        hideEdgesOnViewport: true,
        textureOnViewport: true,
        boxSelectionEnabled: false,
      });
    }

    cyRef.current.removeAllListeners();

    cyRef.current.on('tap', 'node', function (evt) {
      const node = evt.target;
      const nodeId = node.id();
      dispatch({ type: 'SET_SELECTED_ADDRESS', payload: nodeId });
    });

    cyRef.current.on('layoutstop dragfree', () => {
      if (cyRef.current) {
        dispatch({ type: 'SET_GRAPH_ELEMENTS', payload: cyRef.current.elements().jsons() });
      }
    });

    cyRef.current.on('dblclick', 'node', function (evt) {
      const node = evt.target;
      const oldLabel = node.data('label');
      const newLabel = window.prompt('Rename block:', oldLabel);
      if (newLabel !== null && newLabel.trim()) {
        node.data('label', newLabel.trim());
      }
    });

    cyRef.current.on('cxttap', 'node', function (evt) {
      const node = evt.target;
      setCtxMenu({
        visible: true,
        x: evt.originalEvent.clientX,
        y: evt.originalEvent.clientY,
        nodeId: node.id()
      });
    });

    return () => {};
  }, [
    state.cfgData,
    partitionData,
    activeSubId,
    state.renameMap,
    state.commentMap,
    graphViewMode,
    state.currentImports,
    state.currentExports,
    applyRenames,
    dispatch
  ]);

  // Synchronize Cytoscape highlight and centering with globally selected address (Debounced to prevent race conditions)
  useEffect(() => {
    if (!state.selectedAddress || !cyRef.current) return;

    const cleanHex = state.selectedAddress.replace('0x', '').replace('0X', '').trim().toUpperCase();
    const unpaddedAddr = cleanHex.replace(/^0+/, '') || '0';
    const paddedAddr = unpaddedAddr.padStart(8, '0');

    const focusNode = () => {
      if (!cyRef.current) return;

      let targetNode: any = cyRef.current.getElementById(unpaddedAddr);
      if (targetNode.length === 0) {
        targetNode = cyRef.current.getElementById(paddedAddr);
      }
      if (targetNode.length === 0) {
        targetNode = cyRef.current.getElementById(cleanHex);
      }

      // Search labels of blocks to see if this instruction IP resides inside
      if (targetNode.length === 0) {
        targetNode = cyRef.current.nodes().filter((node) => {
          const labelVal = node.data('label') || '';
          return labelVal.toUpperCase().includes(cleanHex) || labelVal.toUpperCase().includes(unpaddedAddr);
        }).first();
      }

      if (targetNode && targetNode.length > 0) {
        cyRef.current.resize();
        cyRef.current.nodes().removeClass('highlighted');
        targetNode.addClass('highlighted');
        
        // Pervasive animated viewport centering
        cyRef.current.animate({
          center: { eles: targetNode },
          zoom: 1.2,
          duration: 350
        });
      }
    };

    const timer = setTimeout(focusNode, 80);
    return () => clearTimeout(timer);
  }, [state.selectedAddress]);

  // Reset graph event
  useEffect(() => {
    const handler = () => {
      cyRef.current?.fit();
      cyRef.current?.center();
    };
    window.addEventListener('reset-cfg', handler);
    return () => window.removeEventListener('reset-cfg', handler);
  }, []);

  // Real-time custom vector Mini-Map (Radar Overview) drawing loop
  useEffect(() => {
    const cy = cyRef.current;
    const canvas = miniMapCanvasRef.current;
    if (!cy || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawMiniMap = () => {
      if (!cy || !canvas || !ctx) return;

      // Clear the canvas cleanly
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fetch all nodes inside the active Cy tree
      const nodes = cy.nodes();
      if (nodes.length === 0) return;

      // Solve total bounding box bounds containing all nodes
      const bb = nodes.boundingBox();
      const pad = 30;
      const bbW = bb.w + pad * 2;
      const bbH = bb.h + pad * 2;

      // Compute proportional scale factor to perfectly scale graph coordinates to fits the mini canvas dimensions
      const scaleX = canvas.width / bbW;
      const scaleY = canvas.height / bbH;
      const scale = Math.min(scaleX, scaleY, 0.15); // Cap maximum zoom to keep it beautiful

      const offsetX = (canvas.width - bbW * scale) / 2;
      const offsetY = (canvas.height - bbH * scale) / 2;

      // 1. Draw each basic block as a neat miniature node outline
      nodes.forEach((node) => {
        const pos = node.position();
        const w = node.width();
        const h = node.height();

        // Project actual node positions to canvas space
        const cx = (pos.x - bb.x1 + pad) * scale + offsetX;
        const cyY = (pos.y - bb.y1 + pad) * scale + offsetY;
        const cw = w * scale;
        const ch = h * scale;

        const isHighlighted = node.hasClass('highlighted');
        const isExternal = node.data('isExternal') === 'true';

        ctx.fillStyle = isHighlighted 
          ? 'rgba(241, 196, 15, 0.95)' // Glow active node with primary color
          : isExternal 
            ? 'rgba(31, 41, 55, 0.65)' 
            : 'rgba(255, 255, 255, 0.18)';

        ctx.fillRect(cx - cw/2, cyY - ch/2, Math.max(3, cw), Math.max(3, ch));

        ctx.strokeStyle = isHighlighted ? '#FFC107' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
        ctx.strokeRect(cx - cw/2, cyY - ch/2, Math.max(3, cw), Math.max(3, ch));
      });

      // 2. Draw user's current camera viewport extent boundary box!
      const extent = cy.extent();
      const vx1 = (extent.x1 - bb.x1 + pad) * scale + offsetX;
      const vy1 = (extent.y1 - bb.y1 + pad) * scale + offsetY;
      const vw = (extent.x2 - extent.x1) * scale;
      const vh = (extent.y2 - extent.y1) * scale;

      ctx.strokeStyle = 'rgba(0, 122, 204, 0.9)'; // IDA blue viewport highlight border
      ctx.lineWidth = 1.25;
      ctx.strokeRect(vx1, vy1, vw, vh);

      ctx.fillStyle = 'rgba(0, 122, 204, 0.07)'; // Shaded inner region for contrast
      ctx.fillRect(vx1, vy1, vw, vh);
    };

    let rafId: number | null = null;
    const drawMiniMapThrottled = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        drawMiniMap();
      });
    };

    // Attach Cytoscape redraw listeners
    cy.on('position zoom pan resize style', drawMiniMapThrottled);
    drawMiniMap();

    return () => {
      cy.off('position zoom pan resize style', drawMiniMapThrottled);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [state.cfgData, graphViewMode]);

  // Update Cytoscape styles on theme-changed event!
  useEffect(() => {
    const handler = () => {
      if (cyRef.current) {
        cyRef.current.style(getCyStyles());
      }
    };
    window.addEventListener('theme-changed', handler);
    return () => window.removeEventListener('theme-changed', handler);
  }, []);

  return (
    <div className="flex-1 relative bg-[var(--ida-bg)] overflow-hidden">
      {/* Crosshair background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,var(--ida-border)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none z-0" />

      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-transparent z-10" />

      {!state.cfgData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--ida-text-dim)] z-20 pointer-events-none animate-fade-in">
          <div className="text-[64px] mb-4">⎈</div>
          <div className="text-sm font-mono text-[var(--ida-text-dim)]">Control Flow Graph</div>
          <div className="text-[11px] text-[var(--ida-text-dim)] mt-2">Load a binary to begin analysis</div>
        </div>
      )}

      {/* Premium Floating View Mode Switcher */}
      {state.cfgData && (
        <div className="absolute top-3 right-3 bg-[var(--ida-panel-2)]/95 border border-[var(--ida-border)] rounded-full p-0.5 z-30 flex items-center shadow-lg font-mono text-[9px]">
          <button
            onClick={() => setGraphViewMode('block')}
            className={`px-3 py-1 rounded-full cursor-pointer transition-all font-bold ${graphViewMode === 'block' ? 'bg-[var(--ida-accent)] text-white' : 'text-[var(--ida-text-dim)] hover:text-white bg-transparent border-0'}`}
          >
            📊 Basic Blocks (CFG)
          </button>
          <button
            onClick={() => setGraphViewMode('call')}
            className={`px-3 py-1 rounded-full cursor-pointer transition-all font-bold ${graphViewMode === 'call' ? 'bg-[var(--ida-accent)] text-white' : 'text-[var(--ida-text-dim)] hover:text-white bg-transparent border-0'}`}
          >
            🕸️ Proximity Call Graph
          </button>
        </div>
      )}

      {/* Mini-Map Radar View */}
      {state.cfgData && (
        <div 
          className="absolute bottom-3 left-3 bg-[var(--ida-panel-2)]/95 border border-[var(--ida-border)] rounded shadow-2xl p-1 z-30 select-none flex flex-col pointer-events-none"
          title="Viewport Radar Overview"
        >
          <div className="text-[8px] font-bold text-[var(--ida-text-dim)] uppercase tracking-widest px-1 pb-0.5 border-b border-[var(--ida-border)] font-mono">
            Radar Overview
          </div>
          <canvas 
            ref={miniMapCanvasRef}
            width={120}
            height={80}
            className="w-[120px] h-[80px] bg-[var(--ida-bg)]/40 rounded mt-1"
          />
        </div>
      )}

      {/* Mini controls */}
      <div className="absolute bottom-3 right-3 flex gap-1 z-30">
        <button
          className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-zinc-300 border border-[var(--ida-border)] rounded px-2.5 py-0.5 text-base cursor-pointer font-bold transition-colors duration-100"
          onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}
        >
          +
        </button>
        <button
          className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-zinc-300 border border-[var(--ida-border)] rounded px-2.5 py-0.5 text-base cursor-pointer font-bold transition-colors duration-100"
          onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
        >
          −
        </button>
        <button
          className="bg-[var(--ida-panel-2)] hover:bg-zinc-700 text-zinc-300 border border-[var(--ida-border)] rounded px-3 py-1 text-xs cursor-pointer font-semibold transition-colors duration-100"
          onClick={() => { cyRef.current?.fit(); cyRef.current?.center(); }}
        >
          ⌖ Fit
        </button>
      </div>

      {/* Context Menu */}
      {ctxMenu.visible && ctxMenu.nodeId && (
        <div className="fixed bg-[var(--ida-menu-bg)] border border-[var(--ida-border)] min-w-[180px] z-[9999] shadow-[0_4px_16px_rgba(0,0,0,0.6)]" style={{ top: ctxMenu.y, left: ctxMenu.x }} onMouseDown={e => e.stopPropagation()}>
          <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => {
            const node = cyRef.current?.getElementById(ctxMenu.nodeId!);
            if (node) node.style('background-color', '#4D2222'); // Red
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>
            <span>Color: Red (Malicious/Alert)</span>
          </div>
          <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => {
            const node = cyRef.current?.getElementById(ctxMenu.nodeId!);
            if (node) node.style('background-color', '#224D22'); // Green
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>
            <span>Color: Green (Safe/Good)</span>
          </div>
          <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => {
            const node = cyRef.current?.getElementById(ctxMenu.nodeId!);
            if (node) node.removeStyle(); // Clear all custom inline style overrides perfectly
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>
            <span>Color: Reset</span>
          </div>
          <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => {
            const node = cyRef.current?.getElementById(ctxMenu.nodeId!);
            if (node) {
              if (node.hasClass('collapsed')) {
                node.removeClass('collapsed');
                node.connectedEdges().removeClass('hidden');
              } else {
                node.addClass('collapsed');
                node.connectedEdges().addClass('hidden');
              }
            }
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>
            <span>Toggle Collapse/Fold Node</span>
          </div>
          <div className="border-t border-[var(--ida-border)] my-0.5" />
          <div className="py-1.25 px-4 text-[11px] cursor-pointer flex justify-between items-center text-[var(--ida-text)] hover:bg-[var(--ida-accent)] hover:text-white" onClick={() => {
            cyRef.current?.getElementById(ctxMenu.nodeId!)?.remove();
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>
            <span>Delete Node</span><span className="kbd">Del</span>
          </div>
        </div>
      )}
    </div>
  );
}
