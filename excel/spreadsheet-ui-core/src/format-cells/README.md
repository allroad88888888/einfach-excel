# format-cells

「设置单元格格式」对话框的 atom 层：五个标签页（数字 / 对齐 / 字体 / 边框 / 填充）的草稿状态
与保存路径。另含独立的「数字格式」子对话框（`number-format-dialog.ts`）。

## Atom classification

| Atom | Class | Notes |
|---|---|---|
| `formatCellsEditorAtom` | source | 会话状态机：`'closed'` / `'open'`，open 时带目标选区与草稿 |
| `formatCellsActiveTabAtom` | derived | 当前标签页；closed 时回落到 `'number'` |
| `formatCellsDraftAtom` | derived | 草稿格式，从 editor 状态投影出来 |
| `formatCellsSavePayloadAtom` | derived | 由草稿算出的后端请求载荷（无变更时为空） |
| `formatCellsSaveBlockedAtom` | derived | 后端缺 `setFormatRange` 端口时为真 → 宿主禁用保存 |
| `formatCellsSaveLedgerAtom` | derived | 保存尝试的有界证据账 |
| `openFormatCellsAtom` / `closeFormatCellsAtom` | command | 开关；open 接受 `initialTab` |
| `setFormatCellsActiveTabAtom` | command | 切标签页 |
| `patchFormatCellsDraftAtom` | command | 局部更新草稿（各标签页共享一份草稿对象） |
| `runFormatCellsSaveAtom` / `saveFormatCellsAtom` | command | 执行保存，写 ledger |

全部 atom 设 `debugLabel = 'spreadsheet.formatCells.<name>'`；子对话框用
`spreadsheet.numberFormatDialog.<name>`。无 per-cell 家族。

## 一份草稿，五个标签页

五个标签页**共享同一个草稿对象**，`patchFormatCellsDraftAtom` 做局部合并。切标签页不提交、
不校验 —— 只有保存才落库。这样「在字体页改了颜色、又去边框页加了框线」是一次后端写入，
而不是两次。

代价：草稿的形状是全部标签页字段的并集，字段增长会推高
`types.ts`。新增字段时优先复用 `shared` 里已有的格式类型，别在这里另立一套。

## 能力降级

`formatCellsSaveBlockedAtom` 为真时（宿主没实现 `setFormatRange` 可选端口），对话框仍可打开
和浏览，但保存要被禁用。这符合本包的一致约定：**UI core 不区分「宿主没实现」与「特性不存在」**，
一律隐藏或禁用入口。

## 已知超限

`index.ts` 与 `number-format-dialog.ts` 合计已超过单文件 300 行的规则上限。按职责拆分的
自然切线是「五个标签页各自的草稿分片」与「保存控制器」，但这属于独立重构，不在文档整理范围内。

## 非目标

- 不做格式的渲染。草稿只描述格式，渲染由宿主与 `projection` 的 `DisplayCell` 承担。
- 不做格式刷 —— 那在 `src/format-painter/`。
