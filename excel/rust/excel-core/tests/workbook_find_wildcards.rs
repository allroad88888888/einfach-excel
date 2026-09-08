use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, FindLookIn, FindQuery, Workbook};

fn query(pattern: &str) -> FindQuery {
    FindQuery {
        needle: pattern.into(),
        case_sensitive: false,
        whole_cell: false,
        wildcards: true,
        look_in: FindLookIn::Formulas,
    }
}
fn scope() -> [(usize, CellRange); 1] {
    [(
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(999, 7)),
    )]
}
fn spans(text: &str, pattern: &str, whole: bool) -> Vec<(usize, usize)> {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text(text.into()));
    let mut q = query(pattern);
    q.whole_cell = whole;
    wb.find_cells(&scope(), &q, 0, 500)
        .unwrap()
        .matches
        .iter()
        .map(|m| (m.start, m.end))
        .collect()
}

#[test]
fn star_matches_leftmost_longest_and_question_matches_one_original_character() {
    assert_eq!(spans("xxab12ab34cdyy", "ab*cd", false), vec![(2, 12)]);
    assert_eq!(spans("ab12ab34", "ab*", false), vec![(0, 8)]);
    assert_eq!(spans("x😀中y", "?中", false), vec![(1, 4)]);
    assert_eq!(spans("a\nb", "a?b", true), vec![(0, 3)]);
    assert_eq!(spans("abc", "a*c", true), vec![(0, 3)]);
    assert_eq!(spans("ac", "a*c", true), vec![(0, 2)]);
    assert!(spans("abcx", "a*c", true).is_empty());
}

#[test]
fn escaping_and_literal_metacharacters_do_not_become_regex() {
    assert_eq!(spans("a*b a?b a~b", "a~*b", false), vec![(0, 3)]);
    assert_eq!(spans("a*b a?b a~b", "a~?b", false), vec![(4, 7)]);
    assert_eq!(spans("a*b a?b a~b", "a~~b", false), vec![(8, 11)]);
    assert_eq!(spans("x~q", "~q", false), vec![(1, 3)]);
    assert_eq!(spans("x~", "~", false), vec![(1, 2)]);
    assert_eq!(spans("a[b].+", "a[b].+", true), vec![(0, 6)]);
}

#[test]
fn unicode_fold_expansions_respect_original_boundaries() {
    assert_eq!(spans("İ中", "i\u{307}?", true), vec![(0, 2)]);
    assert_eq!(spans("İ中", "?中", true), vec![(0, 2)]);
    assert!(spans("İ中", "i?", true).is_empty());
    assert!(spans("İ", "??", true).is_empty());
    assert_eq!(spans("Éé", "é", false), vec![(0, 1), (1, 2)]);
}

#[test]
fn zero_length_matches_never_create_empty_replacement_targets() {
    assert!(spans("", "*", false).is_empty());
    assert_eq!(spans("abc", "***", false), vec![(0, 3)]);
    assert_eq!(spans("abc", "?", false), vec![(0, 1), (1, 2), (2, 3)]);
}

#[test]
fn case_sensitive_wildcards_do_not_fold_literals() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Sku-1 SKU-2".into()));
    let mut q = query("SKU-?");
    q.case_sensitive = true;
    let page = wb.find_cells(&scope(), &q, 0, 10).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!((page.matches[0].start, page.matches[0].end), (6, 11));
    q.case_sensitive = false;
    assert_eq!(wb.find_cells(&scope(), &q, 0, 10).unwrap().total, 2);
}

#[test]
fn wildcard_replace_uses_the_same_spans_and_one_native_history_entry() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("😀ab12 ab34!".into()));
    wb.set_cell(0, "A999", Value::Text("AB56".into()));
    let q = query("ab??");
    let page = wb.find_cells(&scope(), &q, 1, 1).unwrap();
    assert_eq!(page.total, 3);
    let current = &page.matches[0];
    let report = history
        .replace_by_query(&mut wb, &scope(), &q, "X", Some(current))
        .unwrap();
    assert_eq!(report.occurrences, 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("😀ab12 X!".into()));
    history.undo(&mut wb).unwrap();
    let report = history
        .replace_by_query(&mut wb, &scope(), &q, "Y", None)
        .unwrap();
    assert_eq!((report.cells, report.occurrences), (2, 3));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A999"), Value::Text("AB56".into()));
}

#[test]
fn expensive_pattern_fails_before_any_planned_replacement_is_written() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let pattern = "a?".repeat(100);
    wb.set_cell(0, "A1", Value::Text("aa".repeat(100)));
    wb.set_cell(0, "A2", Value::Text("a".repeat(100_000)));
    let q = query(&pattern);
    assert!(wb.find_cells(&scope(), &q, 0, 10).is_err());
    assert!(history
        .replace_by_query(&mut wb, &scope(), &q, "X", None)
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("aa".repeat(100)));
}
