# ADR 0006：溢出区的写入语义以 Excel 为准

- 状态：**accepted**（2026-07-31，owner）
- 日期：2026-07-30 起草；2026-07-31 接受
- 相关：跨引擎 parity 套件 `excel/solid-excel/test/scale-parity.test.ts`（P2/P4 在 `0:H1` / `0:J1` 上抓到分歧）；
  TS 参考实现的目标语义规格 `excel/excel-core-ts/test/workbook.test.ts:287-311`；
  `excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md` 的 INV-2 与 §6/§9 流程

## 背景

往动态数组的溢出区（非 anchor 的投影格）写入时，两个引擎行为不同：

| | Rust 引擎 | TS 参考引擎 / Excel |
|---|---|---|
| 写入投影格 | 拒绝（`SheetError::SpillCellWrite { anchor }`），输入丢弃 | 写入生效，anchor 变 `#SPILL!`，其余投影格回到空 |
| 之后清掉阻塞物 | 数组**不**复活（`spill_infra.rs:140` 把这条钉成 "Phase 1 limitation"） | 数组复活 |

Rust 侧除 `try_*` 三个入口返回 Err 外，还有六处同语义的**静默跳过**（`sheet.rs` 的 `set_cell`、
`clear_cell`、`set_formula`、`BulkLoader::set_cell_at` / `set_formula_at` / `set_formula_lazy`），
其中 `clear_range` 会把跳过的格子算进 `cleared` 计数 —— 也就是带成功计数的丢数据。

## 考古：拒绝契约不是语义决策，是实现约束的固化

引入点是 `866a601`（2026-05-21，"dynamic-array infra ... + write rejection"）。三条独立证据：

1. 该 commit message 通篇讲 atom 图安全性（`Store::has_dependents` panic），没有一句以 Excel 行为
   为依据。
2. 代码里写下的真实理由在 `sheet.rs:6687-6694`：不加 guard 则 `ensure_cell` 返回**只读派生 atom**，
   `store.set` 会 panic（对照 `excel/rust/core/src/store.rs` 的
   `assert!(inner.record(id).read_fn.is_none(), "cannot set a read-only derived atom")`）。
   **拒绝是为了不 panic。**
3. 同批注释把 "no auto-retry on conflict-resolve" 自标为 "Phase 1 limitation" —— 作者当时就知道
   这偏离 Excel。

唯一援引 Excel 为拒绝背书的是 `sheet.rs:6688-6690`：*"Excel treats Delete over the ghost cells of a
dynamic array as a no-op"*。这句对 **Delete 键清区**是对的，但被越界推广到了**输入值** —— Excel 对
输入值不忽略，而是让 anchor 变 `#SPILL!`。**分歧的根就在这一句的过度泛化。**

而原始约束今天已经不成立：`Sheet::clear_spill` 提供了正确解法 —— **先拆 spill 再写**，就不会碰到
只读 atom。

## 决策

**以 Excel 语义为准，改 Rust 引擎，而不是把 TS 参考引擎改成拒绝。**

目标状态：写入投影格 → 该格写入生效；anchor 的投影 atom 置 `Error(ValueError::Spill)`；其余投影格
回到空（整个数组收回，等同 `clear_spill`）；清掉阻塞物后数组复活。

四条理由，按权重：

1. **Excel 就是这样，本仓的参考实现已经是对的。** 参考引擎的存在价值是当 oracle；发现分歧时改
   oracle 而不改被测方，等于把 parity 测试变成橡皮图章。
2. **拒绝契约的原始理由已不成立**（见考古）。
3. **对外承诺已经站在 Excel 语义一边**：`excel/excel-site/src/demos/pages/DynamicArraysDemo.tsx:40,48`
   的双语文案明确承诺"在溢出区域内输入内容 —— 对应锚点会变成 `#SPILL!`"，而该 demo 跑在 TS 引擎上。
   选拒绝语义要撤回一个已发布的行为承诺。
4. **改动面被现有机制托住**：写入期塌缩能完整复用 `clear_spill` + `register_spill` 的碰撞路径 ——
   写入后重跑 `recompute_array_formula(anchor)`，它自然走到"目标被占 → `Err(ValueError::Spill)` →
   anchor 置 `#SPILL!`"。唯一必需的新连线是**把 anchor 塞进 reproject 集合**（spill 的依赖方向是
   反的：投影格依赖 anchor，anchor 公式不引用投影格，所以 store 反向依赖永远选不到它），用的还是
   INV-2 白名单里已有的 `spill_target_anchor`。WASM 的六个 `try*` 导出与 INV-4 的签名快照**不用动**。

## 分期与两条硬约束

**阶段 0 —— 与本决策无关的既有缺陷，无条件先做。** 稀疏快照把投影值烙成字面量；
`teardown_all_spills` 漏掉碰撞态 anchor；`auto_fill` 的三处 `SpillTarget` guard 零测试覆盖；
跨引擎 parity 全量被 `EINFACH_SCALE` 门控因而在 CI 里隐身。

**阶段 1 —— 写入期塌缩。不可拆。** 六个 guard 点必须同批改完：留任何一个未改，就会出现
"`try_set_cell` 塌缩、`BulkLoader` 静默跳过"的不一致，而 `clear_range` → `bulk_load` →
`set_cell_at` 是同一条路；更致命的是漏改会让 `store.set` 打在只读派生 atom 上 → panic。
顺序铁律：**`clear_spill` 必须在任何 `ensure_cell` / `store.set(addr)` 之前**。

**阶段 2 —— 自动复活。** 碰撞发生时 `register_spill` 直接 `return Err` 且不留任何簿记，所以清掉
阻塞物时引擎无法从阻塞地址找回 anchor。修法是把碰撞矩形也登记成 claims（addr → anchor 归属，
带 Blocked 标记），复杂度与现有 `spill_target_anchor` 同阶。

> **硬约束 A：阶段 1 与阶段 2 必须同一个 release。** 只做阶段 1 会把"拒绝写入"这个小毛病换成
> "Ctrl+Z 永久损坏工作簿"这个大毛病 —— undo 前像取自 `snapshotRangeSparse`，而它今天会把投影值
> 烙成真字面量（阶段 0.1），且 `restoreSparse` 是 **additive merge**、不带 clear-then-restore。
> 于是「H1=`=SEQUENCE(10)` → 在 H3 打 999 → Ctrl+Z」的结果是：H3 被写回一个**真的** `2`，H1 仍是
> `#SPILL!`，H2/H4..H10 仍然空 —— 用户拿不回数组。宁可两阶段都不做，也不要只做阶段 1。

> **硬约束 B：阶段 2 的 Blocked claims 与 INV-2 的关系必须先定。** 两种读法都成立，所以不能靠
> 实现者自行判断：
> - **不需要 DECISION_REQUEST**：§「Pre-approved mechanism-pure fallback ladders」里写着
>   *"Spill reactor troubles: keep today's eager engine-side spill maintenance (public setters only),
>   side indexes still collapse to `claims`"* —— Blocked claims 的形状正是 `claims`。
> - **需要 DECISION_REQUEST**：INV-2 正文说"决定**什么在变化时重算**的边只能是 Store 的依赖图"，
>   而 Blocked claims 确实决定了"写这个格子时要重算哪个公式"。
>
> `ATOM_DELEGATION_REWRITE_PLAN.md` 明写：未经 INV 修正就引入这类结构是 **P0 defect，即使全部
> 测试通过**。最省事的出路是给 INV-2 的白名单加一句澄清（spill claims 可以驱动 anchor 重投影），
> 与阶段 2 同 commit 落地。**这个选择属于 owner。**

**阶段 3 —— UI 回填**（`DisplayCell` 的 `spillShape` / `spillAnchor`、溢出区边框）。今天 UI 层
对 spill 完全无感 —— 那套 UX 在拆仓时随 `e192c41` 的 `packages/solid-excel/` 一起被 path filter
滤掉了，之后没人补回来。风险低、价值高、不阻塞阶段 1/2。

## 明确非目标

`sort.rs` 的 `SpillIntersectsRange` 与 `auto_fill.rs` 的 `SpillTarget` **保持整体拒绝**。Excel 对
"排序/填充跨越数组边界"同样整体拒绝（"不能更改数组的某一部分"），单格输入是 Excel 里唯一的例外。
把这个不对称显式写下来，避免后人当 bug 修掉。

## 后果

- 需**逐条重判**的测试 17 条（8 条断言 `Err(SpillCellWrite)`、4 条断言静默跳过、
  `spill_infra.rs:140` 那条必须整体语义反转、4 条排序闸门需复核）；需复跑复核的约 96 条 Rust 用例。
- `tests/golden_replay.rs` 的 5 个 fixture（3981 行）要重新生成并**逐 diff 复核** —— 写入生效会让
  `non_empty_addrs` 变长，后续所有 op 的碰撞判定连锁改变。该预言机的 header 禁止为变绿而重生成，
  所以要在 commit message 里给出 `#SPILL!` 数量变化的闭式解释。
- `excel/solid-excel/src-vnext/adapter/cell-write-reject.ts` 的 `'spill-write'` 分支变死码；
  `'invalid-address'` 与 `'mutation-during-custom-call'` 两个码保留，所以那个模块不白做。
- 新增代价要量：`=SEQUENCE(100000)` 的溢出区里打一个字 → 销毁 99999 个派生 atom。这个代价今天只在
  "清 anchor / 改形状 / 结构编辑"时付，Excel 语义把它挪到了**普通按键路径**上，必须新增 atom-count
  回归与 scale 探针。
- 塌缩、写入、reproject 三步要在同一个 `store_batch` 内，否则订阅者会看到中间态（先空、再 `#SPILL!`）。

## 降级预案

若硬约束 B 的裁决是"不批准"，**不要退到只做阶段 1**（见硬约束 A）。退到**完全维持现状 + 只做
阶段 0**，并把跨引擎分歧登记为一条 known divergence（写进 `excel/solid-excel/e2e/BACKEND_PARITY.md`
与 `scale-parity.test.ts` 的显式排除项，附本 ADR 链接）。这样两个既有缺陷先被修掉，且分歧从
"隐身"变成"有据可查"。

## 批准记录

2026-07-31，owner 就两个待决点表态：

1. **采纳 Excel 语义（阶段 1+2）**，不走降级预案。
2. Blocked claims 与 INV-2 的关系：**先按白名单既有措辞的读法推进** —— `ATOM_DELEGATION_REWRITE_PLAN.md`
   的「Pre-approved mechanism-pure fallback ladders」里明写 *"Spill reactor troubles: keep today's
   eager engine-side spill maintenance (public setters only), side indexes still collapse to
   `claims`"*，而 Blocked claims 的形状正是 `claims`（addr → anchor 归属）。**这个论证必须与阶段 2
   同 commit 落地并接受复核**；若实施时发现该读法站不住（例如 Blocked claims 事实上承担了
   "决定什么在变化时重算"的职责而无法收敛回 `claims` 语义），则**停下来走 §9 的
   DECISION_REQUEST + codex peer review + 显式 INV 修正案**，不得凭实现者自行判断继续。

此后内容冻结（见 `README.md` 规则 2）。结论若变，写新 ADR 并把本篇改为 `superseded by ADR-NNNN`。
