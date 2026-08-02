# spill

动态数组（溢出区）的**可见性**：让用户看得出「这一片是一个数组溢出来的，不是我自己打的值」，
以及数组没能溢出来时**是哪一格挡着**。

只管可见性，不管写入语义 —— 往溢出区写入时数组怎么塌缩、怎么复活，是引擎侧的事，见
[ADR 0006](../../../../docs/decisions/0006-spill-region-write-semantics.md)。

## Atom classification

| Atom | Class | 说明 |
|---|---|---|
| `spillRegionBackingAtom` | source（私有） | 唯一那一格缓存：当前高亮的 `ActiveSpillRegion \| null` |
| `spillBlockageBackingAtom` | source（私有） | 唯一那一格缓存：当前那条 `ActiveSpillBlockage \| null` |
| `spillRequestSeqBackingAtom` | source（私有） | 单调递增查询序号，用来丢弃迟到的旧应答 |
| `spillCapabilityBackingAtom` | source（私有） | `readSpillRegion` 端口在位与否 |
| `activeSpillRegionAtom` | derived | 溢出区缓存的只读投影 |
| `activeSpillBlockageAtom` | derived | 阻塞线索缓存的只读投影 |
| `spillRegionSupportedAtom` | derived | 能力证据的只读投影；`false` 时宿主不画任何东西 |
| `spillCellRoleAtom` | derived | 选择器投影 `(sheetId, coord) => 'anchor' \| 'projected' \| null` |
| `captureSpillRegionCapabilityAtom` | command | 抓一次端口在位与否 |
| `refreshSpillRegionAtom` | command | 问后端「这一格在不在溢出区里 / 是不是被挡住的锚点」，换进缓存 |
| `clearSpillRegionAtom` | command | 清空两格缓存（切表、失焦） |

全部 atom 的 `debugLabel` 前缀是 `spreadsheet.spill.`。**没有 per-cell / per-row / per-column
atom 家族** —— `spillCellRoleAtom` 返回的是一个选择器**函数**，不是按坐标建出来的 atom。

## Bounded caches

- `SPILL_REGION_CACHE_MAX = 1`。同时只留一个溢出区（当前选区所在的那个），查过即丢，
  不留历史。内存占用与表大小、与数组个数都无关。
- `SPILL_BLOCKAGE_CACHE_MAX = 1`。同理，只留当前选中那个 `#SPILL!` 锚点的一条线索。
  与上面那格恒不同时非空 —— 装上了投影就没有阻塞物。

## 为什么不走可见窗口投影

另一条路是给 `DisplayCell` 加 `spillAnchor` / `spillShape` 两个字段，让可见窗口投影顺路
带上来。放弃它的三条理由：

1. **代价对不上**。溢出边框在 Excel 里只在**选区落进数组时**出现。挂在 `DisplayCell` 上
   等于可见窗口每一个非空格、每一次滚动都付这两个字段的序列化代价，而绝大多数时刻一个
   框都不画。按需查询是每次选区移动一次 RPC。
2. **WASM 侧要改 Rust**。`read_sparse_range` 的 `CellSnapshotJSON` 得加字段，意味着重建
   wasm-pkg；而现成的 `spillInfo` / `spillAnchor` 两个导出**已经在产物里**，按需查询一行
   Rust 都不用改。
3. **锚点可能在窗口外**。真要在投影里做，每个投影格都得反查锚点；`spillAnchor` 导出的
   注释本身就写着它是为「锚点落在可见窗口之外时仍能画出边框」准备的。

代价：数组存在但选区不在它里面时，那些格子不带任何标记。这与 Excel 一致（Excel 也只在
选中时才画蓝框），不是缺陷。

## Backend port

可选端口 `readSpillRegion?(request: SpillRegionRequest): Promise<SpillRegionResult>`。

- 宿主没实现 → `spillRegionSupportedAtom` 为 `false`，`refreshSpillRegionAtom` 返回
  `'unsupported'` 并保持缓存为空，UI 什么都不画。**端口缺席是「功能不存在」，不是错误。**
- 应答里 `region: null` 是明确的「这一格不在任何活动溢出区里」，与端口缺席不是一回事。
- 碰撞态（`#SPILL!`）锚点的 `region` 仍是 `null`：它一个格子都没装上，Excel 同样不给它
  画框。但应答可以多带一个 `blockedBy` —— 见下。

## `#SPILL!` 被谁挡住

同一个 `readSpillRegion` 应答顺带回答第二个问题：查询坐标若是碰撞态锚点，`blockedBy`
给出**行主序第一个**挡住它的格子。「行主序第一个」不是随便挑的 —— 引擎的碰撞检测就是
行主序扫的，报别的格子会让用户清了也不复活。

不另开一条端口的理由：这与「我脚下这一格跟动态数组有什么关系」是同一个问题的两半，且
两者互斥（装上了投影就没有阻塞物），而 UI 无法预先知道该不该发第二次查询 —— 拆开只会
让每次选区移动多一个往返。

`blockedBy` 缺席有两种原因，**本层刻意不区分**，因为 UI 对两者的处理一样（不说话）：

1. 这一格不是碰撞态锚点；
2. **后端答不出**。WASM 引擎在溢出目标上真的挂了派生 atom，也记着碰撞锚点想要的矩形，
   所以答得出；TS 参考引擎的溢出目标在表里根本没有条目，碰撞态锚点连「它想要多大的
   矩形」都没存下来，**答不出**。那边于是诚实地什么都不带，而不是编一个地址。跨引擎
   差异钉在 `excel/solid-excel/test/cross-engine-parity-spill.test.ts`。

引擎侧的实现是 `excel/rust/excel-core/src/sheet_spill_blocker.rs`：**按需现算**，一个字段
都不存（存下来会在 claims 上限降级的路径上给出过期答案，指向一个已经被清空的格子）。
那份模块头带着与 `sheet_spill_claims.rs` 同形式的 INV-2 逐条论证。

## 已知缺口

- 公式栏在选中投影格时仍显示**投影值**，而不是 Excel 那样显示灰色的锚点公式。
  本模块已经知道锚点坐标，补这条需要的是公式栏侧的只读草稿态。
- 阻塞物若是**别的数组的投影格**，提示指的是那一格本身而不是它的锚点 —— 用户真正要
  清的是锚点。引擎那边两条线索是分开的（`spillBlocker` 与 `spillAnchor`），把它们串起来
  是 UI 侧的一次再查询，本切片没做。
- TS 参考引擎答不出阻塞地址（见上）。要补需要 `excel/excel-core-ts` 把
  `validateSpillAnchorValue` 算出来的碰撞事实留下来。

## Tests

- `test/spill.test.ts`（本包）
- `excel/solid-excel/test/vnext-spill-region.test.tsx`（宿主渲染）
- `excel/solid-excel/test/vnext-worker-spill-region.test.ts`（worker RPC）
- `excel/solid-excel/test/cross-engine-parity-spill.test.ts`（两个引擎的差异）
