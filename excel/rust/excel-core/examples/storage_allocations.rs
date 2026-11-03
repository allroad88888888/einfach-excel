use einfach_core::{ArrayData, LambdaValue, Store, Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::alloc::{GlobalAlloc, Layout, System};
use std::collections::HashMap;
use std::hint::black_box;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering::Relaxed};
use std::time::Instant;

struct CountingAllocator;
static ENABLED: AtomicBool = AtomicBool::new(false);
static COUNT: AtomicUsize = AtomicUsize::new(0);
static BYTES: AtomicUsize = AtomicUsize::new(0);
static MAX: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
static LIVE: AtomicUsize = AtomicUsize::new(0);
fn allocation(size: usize) {
    let live = LIVE.fetch_add(size, Relaxed) + size;
    if ENABLED.load(Relaxed) {
        COUNT.fetch_add(1, Relaxed);
        BYTES.fetch_add(size, Relaxed);
        MAX.fetch_max(size, Relaxed);
        PEAK.fetch_max(live, Relaxed);
    }
}
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc(layout);
        if !ptr.is_null() {
            allocation(layout.size());
        }
        ptr
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc_zeroed(layout);
        if !ptr.is_null() {
            allocation(layout.size());
        }
        ptr
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        LIVE.fetch_sub(layout.size(), Relaxed);
        System.dealloc(ptr, layout);
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let next = System.realloc(ptr, layout, new_size);
        if !next.is_null() {
            LIVE.fetch_sub(layout.size(), Relaxed);
            allocation(new_size);
        }
        next
    }
}
#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn measure(label: &str, action: impl FnOnce()) {
    COUNT.store(0, Relaxed);
    BYTES.store(0, Relaxed);
    MAX.store(0, Relaxed);
    let before = LIVE.load(Relaxed);
    PEAK.store(before, Relaxed);
    ENABLED.store(true, Relaxed);
    let started = Instant::now();
    action();
    let elapsed = started.elapsed();
    ENABLED.store(false, Relaxed);
    let retained = LIVE.load(Relaxed) as i64 - before as i64;
    println!(
        "{label}: allocations={} requested_bytes={} max_request={} peak_delta={} retained_delta={} elapsed_us={}",
        COUNT.load(Relaxed),
        BYTES.load(Relaxed),
        MAX.load(Relaxed),
        PEAK.load(Relaxed) - before,
        retained,
        elapsed.as_micros()
    );
}

#[allow(dead_code)]
enum CandidateValue<T> {
    Number(f64),
    Text(T),
    Boolean(bool),
    Null,
    Error(ValueError),
    Array(std::sync::Arc<ArrayData>),
    Lambda(std::sync::Arc<dyn LambdaValue>),
}
fn text_reads(storage: bool) {
    let addrs: Vec<String> = (1..=10_000).map(|row| format!("A{row}")).collect();
    let mut wb = Workbook::new();
    if storage {
        let values = addrs
            .iter()
            .map(|a| {
                (
                    CellAddress::parse(a).unwrap(),
                    Value::Text("x".repeat(128).into()),
                )
            })
            .collect();
        wb.install_workbook_bulk(vec![(0, values, HashMap::new())])
            .unwrap();
    } else {
        wb.sheet_mut(0).unwrap().bulk_load(|loader| {
            for addr in &addrs {
                loader.set_cell(addr, Value::Text("x".repeat(128).into()));
            }
        });
    }
    let sheet = wb.sheet(0).unwrap();
    println!(
        "text storage_primary={storage} atoms={}",
        sheet.debug_total_atom_count()
    );
    measure("text_10k_get_cell_128B", || {
        for addr in &addrs {
            black_box(sheet.get_cell(addr));
        }
    });
    measure("text_10k_nonempty_address_only", || {
        let mut count = 0;
        sheet.for_each_non_empty(|_| count += 1);
        assert_eq!(count, 10_000);
    });
    measure("text_10k_sparse_range", || {
        assert_eq!(sheet.debug_range_visit_count("A1:A10000"), 10_000);
    });
}
fn scan_snapshots() {
    let mut wb = Workbook::new();
    let values = (0..100_000)
        .map(|i| {
            (
                CellAddress::new(i / 100, i % 100),
                Value::Text("x".repeat(128).into()),
            )
        })
        .collect();
    wb.install_workbook_bulk(vec![(0, values, HashMap::new())])
        .unwrap();
    for (label, start, end, expected) in [
        ("scan_dense_100x50", (0, 0), (99, 49), 5000),
        ("scan_sparse_million_rows", (900, 0), (999_999, 49), 5000),
        ("scan_export_100k", (0, 0), (999, 99), 100_000),
    ] {
        let range = CellRange::new(
            CellAddress::new(start.0, start.1),
            CellAddress::new(end.0, end.1),
        );
        measure(label, || {
            let mut count = 0;
            wb.for_each_sparse_range_cell(0, range, |a, v| {
                black_box((a, v));
                count += 1;
            });
            assert_eq!(count, expected);
        });
    }
}
fn offscreen_formulas() {
    for n in [0, 100_000] {
        let mut wb = Workbook::new();
        let formulas = (0..n)
            .map(|row| (CellAddress::new(row, 1), "=1".to_owned()))
            .collect();
        wb.install_workbook_bulk(vec![(0, HashMap::new(), formulas)])
            .unwrap();
        let sheet = wb.sheet(0).unwrap();
        println!(
            "offscreen_formulas={n} imported={} atoms={}",
            sheet.debug_imported_formula_count(),
            sheet.debug_total_atom_count()
        );
        measure("empty_A1_sparse_read", || {
            assert_eq!(sheet.debug_range_visit_count("A1:A1"), 0)
        });
    }
}
fn sum_reads(storage: bool) {
    let mut wb = Workbook::new();
    if storage {
        let values = (0..100_000)
            .map(|row| (CellAddress::new(row, 0), Value::Number(1.0)))
            .collect();
        let formulas = HashMap::from([(CellAddress::new(0, 1), "=SUM(A1:A100000)".to_owned())]);
        wb.install_workbook_bulk(vec![(0, values, formulas)])
            .unwrap();
    } else {
        wb.sheet_mut(0).unwrap().bulk_load(|loader| {
            for row in 1..=100_000 {
                loader.set_cell(&format!("A{row}"), Value::Number(1.0));
            }
            loader.set_formula("B1", "=SUM(A1:A100000)");
        });
    }
    let sheet = wb.sheet(0).unwrap();
    println!("sum storage_primary={storage}");
    println!(
        "sum_before atoms={} formula_evals={}",
        sheet.debug_total_atom_count(),
        sheet.debug_formula_eval_count()
    );
    measure("sum_100k_first", || {
        assert_eq!(sheet.get_cell("B1"), Value::Number(100_000.0))
    });
    println!(
        "sum_after atoms={} primitive_cell_atoms={} formula_evals={}",
        sheet.debug_total_atom_count(),
        sheet.debug_materialized_cell_atom_count(),
        sheet.debug_formula_eval_count()
    );
    let before = sheet.debug_formula_eval_count();
    measure("sum_100k_cached_1000_reads", || {
        for _ in 0..1000 {
            assert_eq!(black_box(sheet.get_cell("B1")), Value::Number(100_000.0));
        }
    });
    println!(
        "cached_formula_eval_delta={}",
        sheet.debug_formula_eval_count() - before
    );
    measure("sum_100k_edit_and_read", || {
        wb.set_cell(0, "A1", Value::Number(2.0));
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(100_001.0));
    });
}
fn retained_initial_value() {
    let store = Store::new();
    let before = LIVE.load(Relaxed);
    let id = store.create_atom(Value::Text("z".repeat(1_000_000).into()));
    store.set(id, Value::Number(1.0));
    assert_eq!(store.get(id), Value::Number(1.0));
    let retained = LIVE.load(Relaxed) - before;
    println!("overwrite_1MB_init_with_number_retained_bytes={retained}");
    measure("destroy_overwritten_atom", || store.destroy_atom(id));
}
fn main() {
    println!(
        "Value_size={} OptionValue_size={} candidate_ArcValue_size={} candidate_RcValue_size={}",
        std::mem::size_of::<Value>(),
        std::mem::size_of::<Option<Value>>(),
        std::mem::size_of::<CandidateValue<std::sync::Arc<str>>>(),
        std::mem::size_of::<CandidateValue<std::rc::Rc<str>>>()
    );
    text_reads(false);
    text_reads(true);
    scan_snapshots();
    offscreen_formulas();
    sum_reads(false);
    sum_reads(true);
    retained_initial_value();
}
