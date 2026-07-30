# status-bar

状态栏的 atom 层：选区聚合值（求和/平均/计数等）、缩放级别、视图模式。

## Atom classification

| Atom | Class | Notes |
|---|---|---|
| `statusBarProjectionCellsAtom` | derived | 只读投影视图，读私有 backing |
| `selectionAggregatesAtom` | derived | 由投影 + 选区算出的聚合值 |
| `statusBarAggregateTruncatedAtom` | derived | 聚合是否因触顶而截断 |
| `statusBarAggregateConfigAtom` | derived | 用户勾选了哪几个聚合项 |
| `zoomLevelAtom` | derived | 缩放级别（读 backing，钳制在合法区间） |
| `viewModeAtom` | derived | 视图模式 |
| `syncStatusBarProjectionAtom` | command | 宿主把可见投影推进来（唯一的写入口） |
| `toggleStatusBarAggregateAtom` | command | 切换单个聚合项 |
| `setStatusBarAggregateConfigAtom` | command | 整体设置聚合配置 |
| `setZoomLevelAtom` / `resetZoomLevelAtom` | command | 缩放，写入前钳到 `ZOOM_LEVEL_MIN/MAX` |
| `setViewModeAtom` | command | 切视图模式 |

全部 atom 设 `debugLabel = 'spreadsheet.statusBar.<name>'`（缩放与视图模式用
`spreadsheet.zoom.*` / `spreadsheet.viewMode.*`）。无 per-cell 家族。

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

`statusBarProjectionCellsAtom`、`statusBarAggregateConfigAtom`、`zoomLevelAtom`、`viewModeAtom`
都是**只读派生**，各自读一个私有的 `*BackingAtom`。写入只能经命令 atom —— 这样钳制逻辑
（缩放区间、投影截断）无法被绕过。

## 非目标

- 不订阅后端。投影由宿主在每次可见窗口变化时经 `syncStatusBarProjectionAtom` 推进来，
  本模块不持有 backend 引用。
- 不做聚合项的 UI 排序 / 本地化文案，那属于宿主。
