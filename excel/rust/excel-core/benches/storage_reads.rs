//! Run with --save-baseline before / --baseline before. Setup and drop excluded.
use criterion::{black_box, criterion_group, criterion_main, BatchSize, Criterion};
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::collections::HashMap;

fn installed(n: u32, text_len: Option<usize>, atoms: bool) -> Workbook {
    installed_grid(n, 1, text_len, atoms)
}
fn installed_grid(n: u32, columns: u32, text_len: Option<usize>, atoms: bool) -> Workbook {
    let mut wb = Workbook::new();
    let values: HashMap<_, _> = (0..n)
        .map(|r| {
            (
                CellAddress::new(r / columns, r % columns),
                text_len
                    .map(|len| Value::Text("x".repeat(len).into()))
                    .unwrap_or(Value::Number(1.0)),
            )
        })
        .collect();
    if atoms {
        wb.bulk_load(|loader| {
            for (addr, v) in values {
                loader.set_cell_at(0, addr, v);
            }
        });
    } else {
        wb.install_workbook_bulk(vec![(0, values, HashMap::new())])
            .unwrap();
    }
    wb
}
fn reads(c: &mut Criterion) {
    let mut group = c.benchmark_group("storage/text");
    for atoms in [false, true] {
        for len in [8, 128, 4096] {
            let wb = installed_grid(10_000, 100, Some(len), atoms);
            let label = format!("{atoms}/{len}");
            for (name, last_row, last_col, expected) in [
                ("viewport", 49, 26, 1350),
                ("wide_viewport", 99, 49, 5000),
                ("sparse_wide_viewport", 999_999, 49, 5000),
            ] {
                let range =
                    CellRange::new(CellAddress::new(0, 0), CellAddress::new(last_row, last_col));
                let mut count = 0;
                wb.for_each_sparse_range_cell(0, range, |_, _| count += 1);
                assert_eq!(count, expected);
                group.bench_function(format!("{name}/{label}"), |b| {
                    b.iter(|| {
                        wb.for_each_sparse_range_cell(0, range, |a, v| {
                            black_box((a, v));
                        })
                    })
                });
            }
            group.bench_function(format!("addresses/{label}"), |b| {
                b.iter(|| {
                    wb.sheet(0).unwrap().for_each_non_empty(|a| {
                        black_box(a);
                    });
                })
            });
            group.bench_function(format!("cell/{label}"), |b| {
                b.iter(|| black_box(wb.get_cell("Sheet1", "A1")))
            });
        }
    }
    group.finish();
}
fn exports(c: &mut Criterion) {
    let wb = installed_grid(100_000, 100, Some(128), false);
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(999, 99));
    let mut count = 0;
    wb.for_each_sparse_range_cell(0, range, |_, _| count += 1);
    assert_eq!(count, 100_000);
    c.bench_function("storage/export100k", |b| {
        b.iter(|| {
            wb.for_each_sparse_range_cell(0, range, |a, v| {
                black_box((a, v));
            })
        })
    });
}
fn sum(c: &mut Criterion) {
    let mut group = c.benchmark_group("storage/sum100k");
    group.sample_size(10);
    for atoms in [false, true] {
        let setup = || {
            let mut wb = installed(100_000, None, atoms);
            wb.set_formula(0, "B1", "=SUM(A1:A100000)");
            wb
        };
        group.bench_function(format!("first/{atoms}"), |b| {
            b.iter_batched_ref(
                setup,
                |wb| {
                    let before = wb.debug_formula_eval_count(0);
                    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(100_000.0));
                    assert!(wb.debug_formula_eval_count(0) > before);
                },
                BatchSize::PerIteration,
            )
        });
        let mut wb = setup();
        black_box(wb.get_cell("Sheet1", "B1"));
        let before = wb.debug_formula_eval_count(0);
        group.bench_function(format!("cached/{atoms}"), |b| {
            b.iter(|| black_box(wb.get_cell("Sheet1", "B1")))
        });
        assert_eq!(wb.debug_formula_eval_count(0), before);
        let mut n = 1.;
        group.bench_function(format!("edit_read/{atoms}"), |b| {
            b.iter(|| {
                n += 1.;
                let before = wb.debug_formula_eval_count(0);
                wb.set_cell(0, "A1", Value::Number(n));
                assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(99_999. + n));
                assert!(wb.debug_formula_eval_count(0) > before);
            })
        });
    }
    group.finish();
}
fn formulas(c: &mut Criterion) {
    let sources: HashMap<_, _> = (0..100_000)
        .map(|r| (CellAddress::new(r, 1), "=A1+1".to_owned()))
        .collect();
    let mut group = c.benchmark_group("storage/formulas100k");
    group.sample_size(10);
    group.bench_function("install", |b| {
        b.iter_batched_ref(
            || (Workbook::new(), sources.clone()),
            |(wb, formulas)| {
                wb.install_workbook_bulk(vec![(0, HashMap::new(), std::mem::take(formulas))])
                    .unwrap();
                assert_eq!(wb.debug_formula_eval_count(0), 0);
            },
            BatchSize::PerIteration,
        )
    });
    let setup = || {
        let mut wb = Workbook::new();
        wb.install_workbook_bulk(vec![(0, HashMap::new(), sources.clone())])
            .unwrap();
        wb
    };
    let range = CellRange::new(CellAddress::new(0, 1), CellAddress::new(49, 1));
    group.bench_function("first_window", |b| {
        b.iter_batched_ref(
            setup,
            |wb| {
                wb.for_each_sparse_range_cell(0, range, |_, v| {
                    black_box(v);
                });
                assert_eq!(wb.debug_formula_eval_count(0), 50);
            },
            BatchSize::PerIteration,
        )
    });
    let mut wb = setup();
    wb.for_each_sparse_range_cell(0, range, |_, v| {
        black_box(v);
    });
    let mut n = 0.;
    group.bench_function("edit_window", |b| {
        b.iter(|| {
            n += 1.;
            wb.set_cell(0, "A1", Value::Number(n));
            wb.for_each_sparse_range_cell(0, range, |_, v| assert_eq!(v, Value::Number(n + 1.)));
        })
    });
    group.bench_function("empty_window", |b| {
        b.iter(|| {
            wb.for_each_sparse_range_cell(
                0,
                CellRange::new(CellAddress::new(1, 0), CellAddress::new(1, 0)),
                |_, _| panic!("empty"),
            );
        })
    });
    group.finish();
}
criterion_group!(benches, reads, exports, sum, formulas);
criterion_main!(benches);
