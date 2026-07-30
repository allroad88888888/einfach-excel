# 归档索引 —— excel/rust

本目录是**冻结记录**：2026-05 那一轮「在线表格」战役的 phase / wave 分工计划、
会话交接、发布门禁记录，以及已被接任文档取代的路线图与待办。

它们描述的是**当时的意图与当时的代码**。三点注意：

1. 里面的「当前状态」全部过期，且彼此停在不同月份，互相矛盾 —— 不要用它们判断现状。
2. 钉死的 commit（如 `e5a25d0`）属于拆分前的老仓，在本仓历史里不存在。
3. 阶段命名有三套并存：`PHASE1-5`、`WAVE1-6`、`ATOM_DELEGATION P1-P7`，指的不是同一套编号。

现行入口：架构总览见仓库根 `docs/ARCHITECTURE.md`，atom 委托现状见 `../ATOM_DELEGATION_MAINLINE.md`，
基准测试操作见 `../PERF.md`。

- [STEPS.md](STEPS.md) — Phase 1-5 实现步骤清单，全部 ✅
- [HANDOFF.md](HANDOFF.md) — 2026-05-14 会话交接（钉的 tip e5a25d0 在本仓历史里不存在；「不 push / 不改 CI」约束已失效）
- [ONLINE_SPREADSHEET_PLAN.md](ONLINE_SPREADSHEET_PLAN.md) — 2026-05-13 在线表格产品化规模计划
- [ONLINE_SPREADSHEET_EXECUTION_WAVES.md](ONLINE_SPREADSHEET_EXECUTION_WAVES.md) — 2026-05-14 波次执行拆解（以 e5a25d0 为 HEAD 事实）
- [PHASE1_PARALLEL.md](PHASE1_PARALLEL.md) — 2026-05-12 Phase 1 多 agent 并行分工
- [PHASE2_PARALLEL.md](PHASE2_PARALLEL.md) — 2026-05-12 Phase 2 多 agent 并行分工
- [PHASE3_PARALLEL.md](PHASE3_PARALLEL.md) — 2026-05-12 Phase 3 多 agent 并行分工
- [PHASE4_PARALLEL.md](PHASE4_PARALLEL.md) — 2026-05-12 Phase 4 多 agent 并行分工
- [PHASE4A_PARALLEL.md](PHASE4A_PARALLEL.md) — 2026-05-12 Phase 4A 尾巴分工
- [PHASE5_PARALLEL.md](PHASE5_PARALLEL.md) — 2026-05-12 Phase 5 多 agent 并行分工
- [WAVE3_IMPORT_PERSISTENCE_PLAN.md](WAVE3_IMPORT_PERSISTENCE_PLAN.md) — 2026-05-13 Wave 3 导入与持久化计划
- [WAVE4_OBSERVABILITY_MCP_PLAN.md](WAVE4_OBSERVABILITY_MCP_PLAN.md) — 2026-05-14 Wave 4 可观测性计划
- [WAVE5_FILE_IMPORT_BACKPRESSURE_PLAN.md](WAVE5_FILE_IMPORT_BACKPRESSURE_PLAN.md) — 2026-05-14 Wave 5 文件导入背压计划
- [WAVE6_PRODUCT_HARDENING_PLAN.md](WAVE6_PRODUCT_HARDENING_PLAN.md) — 2026-05-14 Wave 6 产品加固计划
- [RELEASE_GATE_PLAN.md](RELEASE_GATE_PLAN.md) — 2026-05-14 本地发布门禁执行记录（前提「不 push、不改 workflow」与现行 CI 冲突）
- [ATOM_DELEGATION_PROGRESS.md](ATOM_DELEGATION_PROGRESS.md) — atom 委托改造的进度快照，停在 2026-07-10 P7（与 ATOM_DELEGATION_MAINLINE.md 重复）
- [LAZY_FORMULA_EVAL.md](LAZY_FORMULA_EVAL.md) — 2026-05 惰性公式求值叙事（已被 excel-core/docs/archive/LAZY_FORMULA_INDEXING_PLAN.md 接管）
- [ROADMAP.md](ROADMAP.md) — Rust 侧路线图，停在「第七期 7C」；不覆盖 Wave 1-6、atom-delegation P1-P7、excel-core-ts
- [TODO.md](TODO.md) — 待办清单，基准是 2026-05 惰性公式批次；多数条目已完成
- [ISSUES.md](ISSUES.md) — 针对某个 review 分支的问题清单（2026-05）；勾选框状态多已与代码不符
