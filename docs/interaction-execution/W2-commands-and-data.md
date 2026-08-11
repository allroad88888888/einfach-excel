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

## 已完成

### UI-301 工作表标签

- Commit：`aa1c97c`。
- 原 424 行入口已按职责拆为装配（95 行）、单项 Tab、覆盖层、DOM 焦点注册和交互控制器；本次新/改文件均不超过 300 行。
- 已通过 roving tabindex、Arrow/Home/End、Ctrl/Cmd+PageUp/PageDown、F2 重命名、键盘右键菜单、Escape 焦点归还，以及 pointer cancel/卸载清理的组件路径。
- 产品状态仍由 `workspaceSessionAtom`、`sheetTabsAtom`、`sheetTabsSheetsAtom` 与既有 command/intent atom 持有；新 controller 只持有 DOM ref 和暂时的 pointer listener。
- 根侧与既有 core/UI 回归一起复验通过；未改的 `vnext-sheet-tabs.test.tsx`（503 行）和 `sheet-tabs.test.ts`（599 行）是独立的测试拆分债务，不在本 Issue 扩 scope。

### UI-302 行列与区域结构

- Commit：`d782f77`。
- 新增 core `structural-commands` Atom 命令层，以 selection snapshot 映射既有 operations、viewport 和 outline 命令；Solid host 只注入 backend/projection refresh 适配器，没有引入新的产品状态。
- 核心和宿主的定向回归、core/host/root TypeScript 检查、范围内 ESLint、Prettier 与 diff 检查均通过；新增或修改文件均不超过 300 行。
- 本项刻意没有改菜单或右键 presenter；它们应在各自 Issue 消费该命令 seam。现有后端没有移动区域命令端口，未伪造移动功能。

### UI-303 顶部菜单导航

- Commit：`62ebef6`。
- 原菜单入口已按命令上下文、呈现、帮助窗口和键盘控制职责拆分；新增或修改的实现文件均不超过 300 行。
- 保持 `topMenuOpenAtom` 作为开关事实；方向高亮只保存在 DOM 焦点中，因为 Core 未提供可写的高亮交互契约。顶部、下拉菜单支持方向键、Home/End、Escape、焦点归还和 Alt 助记键。
- 85 项定向回归、TypeScript、范围内 ESLint、Prettier 与 diff 检查通过。未改的 2,926 行遗留菜单测试是独立拆分债务。

### UI-304 右键上下文命令

- Commit：`1035000`。
- 拆出 cell/range、行、列、全表和 Sheet Tab 的命令 manifest、执行器和 DOM 焦点控制；不拥有产品状态，也不直接重建 Core 命令。
- 键盘打开时定位首项，支持方向键、Home/End、Tab、Escape 和 opener 焦点归还；菜单项继续复用原有 capability 与 command Atom。
- 32 项定向回归和 TypeScript 通过。遗留的 1,647 行测试未在本项顺手拆分。

### UI-305 工具栏布局和发现性

- Commit：`ff2d38f`。
- 将 1,978 行入口拆为 shell、运行时、命令控制器、各功能组和浮层；入口现在只装配，新增或修改文件最大 223 行。
- 增加水平溢出滚动、前后滚动控件，并把边框、对齐、旋转、合并和排序的浮层改为锚定 portal，避免被滚动容器裁切；产品事实仍来自既有 formatting Atom。
- 23 项工具栏回归、范围内 ESLint、Prettier 与 diff 检查通过；随后全项目 TypeScript 已由后续对话框 Issue 复验通过。未改的 `ToolbarIcons.tsx`（527 行）是存量文件拆分债务。

### UI-401 查找、替换和定位

- Commit：`e86ca1b`。
- 查找替换和定位对话框已拆为 Atom 控制器、字段/内容 presenter 与仅负责 DOM 焦点的 helper；不改既有查找替换状态机或定位解析 Atom。
- 补齐 modal 语义、tab/tabpanel 关联、初始焦点、Escape 关闭和 opener 焦点归还；错误和 retry 继续由 Core lifecycle Atom 驱动。
- 177 项 Core/宿主交互回归、Core/宿主/根 TypeScript、范围内格式与 diff 检查均通过。超限的 Core 定位引擎和遗留测试留给独立拆分 Issue。

### UI-402 筛选

- Commit：`8525020`。
- 原 518 行 dropdown 拆为编排、呈现、条件草稿和 DOM 焦点职责；筛选草稿、加载、错误和 retry 仍只使用既有 Atom。
- 打开自动聚焦搜索框，Escape 归还 opener，刷新失败聚焦 Retry，两个范围字段均可 Enter 提交；错误和 busy 状态有明确 ARIA 关联。
- 120 项定向回归、Core/宿主/根 TypeScript、ESLint、Prettier 与 diff 检查通过。排序呈现保持原行为，待 UI-403 单独完善。

### UI-404 文本分列

- Commit：`43bbdc3`。
- Wizard 拆为 Atom 控制器、内容、步骤 presenter 和 DOM focus helper；预览、会话、完成、错误及 retry 沿用既有 Core Atom。
- 补齐 modal 语义、焦点循环、Escape/焦点归还和 Finish 错误关联；94 项定向回归和 Core/根 TypeScript 通过。
- 存量 610 行宿主测试和 1,807 行 Core 测试未在本项改动。

### UI-405 删除重复项

- Commit：`5db40f3`。
- 对话框拆为控制器、内容与 CSS，保持既有扫描/预览/变更 Atom；新增表单提交、预览 live region、错误与 retry 的语义反馈，以及焦点循环、Escape 和焦点归还。
- 126 项定向回归、宿主 TypeScript、格式和 diff 检查通过。超限的 Core 与遗留组件测试留作独立债务。

### UI-407 Excel 表格

- Commit：`27d7f05`。
- 审计确认现有 `runCreateTableAtom`、`runToggleTableTotalsAtom` 和诊断/结果 Atom 已覆盖创建与总计行生命周期；新增宿主反馈面只消费这些 Atom，不持有业务状态或直接调用后端。
- 50 项 Core/宿主定向回归、行数、Prettier 和 diff 检查通过。因装配范围未授权，反馈面尚未挂入菜单或主界面，留给拥有入口的后续 Issue。

### UI-408 条件格式

- Commit：`d596244`。
- 对话框使用共享 DOM-only overlay interaction，补齐初始焦点、焦点循环、Escape、焦点归还、modal ARIA 和错误关联；保存仍只派发既有条件格式编辑/变更 Atom。
- 15 项定向回归、Core/宿主/根 TypeScript、Prettier 与 diff 检查通过。富规则值编辑和 retry 命令未由 Core 暴露，未臆造新的状态契约。

### UI-409 数据验证

- Commit：`5e330f8`。
- 原 1,136 行 Core 聚合和 310 行弹窗已按表单、值快照、目标授权、身份、账本、提交状态和 DOM 焦点职责拆分；本次生产文件最大 260 行。
- 编辑草稿、pending/error、操作账本和未知结果阻断仍只由既有 Einfach Atom 持有。宿主只保存焦点返回元素和焦点代次等 DOM 生命周期信息。
- 对话框补齐 modal/字段/错误 ARIA、busy、Escape、焦点循环和关闭后焦点恢复；未知结果下 Save/Clear 禁用而关闭仍可用，重开时焦点落在关闭按钮。
- 77 项定向回归、Core 与根 TypeScript、范围内 ESLint、Prettier 和 diff 检查通过；宿主 TypeScript 当时仅被并行 UI-406 尚未导出的名称管理 Atom 阻断。
