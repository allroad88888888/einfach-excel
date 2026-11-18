# 工作簿插件

`plugins/*` 是可选功能包，宿主按需安装，通过 `<Spreadsheet plugins={[...]} />` 挂载。
工作簿核心（`excel/*`、`packages/*`）在没有任何插件时行为不变，也不 import 任何插件。

## 包结构

| 入口 | 内容 | 适用规则 |
|---|---|---|
| `@einfach-excel/plugin-<name>/core`（`src/core/`） | 插件自有 atom 与命令，框架无关 | 同 UI Core：不依赖视图框架；debugLabel 用 `plugin.<name>.<atom>` |
| `@einfach-excel/plugin-<name>`（`src/` 其余） | React 组件与 `SpreadsheetPlugin` 描述对象 | 同 react-excel：不声明 atom、不用 `useState`/`useReducer` 存表格状态、不直接调 `store.getter/setter/sub` |

插件只能经核心包的**根入口**接入（`@einfach-excel/react-excel`、`@einfach-excel/spreadsheet-ui-core`），
不得深引内部路径，插件之间不得互相依赖。`npm run check:presentation` 与 `npm run check:cycles` 机械守卫这些边界。

## 贡献点（`SpreadsheetPlugin`，类型见 `excel/react-excel/src/plugin/types.ts`）

- `filterConditions`：向共享筛选面板贡献条件编辑器，覆盖功能区、普通区域表头与 Table
  表头入口。每个原生条件 kind 只能有一个编辑器，不能覆盖内置的四类条件。
  插件组件通过自己的 Core 命令编辑共享草稿；卸载编辑器不会删除条件数据。

- `richTextTools`：向共享富文本对话框贡献选区格式按钮。插件 Core 派生选区摘要并修改共享草稿，
  原对话框统一负责保存、取消、忙碌状态与焦点。工具只接收恢复 DOM 选区的回调；卸载保留草稿。

- `borderPresets`：向共享边框面板声明原生预设及标签；共享面板拥有草稿与提交生命周期。
  重复或未知预设在挂载时拒绝，卸载保留打开的草稿并显示保存的位置标签。

- `ribbon`：功能区分组，排在内置分组之后，只在声明的 `tab` 分类显示；放不下时与内置分组一样整组收进“更多”。
- `ribbonItems`：控件进入现有分组，`after` 只能指定 `workbookRibbonItemIds` 中的内置入口，按插件配置顺序排列；继承原组的分类与“更多”布局。宿主可用 `plugin:<插件 id>:<贡献 id>` 隐藏整项贡献，隐藏锚点不影响贡献。同插件的分组与组内贡献 ID 不得重复，未知锚点在挂载时拒绝。
- `contextMenu`：单元格右键菜单项，排在内置项（`cells.insert`、`cells.delete`）之后；一个菜单项派发一个零参数命令 atom。
- `editorAdornments`：渲染在当前格内编辑器或公式栏内部，属于同一失焦提交范围；控件间移焦点不会提前提交。
- `panels`：对话框与面板，挂在工作簿视图根部。
- `drawings`：按 `kind` 渲染浮动对象内容；框、选中、拖动缩放、删除与撤销由核心负责，
  对象载荷由插件解释（核心只校验 JSON 形状与 64 KiB 上限）。
- `messages`：已编译的 Lingui 目录，并入工作簿自己的 i18n 实例。

控件可使用公开的 `WorkbookRibbonItem` 读取宿主显隐配置，并用 `preserveWorkbookToolFocus` 在异步命令完成后恢复被 disabled 移走的焦点；不会抢走用户主动移动的焦点。

插件对话框可复用 `cycleWorkbookDialogFocus` 管理首尾焦点，通过 `translateWorkbookFeedback` 翻译核心命令反馈。

需要新的工作簿数据或 Rust 命令时，先在核心补一条通用、明确的命令，再由插件 Core 调用；
不要让插件改 `excel/*` 的内部文件。

## 新建插件

1. 复制 `plugin-sample` 的 `package.json`、`tsconfig.json`（继承 `plugins/tsconfig.plugin.json`）与 `vitest.config.ts`。
2. 根 Vitest、lint、typecheck、依赖检查已按 `plugins/*` 自动覆盖，无需逐个登记。
3. 用户可见入口在 `excel/react-excel/e2e/FEATURES.md` 登记并写真实 DOM 主用例；演示站经
   `excel/react-excel/src/page/demo/demo-presentation.ts` 的 `?plugins=<id>` 挂载。

`plugin-sample` 是仓内样例，覆盖全部贡献点，不发布。

## 可选功能包（工作区实现，尚未发布）

- [日期选择器](plugin-date-picker/README.md)：`datePickerPlugin`。
- [图片导出](plugin-image-export/README.md)：`imageExportPlugin`。
- [图表](plugin-chart/README.md)：`chartPlugin`（ECharts；对象层与对象目录在核心，不认识图表）。
- [文字格式](plugin-text-format/README.md)：`textFormatPlugin`（整格与局部上下标、缩小字体填充；插件拥有编辑命令，核心保留格式数据与原生事务）。
- [单元格外观](plugin-cell-appearance/README.md)：`cellAppearancePlugin`（声明可选斜线边框预设，复用共享草稿；核心拥有格式事实、事务与渲染）。
- [列表排序](plugin-data-sort/README.md)：`dataSortPlugin`（复用填充目录；插件拥有排序草稿，核心负责校验、行置换与历史）。
- [筛选条件](plugin-data-filter/README.md)：`dataFilterPlugin`（插件拥有 Top-N、日期期间编辑交互，核心负责数值排名、日历区间与筛选快照）。

演示：`?plugins=date-picker,image-export,chart`；不传 `plugins` 时不挂载任何插件控件。
