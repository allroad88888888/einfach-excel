# spill

动态数组（溢出区）的**可见性**：让用户看得出「这一片是一个数组溢出来的，不是我自己打的值」。

只管高亮，不管写入语义 —— 往溢出区写入时数组怎么塌缩、怎么复活，是引擎侧的事，见
[ADR 0006](../../../../docs/decisions/0006-spill-region-write-semantics.md)。

## Atom classification

| Atom | Class | 说明 |
|---|---|---|
| `spillRegionBackingAtom` | source（私有） | 唯一那一格缓存：当前高亮的 `ActiveSpillRegion \| null` |
| `spillRequestSeqBackingAtom` | source（私有） | 单调递增查询序号，用来丢弃迟到的旧应答 |
| `spillCapabilityBackingAtom` | source（私有） | `readSpillRegion` 端口在位与否 |
| `activeSpillRegionAtom` | derived | 上面那格缓存的只读投影 |
| `spillRegionSupportedAtom` | derived | 能力证据的只读投影；`false` 时宿主不画任何东西 |
| `spillCellRoleAtom` | derived | 选择器投影 `(sheetId, coord) => 'anchor' \| 'projected' \| null` |
| `captureSpillRegionCapabilityAtom` | command | 抓一次端口在位与否 |
| `refreshSpillRegionAtom` | command | 问后端「这一格在不在溢出区里」，换进缓存 |
| `clearSpillRegionAtom` | command | 清空缓存（切表、失焦） |

全部 atom 的 `debugLabel` 前缀是 `spreadsheet.spill.`。**没有 per-cell / per-row / per-column
atom 家族** —— `spillCellRoleAtom` 返回的是一个选择器**函数**，不是按坐标建出来的 atom。

## Bounded caches

- `SPILL_REGION_CACHE_MAX = 1`。同时只留一个溢出区（当前选区所在的那个），查过即丢，
  不留历史。内存占用与表大小、与数组个数都无关。

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
- 碰撞态（`#SPILL!`）锚点回 `null`：它一个格子都没装上，Excel 同样不给它画框。

## 已知缺口

- 公式栏在选中投影格时仍显示**投影值**，而不是 Excel 那样显示灰色的锚点公式。
  本模块已经知道锚点坐标，补这条需要的是公式栏侧的只读草稿态。
- `#SPILL!` 锚点不带「被谁挡住」的信息 —— 引擎没有把阻塞地址传上来
  （`register_spill` 碰撞时只回 `Err(ValueError::Spill)`）。

## Tests

- `test/spill.test.ts`（本包）
- `excel/solid-excel/test/vnext-spill-region.test.tsx`（宿主渲染）
- `excel/solid-excel/test/vnext-worker-spill-region-wasm.test.ts`（真 WASM 端口）
