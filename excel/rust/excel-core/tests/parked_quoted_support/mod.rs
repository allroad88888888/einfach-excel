//! 停泊态带引号表名两套用例（`parked_quoted_sheet_name.rs` 正向 /
//! `parked_quoted_sheet_name_edges.rs` 边角）共用的夹具。
//!
//! 每条用例都走**真实入口**：`Workbook::install_sheet_bulk` 停泊源码（从不
//! hydrate）→ 结构编辑触发 `Sheet::retarget_parked_sources` → `get_formula`
//! 把停泊源码原样读回来。断言落在**文本**上，因为坏掉的正是文本本身 ——
//! 只测扫描器函数就会重演 `3743343` 的教训（AST 那条路有测试所以是对的，
//! 停泊这条没有所以坏了）。
//!
//! `tests/` 下的每个文件都是独立 crate，所以这里的每个条目对任一具体调用方
//! 都可能是未使用的；模块级 `allow(dead_code)` 是这个形状的代价，不是疏漏。
#![allow(dead_code)]

use einfach_core::Value;
use einfach_excel_core::{CellAddress, Workbook};
use std::collections::HashMap;

/// 探针公式停在这里；`Op::probe_after` 给出编辑之后它挪到哪。
const PROBE: &str = "C5";

pub fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

/// 四种结构编辑都要点到 —— 删列 / 删行不是插入的镜像，它们还额外走
/// `DeadRef` 早退那条分支。
#[derive(Clone, Copy, Debug)]
pub enum Op {
    InsertRow,
    DeleteRow,
    InsertCol,
    DeleteCol,
}

pub const ALL_OPS: [Op; 4] = [Op::InsertRow, Op::DeleteRow, Op::InsertCol, Op::DeleteCol];

impl Op {
    pub fn apply(self, wb: &mut Workbook) {
        let sheet = wb.sheet_mut(0).expect("sheet 0");
        match self {
            Op::InsertRow => sheet.insert_row(0, 1),
            Op::DeleteRow => sheet.delete_row(0, 1),
            Op::InsertCol => sheet.insert_col(0, 1),
            Op::DeleteCol => sheet.delete_col(0, 1),
        }
    }

    /// `C5` 上的探针公式经这次编辑之后的地址。
    pub fn probe_after(self) -> &'static str {
        match self {
            Op::InsertRow => "C6",
            Op::DeleteRow => "C4",
            Op::InsertCol => "D5",
            Op::DeleteCol => "B5",
        }
    }
}

/// 把一条公式停泊到 0 号表的 `C5`。**不做任何读取**，所以它一直是停泊态。
pub fn park(wb: &mut Workbook, src: &str) {
    let mut formulas: HashMap<CellAddress, String> = HashMap::new();
    formulas.insert(addr(PROBE), src.to_string());
    wb.install_sheet_bulk(0, HashMap::new(), formulas)
        .expect("install_sheet_bulk");
    assert_eq!(
        wb.sheet(0).unwrap().debug_point_dependency_key_count(),
        0,
        "install 之后必须仍是停泊态，否则这条用例根本没测到文本改写"
    );
}

/// 停泊 → 编辑 → 读回停泊源码文本。`None`（公式被 `#REF!` 掉）会变成空串，
/// 让断言一眼看出是「文本没了」而不是「文本不对」。
pub fn parked_text(src: &str, op: Op) -> String {
    let mut wb = Workbook::new();
    park(&mut wb, src);
    op.apply(&mut wb);
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(
        sheet.debug_point_dependency_key_count(),
        0,
        "{op:?} 不得 hydrate 任何停泊公式"
    );
    sheet.get_formula(op.probe_after()).unwrap_or_default()
}

/// 断言一条公式在四种结构编辑下都**逐字节**不变。
pub fn assert_byte_identical_under_all_ops(src: &str) {
    for op in ALL_OPS {
        assert_eq!(parked_text(src, op), src, "{op:?} 改写了 {src}");
    }
}

/// 名字里的 `'` 加倍，套上引号 —— `push_sheet_name` 写侧规则的测试侧复刻。
pub fn quoted(name: &str) -> String {
    format!("'{}'", name.replace('\'', "''"))
}

/// 建一张真表并放一个数，用于「改写之后还算得出来」的求值断言。
pub fn wb_with_sheet(name: &str, addr_str: &str, v: f64) -> Workbook {
    let mut wb = Workbook::new();
    let idx = wb.add_sheet(name);
    wb.sheet_mut(idx)
        .unwrap()
        .set_cell(addr_str, Value::Number(v));
    wb
}
