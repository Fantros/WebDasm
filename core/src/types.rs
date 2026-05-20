use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Serialize, Clone)]
pub struct CfgNode {
    pub id: String,
    pub label: String,
}

#[derive(Serialize, Clone)]
pub struct CfgEdge {
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Serialize, Clone)]
pub struct CfgGraph {
    pub nodes: Vec<CfgNode>,
    pub edges: Vec<CfgEdge>,
}

#[derive(Serialize, Clone)]
pub struct FileFormatInfo {
    pub is_executable: bool,
    pub format: String,
    pub arch: String,
    pub entry_point: u64,
    pub sections: Vec<String>,
    pub text_section_hex: Option<String>,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
    pub text_base_ip: u64,
}

#[derive(Serialize, Clone)]
pub struct Xref {
    pub target: String,
    pub sources: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct AnalysisResult {
    pub strings: Vec<String>,
    pub disassembly: Vec<String>,
    pub pseudo_c: Vec<String>,
    pub xrefs: Vec<Xref>,
    pub heuristics: Vec<String>,
    pub cfg: CfgGraph,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EmulationStepResult {
    pub regs: HashMap<String, u64>,
    pub stack: HashMap<String, u64>,
    pub log: String,
    pub next_rip: u64,
}
