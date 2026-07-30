# ROADMAP

## 这份文档现在是什么

**wave 模型已退役。** 本文原先把 20 份 feature 设计稿排进 Wave 1-4（后来扩到 8），
用来安排实现顺序。那些 wave 已全部落地，而**之后的工作不再按 wave 组织** —— `tables`、
`outline`、`formula-functions` 等已上线 feature 不属于任何 wave，后续按 parity 编号
（#27 筛选、#29 排序、#32 Excel Table 等）推进。

继续维护一张 wave 进度表只会持续误导，所以本文改成**能力索引**：每个 feature 现在在哪、
契约文档是哪份、归引擎还是归 UI core。原先的 wave 表与 20 份一次性设计稿在
[`archive/`](./archive/INDEX.md)。

## 现行契约在哪

| 想知道 | 权威来源 |
|---|---|
| 某 feature 的 atom 分类、有界缓存上限、测试面 | `src/<feature>/README.md` |
| 某个事实归引擎还是归 UI core | [`../../solid-excel/docs/CANONICAL_OWNERSHIP.md`](../../solid-excel/docs/CANONICAL_OWNERSHIP.md) |
| 归属判据及那次翻转的理由 | [ADR 0003](../../../docs/decisions/0003-engine-owns-filter-sort.md) |
| 后端端口形状（必需 / 可选） | `src/backend/types.ts` + `src/backend/README.md` |
| 仓库级三层架构 | [`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) |
| 包内硬约束与测试门禁 | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| e2e 覆盖了哪些场景 | `excel/solid-excel/e2e/<feature>/CASES.md` |

模块全表（含每个模块一句话职责与 README 链接）在包 [`README.md`](../README.md)。

## 仍在维护的 feature 契约文档

`docs/` 下只留了带 as-built 标记、确实反映现状的几份：

| 文档 | 性质 |
|---|---|
| [frozen-panes.md](./frozen-panes.md) | canonical authority contract，记录已实现的冻结窗格契约 |
| [filter-sort.md](./filter-sort.md) | 2026-07-21 为 #27 重写，含 engine-owns-filter 裁决 |
| [cell-format-expansion.md](./cell-format-expansion.md) | 带 as-built 实现状态段 |
| [comments-notes.md](./comments-notes.md) | 记录 `src/comments/` 的已实现范围与权属划分 |

其余 feature 一律以 `src/<feature>/README.md` 为准 —— 它们统一采用 State Decision Template，
是全仓与实现同步得最好的一层。

## 跨切面不变式（跨期持续生效）

这几条约束不随 wave 存废，所有 feature 都适用：

- **可选后端端口** —— feature 新增的 `SpreadsheetBackend` 方法一律可选。宿主没实现时
  UI core 隐藏对应入口，且不区分「没实现」与「特性不存在」。
- **State Decision Template** —— 每个模块声明 Source / Derived / Command atom、规模上限、
  以及 per-cell/per-row atom 风险。`debugLabel` 走 `spreadsheet.<feature>.<name>` 命名空间。
- **`DisplayCell` 扩展** —— 很多 feature 给 `DisplayCell` 加可选字段（`mergedSpan`、
  `mergeAnchor`、`validation`、`conditionalFormat`、`noteIndicator`、`commentThreadId`、
  `locked`），由可见窗口投影填充。单元格保持值类型，**不引入 atom 家族**。
- **有界缓存** —— 每个缓存后端状态的地方都要声明明确上限（history 100、命名区间列表 500、
  presence 光标 32、find 匹配 500、解锁区间 256），淘汰策略写在各 feature 文档里。
- **revision 与取消** —— 新请求沿用可选的 `requestId` / `revision` / `cancelToken` 形状。

## 明确不做

Charts、images、浮动对象不在本包范围内，也没有对应文档。
