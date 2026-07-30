# ADR 0003：影响计算的状态归引擎 —— 隐藏行与筛选可见性下沉

- 状态：accepted
- 日期：2026-07-19（初次裁决）→ 2026-07-22（二次翻转，本 ADR 记录的是最终口径）
- 相关：`excel/solid-excel/docs/CANONICAL_OWNERSHIP.md`（逐条归属表，现行规范源）

## 判据

**影响计算的状态归引擎，不影响计算的归视图。**

这条判据本身从 2026-07-19 起没有变过。变的是「什么影响计算」这个**事实前提**。

## 初次裁决与它的过期

2026-07-19 的裁决把隐藏行列与筛选可见性判给 UI core，第一条依据是当日逐字为真的一句事实：
「引擎没有任何公式读取 hidden（`SUBTOTAL` 101-111 被折算为 1-11）」。

这句话随后被 #27 与隐藏行下沉推翻。现在引擎有两个真实的隐藏集求值输入
（`excel/rust/excel-core/src/sheet.rs` 的 `eval_hidden_rows` / `eval_filter_hidden_rows`），
`SUBTOTAL` 真的读它们，而且 **`SUBTOTAL(1-11)` 只读筛选集、`(101-111)` 两个都读**
（`eval.rs` 的 `SubtotalHiddenPolicy` / `subtotal_hidden_for_arg`）。筛选激活时
`SUBTOTAL(1-11)` 的数字会变小 —— 这是**可观测的计算差异**，不是渲染差异。

## 决策（2026-07-22 起的口径）

| 事实 | 影响计算？ | 归属 |
|---|---|---|
| 隐藏行 | **是** —— `SUBTOTAL(101-111)` 读它 | **引擎**（UI core 侧只留投影缓存） |
| 筛选可见性 | **是** —— `1-11` 只读它，`101-111` 也读 | **引擎**（UI core 侧只留投影缓存） |
| 隐藏列 | 否 —— 引擎零建模，只按 `addr.row` 过滤 | UI core |
| 行高列宽 | （既定归引擎） | 引擎 |

引擎因此**拥有**手动隐藏行（`Sheet.hidden_rows`）与筛选（`SheetAutoFilter` = 规则 + 派生隐藏集），
并自己求值谓词（worker 经 `applyFilter`；static backend 作为第二引擎，TS 谓词由黄金对照钉死）。
UI core 的两个对应 atom **降级为只在 backend ACK 上写的投影缓存**。

## 这不是反复横跳

隐藏**列**是同一判据的负对照：`viewportHiddenColsAtom` 留在 UI core，`sheetHiddenRowsAtom`
是引擎投影 —— 同一个概念的两条轴，因为一条影响计算、一条不影响，归属就是分开的。

推翻的是一个**已经过期的事实陈述**，不是一个当时错误的决策。归属是判据的函数：若某天 `SUBTOTAL`
的两档规则被删、且 AGGREGATE 的 ignore-hidden 确定不做，按同一判据隐藏行应当翻回 UI core。

## 后果

- 新增任何「工作簿事实」时，先问它是否进入公式求值 —— 是则归引擎，UI 侧只能持投影缓存。
- UI core 里凡是引擎投影的 atom，**不得**在本地乐观写入，只能在 backend ACK 上写。
- 归属的逐条现状表在 `excel/solid-excel/docs/CANONICAL_OWNERSHIP.md`，那里是规范源；
  本 ADR 只记判据与这次翻转的理由。
