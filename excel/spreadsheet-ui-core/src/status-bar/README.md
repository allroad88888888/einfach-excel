# status-bar

状态栏的 atom 层：**选区聚合值**（求和/平均/计数/数值计数/最小值/最大值）。

只有这一件事。缩放级别与视图模式（普通/分页预览/页面布局）曾经也住在这里，但它们从来没有
消费者 —— 网格从不读 `zoomLevelAtom`，打印也不读 `viewModeAtom`，点按钮只是改一个没人看的
数字。已整体删除；将来真要做缩放，它属于 viewport 层，真要做分页预览，它属于 `print/`。

## 文件划分

| 文件 | 职责 |
|---|---|
| `types.ts` | 聚合项键名、聚合结果形状、输入模式、默认配置 |
| `aggregates-compute.ts` | 纯算术：给定单元格与选区算聚合，无 atom |
| `projection-state.ts` | 宿主推进来的可见投影快照（唯一写入口） |
| `aggregate-config-state.ts` | 用户勾选了哪几个聚合项 |
| `selection-aggregates.ts` | 把投影快照与当前选区拼成一个聚合结果 |

## Atom classification

| Atom | Class | Notes |
|---|---|---|
| `statusBarProjectionCellsAtom` | derived | 只读投影视图，读私有 backing |
| `selectionAggregatesAtom` | derived | 由投影 + 选区算出的聚合值 |
| `statusBarAggregateTruncatedAtom` | derived | 聚合是否因触顶而截断 |
| `statusBarAggregateConfigAtom` | derived | 用户勾选了哪几个聚合项 |
| `syncStatusBarProjectionAtom` | command | 宿主把可见投影推进来（唯一的写入口） |
| `toggleStatusBarAggregateAtom` | command | 切换单个聚合项 |
| `setStatusBarAggregateConfigAtom` | command | 整体设置聚合配置 |

全部 atom 设 `debugLabel = 'spreadsheet.statusBar.<name>'`。无 per-cell 家族。

## Bounded caches

两道上限都在 50 000，且**目的不同**：

- `STATUS_BAR_PROJECTION_CELLS_MAX = 50_000` —— 推入的投影单元格超过这个数就 `slice` 截断。
  保护的是快照本身的内存占用。
- `STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX = 50_000` —— 聚合计算时「这个单元格在选区里吗」
  的判定次数上限。保护的是计算时间：多区间选区下判定次数是 O(cells × regions)，不设限会在
  大选区上卡住主线程。

触顶时 `statusBarAggregateTruncatedAtom` 为真，宿主应当提示「聚合基于前 N 个单元格」而不是
静默给出错的和。

## backing atom 模式

`statusBarProjectionCellsAtom`、`statusBarAggregateConfigAtom` 都是**只读派生**，各自读一个
私有的 `*BackingAtom`。写入只能经命令 atom —— 这样钳制逻辑（投影截断、配置键白名单）无法
被绕过。`statusBarProjectionSnapshotAtom` 是模块内部的只读全量快照，**不从 barrel 导出**：
`selection-aggregates.ts` 需要读截断来源，但不应因此拿到 backing 的写权限。

## 非目标

- 不订阅后端。投影由宿主在每次可见窗口变化时经 `syncStatusBarProjectionAtom` 推进来，
  本模块不持有 backend 引用。
- 不做聚合项的 UI 排序 / 本地化文案，那属于宿主。
- 不管缩放、视图模式、投影加载状态。投影加载状态这类调试读数归 solid 侧的
  `diagnostics/SpreadsheetDiagnosticsReadout.tsx`。
