# Performance Benchmarks

Criterion-based benchmarks for the Rust core. They exist so the lazy / sparse
engine architecture (`docs/ON_DEMAND_EVALUATION.md`,
`docs/RANGE_DEPENDENCY_TIERS.md`, `docs/SPARSE_STORAGE_MODEL.md`; historical
plan in `excel/rust/docs/archive/LAZY_FORMULA_EVAL.md`) has a stable baseline to
measure against — not to prove absolute thresholds, which vary by machine.

## Running

Each crate owns its own bench suite. From the crate directory:

```bash
# Full suite (slow — full criterion sampling)
cd excel/rust/core         && cargo bench
cd excel/rust/excel-core   && cargo bench

# A single bench
cargo bench --bench store_bench
cargo bench --bench sheet_bench

# Fast smoke check (smaller sample count — useful in CI / pre-commit)
cargo bench -- --quick

# Compile-only (verify the harness still builds without running)
cargo bench --no-run
```

Criterion writes HTML reports to `target/criterion/<group>/<bench>/report/index.html`.
The terminal output shows `time`, `thrpt` (throughput) and any % change vs the
previous baseline.

## Comparing baselines

Before making a perf-sensitive change:

```bash
cargo bench -- --save-baseline before
```

Then, after the change:

```bash
cargo bench -- --baseline before
```

Criterion will annotate each row with the delta and flag statistically
significant regressions.

## What each benchmark measures

### `excel/rust/core/benches/store_bench.rs`

| Bench | What it measures | Gates / motivation |
|---|---|---|
| `store/atom_write_throughput/set_10k_primitives` | Bare `Store::set` cost on primitive atoms with no subscribers. The floor for every other write path. | Changes to `Store::set` or dependency invalidation must not regress this beyond noise. |
| `store/formula_chain_propagation/chain_100_propagate` | One full top-down recompute over a 100-deep linear chain after a single set at the head. Worst case for dependency propagation when the tail is read. | Ensures `Store` dependency propagation stays linear and low-overhead when readers observe the tail. |

### `excel/rust/excel-core/benches/sheet_bench.rs`

| Bench | What it measures | Gates / motivation |
|---|---|---|
| `sheet/bulk_set_cell/set_10k_numbers` | Throughput of `Sheet::set_cell` for 10k primitive values, no formulas, no subscribers. Captures the cost of address parsing + slot update + `store.set`. | Floor for the single-cell sheet write path. |
| `sheet/sum_range_eval/sum_a1_a10000` | Per-call cost of `get_cell("B1")` where `B1 = SUM(A1:A10000)`. After the first evaluation, the derived formula-inner atom value is cached in `Store`, so repeated calls measure the settled read path. | Guards the hot `Sheet::get_cell` + `Store::settle_pending_reads` read boundary on a range formula. |
| `sheet/lazy_import_no_eval/import_10k_formulas` | Throughput of installing 10k scalar formulas via `Sheet::set_formula` without reading any of them. | Scalar `set_formula` parses and installs the `FormulaRecord` and lazy `formula-inner` derived atom without eagerly evaluating it. (`Store::debug_recompute_count` in `excel/rust/core/src/store.rs` and `Sheet::debug_recompute_count` / `Sheet::debug_formula_eval_count` in `excel/rust/excel-core/src/sheet_debug_atoms.rs` provide the exact evaluation counters used by behavioral tests.) |
| `sheet/range_dep_registration/{10,100,1000}` | `set_formula(=SUM(A1:A1000))` N times, measure time. Because `A1:A1000` exceeds `RANGE_TIER_A_CELL_LIMIT` (`256`), it uses Tier-B row-band geometry epochs (`sheet_range_tiers.rs`, `sheet_facade_range_context.rs`) when evaluated rather than expanding 1,000 per-cell dependency edges at registration time. | Catches accidental reintroduction of eager O(range_size) per-cell dependency expansion during formula registration. |
| `sheet/range_dirty_lookup/{10,100,1000}` | After registering and initial-reading N `=SUM(A1:A1000)` formulas that all depend on `A1`'s Tier-B row-band geometry root, time `set_cell("A1", …)`. | Measures single-cell write invalidation across N range-formula consumers via `Store` geometry epochs (`sheet_facade.rs`, `sheet_facade_range_context.rs`). |

### `excel/rust/excel-core/benches/scale_bench.rs`

规模验收套件，与上面两份的定位不同：**它不守某个性能数字**，而是在数量级规模上证明
lazy / sparse 契约成立 —— 如果实现退化成 eager 或 O(总坐标空间)，这些 bench 会跑到
明显超出任何合理预算，从而暴露问题。

| Bench | What it measures | Gates / motivation |
|---|---|---|
| `bulk_load_100k_formulas` | 经 `bulk_load` 导入 10 万条公式，须在有界时间内完成 | 导入路径的惰性检查：公式停留在 `formula_source` / `needs_parse` 而不求值 |
| `sparse_1m_grid_read_window` | 100 万单元格坐标空间、仅 1 万个已物化，读一个 50×27 视口矩形 | 必须是 O(可见)，不是 O(坐标空间总量) |
| `dirty_lookup_100k_ranges` | 10 万区间公式下的脏查找 fan-out | Tier 分层区间依赖（`sheet_range_tiers.rs`）在规模下的失效传播行为 |
| `cross_sheet_store_propagation_10k` | 万级跨表传播 | 跨表依赖走同一个 workbook 级 Store 图后的传播成本 |

```bash
cd excel/rust/excel-core && cargo bench --bench scale_bench
cd excel/rust/excel-core && cargo bench --bench scale_bench --no-run   # 只验编译
```

完整执行是**分钟级**，不适合放进 pre-commit；`--no-run` 适合（已在 CI `rust` job 中作为编译门禁运行）。

## Debug & Telemetry Counters in `Store` and `Sheet`

Behavioral assertions for lazy evaluation and dependency bounds live in standard
`cargo test` suites (such as `excel/rust/excel-core/tests/lazy_bulk_load.rs` and
`excel/rust/excel-core/src/sheet_tests/range_store_edges.rs`) using the
`#[doc(hidden)]` counters:

- `Store::debug_recompute_count(&self) -> usize` and
  `Store::debug_flush_visit_count(&self) -> usize` in
  `excel/rust/core/src/store.rs`
- `Sheet::debug_recompute_count(&self) -> usize`,
  `Sheet::debug_formula_eval_count(&self) -> usize`,
  `Sheet::debug_total_atom_count(&self) -> usize`, and
  `Sheet::debug_dirty_count(&self) -> usize` in
  `excel/rust/excel-core/src/sheet_debug_atoms.rs`

## Workflow for performance-sensitive changes

1. Check out the pre-change commit.
2. `cargo bench -- --save-baseline before`.
3. Apply the change.
4. `cargo bench -- --baseline before`.
5. Record the deltas + the criterion report path in the PR description.
   Do NOT promise specific wall-clock numbers in the doc — only deltas vs a
   named baseline on the same hardware are meaningful.

## What's intentionally NOT here

- **WASM bench harness.** `wasm-pack bench` is a different ecosystem and out
  of scope for native Criterion benchmarks.
- **Absolute thresholds (e.g. "must be < 50 ms").** Hardware-dependent; we
  rely on relative deltas for timing and deterministic counter assertions in
  `cargo test` for algorithmic invariants.

## Storage reads and allocation probes

`storage_reads` separates first SUM evaluation, cached reads, and edit/recompute,
with both storage-primary Plain cells and materialized atom cells. It also covers
8/128/4096-byte text reads and 100k formula installation/window reads. Use the
same Criterion baseline workflow above; avoid timing alongside builds/tests.

`cargo run --release --example storage_allocations` reports allocator requests,
peak/live requested bytes, and atom/evaluation counts. These are not RSS.
For a real Chromium Worker projection and transport measurement, start the React
Vite server and run `node scripts/bench-rust-storage-worker.mjs <server-url>` from
the repository root. For lite/full it validates a 1350-cell viewport, a dense
5000-cell wide viewport, the same 5000 cells in a sparse million-row rectangle,
and a 10000-cell export spanning the snapshot budget.

Sparse scans carry the first 8192 actual primitive slots with their values, then
keep only addresses for the remainder. Empty coordinates do not consume this
budget. The power-of-two limit covers a dense 100-by-50 viewport while bounding
the retained slot buffer independently of export size. Layout depends on the
target; the measured native slot buffer is at most 256 KiB. Large formula ranges
still retain one reusable address epoch per visited Plain member; replacing those
with region dependencies requires a separate invalidation design.

The [2026-11-03 validation record](archive/2026-11-03-storage-read-optimization.md)
records the implementation boundaries and distinguishes counts from noisy timings.
The [snapshot-budget follow-up](archive/2026-11-03-slot-snapshot-review.md)
records the later viewport correction, export-memory tradeoff, and verification.
