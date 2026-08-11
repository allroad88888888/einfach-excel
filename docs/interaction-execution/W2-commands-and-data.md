# W2：命令、结构和数据工作流

> 命令与数据 Issue 不允许直接重写共享 Toolbar/Menu/ContextMenu 文件。先由 IX-004 拆出可消费契约；
> 前端页面只消费各自领域 Atom 与 command adapter。

| 来源 Issue                    | 唯一模型                       | 判定       | 独占模块                                                           | 前置                   | 模型交付                                                            |
| ----------------------------- | ------------------------------ | ---------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------- |
| UI-301 工作表标签             | `model-301-sheet-tabs`         | 修复       | `src-vnext/sheet-tabs/**`、`ui-core/src/sheet-tabs/**`             | IX-001、IX-005         | 补生命周期、roving focus 和键盘路径；不改 workspace 共享契约。      |
| UI-302 行列与区域结构         | `model-302-structure`          | 重构后修复 | `ui-core/src/operations/**`、专属 `src-vnext/structure/**`         | IX-004                 | 先把 operation command/lifecycle/adapter 拆责，再接结构入口。       |
| UI-303 顶部菜单导航           | `model-303-menu`               | 重构后修复 | `src-vnext/menu-bar/**`                                            | IX-004、IX-005         | 补方向键高亮、关闭与焦点返回；不改具体领域命令。                    |
| UI-304 右键上下文命令         | `model-304-context-menu`       | 重构后修复 | `src-vnext/context-menu/**`                                        | IX-004、IX-005         | 拆 cell/header/row/column/sheet presenter，再接命令 manifest。      |
| UI-305 工具栏布局和发现性     | `model-305-toolbar-shell`      | 重构后修复 | `src-vnext/toolbar/SpreadsheetToolbar.tsx`、shell presenter        | IX-004                 | 处理分组、禁用、当前态和溢出；不实现具体格式控件。                  |
| UI-306 文本和填充格式         | `model-306-text-format`        | 修复       | `src-vnext/toolbar/Font*`、`FillColorPopover.tsx`                  | IX-004、UI-305         | 用 formatting command adapter 接通控件；保留 format Atom。          |
| UI-307 对齐、边框、合并和尺寸 | `model-307-layout-format`      | 修复       | `src-vnext/toolbar/{HAlign,VAlign,Borders,Merge}*`                 | IX-004、UI-305、UI-302 | 统一控制器可用性与回显；不改 operations 语义。                      |
| UI-308 数字格式快捷入口       | `model-308-number-format`      | 修复       | `src-vnext/toolbar/NumberFormatDropdown.tsx`                       | IX-004、UI-305、UI-309 | 补快捷入口与格式对话框的状态同步。                                  |
| UI-309 单元格格式对话框       | `model-309-format-dialog`      | 重构后修复 | `src-vnext/format-cells/**`                                        | IX-005                 | 按 tab/preview/submit 拆呈现文件；领域 state 继续来自 Atom。        |
| UI-401 查找、替换和定位       | `model-401-find-replace`       | 修复       | `src-vnext/{find-replace,go-to}/**`、`ui-core/src/find-replace/**` | IX-005、IX-006         | 统一 dialog、错误、retry；不重写已有恢复状态机。                    |
| UI-402 筛选                   | `model-402-filter`             | 修复       | `src-vnext/filter-sort/**`、`ui-core/src/filter-sort/**`           | IX-004、IX-005         | 轻拆超限 UI，保留 filter lifecycle/draft Atom。                     |
| UI-403 排序                   | `model-403-sort`               | 修复       | `src-vnext/sort/**`（新）、sort adapter                            | IX-004、IX-005、UI-402 | 补范围/方向确认会话，不重做 physical-sort core。                    |
| UI-404 文本分列               | `model-404-text-columns`       | 修复       | `src-vnext/text-to-columns/**`、`ui-core/src/text-to-columns/**`   | IX-005                 | 拆 wizard presenter，复用 preview/session Atom。                    |
| UI-405 删除重复项             | `model-405-remove-duplicates`  | 修复       | `src-vnext/remove-duplicates/**`、同名 core 模块                   | IX-005                 | 轻拆 dialog；保留 scan/preview/mutation Atom。                      |
| UI-406 命名区域和名称框       | `model-406-named-ranges`       | 重构后修复 | `src-vnext/named-ranges/**`、`ui-core/src/named-ranges/**`         | IX-005、UI-202         | 迁移 name-manager 的产品 signal 到领域 Atom，并拆超限 core/dialog。 |
| UI-407 Excel 表格             | `model-407-tables`             | 补建       | `ui-core/src/tables/**`、`src-vnext/tables/**`（新）               | IX-004、IX-005         | 补创建、结果、总计行的用户反馈；不把 backend command 当成完整 UI。  |
| UI-408 条件格式               | `model-408-conditional-format` | 修复       | `src-vnext/conditional-formatting/**`、同名 core 模块              | IX-005                 | 接入统一 dialog/a11y；保留现有规则 Atom。                           |
| UI-409 数据验证               | `model-409-data-validation`    | 重构后修复 | `src-vnext/data-validation/**`、同名 core 模块                     | IX-005                 | 先拆超限 core，再修 dialog 提示与提交流程。                         |

模型须提供领域单测；有 popover/dialog 交互的节点还须有焦点和 Escape 证据。

## 已完成：UI-301 工作表标签

- Commit：`aa1c97c`。
- 原 424 行入口已按职责拆为装配（95 行）、单项 Tab、覆盖层、DOM 焦点注册和交互控制器；本次新/改文件均不超过 300 行。
- 已通过 roving tabindex、Arrow/Home/End、Ctrl/Cmd+PageUp/PageDown、F2 重命名、键盘右键菜单、Escape 焦点归还，以及 pointer cancel/卸载清理的组件路径。
- 产品状态仍由 `workspaceSessionAtom`、`sheetTabsAtom`、`sheetTabsSheetsAtom` 与既有 command/intent atom 持有；新 controller 只持有 DOM ref 和暂时的 pointer listener。
- 根侧与既有 core/UI 回归一起复验通过；未改的 `vnext-sheet-tabs.test.tsx`（503 行）和 `sheet-tabs.test.ts`（599 行）是独立的测试拆分债务，不在本 Issue 扩 scope。
