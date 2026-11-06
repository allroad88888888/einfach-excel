# Workbook API

`createWorkbookApi(store)` 从 `@einfach-excel/spreadsheet-ui-core` 根导入。
将同一个 Store 传给 `<Spreadsheet store={store} />`，在组件运行状态 ready 后调用 API。
它只是现有 command atoms 的便捷入口，不复制工作簿数据，不创建额外 Worker。

```ts
const api = createWorkbookApi(store)
const target = { sheetId: 'orders', range: {
  rowStart: 1, rowEnd: 10, colStart: 2, colEnd: 2,
} }
const result = await api.format({ ...target, format: { bold: true } })
if (result.status === 'error') console.error(result.error)
const displayed = await api.readDisplay(target)
const stop = api.onChange(change => { if (change) scheduleSave(change) })
// 宿主卸载时：stop()
```

所有范围都是零基、包含两端。持久操作必须显式指定 `sheetId` / `range`，不会借用当前选区。
修改非当前表时保留当前表和选区；删除或隐藏当前表时切到仍可见的表。保护、原生事务和撤销历史
仍由 Rust 处理。已有编辑草稿或正在提交时，持久操作返回 `HOST_EDITING_ACTIVE`。

| 操作 | 输入要点 |
| --- | --- |
| `read` / `write` | 与原有 typed 读写 atom 相同，见 [host-data](host-data.md) |
| `readDisplay` | 指定单个范围；最多 65,536 格，返回 Rust 显示值、格式和元数据，不替换当前投影 |
| `setRichText(sheetId, row, col, runs)` | 分段文字及 fontFamily、fontSize、color、bold、italic、underline、strikethrough；单格原生事务，最多 1,024 段、32,767 个字符 |
| `format` | `format` 默认 patch；`replace: true` 替换，`format: null` 清除；支持 scope、clearFormatFields、borderPatch |
| `clear` | `mode: 'contents' / 'formats' / 'all'` |
| `shiftCells` | `direction: 'insert-right' / 'insert-down' / 'delete-left' / 'delete-up'` |
| `resize` | `axis: 'row' / 'column' / 'reset'`、`pixels` |
| `visibility` | `action: 'hide-rows' / 'hide-columns' / 'unhide'` |
| `structure` | `edit: { action: 'insert-rows' / 'insert-columns' / 'delete-rows' / 'delete-columns', at, count }` |
| `freeze` / `merge` | `rows, cols`；或范围及 `action: 'merge' / 'center' / 'unmerge'`，默认不丢弃已有内容 |
| `sort` / `filter` | 复用 `SortRangeOptions` / `RustFilterAction`；排序键是零基绝对列索引 |
| `conditionalFormat` | `action, scope, priority, rule` 等原生规则参数；省略 revision 时在串行 Worker 队列中读取当前规则版本 |
| `validation` | `rule: NativeDataValidationRule / null` |
| `addSheet` / `renameSheet` | `name`，改名需 sheetId；新增可指定逻辑 rowCount、colCount |
| `copySheet` / `deleteSheet` / `moveSheet` | sheetId；移动另传 targetIndex |
| `hideSheet` / `colorSheet` | sheetId 及 hidden / color（null 清色） |
| `undo` / `redo` | 整簿统一原生历史；并非只撤销当前表 |
| `find` / `replace` | 显式 targets 和 query；查找分页，替换必须传查找返回的 expectedRevision |
| `execute` | 上述持久操作的 `WorkbookOperation` 判别联合入口 |

持久操作返回 `status: 'ok' / 'error'`，成功含 changed、revision、当前原生表目录，新增/复制可返回
sheetId。`displayError` 表示已经提交但显示读取失败，不可当作回滚重试。连接中断返回
`commitStatus: 'unknown'` 时先读回。`configure` 与原有 hostControls 相同：readOnly 拒绝持久修改，
busy 允许明确的宿主 API 修改，结构权限也在 Worker 中复核。API 事件 source 为 api，kind 为
`host.<operation>`；界面触发继续使用已有 user/history 事件。

`select(target, scroll = true)`、`activateSheet(sheetId)`、`scrollTo(row, col)`、
`zoom(percent, sheetId?)` 只改会话状态，不记历史或 dirty。缩放范围 10–400。无效目标不会先切表。
busy 或正在编辑时导航返回错误。`getDocument/getSelection/getViewport/getEditing` 读取同 Store 状态。
`beginEditing()` 编辑当前可见选区锚点；`setDraft(string)`、`commitEditing()`、`cancelEditing()`
沿现有编辑事务，不另建编辑器。返回值沿用相应编辑 atom；草稿校验失败仍保留编辑状态。
`openRichTextEditor()` 打开当前文字格的分段编辑器；公式与数值格不开放这个界面入口。
`openFormulaDialog('SUM')` 打开函数参数面板；`formulaDialog(action)` 沿原有参数命令修改、插入或关闭，
`getFormulaDialog()` 读取状态。函数面板不依赖工具栏显示，隐藏 ribbon 时也能打开。

`highlight([{ id, sheetId, range, color? }])` 替换宿主高亮列表，`clearHighlights()` 清空。
最多 128 个唯一 id，color 为 #RRGGBB；高亮不改选区、不进文件，换工作簿自动清除。
`isCellVisible(row, col, sheetId?, fully = false)` 按当前实际像素窗口判断，排除预加载缓冲、隐藏行列和冻结区遮挡；
合并格按完整合并范围判断，非当前表返回 false，fully 要求四边完整可见。

`coordToA1/rangeToA1/parseA1Cell/parseA1Range` 是无副作用的本地坐标转换工具。

`onChange/onSelectionChange/onActiveSheetChange/onEditingChange/onStructureChange` 均返回取消订阅函数，
不立即回放初始值。修改事件只保留最近一条，宿主应同步取走，再自行排队保存。
编辑订阅报告开始/结束或源单元格变化，不按每次输入报告草稿。
结构订阅包括 API 工作表操作、行列插删及相应界面操作；撤销重做的完整信息使用 onChange。

```ts
api.hooks({ beforeChange(event) {
  // event: command、source、不可变 payload 副本
  return myPolicyAllows(event) // false 在请求进入 Worker 前取消
} })
api.hooks({}) // 移除
```

beforeChange 必须同步返回 boolean 或 undefined；Promise、抛错和重入写入都会被拒绝。
它拦截该连接上的界面/API 持久命令，不拦读取和初始导入。取消不产生历史或成功修改事件。
同 Store 换簿后保留配置，其他 Store 不受影响。它是宿主交互策略，不是工作簿数据或权限安全边界。

## 暂停与刷新

`suspendDraw()` / `resumeDraw()` 与 `suspendCalculation()` / `resumeCalculation()` 都支持嵌套，
返回 depth；每次暂停应在 finally 中配对恢复，只有最后一层恢复才重新发布画面或恢复计算。

```ts
const paused = api.suspendDraw()
if (paused.status === 'ok') {
  try {
    await api.format({ ...target, format: { bold: true } })
    await api.resize({ ...target, axis: 'column', pixels: 160 })
  } finally {
    await api.resumeDraw()
  }
}
```

暂停绘制时 Rust 仍接受宿主写入并正常产生历史、修改事件；界面保留一个有界的旧投影并暂停用户编辑。
表目录与尺寸在最后恢复时重新读取，`getDocument()` 因而暂时报告原来显示的目录。
`read()` 仍读原生当前事实；`readDisplay()` 读取已知工作表的当前显示值，不替换保留的画面。
暂停不是事务合并，多个写命令仍分别进入历史。`refresh()` 刷新目录、几何和可见区；暂停中返回 deferred。

计算暂停保留已求值结果，新公式暂不求值；自动模式恢复时统一重算，原来为手动模式则继续保持手动。
暂停状态不写入文件。`recalculate(sheetId?)` 显式重算，省略表 id 表示整簿；暂停期间返回 CALCULATION_SUSPENDED。

## 富文本

普通文字格与合并锚点支持分段字体、字号、颜色、粗体、斜体、下划线和删除线。
界面的“富文本”按钮打开选段编辑器，React 只保存弹窗草稿，Rust 保存文字分段与历史。
DOM、Canvas、原生文件及 XLSX 的共享字符串／内联字符串读写使用同一份分段数据。
普通文字编辑保留未改动部分的样式；复制粘贴、填充、排序、行列移动、工作表复制随内容搬运分段。
整格字体修改会覆盖对应分段属性，清除格式会清除分段样式。暂不支持表格内富文本编辑、上下标或任意 HTML。

新增入口已完成编译与冒烟检查；单测按本轮安排留到后续集中补充。

## 界面与 Canvas 绘制

```tsx
<Spreadsheet store={store} definition={seed} ui={{
  ribbon: { hidden: ['format.bold', 'history.undo'] },
  rowHeaderWidth: 80, columnHeaderHeight: 40,
}} />
```

`workbookRibbonItemIds` 从 React 包根导出，列出全部内置触发控件 ID，独立于翻译文本。
`ribbon: false` 隐藏整个功能区。单项隐藏只移除入口，不关闭已打开的内置面板或撤销快捷键。
插件功能组使用 `plugin:<pluginId>:<groupId>`；插件自己的细粒度按钮可用公开的
`<WorkbookRibbonItem id="my-plugin.action">…</WorkbookRibbonItem>`。
行号栏宽、列标栏高支持整数 0–512 px，0 隐藏对应标题；非法值回退产品默认值。
配置可在同一挂载中更新，不重置工作簿，不写入文件。

Canvas 模式支持 `cellPaintHooks={{ before, after, onError }}`。回调收到 context、只读 cell、range、
bounds、merged。坐标以工作表为基准；使用给定 bounds 绘制。before 返回 false 替换默认格绘制，
after 在默认格绘制之后执行。每个回调独立 save/clip/restore；抛错交给 onError，不中断其他格。
启用钩子时关闭滚动像素复用。DOM 渲染和 PNG 导出不执行这些钩子；不保存到工作簿。
