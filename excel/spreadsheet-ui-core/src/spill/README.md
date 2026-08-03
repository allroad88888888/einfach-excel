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
| `spillProjectedFormulaAtom` | derived | 选择器投影 `(sheetId, coord) => SpillProjectedFormula \| null`：投影格的公式栏该显示哪条锚点公式 |
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

## `#SPILL!` 要清哪一格

同一个 `readSpillRegion` 应答顺带回答第二个问题：查询坐标若是碰撞态锚点，`blockedBy`
给出**清掉之后数组就能溢出来**的那一格。两步得到：

1. **行主序第一个**被占的格子。不是随便挑的 —— 引擎的碰撞检测就是行主序扫的，报别的
   格子会让用户清了也不复活。
2. 那一格若是**别的数组的投影格**，换成那个数组的**锚点**。清投影格按 ADR 0006 会把
   那个数组整个塌成 `#SPILL!` —— 拿一个错误换另一个，不是解法。

所以 `blockedBy` **不保证落在锚点想要的矩形里**。这也是 `blockedByArray` 存在的理由：
为真时那一格是某个数组的锚点，宿主必须换一句话说（「被 C1 **处的数组**挡住」）。锚点在
用户眼里可能是空的 —— 数组的内容画在它的投影格上 —— 照直说「清掉 C1」会像是提示指错了
地方。这条标志**只换措辞，不影响该不该说话**，缺席（不是数组 / 答不出）都退回朴素说法。

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
第 2 步走的是安装侧已有的只读反查索引 `spill_target_anchor`，**只追一步**：一个地址不可能
既是锚点又是投影格（`register_spill` 的碰撞谓词两个方向都堵死了），所以没有链、也没有环
要防。那份模块头带着与 `sheet_spill_claims.rs` 同形式的 INV-2 逐条论证。

`blockedByArray` **不需要新的 WASM 导出**：引擎已经把答案翻译成了锚点，而锚点是唯一持有
`Value::Array` 的地址，所以 worker 拿它的地址回头问一次现成的 `spillInfo` 就够了
（`worker-commands-spill.ts`）。旧 wasm-pkg 上 `spillBlocker` 回的是没翻译过的投影格，那一格
`spillInfo` 答不出形状 → 标志缺席 → 文案退回朴素说法，正是它落地前的样子。

## 投影格的公式栏：显示锚点的公式，且不接受输入

投影格**没有自己的公式**，所以公式栏原先落到那一格的投影值。Excel 显示的是**锚点的公式**，
并且置灰。这个差别不是审美：把 `=SEQUENCE(10)` 显示在一条**可编辑**的输入框里，用户敲一个
字符就会把它提交进**投影格**，按 ADR 0006 的写入语义整个数组当场塌成 `#SPILL!`。所以「显示」
与「只读」必须同一批落地 —— 只做前者比不做更危险。

数据走 `readSpillRegion` 应答上的 `anchorFormula`（与 `region` 同生共死）。**不另发一次读单元格**：
溢出区查询本来就每次选区移动才发一次，把公式挂在同一条应答上是零额外往返；而锚点可能落在
可见窗口之外（`=SEQUENCE(10000)` 滚到中段），单独去读要么多一个往返、要么根本读不到。

`anchorFormula` 与 `blockedBy` **不是一类**：**两个 runtime 都答得出**这一条（锚点在两个引擎里
都有自己的条目 —— WASM 走早就在产物里的 `get_formula`，TS runtime 直接读锚点的 `input`），所以
它在跨引擎契约里是**无条件**断言，没有 `blocker` 那样的分歧标志。

只读是**显示层**的事实，刻意**不进** `editingSessionAtom`：

- **进**：没有编辑会话 + 活动单元格是投影格 + 后端说得出锚点公式。三者缺一就不生效。
- **出**：选区移开（选择器现读，自动停口）；或**编辑会话一开就立刻退场** —— 往投影格里直接
  打字是 ADR 0006 明确允许的操作，只读态不许把它一起禁掉。
- 锚点公式**只覆盖显示**，`formulaBarStateAtom.draft` 仍是这一格自己的源文本。反过来做会把
  一条别人的公式放进「待提交的草稿」里，任何读 `draft` 去提交的路径都会打爆整个数组。

宿主侧是 `excel/solid-excel/src-vnext/formula-bar/SpreadsheetFormulaBar.tsx`（`readOnly` +
`data-spill-readonly` / `data-spill-anchor` + i18n `spill.projectedFormula` 悬停提示）。

## 已知缺口

- TS 参考引擎答不出阻塞**地址**（见上）。要补需要 `excel/excel-core-ts` 把
  `validateSpillAnchorValue` 算出来的碰撞事实留下来 —— 今天它算完就扔，只留一个
  `#SPILL!`。

  > 「阻塞物是投影格时 TS 连 `#SPILL!` 都不报」这一条**已经修掉**：碰撞检测现在除了
  > 扫矩形里的活条目，还会看「有没有更早声明的锚点的矩形压过来」，见
  > `excel/excel-core-ts/src/eval/spill-collision.ts`。跨引擎钉子在
  > `cross-engine-parity-spill.test.ts` 的「阻塞物是另一个数组的投影格」一节。

- TS 引擎的投影格**只在显示层存在**（`worker-runtime-ts.ts` 的 `getSpillProjectedValue`），
  公式读不到：`=SUM(A1:A3)` 在 `A1 = =SEQUENCE(3)` 上 TS 给 `#CALC!` / Rust 给 `6`，
  `=A2` 给空 / Rust 给 `2`，`COUNTA` / `COUNTIF` / `ISBLANK` / `INDEX` 同款。这是比阻塞
  地址更大的一条引擎级分歧，尚未立项。

## Tests

- `test/spill.test.ts`（本包）
- `excel/solid-excel/test/vnext-spill-region.test.tsx`（宿主渲染）
- `excel/solid-excel/test/vnext-formula-bar-spill-readonly.test.tsx`（投影格上的只读公式栏）
- `excel/solid-excel/test/vnext-worker-spill-region.test.ts`（worker RPC）
- `excel/solid-excel/test/cross-engine-parity-spill.test.ts`（两个引擎的差异）
