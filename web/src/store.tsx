import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { AnalysisResult, Xref, SidebarTab, CenterTab, IdaViewMode, BottomTab, StructDefinition } from './types';

interface AppState {
  // WASM Module
  wasmReady: boolean;

  // Binary data
  globalBytes: Uint8Array | null;
  hexInput: string;

  // File info
  fileType: string;
  fileArch: string;
  fileEntry: string;
  fileBaseIp: number;

  // Analysis results
  currentStrings: string[];
  currentImports: string[];
  currentExports: string[];
  currentSegments: string[];
  currentXrefs: Xref[];
  currentDisasm: string[];
  currentPseudoC: string[];
  heuristics: string[];
  cfgData: AnalysisResult['cfg'] | null;

  // User annotations
  renameMap: Record<string, string>;
  commentMap: Record<string, string>;
  typeMap: Record<string, string>;

  // UI state
  activeLeftTab: SidebarTab;
  activeCenterTab: CenterTab;
  idaViewMode: IdaViewMode;
  activeBottomTab: BottomTab;
  selectedAddress: string | null;
  isLoading: boolean;
  logMessages: LogMessage[];
  searchQuery: string;

  // Graph elements (for .wddb restore)
  graphElements: any[];
  bookmarks: string[];
  overrides: Record<string, 'code' | 'data' | 'string' | 'undefined'>;
  structs: Record<string, StructDefinition>;
  structOverrides: Record<string, string>;
  popoutViews: string[];
}

export interface LogMessage {
  id: number;
  type: 'info' | 'error' | 'warning' | 'success' | 'search';
  text: string;
  timestamp: Date;
}

type Action =
  | { type: 'SET_POPOUT_VIEW'; payload: string | null }
  | { type: 'TOGGLE_POPOUT_VIEW'; payload: string }
  | { type: 'CLOSE_POPOUT_VIEW'; payload: string }
  | { type: 'SET_WASM_READY'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_HEX_INPUT'; payload: string }
  | { type: 'SET_FILE_INFO'; payload: { fileType: string; fileArch: string; fileEntry: string; fileBaseIp: number } }
  | { type: 'SET_GLOBAL_BYTES'; payload: Uint8Array | null }
  | { type: 'SET_ANALYSIS_RESULT'; payload: Partial<AppState> }
  | { type: 'SET_LEFT_TAB'; payload: SidebarTab }
  | { type: 'SET_CENTER_TAB'; payload: CenterTab }
  | { type: 'SET_IDA_VIEW_MODE'; payload: IdaViewMode }
  | { type: 'SET_BOTTOM_TAB'; payload: BottomTab }
  | { type: 'SET_SELECTED_ADDRESS'; payload: string | null }
  | { type: 'SET_RENAME'; payload: { addr: string; name: string } }
  | { type: 'DELETE_RENAME'; payload: string }
  | { type: 'SET_VAR_TYPE'; payload: { name: string; typeStr: string } }
  | { type: 'SET_COMMENT'; payload: { addr: string; comment: string } }
  | { type: 'DELETE_COMMENT'; payload: string }
  | { type: 'ADD_LOG'; payload: Omit<LogMessage, 'id'> }
  | { type: 'CLEAR_LOG' }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_GRAPH_ELEMENTS'; payload: any[] }
  | { type: 'TOGGLE_BOOKMARK'; payload: string }
  | { type: 'SET_OVERRIDE'; payload: { addr: string; type: 'code' | 'data' | 'string' | 'undefined' } }
  | { type: 'SET_STRUCT_OVERRIDE'; payload: { addr: string; structName: string | null } }
  | { type: 'ADD_STRUCT'; payload: StructDefinition }
  | { type: 'DELETE_STRUCT'; payload: string }
  | { type: 'RESTORE_WDDB'; payload: Partial<AppState> };

let logCounter = 0;

const initialState: AppState = {
  wasmReady: false,
  globalBytes: null,
  hexInput: '',
  fileType: 'None',
  fileArch: '-',
  fileEntry: '-',
  fileBaseIp: 0,
  currentStrings: [],
  currentImports: [],
  currentExports: [],
  currentSegments: [],
  currentXrefs: [],
  currentDisasm: [],
  currentPseudoC: [],
  heuristics: [],
  cfgData: null,
  renameMap: {},
  commentMap: {},
  typeMap: {},
  activeLeftTab: 'functions',
  activeCenterTab: 'idaview',
  idaViewMode: 'graph',
  activeBottomTab: 'output',
  selectedAddress: null,
  isLoading: false,
  logMessages: [{ id: 0, type: 'info', text: 'WebDasm v2.0 — React Edition. Ready.', timestamp: new Date() }],
  searchQuery: '',
  graphElements: [],
  bookmarks: [],
  overrides: {},
  structs: {},
  structOverrides: {},
  popoutViews: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_POPOUT_VIEW': {
      if (action.payload === null) return { ...state, popoutViews: [] };
      return {
        ...state,
        popoutViews: state.popoutViews.includes(action.payload)
          ? state.popoutViews
          : [...state.popoutViews, action.payload]
      };
    }
    case 'TOGGLE_POPOUT_VIEW': {
      const v = action.payload;
      return {
        ...state,
        popoutViews: state.popoutViews.includes(v)
          ? state.popoutViews.filter(x => x !== v)
          : [...state.popoutViews, v]
      };
    }
    case 'CLOSE_POPOUT_VIEW':
      return { ...state, popoutViews: state.popoutViews.filter(x => x !== action.payload) };
    case 'SET_WASM_READY': return { ...state, wasmReady: action.payload };
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_HEX_INPUT': return { ...state, hexInput: action.payload };
    case 'SET_FILE_INFO': return { ...state, ...action.payload };
    case 'SET_GLOBAL_BYTES': return { ...state, globalBytes: action.payload };
    case 'SET_ANALYSIS_RESULT': return { ...state, ...action.payload };
    case 'SET_LEFT_TAB': return { ...state, activeLeftTab: action.payload };
    case 'SET_CENTER_TAB': return { ...state, activeCenterTab: action.payload };
    case 'SET_IDA_VIEW_MODE': return { ...state, idaViewMode: action.payload };
    case 'SET_BOTTOM_TAB': return { ...state, activeBottomTab: action.payload };
    case 'SET_SELECTED_ADDRESS': return { ...state, selectedAddress: action.payload };
    case 'SET_RENAME':
      return { ...state, renameMap: { ...state.renameMap, [action.payload.addr]: action.payload.name } };
    case 'DELETE_RENAME': {
      const m = { ...state.renameMap };
      delete m[action.payload];
      return { ...state, renameMap: m };
    }
    case 'SET_VAR_TYPE':
      return { ...state, typeMap: { ...state.typeMap, [action.payload.name]: action.payload.typeStr } };
    case 'SET_COMMENT':
      return { ...state, commentMap: { ...state.commentMap, [action.payload.addr]: action.payload.comment } };
    case 'DELETE_COMMENT': {
      const m = { ...state.commentMap };
      delete m[action.payload];
      return { ...state, commentMap: m };
    }
    case 'ADD_LOG':
      return {
        ...state,
        logMessages: [...state.logMessages, { ...action.payload, id: ++logCounter }]
      };
    case 'CLEAR_LOG': return { ...state, logMessages: [] };
    case 'SET_SEARCH_QUERY': return { ...state, searchQuery: action.payload };
    case 'SET_GRAPH_ELEMENTS': return { ...state, graphElements: action.payload };
    case 'TOGGLE_BOOKMARK': {
      const addr = action.payload;
      const bms = state.bookmarks.includes(addr)
        ? state.bookmarks.filter(x => x !== addr)
        : [...state.bookmarks, addr].sort();
      return { ...state, bookmarks: bms };
    }
    case 'SET_OVERRIDE': {
      const { addr, type } = action.payload;
      const ovr = { ...state.overrides };
      if (type === 'undefined') {
        delete ovr[addr];
      } else {
        ovr[addr] = type;
      }
      return { ...state, overrides: ovr };
    }
    case 'SET_STRUCT_OVERRIDE': {
      const { addr, structName } = action.payload;
      const nextOverrides = { ...state.structOverrides };
      if (structName) {
        nextOverrides[addr] = structName;
      } else {
        delete nextOverrides[addr];
      }
      return { ...state, structOverrides: nextOverrides };
    }
    case 'ADD_STRUCT':
      return { ...state, structs: { ...state.structs, [action.payload.name]: action.payload } };
    case 'DELETE_STRUCT': {
      const s = { ...state.structs };
      delete s[action.payload];
      return { ...state, structs: s };
    }
    case 'RESTORE_WDDB': return { ...state, ...action.payload };
    default: return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  addLog: (type: LogMessage['type'], text: string) => void;
  applyRenames: (text: string) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addLog = useCallback((type: LogMessage['type'], text: string) => {
    dispatch({ type: 'ADD_LOG', payload: { type, text, timestamp: new Date() } });
  }, []);

  const renameRegexes = React.useMemo(() => {
    return Object.entries(state.renameMap).map(([orig, newName]) => ({
      reg: new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      newName
    }));
  }, [state.renameMap]);

  const applyRenames = useCallback((text: string) => {
    if (!text || renameRegexes.length === 0) return text;
    let modified = text;
    for (const { reg, newName } of renameRegexes) {
      modified = modified.replace(reg, newName);
    }
    return modified;
  }, [renameRegexes]);

  return (
    <AppContext.Provider value={{ state, dispatch, addLog, applyRenames }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
