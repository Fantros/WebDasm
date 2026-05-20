// WASM Module types
export interface CfgNode {
  id: string;
  label: string;
}

export interface CfgEdge {
  source: string;
  target: string;
  label: string;
}

export interface CfgGraph {
  nodes: CfgNode[];
  edges: CfgEdge[];
}

export interface Xref {
  target: string;
  sources: string[];
}

export interface AnalysisResult {
  strings: string[];
  disassembly: string[];
  pseudo_c: string[];
  xrefs: Xref[];
  heuristics: string[];
  cfg: CfgGraph;
}

export interface FileFormatInfo {
  is_executable: boolean;
  format: string;
  arch: string;
  entry_point: number;
  sections: string[];
  text_section_hex: string | null;
  imports: string[];
  exports: string[];
  text_base_ip: number;
}

export interface StructMember {
  offset: number;
  type: string;
  name: string;
}

export interface StructDefinition {
  name: string;
  size: number;
  members: StructMember[];
}

export interface WddbDatabase {
  magic: string;
  version: number;
  bytes: number[];
  renameMap: Record<string, string>;
  commentMap: Record<string, string>;
  typeMap?: Record<string, string>;
  currentStrings: string[];
  currentImports: string[];
  currentExports: string[];
  currentSegments: string[];
  currentXrefs: Xref[];
  currentDisasm: string[];
  currentPseudoC: string[];
  fileType: string;
  fileArch: string;
  fileEntry: string;
  hexInput: string;
  graphElements: any[];
  bookmarks: string[];
  overrides?: Record<string, 'code' | 'data' | 'string' | 'undefined'>;
  structs?: Record<string, StructDefinition>;
  structOverrides?: Record<string, string>;
}

export type SidebarTab = 'functions' | 'strings' | 'imports' | 'exports' | 'segments' | 'bookmarks' | 'structs';
export type CenterTab = 'idaview' | 'hex' | 'pseudo';
export type IdaViewMode = 'graph' | 'text';
export type BottomTab = 'output' | 'console' | 'memmap' | 'debugger';
