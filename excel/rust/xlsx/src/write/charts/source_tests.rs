use super::*;
use serde_json::json;

fn book() -> Persistence {
    serde_json::from_value(json!({
        "version": 1, "cells": [],
        "sheets": [{"idx": 0, "name": "Main"}, {"idx": 1, "name": "My data"}],
        "tables": [
            {"name": "Sales", "sheet": "My data", "sheetIndex": 1, "range": "B2:E8", "hasHeaders": true,
             "hasTotals": true, "columns": ["Month", "East", "West", "Total"]},
            {"name": "Plain", "sheet": "Main", "sheetIndex": 0, "range": "A1:B4", "hasHeaders": true,
             "hasTotals": false, "columns": ["Id", "Rev'x]"]},
            {"name": "Shadow", "sheet": "Main", "sheetIndex": 0, "range": "H1:H3", "hasHeaders": true,
             "columns": ["V"]},
        ],
        "namedRanges": [
            {"name": "Local", "scope": 0, "target": {"sheet": 1, "range": [0, 0, 4, 1]}},
            {"name": "Local", "target": {"sheet": 0, "range": [9, 9, 9, 9]}},
            {"name": "Global", "target": {"sheet": 1, "range": [4, 1, 0, 0]}},
            {"name": "OnData", "scope": 1, "target": {"sheet": 1, "range": [0, 2, 3, 2]}},
            {"name": "Calc", "target": null, "formula": "=1+1"},
            {"name": "Shadow", "target": null, "formula": "=2"},
        ],
    })).unwrap()
}

fn got(source: &str, own: usize) -> Option<(String, [u32; 4])> {
    resolve(source, &book(), own)
        .map(|r| (r.sheet_name.unwrap(), [r.start_row, r.start_col, r.end_row, r.end_col]))
}

fn at(sheet: &str, range: [u32; 4]) -> Option<(String, [u32; 4])> { Some((sheet.into(), range)) }

#[test]
fn whole_table_includes_header_and_drops_totals_row() {
    assert_eq!(got("Sales", 0), at("My data", [1, 1, 6, 4]));
    assert_eq!(got("sales", 1), at("My data", [1, 1, 6, 4]));
    assert_eq!(got("Plain", 1), at("Main", [0, 0, 3, 1]));
}

#[test]
fn table_columns_and_spans() {
    assert_eq!(got("Sales[East]", 0), at("My data", [1, 2, 6, 2]));
    assert_eq!(got("Sales[[east]]", 0), at("My data", [1, 2, 6, 2]));
    assert_eq!(got("Sales[[Month]:[West]]", 0), at("My data", [1, 1, 6, 3]));
    assert_eq!(got("Sales[[West]:[Month]]", 0), at("My data", [1, 1, 6, 3]));
    // 列名 `Rev'x]` 在引用里写成 `Rev''x']`（`'` 转义下一个字符）。
    assert_eq!(got("Plain[Rev''x']]", 0), at("Main", [0, 1, 3, 1]));
}

#[test]
fn unknown_columns_and_bad_syntax_are_unresolvable() {
    for source in ["Sales[Nope]", "Sales[[Month]:[Nope]]", "Nope[East]", "Sales[", "Sales[]", "Sales[#Data]",
        "Sales[[East]", "Sales[East]x", "Sales[[East]:[West]"] {
        assert_eq!(got(source, 0), None, "{source}");
    }
}

#[test]
fn names_prefer_own_sheet_scope_then_workbook_scope() {
    assert_eq!(got("Local", 0), at("My data", [0, 0, 4, 1]));
    assert_eq!(got("local", 1), at("Main", [9, 9, 9, 9]));
    assert_eq!(got("Global", 0), at("My data", [0, 0, 4, 1]));
}

#[test]
fn sheet_qualified_names_have_no_table_fallback() {
    assert_eq!(got("'My data'!OnData", 0), at("My data", [0, 2, 3, 2]));
    assert_eq!(got("Main!OnData", 0), None);
    assert_eq!(got("'my DATA'!Global", 0), at("My data", [0, 0, 4, 1]));
    assert_eq!(got("Main!Local", 1), at("My data", [0, 0, 4, 1]));
    assert_eq!(got("Nope!Global", 0), None);
    assert_eq!(got("Main!Sales", 0), None);
}

#[test]
fn formula_and_unknown_names_are_unresolvable() {
    assert_eq!(got("Calc", 0), None);
    // 同名的公式名遮住表，不再回落到表。
    assert_eq!(got("Shadow", 0), None);
    assert_eq!(got("Missing", 0), None);
    assert_eq!(got("", 0), None);
}

#[test]
fn effective_refs_falls_back_to_the_stored_refs() {
    let stale = vec![Some(NativeRange { start_row: 0, start_col: 0, end_row: 2, end_col: 1, sheet_name: None })];
    let book = book();
    let used = |payload: serde_json::Value| effective_refs(&payload, &stale, &book, 0);
    assert_eq!(used(json!({})), stale);
    assert_eq!(used(json!({"source": ""})), stale);
    assert_eq!(used(json!({"source": 7})), stale);
    assert_eq!(used(json!({"source": "Missing"})), stale);
    let fresh = used(json!({"source": "Plain"}));
    assert_eq!(fresh.len(), 1);
    assert_eq!(fresh[0].as_ref().unwrap().end_row, 3);
}
