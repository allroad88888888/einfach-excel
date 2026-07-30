# 归档索引 —— einfach-excel-core

本目录是**冻结记录**：带日期的一次性审计、trace 报告，与已 LANDED 的改造计划。
标 LANDED 的计划说明当时已落地，但**不保证与今天的代码一致** —— 现状看代码与
`src/CUSTOM_FORMULAS.md`（自定义公式契约，现役）。

- [AUDIT_PATTERN_FAMILY_2026-06-12.md](AUDIT_PATTERN_FAMILY_2026-06-12.md) — 跨引擎反模式审计报告（P-A~P-D），一次性
- [CAP_REMOVAL_2026-06-11.md](CAP_REMOVAL_2026-06-11.md) — Phase 5 上限移除记录
- [MEGA_TRACE_2026-06-11.md](MEGA_TRACE_2026-06-11.md) — 一次 bench trace 报告
- [LAZY_FORMULA_INDEXING_PLAN.md](LAZY_FORMULA_INDEXING_PLAN.md) — 惰性公式索引计划（2026-06-11 LANDED + 06-12 update）—— 取代了 rust/docs 里 2026-05 那版叙事
- [SCALE_TEST_SUITE_PLAN.md](SCALE_TEST_SUITE_PLAN.md) — 大 N 测试套件计划（LANDED）；对应的 benches/scale_bench.rs 仍在跑，运行说明已并入 ../../docs/PERF.md
- [STORAGE_PRIMARY_PLAN.md](STORAGE_PRIMARY_PLAN.md) — storage-primary 改造计划（LANDED，6.1-6.4 逐 commit 结案）
