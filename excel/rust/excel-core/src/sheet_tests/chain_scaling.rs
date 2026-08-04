//! 链式公式批量安装的复杂度闸门。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

/// 链式批量安装的复杂度闸门：A1 是字面量，A2..A_N 每格引用上一格。这个形状
/// 的唯一现实退化路径是「装第 i 条公式时顺着已装好的前缀走一遍」—— 总代价
/// 就从 N 变成 Σi ≈ N²/2。
///
/// 断言用计数器，不用墙钟。原先那句 `dur.as_millis() < 500` 有两个毛病：
/// 一是 CI 机器抖动必然让它 flaky；二是它想证的「线性」用时间根本证不出来
/// —— 常数因子足够小的话，一条 O(N²) 路径在 N=10k 时照样跑进 500ms，要等 N
/// 再大一个量级才炸出来，那时这个闸门早已形同虚设。计数器则是闭式的：下面
/// 每一条的期望值都能由 N 直接算出，不是拍脑袋的阈值。
///
/// 惰性安装路径（`BulkLoader::set_formula_lazy`）每条公式只做「解析 + 挂起
/// 源码 + 物化一个 formula-inner 原子」；静态环检查、求值、Store 反向依赖
/// 传播这些会随前缀增长的工作全部推迟到首次读。所以安装阶段这几个计数器
/// 恒为 0 —— 任何一条重新变回 per-install 的走图，在链上会立刻涨成 ~N²/2。
/// 全新 sheet 且 A1 只是 literal，所以下面直接断言绝对值。
///
/// 分工：这里只盯**安装**阶段。推迟到读的那一半（hydration 也必须线性）由
/// `tail_first_chain_static_cycle_walk_is_linear`（一次遍历认证整条链）和
/// scale suite 的 `s1_chain_evals_linear_and_caches_clean`（n=20k，求值次数
/// 恰为 n-1）盯着。想人肉看安装耗时随 N 的走势，用下面那个 `#[ignore]` 的
/// `chain_install_scaling_trace`。
///
/// 局限，如实记下：计数器覆盖的是「安装时有没有碰已装好的前缀」这一类退化。
/// 若有人在 per-install 路径里塞进一次不被任何计数器记录的全表扫描，这里抓
/// 不到，只能靠 `chain_install_scaling_trace` 的步长比看出来。
#[test]
fn chain_bulk_install_is_linear() {
    const N: u32 = 10_000;
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));

    sheet.bulk_load(|loader| {
        for i in 2..=N {
            let addr = format!("A{i}");
            let src = format!("=A{}+1", i - 1);
            let ok = loader.set_formula(&addr, &src);
            assert!(ok, "chain formula must not be rejected at {}", addr);
        }
    });

    // 安装阶段不许碰前缀。
    assert_eq!(
        sheet.debug_static_cycle_node_visit_count(),
        0,
        "install must not walk the upstream chain — a per-install static \
         cycle check would cost sum(i) = N²/2 AST node visits"
    );
    assert_eq!(
        sheet.debug_formula_eval_count(),
        0,
        "bulk install must evaluate nothing"
    );
    assert_eq!(
        sheet.debug_recompute_count(),
        0,
        "bulk install must not recompute a single derived atom"
    );
    assert_eq!(
        sheet.debug_reverse_dep_visit_count(),
        0,
        "parked formulas own no live Store edges — installing A_i must not \
         propagate down the already-installed prefix"
    );
    assert_eq!(
        sheet.debug_bulk_notify_probe_count(),
        0,
        "no subscribers — flush's notify tail must early-out instead of \
         probing every touched address"
    );

    // 上面清一色是 0，所以还得证明这 N-1 条公式真装进去了，否则那些 0 是空话。
    // 三个量都是 N 的闭式。
    assert_eq!(
        sheet.debug_imported_formula_count(),
        (N - 1) as usize,
        "every chain formula must be parked by the import path"
    );
    assert_eq!(
        sheet.debug_dirty_count(),
        (N - 1) as usize,
        "every parked formula stays pending-compute until first read"
    );
    assert_eq!(
        sheet.debug_total_atom_count(),
        N as usize,
        "exactly one atom per cell: 1 primitive (A1) + (N-1) formula-inners"
    );
}

/// `#[ignore]`d scaling trace — print install wall time at 1k / 10k /
/// 100k chain depths so we can eyeball the step ratio and chase any
/// residual super-linearity that the 10k assertion above can't surface.
///
/// Run with:
///   `cargo test --release chain_install_scaling_trace -- --ignored --nocapture`
#[test]
#[ignore]
fn chain_install_scaling_trace() {
    for &n in &[1_000usize, 10_000, 100_000] {
        let mut sheet = Sheet::new();
        sheet.set_cell("A1", Value::Number(1.0));
        let start = std::time::Instant::now();
        sheet.bulk_load(|loader| {
            for i in 2..=n {
                let addr = format!("A{i}");
                let src = format!("=A{}+1", i - 1);
                let ok = loader.set_formula(&addr, &src);
                assert!(ok, "chain formula must not be rejected at {}", addr);
            }
        });
        eprintln!("Chain{}: {:?}", n, start.elapsed());
    }
}

/// Per-phase decomposition of `Sheet::bulk_load` at chain depths.
/// Times: parse, dependency extraction, local cycle check,
/// range registration, formula_cells/exprs/texts inserts, and flush.
#[test]
#[ignore]
fn chain_install_scaling_trace_phases() {
    use std::time::{Duration, Instant};
    for &n in &[1_000usize, 10_000, 100_000] {
        let mut sheet = Sheet::new();
        sheet.set_cell("A1", Value::Number(1.0));
        let formulas: Vec<(CellAddress, String)> = (2..=n)
            .map(|i| {
                (
                    CellAddress::parse(&format!("A{i}")).unwrap(),
                    format!("=A{}+1", i - 1),
                )
            })
            .collect();

        let mut t_parse = Duration::ZERO;
        let mut t_collect = Duration::ZERO;
        let mut t_cycle = Duration::ZERO;
        let mut t_add_deps = Duration::ZERO;
        let mut t_inserts = Duration::ZERO;
        let mut t_other = Duration::ZERO;

        let total = Instant::now();
        sheet.bulk_load(|loader| {
            for (addr, src) in &formulas {
                let t0 = Instant::now();
                let expr = parse_formula(src).expect("parse ok");
                t_parse += t0.elapsed();

                let t1 = Instant::now();
                if loader.sheet.closes_local_cycle(*addr, &expr) {
                    panic!("unexpected cycle");
                }
                t_cycle += t1.elapsed();

                let t2 = Instant::now();
                loader.sheet.detach_address_sub(*addr);
                let expr = Rc::new(expr);
                let deps = Sheet::formula_deps_for(&expr);
                let static_ranges = collect_range_refs(&expr);
                t_collect += t2.elapsed();

                let t3 = Instant::now();
                loader.sheet.remove_formula_record(*addr);
                loader.sheet.drop_cell_slot(*addr);
                t_other += t3.elapsed();

                let t4 = Instant::now();
                let record = Rc::new(FormulaRecord::new(expr.clone(), deps, static_ranges));
                t_add_deps += t4.elapsed();

                let t5 = Instant::now();
                loader
                    .sheet
                    .interior
                    .formula_cells
                    .borrow_mut()
                    .insert(*addr, record);
                loader
                    .sheet
                    .interior
                    .formula_exprs
                    .borrow_mut()
                    .insert(*addr, expr.clone());
                loader
                    .sheet
                    .interior
                    .formula_texts
                    .borrow_mut()
                    .insert(*addr, src.clone());
                loader.sheet.materialize_formula_inner(*addr);
                loader.sheet.invalidate_formula_inner(*addr);
                loader.sheet.bump_facade_epoch(*addr);
                loader
                    .sheet
                    .imported_formula_count
                    .set(loader.sheet.imported_formula_count.get() + 1);
                loader.touched.insert(*addr);
                t_inserts += t5.elapsed();
            }
        });
        let tt = total.elapsed();
        eprintln!(
            "Chain{} phases: parse={:?} cycle={:?} collect={:?} other={:?} add_deps={:?} inserts={:?} total(incl_flush)={:?}",
            n, t_parse, t_cycle, t_collect, t_other, t_add_deps, t_inserts, tt,
        );
    }
}

/// Mirror of the WASM `bulk_import_cells` shape: drive every formula
/// through `Workbook::bulk_load` (not `Sheet::bulk_load` directly).
/// The WASM bench reports super-linear scaling on this exact path,
/// so we trace it natively to see if the gap is wasm32-specific or
/// algorithmic.
#[test]
#[ignore]
fn chain_install_scaling_trace_workbook() {
    use crate::workbook::Workbook;
    for &n in &[1_000usize, 10_000, 100_000] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(1.0));
        // Time the queue-only portion (parse + cycle check + enqueue)
        // vs the flush portion (sheet-level bulk_load replay).
        let queue_start = std::time::Instant::now();
        let mut formulas: Vec<(String, String)> = Vec::with_capacity(n);
        for i in 2..=n {
            formulas.push((format!("A{i}"), format!("=A{}+1", i - 1)));
        }
        let prep = queue_start.elapsed();
        let total_start = std::time::Instant::now();
        wb.bulk_load(|loader| {
            for (addr, src) in &formulas {
                let ok = loader.set_formula(0, addr, src);
                assert!(ok, "chain formula must not be rejected at {}", addr);
            }
        });
        eprintln!(
            "WorkbookChain{}: prep={:?} bulk_load={:?}",
            n,
            prep,
            total_start.elapsed()
        );
    }
}
