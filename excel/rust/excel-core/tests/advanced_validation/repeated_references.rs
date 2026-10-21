use super::*;
use einfach_excel_core::CustomFunctionRegistry;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

#[derive(Debug, Default)]
struct NextValue(AtomicUsize);

impl CustomFunctionRegistry for NextValue {
    fn lookup(&self, name: &str, _: &[Value]) -> Option<Value> {
        (name == "NEXTVALUE")
            .then(|| Value::Number((self.0.fetch_add(1, Ordering::SeqCst) + 1) as f64))
    }
}

fn workbook() -> (Workbook, Arc<NextValue>) {
    let mut book = Workbook::new();
    let next = Arc::new(NextValue::default());
    book.set_custom_function_registry(Some(next.clone()));
    (book, next)
}

#[test]
fn repeated_formula_reference_reads_native_cache_without_replaying_host() {
    let (mut book, next) = workbook();
    book.set_formula(0, "B1", "=NEXTVALUE()");
    book.get_cell("Sheet1", "B1");
    install(&mut book, range("A1", "A1"), formula("=$B$1=$B$1", "A1"));
    let initial_calls = next.0.load(Ordering::SeqCst);
    assert_eq!(book.set_cell_input(0, "A1", "7"), Ok(()));
    assert_eq!(next.0.load(Ordering::SeqCst), initial_calls);
    book.recalculate(Some(0)).unwrap();
    let recalculated_calls = next.0.load(Ordering::SeqCst);
    assert!(recalculated_calls > initial_calls);
    assert_eq!(book.set_cell_input(0, "A1", "8"), Ok(()));
    assert_eq!(next.0.load(Ordering::SeqCst), recalculated_calls);
}

#[test]
fn repeated_cross_sheet_formula_references_read_each_native_cell_cache() {
    let (mut book, next) = workbook();
    let other = book.add_sheet("Other");
    for sheet in [0, other] {
        book.set_formula(sheet, "B1", "=NEXTVALUE()");
    }
    book.get_cell("Sheet1", "B1");
    book.get_cell("Other", "B1");
    install(
        &mut book,
        range("A1", "A1"),
        formula(
            "=AND($B$1=$B$1,Other!$B$1=Other!$B$1,$B$1<>Other!$B$1)",
            "A1",
        ),
    );
    let calls = next.0.load(Ordering::SeqCst);
    assert_eq!(book.set_cell_input(0, "A1", "7"), Ok(()));
    assert_eq!(next.0.load(Ordering::SeqCst), calls);
}

#[test]
fn repeated_spill_member_and_anchor_references_share_the_native_array_result() {
    let (mut book, next) = workbook();
    let other = book.add_sheet("Other");
    book.set_formula(other, "B1", "=SEQUENCE(2,1,NEXTVALUE())");
    assert!(matches!(book.get_cell("Other", "B2"), Value::Number(_)));
    install(
        &mut book,
        range("A1", "A1"),
        formula(
            "=AND(Other!B1=Other!B1,Other!B2=Other!B2,Other!B2=Other!B1+1)",
            "A1",
        ),
    );
    let calls = next.0.load(Ordering::SeqCst);
    assert_eq!(book.set_cell_input(0, "A1", "7"), Ok(()));
    assert_eq!(next.0.load(Ordering::SeqCst), calls);
}

#[test]
fn unrelated_volatile_host_formula_uses_exact_native_cached_value_not_a_fresh_result() {
    let (mut book, next) = workbook();
    book.set_formula(0, "B1", "=NEXTVALUE()");
    let Value::Number(cached) = book.get_cell("Sheet1", "B1") else {
        panic!("Expected host number")
    };
    install(
        &mut book,
        range("A1", "A1"),
        formula(&format!("=$B$1={cached:?}"), "A1"),
    );
    let calls = next.0.load(Ordering::SeqCst);
    assert_eq!(book.set_cell_input(0, "A1", "7"), Ok(()));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(cached));
    assert_eq!(next.0.load(Ordering::SeqCst), calls);
}

#[test]
fn unrelated_rand_reference_matches_the_unchanged_native_cached_value() {
    let mut book = Workbook::new();
    book.set_formula(0, "B1", "=RAND()");
    let Value::Number(cached) = book.get_cell("Sheet1", "B1") else {
        panic!("Expected RAND number")
    };
    install(
        &mut book,
        range("A1", "A1"),
        formula(&format!("=AND($B$1=$B$1,$B$1={cached:?})"), "A1"),
    );
    book.set_cell_input(0, "A1", "7").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(cached));
}
