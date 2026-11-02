# 归档索引 —— 仓库级文档

冻结记录：已执行完毕、已被取代，或对应已废弃 `SpreadsheetBackend` 双后端协议与暂停 Solid 时代的仓库级文档与观察记录。

## 历史提案与执行台账

- [DOCS_OVERHAUL_PLAN_2026-07-30.md](DOCS_OVERHAUL_PLAN_2026-07-30.md) —— 2026-07-30 文档整理的提案与全仓盘点依据（P0-P4 已全部执行）。
- [PARITY_BACKLOG_HANDOFF_2026-08-04.md](PARITY_BACKLOG_HANDOFF_2026-08-04.md) —— 2026-08-04 双引擎对齐 backlog 与单文件瘦身 agent 交接指南。
- [INTERACTION_ISSUE_TREE.md](INTERACTION_ISSUE_TREE.md)（及 [`interaction-issues/`](interaction-issues/)、[`issues/`](issues/)）—— Solid 时代交互拆解 Issue 树（`UI-000..UI-500`）。
- [INTERACTION_EXECUTION_TREE.md](INTERACTION_EXECUTION_TREE.md)（及 [`interaction-execution/`](interaction-execution/)）—— Solid 时代交互重构波次执行台账（`IX-000`、`W0..W13`）。
- [ADOPTION_ISSUE_TREE.md](ADOPTION_ISSUE_TREE.md)（及 [`content/`](content/)、[`examples/`](examples/)、[`recipes/`](recipes/)）—— Solid 时代 `0.1.0` 发布与 `SpreadsheetBackend` 适配采用 Issue 树（`AD-100..AD-800`）及配套示例、框架配方与外宣草稿。

## 已废弃 `SpreadsheetBackend` 与跨框架适配契约（2026-08）

- [CUSTOM_BACKEND_TUTORIAL.md](CUSTOM_BACKEND_TUTORIAL.md) —— 已移除的 77 成员 `SpreadsheetBackend` 自定义后端教程（AD-218）。
- [BACKEND_DEGRADATION.md](BACKEND_DEGRADATION.md) —— 已移除的 `SpreadsheetBackend` 可选端口降级行为说明（AD-217）。
- [HEADLESS_MOUNTING_CONTRACT.md](HEADLESS_MOUNTING_CONTRACT.md) —— 绑定 `SpreadsheetBackend` 与 `solid-excel` 生命周期模块的挂载契约（AD-320）。
- [DOM_MEASUREMENT_ADAPTER_CONTRACT.md](DOM_MEASUREMENT_ADAPTER_CONTRACT.md) —— 基于 `solid-excel/src/grid/` 与 `HEADLESS_MOUNTING_CONTRACT` 的 DOM 测量适配契约（AD-321）。
- [FRAMEWORK_GRID_PORTABILITY_BOUNDARIES.md](FRAMEWORK_GRID_PORTABILITY_BOUNDARIES.md) —— `solid-excel/src/grid/` 的 Solid 耦合边界审计（AD-312）。
- [FRAMEWORK_EDITING_PORTABILITY_BOUNDARIES.md](FRAMEWORK_EDITING_PORTABILITY_BOUNDARIES.md) —— `solid-excel` 编辑链路的 Solid 耦合边界审计（AD-313）。
- [FRAMEWORK_SELECTION_PORTABILITY_BOUNDARIES.md](FRAMEWORK_SELECTION_PORTABILITY_BOUNDARIES.md) —— `solid-excel` 选区链路的 Solid 耦合边界审计（AD-313）。
- [FRAMEWORK_INTERACTION_PORTABILITY_BOUNDARIES.md](FRAMEWORK_INTERACTION_PORTABILITY_BOUNDARIES.md) —— `solid-excel` 非 Grid 交互表面的 Solid 耦合边界审计（AD-314）。
- [FRAMEWORK_ADAPTER_TIER1_SCOPE.md](FRAMEWORK_ADAPTER_TIER1_SCOPE.md) —— 早期 React/Vue Tier-1 薄适配范围定义（AD-325，已被完整 React 主线产品取代）。
- [FRAMEWORK_ADAPTER_BEHAVIOR_RESOLUTION.md](FRAMEWORK_ADAPTER_BEHAVIOR_RESOLUTION.md) —— 基于 `HEADLESS_MOUNTING_CONTRACT` 的跨框架适配器分歧裁决流程（AD-391）。
- [FRAMEWORK_BACKEND_E2E_MATRIX.md](FRAMEWORK_BACKEND_E2E_MATRIX.md) —— 已移除的 React/Vue `SpreadsheetBackend` 夹具与暂停 Solid 双后端 E2E 矩阵（AD-392）。
- [BOUNDEDNESS_CONTRACTS.md](BOUNDEDNESS_CONTRACTS.md) —— 基于 `solid-excel/e2e/perf-virtual/CASES.md` 与 `SpreadsheetBackend` 可选能力的早期有界性映射（AD-804）。
- [SCALE_TRANSPORT_NARRATIVE.md](SCALE_TRANSPORT_NARRATIVE.md) —— 围绕 3 方法 `SpreadsheetBackend` 端口与 AD-826/827/828 观察记录的早期传输叙事（AD-829）。

## Solid 时代基准、冒烟与规模观察记录（2026-08）

- [BENCHMARK.md](BENCHMARK.md)（及 [`observations/bench/`](observations/bench/)）—— 暂停包 `@einfach-excel/solid-excel` 的 `/?bench=1` 基准页说明（AD-505..510）。
- [AD516_BENCHMARK_CI_DECISION.md](AD516_BENCHMARK_CI_DECISION.md) —— AD-505 落地前的基准 CI 临时决策记录（AD-516）。
- [AD517_COMPETITOR_BENCHMARK_DECISION.md](AD517_COMPETITOR_BENCHMARK_DECISION.md) —— AD-505 落地前的竞品同页基准临时决策记录（AD-517）。
- [WASM_SIZE_REDUCTION_FEASIBILITY.md](WASM_SIZE_REDUCTION_FEASIBILITY.md) —— 基于 D2 迁移前 `solid-excel` 依赖形态的 WASM 体积削减可行性记录（AD-514）。
- [LAZY_EVALUATION_AUDIT.md](LAZY_EVALUATION_AUDIT.md) —— 2026-08-13 两份懒求值归档提案与当时 `sheet.rs` 的逐项对照审计（AD-823）。
- [AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md](AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md) —— 2026-08-17 Solid 时代五包 `0.1.0` 本地 verdaccio dry-run 观察记录。
- [AD138_VITE_SMOKE_OBSERVATION.md](AD138_VITE_SMOKE_OBSERVATION.md) —— 2026-08-17 `solid-excel@0.1.0` Vite 仓外冒烟观察记录。
- [AD139_WEBPACK_SMOKE_OBSERVATION.md](AD139_WEBPACK_SMOKE_OBSERVATION.md) —— 2026-08-17 `solid-excel@0.1.0` webpack 5 仓外冒烟观察记录。
- [AD140_NEXT_SMOKE_OBSERVATION.md](AD140_NEXT_SMOKE_OBSERVATION.md) —— 2026-08-17 基于 3 方法 `SpreadsheetBackend` 桩的 Next.js 仓外冒烟观察记录。
- [AD141_NUXT_SMOKE_OBSERVATION.md](AD141_NUXT_SMOKE_OBSERVATION.md) —— 2026-08-17 基于 3 方法 `SpreadsheetBackend` 桩的 Nuxt 3 仓外冒烟观察记录。
- [AD142_FAILURE_PATH_WALKTHROUGH.md](AD142_FAILURE_PATH_WALKTHROUGH.md) —— 2026-08-17 `solid-excel` 失败路径可读性走查记录。
- [AD219_FIRST_RUN_WALKTHROUGH.md](AD219_FIRST_RUN_WALKTHROUGH.md) —— 2026-08-17 Solid 时代 `QUICKSTART.md` 新手首跑走查记录。
- [SCALE_OBSERVATIONS.md](SCALE_OBSERVATIONS.md)（及 [`observations/`](observations/)）—— Solid 时代规模观察记录汇总索引。
- [AD807_TEN_MILLION_LOAD_OBSERVATION.md](AD807_TEN_MILLION_LOAD_OBSERVATION.md) —— 2026-08-13 `solid-excel` DemoMillion 千万单元格灌入边界观察记录。
- [AD808_SCALE_INTERACTION_OBSERVATION.md](AD808_SCALE_INTERACTION_OBSERVATION.md) —— 2026-08-17 `solid-excel` DemoMillion 600 万单元格交互观察记录。
- [AD809_SCALE_RECALC_OBSERVATION.md](AD809_SCALE_RECALC_OBSERVATION.md) —— 2026-08-17 `solid-excel` 700 万单元格按需求值观察记录。
- [AD810_IMPORT_SESSION_BOUNDARY_OBSERVATION.md](AD810_IMPORT_SESSION_BOUNDARY_OBSERVATION.md) —— 2026-08-13 `solid-excel` DemoMillion 导入会话边界观察记录。
- [AD825_WIRE_BYTES_MEASUREMENT.md](AD825_WIRE_BYTES_MEASUREMENT.md) —— 已移除的 `solid-excel` worker adapter 传输字节计数探针说明。
- [AD826_FIRST_SCREEN_EVALUATION_OBSERVATION.md](AD826_FIRST_SCREEN_EVALUATION_OBSERVATION.md) —— 2026-08-13 `solid-excel` 双后端首屏公式求值观察记录。
- [AD827_BOUNDED_VS_FULL_RANGE_READ_OBSERVATION.md](AD827_BOUNDED_VS_FULL_RANGE_READ_OBSERVATION.md) —— 2026-08-13 `solid-excel` 双后端有界窗口读取与全量读取载荷观察记录。
- [AD828_REMOTE_BACKEND_OBSERVATION.md](AD828_REMOTE_BACKEND_OBSERVATION.md) —— 2026-08-17 `solid-excel/demo-remote` HTTP 3 方法 `SpreadsheetBackend` 观察记录。

现行入口在上一层：[`../ARCHITECTURE.md`](../ARCHITECTURE.md) 与
[`../decisions/`](../decisions/README.md)。
