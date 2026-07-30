# Rust 侧文档

## 活文档

| 文档 | 内容 |
|---|---|
| [ATOM_DELEGATION_MAINLINE.md](ATOM_DELEGATION_MAINLINE.md) | **现行主流程**：公式单元格如何经一个 workbook 级 Store 图派生。要理解引擎数据流先读这份 |
| [ATOM_DELEGATION_REWRITE_PLAN.md](ATOM_DELEGATION_REWRITE_PLAN.md) | 该改造的约束与门禁契约（P1-P7 已完成，门禁条款仍生效） |
| [PERF.md](PERF.md) | criterion 基准的运行方式、基线对比、各 bench 守什么 |

引擎之外的入口：

- 仓库级三层架构 —— [`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)
- 自定义公式引擎契约 —— [`../excel-core/src/CUSTOM_FORMULAS.md`](../excel-core/src/CUSTOM_FORMULAS.md)
- WASM 导出面与测试 —— [`../wasm/README.md`](../wasm/README.md)
- feature 归引擎还是归 UI core —— [`../../solid-excel/docs/CANONICAL_OWNERSHIP.md`](../../solid-excel/docs/CANONICAL_OWNERSHIP.md)

## 归档

[`archive/`](archive/INDEX.md) 里是 2026-05 那轮「在线表格」战役的 phase / wave 分工计划、
会话交接、发布门禁记录，以及被取代的 ROADMAP / TODO / ISSUES / MAIN_FLOW。

**不要用它们判断现状。** 那些文档的「当前状态」各停在不同月份且互相矛盾，钉死的 commit
属于拆分前的老仓，`MAIN_FLOW.md` 的状态归属表已被现行架构推翻。详情见
[archive/INDEX.md](archive/INDEX.md) 的说明。
