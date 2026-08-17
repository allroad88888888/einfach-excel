# filter/sort 为什么判给引擎:一次被事实推翻的架构裁决

在线表格的架构里有一条反复出现的分界线:哪些状态归 UI,哪些状态归公式引擎。行高列宽、冻结窗格、选区,这些直觉上都是"视图的事";单元格值、公式、依赖图,这些显然是"引擎的事"。但隐藏行和筛选可见性卡在中间——它们看起来是纯视图状态("这行显示不显示"),我们最初也确实把它们判给了 UI 层,三天后又翻案判给引擎。这篇文章讲清楚为什么翻,翻之前的错误形态长什么样,以及翻过去付了什么代价。

## 判据先行:影响计算的状态归引擎

裁决记录在 ADR 0003(`docs/decisions/0003-engine-owns-filter-sort.md`),判据只有一句:

> **影响计算的状态归引擎,不影响计算的归视图。**

这条判据本身从 2026-07-19 起没有变过。变的是"什么影响计算"这个**事实前提**。

2026-07-19 的初次裁决把隐藏行列与筛选可见性判给 UI core,第一条依据是当日逐字为真的一句事实:"引擎没有任何公式读取 hidden(`SUBTOTAL` 101-111 被折算为 1-11)"。既然引擎的求值路径根本不看隐藏状态,那它就是纯渲染事实,归 UI 天经地义。

问题是这句话三天后就不成立了。`SUBTOTAL` 的两档规则落地后,引擎有了两个真实的隐藏集求值输入(`excel/rust/excel-core/src/sheet.rs` 里的 `eval_hidden_rows` / `eval_filter_hidden_rows`),而且两档的读法不一样——看 `eval_aggregate_subtotal.rs` 里的真实分派:

```rust
let (fn_norm, policy) = if (1..=11).contains(&fn_int) {
    (fn_int as u32, SubtotalHiddenPolicy::ExcludeFilter)
} else if (101..=111).contains(&fn_int) {
    ((fn_int - 100) as u32, SubtotalHiddenPolicy::ExcludeFilterAndManual)
}
```

`SUBTOTAL(1-11)` 只排除**筛选**隐藏的行(手动隐藏的照算),`SUBTOTAL(101-111)` 两种都排除。这是 Excel 的语义,不是我们的发明。于是"筛选激活时 `SUBTOTAL(9, A:A)` 的数字会变小"成了**可观测的计算差异,不是渲染差异**——判据没变,前提变了,结论跟着变。

## 裁决前的错误形态:两套真相

翻案之前的形态,用 `excel/solid-excel/src-vnext/adapter/filter-hidden-rows.ts` 文件头注释里的原话描述最准确:

> Until this landed the engine had no idea a filter existed, so 1-11 summed filtered-out rows — a divergence from Excel, not a missing feature.

拆开说,错误形态有两层:

**第一层是直接的语义错。** 用户筛选后,屏幕上只剩 30 行,`SUBTOTAL(9, ...)` 却把被筛掉的 970 行也加了进去——因为"哪些行可见"只活在 UI 层的 atom 里,worker 里的引擎对筛选的存在一无所知。这不是"筛选功能还没做完",而是已有的两个功能(筛选、SUBTOTAL)组合出与 Excel 的公开分歧。

**第二层更危险:同一个事实有两个权威。** UI 层知道哪些行可见,引擎按"所有行都可见"计算。只要存在"看得见的才算"这类函数(SUBTOTAL 是第一个,AGGREGATE 的 ignore-hidden 选项是下一个),这两套真相就必然在某个单元格里碰头。而一旦碰头,你没法在 UI 层修——在宿主侧复刻聚合语义等于再写一个引擎。

## 裁决后的边界

2026-07-22 起的口径,ADR 0003 里是一张四行的表:隐藏行、筛选可见性归**引擎**(UI core 侧只留投影缓存);隐藏**列**归 UI core;行高列宽维持引擎。

落到代码上,边界是这样的:

- 引擎**拥有**手动隐藏行(`Sheet.hidden_rows`)与筛选(`SheetAutoFilter` = 规则 + 派生隐藏集),并**自己求值谓词**。worker 适配器的 `setFilterSort`(`src-vnext/adapter/worker/filter-sort.ts`)把规则整体交给引擎的 `applyFilter`,引擎跑一遍谓词,把规则和它隐藏的行一起提交,隐藏行随 ACK 回传。适配器侧的注释写得很直白:"This is a MIRROR of engine-owned state, not an independently derived set — nothing here re-runs the predicate." 适配器早期那套宿主侧整列扫描被删掉了(引擎在 7700 次逐格判定的黄金对照下复现了它,才敢删)。
- UI core 的两个对应 atom **降级为只在 backend ACK 上写的投影缓存**。这条是硬规则:引擎投影的 atom 不得本地乐观写入——乐观写就是在重新制造第二个权威。
- 隐藏**列**留在 UI core。这是同一判据的负对照:引擎对隐藏列零建模,没有任何公式读它,所以 `viewportHiddenColsAtom` 留在视图层,而 `sheetHiddenRowsAtom` 是引擎投影。同一个概念的两条轴,因为一条影响计算、一条不影响,归属就是分开的。

还有一个容易想当然的点:为什么引擎要**两个**集合而不是一个并集?因为 `SUBTOTAL(1-11)` 必须**包含**手动隐藏行、**排除**筛选隐藏行——集合一旦合并,来源信息永久丢失,两档规则在架构上就表达不出来。所以引擎持两个独立的 per-sheet 集合,配两个独立的失效 epoch,推送手动隐藏不会脏化全工作簿的 1-11 公式(`excel/solid-excel/docs/CANONICAL_OWNERSHIP.md` §7-1 勘误)。这个"一个并集就够了"的想法我们真的持有过——早期裁决原文写的就是"手动/filter 同一集合",后来被三条硬约束逐一否掉:SUBTOTAL 两档规则、复制语义的不对称(Excel 的复制对手动隐藏行照常生效、只对筛选隐藏行跳过)、以及"对被筛行执行 Unhide Rows 不应解除筛选"。任何一条都足以要求保留来源信息。

## sort 的那一半:显示置换退役,物理排序是唯一机制

标题里的 sort 走的是同一条判据,但形态不同。早期的排序是**显示置换**:数据不动,UI 层维护一个 display→源行的映射,按映射顺序画格子。这套东西的问题和筛选同构——排序后的"第 3 行"在 UI 层和引擎层指向不同的物理行,凡是携带行号的操作(选区、复制、引用)都要经过一层回映射,而回映射只存在于 UI 侧,引擎侧的公式看到的还是旧行序。

裁决后排序**物理化**:Rust 引擎的 `sort.rs` 真实搬运单元格(任意置换 relocate + 公式逐字搬运 + spill 闸门),worker、static 两条适配路径与引擎共享同一套比较器语义(static 的 TS 比较器与 Rust `sort_cmp` 逐条对齐,靠 WASM 黄金对照钉住)。随后 `SortDirective`、`FilterSortState.directives` 这些显示置换时代的类型被**整体删除**,`buildFilterSortDisplayRows` 只保留筛选可见性,行序恒为源序。排序的唯一机制是 `runPhysicalSortAtom` → 后端 `sortRange` 端口:后端没有这个端口时**fail-closed 无排序**——工具栏排序按钮、filter 下拉里的排序区、Data 菜单项按 capability 全部隐藏,而不是退回一个只有当前用户看得见的假排序。

## 落到 UI core:投影缓存的纪律

翻转之后,UI core 里的 `sheetHiddenRowsAtom` 和 `viewportFilterHiddenAtom` 还在——渲染和导航总得有个本地可读的集合——但它们的身份从"权威"降级为"投影缓存",写入纪律完全不同:筛选侧**只在 `setFilterSort` 的 ACK 上写**,不存在本地写路径;手动隐藏侧保留乐观写,但每次都经 `feedAndReconcileHiddenRows` 把整个集合喂给引擎并无条件对账,乐观值活不过一次往返。undo 恢复出的状态也不直接写缓存,而是恢复引擎筛选后由 provider 从 `readSheetHiddenState` 重新水合——**缓存永远从引擎的答案长出来,不反向生长**。

## 代价

把状态判给引擎不是免费的,这次翻转至少付了四笔:

**1. undo 换了机制。** 筛选的 apply/clear 现在是一条可撤销事务,靠引擎的整簿快照 `snapshotFilters` / `restoreFilters` 括前后像实现。快照有预算上限(`WORKER_FILTER_SNAPSHOT_MAX`):一个隐藏几万行的筛选会超预算,此时**筛选照常生效但不进历史**——截断快照会让 undo 恢复出错误的隐藏集,所以整条记录丢弃,这是明确选过的取舍。

**2. 数据路径必须逐条对齐。** 复制、Copy As、TSV/图片导出这些"动数据"的路径,都要学会跳过筛选隐藏的行(Excel 的复制对手动隐藏行照常生效、只对筛选隐藏行跳过——两个集合不能读错)。导出侧的实现刻意把隐藏集作为**请求参数**从 UI core 传入,适配器不碰自己的筛选快照——"an adapter that consulted its own `setFilterSort` snapshot would be a second, staler authority"(`filter-hidden-rows.ts`)。

**3. 第二个引擎跟不上就整个撤下。** TS 后端(`@einfach/excel-core-ts`)没有引擎侧隐藏建模,它的能力证词直接声明 `engineHiddenState: false`,宿主随之撤下 `setFilterSort` 端口,筛选入口在 TS 后端上**整体消失**(fail-closed),而不是假装扫一遍谓词。功能可以没有,假 ACK 不行。

**4. 归属翻转本身的迁移成本。** UI core 里原本承载筛选可见性的写路径、local-replay undo 分支、display→源行回映射,整批退役;结构位移(插删行)的前向平移保留。这些在 `CANONICAL_OWNERSHIP.md` #29 那格里有逐条记录。

## 这不是反复横跳

三天两次裁决,看起来像摇摆,其实是判据稳定性的最好证明:推翻的是一个**已经过期的事实陈述**,不是一个当时错误的决策。2026-07-19 判 UI core 时"引擎不读 hidden"为真;两档规则落地后它为假;判据不动,结论跟着事实走。ADR 里甚至写明了反向条件:若某天 SUBTOTAL 的两档规则被删、且 AGGREGATE 的 ignore-hidden 确定不做,按同一判据隐藏行应当翻回 UI core。

留给后来者的操作规程也只有一句:新增任何"工作簿事实"时,先问它是否进入公式求值——是则归引擎,UI 侧只能持投影缓存,且只在 ACK 上写。

---
仓库:https://github.com/allroad88888888/einfach-excel
