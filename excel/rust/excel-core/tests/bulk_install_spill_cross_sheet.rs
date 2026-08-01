//! 跨表动态数组依赖在**批量安装**路径上的重投影。
//!
//! 同表的情形由 `bulk_install_spill.rs` 覆盖。这里管的是安装期跨过表边界的
//! 那条线，它此前是 `install_bulk_spill_projections` 文档里写着的 KNOWN GAP：
//! 一条读别的表的数组公式，是对着"安装到一半的世界"投影的，投完再没人纠正。
//!
//! 两个症状，两条修法：
//!   - 载荷里表的先后顺序决定结果 → `install_workbook_bulk` 改成两阶段
//!     （先全部落地，再逐表投影）。
//!   - 单表安装换掉了**别的表**上某个数组公式的源 → 安装批次关闭后补一次
//!     `reproject_cross_sheet_arrays_after_install`（Store 反向依赖驱动，
//!     与 `set_cell` / `set_formula` 用的是同一条机制）。

use std::collections::HashMap;

use einfach_core::Value;
use einfach_excel_core::{CellAddress, Workbook};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

fn fmap(pairs: &[(&str, &str)]) -> HashMap<CellAddress, String> {
    pairs
        .iter()
        .map(|(a, s)| (addr(a), (*s).to_string()))
        .collect()
}

/// 载荷把**依赖方**排在前面：`Sheet1!B1 = =Sheet2!A1#` 先安装，那时 Sheet2
/// 还是空的。两阶段安装之后它必须照样溢出。
#[test]
fn cross_sheet_spill_ref_projects_when_dependent_sheet_installs_first() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    let payload = vec![
        (0usize, HashMap::new(), fmap(&[("B1", "=Sheet2!A1#")])),
        (1usize, HashMap::new(), fmap(&[("A1", "=SEQUENCE(3)")])),
    ];
    wb.install_workbook_bulk(payload).expect("install");

    assert_eq!(wb.get_cell("Sheet2", "A2"), Value::Number(2.0));
    assert_eq!(
        wb.get_cell("Sheet1", "B2"),
        Value::Number(2.0),
        "=Sheet2!A1# 必须投影出去，而不是只剩 anchor"
    );
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(3.0));
}

/// 反过来把**源表**排在前面。这一条本来就是绿的，留着是为了钉死"结果不随
/// 载荷顺序变化" —— 两个方向必须给出同一个答案。
#[test]
fn cross_sheet_spill_ref_projects_when_source_sheet_installs_first() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    let payload = vec![
        (1usize, HashMap::new(), fmap(&[("A1", "=SEQUENCE(3)")])),
        (0usize, HashMap::new(), fmap(&[("B1", "=Sheet2!A1#")])),
    ];
    wb.install_workbook_bulk(payload).expect("install");

    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(3.0));
}

/// 跨表**区域**依赖：`=SORT(Sheet2!A1:A3)` 读的是另一张表的字面量。依赖方
/// 先安装时，它此前算出的是一个全 `Null` 的 3x1 数组 —— 不是"少投影"，
/// 是把错值烙进了 anchor。
#[test]
fn cross_sheet_range_array_reads_final_world() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    let mut prims: HashMap<CellAddress, Value> = HashMap::new();
    prims.insert(addr("A1"), Value::Number(3.0));
    prims.insert(addr("A2"), Value::Number(1.0));
    prims.insert(addr("A3"), Value::Number(2.0));
    let payload = vec![
        (0usize, HashMap::new(), fmap(&[("C1", "=SORT(Sheet2!A1:A3)")])),
        (1usize, prims, HashMap::new()),
    ];
    wb.install_workbook_bulk(payload).expect("install");

    match wb.get_cell("Sheet1", "C1") {
        Value::Array(a) => {
            assert_eq!(a.shape(), (3, 1));
            assert_eq!(a.get(0, 0), Some(&Value::Number(1.0)));
        }
        other => panic!("expected sorted Array at anchor C1, got {other:?}"),
    }
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(3.0));
}

/// 单表安装换掉了别的表上某个活着的数组公式的**源**。Sheet1!B1 的溢出矩形
/// 必须跟着换形状，而不是停在旧的 3 行。
#[test]
fn single_sheet_install_reprojects_other_sheets_array() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    assert!(wb.set_formula(1, "A1", "=SEQUENCE(3,1,10)"));
    assert!(wb.set_formula(0, "B1", "=Sheet2!A1#"));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(11.0));

    wb.install_sheet_bulk(1, HashMap::new(), fmap(&[("A1", "=SEQUENCE(5,1,20)")]))
        .expect("install");

    assert_eq!(wb.get_cell("Sheet2", "A5"), Value::Number(24.0));
    match wb.get_cell("Sheet1", "B1") {
        Value::Array(a) => assert_eq!(a.shape(), (5, 1)),
        other => panic!("Sheet1!B1 anchor must hold the NEW 5x1 array, got {other:?}"),
    }
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(21.0));
    assert_eq!(
        wb.get_cell("Sheet1", "B5"),
        Value::Number(24.0),
        "旧几何只有 3 行，这一格必须被新投影补出来"
    );
}

/// 反向：新数组比旧的**短**。多出来的旧目标格必须收回，不能留残影。
#[test]
fn single_sheet_install_shrinks_other_sheets_array() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    assert!(wb.set_formula(1, "A1", "=SEQUENCE(5)"));
    assert!(wb.set_formula(0, "B1", "=Sheet2!A1#"));
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(5.0));

    wb.install_sheet_bulk(1, HashMap::new(), fmap(&[("A1", "=SEQUENCE(2)")]))
        .expect("install");

    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(2.0));
    assert_eq!(
        wb.get_cell("Sheet1", "B5"),
        Value::Null,
        "缩短后的数组不能留下旧投影格"
    );
}
