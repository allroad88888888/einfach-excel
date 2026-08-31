# 非 Grid 交互的框架可移植性边界

状态：当前源码分类（AD-314）

本文的唯一职责是：按交互家族区分非 Grid 行为中可成为框架无关候选的部分与仍由当前 DOM、JSX、Solid 或生命周期承载的部分。

这不是迁移设计或实现计划：不移动代码、不调整包、不规定共享层归属、不定义 headless 挂载，也不讨论 React、Vue、安装、兼容性、发布或支持范围。Grid 交互不在本文范围；其边界由 AD-312 处理。

## 分类依据与覆盖范围

分类以 [AD-311 TypeScript 台账](interaction-execution/AD-311-solid-coupling-audit.md) 和 [AD-311 TSX 台账](interaction-execution/AD-311-solid-coupling-audit-tsx.md) 为起点，并逐项查看当前 `excel/solid-excel/src` 源码。

可复核的直接 `solid-js` 导入扫描为：

```sh
rg -n --glob '*.{ts,tsx}' "^import(?:\\s+type)? .* from 'solid-js'" \
  excel/solid-excel/src | awk '!/\/grid\//'
```

当前非 Grid 结果为 119 个声明（22 个 `.ts`、97 个 `.tsx`）；完整扫描为 136 个（25 个 `.ts`、111 个 `.tsx`），差额正是 Grid 的 3 个 `.ts` 和 14 个 `.tsx` 声明。下面的家族表覆盖这 119 个声明所属的非 Grid 表面，并补查了虽未直接导入 `solid-js`、但仍承担 JSX 或浏览器交互的相邻文件。

直接导入不是唯一判据。JSX 控制流、`@einfach/solid`、`createEffect` / `createMemo` / `createSignal`、`onMount` / `onCleanup`、节点 ref，以及向 `document`、`window` 或元素注册和释放监听器，均归入当前框架承载行为。反过来，未导入 Solid 也不自动成为无框架代码。

本文中“候选”只表示行为可在不保留 Solid 依赖的前提下表达；它不宣告目标目录、包边界或最终责任方。

## 可成为框架无关候选的部分

| 交互家族              | 当前文件或入口                                                                                                                                                                                                                   | 可分离的行为                                                   | 必须保留的边界说明                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公式栏与补全          | `formula-bar/formula-bar-keys.ts`、`formula-bar/projection-source-text.ts`                                                                                                                                                       | 提交、取消、补全键优先级；单元格公式文本投影                   | 键盘事件由调用方适配，输入框焦点、选区和原生监听器不随规则一同变为无 DOM 行为。                                                                                |
| 反馈与读数            | `feedback/types.ts`、`feedback/editing-commit-feedback.ts`、`status-bar/status-bar-format.ts`、`diagnostics/diagnostics-readout-format.ts`                                                                                       | 反馈 union、编辑提交到反馈的映射、状态栏和诊断文字格式化       | `feedback/types.ts` 的 `Accessor` 仅是台账所列类型耦合；以通用 reader 表达后才是候选。显示反馈本身仍是渲染表面。                                               |
| Overlay 和对话框数据  | `overlay/types.ts`、`format-cells/format-cells-panel-types.ts`、`format-cells/format-cells-config.ts`、`data-validation/data-validation-dialog-range.ts`、`sort/sort-range-label.ts`、`named-ranges/name-manager-dialog-copy.ts` | 可见性、锚点和初始焦点等输入契约；格式面板描述；范围和复制文案 | `overlay/types.ts` 与 `format-cells-panel-types.ts` 的 `Accessor` 字段须先泛化为 reader；`HTMLElement`、`DOMRect` 和焦点只是 DOM 输入输出，不代表可挂载的 UI。 |
| 上下文菜单            | `context-menu/context-menu-presentation.ts`、`context-menu/context-menu-clipboard-text.ts`                                                                                                                                       | 命令解析、标签和 tooltip 投影；选区到剪贴板文本的转换          | 写入剪贴板和打开菜单的时机仍由浏览器事件调用者处理。                                                                                                           |
| 工具栏命令与模型      | `toolbar/ToolbarActionDeps.ts`、`toolbar/useToolbarPainterCommands.ts`、`toolbar/anchored-menu-style.ts`、`toolbar/ToolbarFormatLogic.ts`、`toolbar/NumberFormatDropdownModel.ts`                                                | 动作依赖、画笔单击/双击规则、锚定菜单几何、格式变换和下拉模型  | AD-311 中前三项的 `Accessor` 或 `JSX.CSSProperties` 仅为接口类型耦合；可分别改为 reader 或结构化样式值。现有格式逻辑引用的渲染器常量也不能据此视为已脱钩。     |
| 菜单栏命令            | `menu-bar/menu-bar-command-context.ts`、`menu-bar/menu-bar-command-router.ts`                                                                                                                                                    | 命令上下文解析与命令路由                                       | 菜单的焦点循环、快捷键绑定和节点查找不在这些候选中。                                                                                                           |
| Sheet tabs 的键盘决策 | `sheet-tabs/sheet-tab-focus.ts` 中的 `sheetTabKeyboardAction`、`resolveSheetTabKeyboardTarget`                                                                                                                                   | 从按键和工作表数据得出目标 tab 的确定性决策                    | 注册按钮、调用 `focus()` 和维护焦点注册表均仍是 DOM 行为。                                                                                                     |

这些候选可继续依赖现有业务输入或 atom 抽象；本文只确认它们不必以 Solid 的 JSX 计算图或 effect 生命周期来表达。

## 当前由框架承载的交互行为

| 交互家族                      | 当前框架承载的行为                                                                                                                                     | 代表性源码                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公式栏与公式补全              | 输入 ref、焦点和选区；对 `keydown`、窗口尺寸和滚动、文档焦点的监听和清理；`Show` / `For` 渲染与 reactive anchor 状态                                   | `formula-bar/SpreadsheetFormulaBar.tsx`、`formula-autocomplete/SpreadsheetFormulaAutocomplete.tsx`、`formula-autocomplete/formula-autocomplete-anchor.ts`                                                                                                                                                                                    |
| Overlay、通用对话框和焦点圈闭 | Escape、Tab、初始焦点、焦点恢复、`document` 监听、元素测量及 effect cleanup                                                                            | `overlay/use-overlay-interaction.ts`、`overlay/focusable-elements.ts`、`find-replace/dialog-interactions.ts`、`format-cells/format-cells-dialog-focus.ts`                                                                                                                                                                                    |
| 具体对话框表面                | 条件格式、数据验证、格式单元格、查找替换、转到、命名范围、粘贴特殊、打印、保护、删除重复项、文本分列、排序的 JSX 模板、输入事件、dialog ref 与生命周期 | 相应目录下的 `*.tsx` 对话框组件；`go-to/go-to-dialog-controller.ts`、`sort/useSortConfirmation.ts`、`format-cells/format-cells-dialog-controller.ts`                                                                                                                                                                                         |
| 上下文菜单、菜单栏与工具栏    | 菜单和下拉项的 JSX 控制流；活跃元素判断；原生键盘、指针、点击和双击绑定；定位、挂载、清理和 Surface state                                              | `context-menu/SpreadsheetContextMenu.tsx`、`context-menu/context-menu-focus.ts`、`menu-bar/SpreadsheetMenuBar.tsx`、`menu-bar/menu-bar-keyboard-controller.ts`、`toolbar/ToolbarAnchoredMenu.tsx`、`toolbar/ToolbarShell.tsx`、`toolbar/useToolbarRuntime.ts`、`toolbar/useToolbarSurfaceState.ts`、`toolbar/LayoutFormatMenuInteraction.ts` |
| Sheet tabs                    | tab JSX、拖拽及 pointer capture、`elementFromPoint`、全局 pointer 监听、焦点调用和 dispose                                                             | `sheet-tabs/SpreadsheetSheetTabs.tsx`、其他 tab `*.tsx`；`sheet-tabs/sheet-tab-controller.ts`、`sheet-tabs/sheet-tab-focus.ts`                                                                                                                                                                                                               |
| 反馈、状态与诊断表面          | `@einfach/solid` 读取、memo 化展示、`Show` / `For`、通知和诊断节点的 JSX                                                                               | `feedback/use-atom-feedback-presentation.ts`、`feedback/SpreadsheetFeedbackSurface.tsx`、状态栏与 diagnostics 的 `*.tsx` 组件                                                                                                                                                                                                                |
| 批注、筛选排序与其它面板      | 滚动/尺寸响应、下拉焦点、筛选和排序面板 JSX、组件局部 signal/effect 和 cleanup                                                                         | `comments/use-comment-thread-interaction.ts`、`filter-sort/filter-dropdown-focus.ts`、`comments`、`filter-sort`、`conditional-formatting`、`data-validation`、`format-cells` 的 TSX 表面                                                                                                                                                     |
| Provider 和渲染节点契约       | `JSX.Element`、context、渲染树以及以 Solid 生命周期连接 atom 值的 hooks                                                                                | `provider/types.ts` 和 AD-311 TSX 台账所列全部直接 Solid 导入组件                                                                                                                                                                                                                                                                            |

`context-menu/context-menu-focus.ts`、`toolbar/useToolbarPainterCommands.ts` 和 `sheet-tabs/sheet-tab-controller.ts` 是容易误读的边界。AD-311 将它们列为可下沉，是因为它们的 Solid 直接耦合限于 `Accessor` 输入；但其中的元素查询、事件对象、原生监听器、pointer capture 或 disposer 仍须在承载界面的一侧绑定与清理。此处并未把整份控制器判为可无 DOM 挂载。

同理，`anchored-menu-style.ts` 的几何计算可脱离 `JSX.CSSProperties` 类型，但读取 viewport 的默认值仍是浏览器环境细节；`formula-autocomplete-anchor.ts` 的矩形读取也仍需元素测量适配。

## 交接边界

本分类为后续工作提供的是“哪些行为可以先消除 Solid 表达依赖”的清单，以及“哪些行为仍需要当前渲染器负责节点、事件与生命周期”的清单。它没有为任一项指定跨层归属或新的挂载方式。

残余的判断点是：台账以直接 `solid-js` 导入计数，而若干 JSX 表面依赖编译时 JSX 运行时或经由 `@einfach/solid` 间接耦合。因此后续若新增交互文件，应同时检查直接导入、JSX、浏览器副作用和 cleanup，而不能只比较导入计数。
