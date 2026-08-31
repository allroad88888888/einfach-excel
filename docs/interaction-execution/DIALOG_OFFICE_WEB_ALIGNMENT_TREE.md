# Dialog Office Excel for web 对齐：执行 Issue 树

> 执行账本，基线为 `2b70cdc7…5a2e68f0` 已完成的 Excel for web 主 chrome。
> 范围是该基线之后所有语义 `role="dialog"` 表面；不改变工作簿业务状态、命令语义、Atom
> 所有权或既有键盘/读屏契约。每个 Dxx 只有一个 Dialog owner，不暂存、不提交、不改共享文件。

## 设计契约与边界

- 视觉口径：`chrome-tokens.css` 的 Segoe UI、`--bg-surface`、`--border`、`--office-blue`、
  `--excel-green` 与 `--control-h`；浅/深色都必须使用 token，禁止在 feature CSS 新增裸色值。
- Excel Web modal：4px 圆角、紧凑的 40px 标题栏、1px 边线、克制阴影、28px 控件、右对齐操作区；
  primary 为绿色，focus 为蓝色。内容布局仍由每个 Dialog 独占。
- 所有 modal 保持 Escape、初始焦点、Tab 圈闭、焦点归还、`aria-modal` 和可访问名称；不以 CSS
  对齐为由替换领域 Atom 或改动命令逻辑。
- `FilterDropdown` 和 `FillColorPopover` 虽为 `role="dialog"`，但不是 modal：保留锚点、非模态
  行为和通用皮肤排除规则，只对齐其浮层视觉。

## 依赖树

```text
D-000 Excel for web Dialog 对齐
├── W0 D00 共享 Dialog 壳与视觉门禁
├── W1 单一工作流 Dialog（可并行，均依赖 D00）
│   ├── D01 查找和替换                 ├── D02 转到
│   ├── D03 选择性粘贴                 ├── D04 文本分列
│   ├── D05 删除重复项                 ├── D06 条件格式
│   ├── D07 数据验证                   ├── D08 名称管理器
│   ├── D09 设置单元格格式             ├── D10 更多数字格式
│   ├── D11 页面设置                   ├── D12 排序确认
│   ├── D13 保护范围解锁               ├── D14 批注线程
│   ├── D15 删除工作表确认             ├── D16 帮助
│   ├── D17 打印预览                   ├── D18 筛选下拉（非模态）
│   └── D19 填充/字体颜色选择器（非模态）
├── W2 D20 跨 Dialog 视觉矩阵验收（依赖 D01…D19）
└── W3 D21 集成、回归与交付

D-022 线上 CI 回归修复（依赖 D-000）
├── W1 R01 编译门禁：修正重复键与未使用测试绑定
├── W1 R02 站点契约：将首页文案断言移至实际组件边界
├── W1 R03 Number Format：恢复下拉的外部点击关闭
├── W2 R04 Chrome E2E：同步已提交 Office 视觉基线断言
├── W2 R05 Name Manager：同步可访问名称契约断言
├── W3 R06 首页 Hero：同步静态工作台冒烟契约
├── W3 R07 排序入口：恢复确认后的物理排序派发
└── W3 R08 双后端清单：登记新增的保护解锁视觉用例

R-006 Pages 冒烟：同步首页静态 Hero 的就绪契约
```

## 波次与文件所有权

| 波次 | 进入/解锁 | 并行规则 | 结果 |
| --- | --- | --- | --- |
| W0 | 现状盘点完成 | 仅 D00；独占 shared skin、tokens、视觉 spec | 全表面可继承的 Excel Web 壳与断言 |
| W1 | D00 已审阅 | 每个 owner 只能编辑自己的 `src/<feature>/**`、专属 CSS、专属测试 | 每个 Dialog 的内部布局接入共同壳 |
| W2 | 全部 W1 leaf 通过 | D20 只编辑 visual-chrome E2E，不回写 feature | 覆盖浅/深色、尺寸、颜色、modal/popover 边界 |
| W3 | D20 通过 | 集成 owner 只修冲突；root 只审阅、显式暂存和提交 | 已核实的完整交付 |

## 叶子任务

| ID | 对象 / 唯一 owner | 模型 | 独占范围 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| D00 | 共享 Dialog 壳 | `gpt-5.6-sol` | `styles/chrome-tokens.css`、`styles/dialog-skin.css`、`e2e/visual-chrome/**` | token-only skin；浅/深色 CSSOM 断言；不覆盖 popover | done — visual-chrome 7/7 |
| D01 | 查找和替换 | `gpt-5.6-terra` | `find-replace/**`、`features/find-replace-*.css`、专属 test | 40px header、28px control、footer/焦点回归 | done — Jest 42/42 |
| D02 | 转到 / 定位条件 | `gpt-5.6-terra` | `go-to/**`、`features/go-to-dialog.css`、专属 test | tab、radio、footer 视觉与 Escape 回归 | done — Jest 19/19 |
| D03 | 选择性粘贴 | `gpt-5.6-terra` | `paste-special/**`、`features/paste-special-dialog.css`、专属 test | fieldset/footer/禁用态、快捷键回归 | done — Jest 19/19 |
| D04 | 文本分列 | `gpt-5.6-sol` | `text-to-columns/**`、`features/text-to-columns-dialog.css`、专属 test | 三步向导、预览、footer 与 focus 回归 | done — Jest 15/15, E2E 9/9 |
| D05 | 删除重复项 | `gpt-5.6-terra` | `remove-duplicates/**`、`features/remove-duplicates-dialog.css`、专属 test | 列表/预览/操作区与 pending 视觉 | done — Jest 11/11 |
| D06 | 条件格式 | `gpt-5.6-sol` | `conditional-formatting/**`、`features/conditional-format-dialog.css`、专属 test | 规则列表、编辑区、danger/primary 状态 | done — Jest 26/26, E2E 5/5 |
| D07 | 数据验证 | `gpt-5.6-sol` | `data-validation/**`、`features/data-validation-dialog.css`、专属 test | 输入规则/错误/clear 状态与 focus | done — Jest 11/11, E2E 1/1 |
| D08 | 名称管理器 | `gpt-5.6-terra` | `named-ranges/**`、新增专属 feature CSS、专属 test | 表格/编辑区/操作区；无全局 selector | done — Jest 25/25 |
| D09 | 设置单元格格式 | `gpt-5.6-sol` | `format-cells/SpreadsheetFormatCellsDialog.tsx`、`features/format-cells-dialog.css`、专属 test | tab/面板/preview/footer；不碰 D10 | done — Jest 31/31, E2E 5/5 |
| D10 | 更多数字格式 | `gpt-5.6-terra` | `format-cells/SpreadsheetNumberFormatDialogs.tsx`、`features/number-format-dialog.css`、专属 test | listbox/preview/footer；不碰 D09 文件 | done — Jest 26/26 |
| D11 | 页面设置 | `gpt-5.6-sol` | `print/SpreadsheetPageSetupDialog.tsx`、`features/page-setup-dialog.css`、专属 test | fieldset、save/error、focus return；不碰 D17 | done — Jest 6/6 |
| D12 | 排序确认 | `gpt-5.6-terra` | `sort/**`、`features/sort-confirmation-dialog.css`、专属 test | backdrop/card/close/confirm disabled 状态 | done — Jest 6/6, E2E 2/2 |
| D13 | 保护范围解锁 | `gpt-5.6-sol` | `protection/**`、新增专属 feature CSS、专属 test | 密码/错误/pending、trap/focus return | done — Jest 14/14, E2E 1/1 |
| D14 | 批注线程 | `gpt-5.6-terra` | `comments/**`、新增专属 feature CSS、专属 test | thread/reply/action visual；保留锚点语义 | done — Jest 33/33, E2E 1/1 |
| D15 | 删除工作表确认 | `gpt-5.6-luna` | `sheet-tabs/SpreadsheetSheetTabOverlays.tsx`、专属 CSS/test | destructive confirmation、return focus、深色 token | done — Jest 13/13 |
| D16 | 菜单帮助 | `gpt-5.6-luna` | `menu-bar/menu-bar-help-dialog.tsx`、专属 CSS/test | 简短 help card、close/focus、深色 token | done — Jest 3/3 |
| D17 | 打印预览 | `gpt-5.6-terra` | `print/SpreadsheetPrintPreviewOverlay.tsx`、新增专属 feature CSS、专属 test | preview frame/controls/return；不碰 D11 | done — Jest 10/10, E2E 6/6 |
| D18 | 筛选下拉（非模态） | `gpt-5.6-terra` | `filter-sort/**`、新增专属 feature CSS、专属 test | anchored menu，非 `aria-modal`，不吃 modal backdrop | done — targeted Jest 8/8, visual 3/3 |
| D19 | 填充/字体颜色选择器（非模态） | `gpt-5.6-terra` | `toolbar/FillColorPopover.tsx`、`styles/toolbar-popovers.css`、专属 test | anchored palette、键盘/焦点、保持 modal 排除 | done — Jest 7/7 |
| D20 | 视觉矩阵 | `gpt-5.6-sol` | `e2e/visual-chrome/**` | 每表面浅/深色 computed-style + modal/popover 不混淆 | done — visual-chrome 27/27 |
| D21 | 集成修复 | `gpt-5.6-sol` | 仅验收发现的冲突文件 | targeted Jest、visual E2E、lint、typecheck | done — Jest 53/53, visual 27/27, E2E 16/16 |
| R01 | 编译门禁 | `gpt-5.6-terra` | `vnext-sheet-tabs.test.tsx`、`vnext-grid-header-resize-split.test.tsx` | `lint:check` 与项目 `tsc` 不再报这两处 | done — lint/tsc/Prettier/diff-check 均通过 |
| R02 | 站点首页契约 | `gpt-5.6-luna` | `ad395-framework-demo-contract.test.mjs` | `npm run test:scripts` 通过；仅更新实际 HomePage 边界的断言 | done — scripts 14/14、docs/Prettier/diff-check 通过 |
| R03 | Number Format 外部关闭 | `gpt-5.6-sol` | Number Format 下拉实现/样式及 `audit-format.spec.ts` 对应场景 | 点击未被菜单遮挡的外部目标可关闭下拉，目标 E2E 通过 | done — 根因是测试点被菜单覆盖；WASM 4/4、Jest 1/1 通过 |
| R04 | Chrome E2E 基线 | `gpt-5.6-terra` | `toolbar-colors.spec.ts`、`toolbar-clear-format.spec.ts`、`vnext-wave5.spec.ts` | 断言当前已提交的 Office 网格视觉，不放宽业务行为 | done — Playwright 36/36、diff-check 通过 |
| R05 | Name Manager 可访问名称 | `gpt-5.6-luna` | `toolbar-name-manager.spec.ts` | 断言 `aria-labelledby` 指向可见标题 | done — E2E 5/5、Prettier/diff-check 通过 |
| R06 | 首页 Hero 冒烟契约 | `gpt-5.6-luna` | `excel-site/e2e/site-smoke/demo-cold-load.spec.ts` | 验证实际静态 Hero 画布，不再要求已移除的 SpreadsheetGrid island | done — site E2E 13/13、build/Prettier/diff-check 通过 |
| R07 | 物理排序入口 | `gpt-5.6-sol` | `sort/useSortConfirmation.ts` 的公共确认链、`filter-sort/**`、`menu-bar/**` 的排序入口及对应 Jest，及 `vnext-toolbar-number-format.scenarios.tsx`、`vnext-menu-bar-sort-confirmation.test.tsx` 的确认等待 | 菜单/筛选/工具栏确认后均派发一次真实 sort request；保持 Einfach Atom 链路 | done — 仅修正 async preparing 后的确认等待；相关 Jest 160/160、Playwright 15 passed/3 expected skipped |
| R08 | 双后端视觉清单 | `gpt-5.6-luna` | `e2e/dual-backend-manifest.ts` 的显式 manifest 常量 | 新增的 protection 解锁视觉 spec 已受双后端覆盖 | done — manifest Jest 4/4、Prettier/diff-check 通过 |

## 统一完成标准

每个 D01…D19 在开始时复核现状，只改分配范围；新/大改文件必须 `wc -l <= 300`。交付中给出
文件清单、测试命令与退出码、浅/深色截图或 CSSOM 证据，并说明未修改 Atom/命令语义。发现共享
token 或 `dialog-skin.css` 缺口时只记录给 D00/D21，绝不跨所有权修改。所有 agent 不得暂存或提交。
