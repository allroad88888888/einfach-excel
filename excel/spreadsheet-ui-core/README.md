# @einfach/spreadsheet-ui-core

这是 Einfach 表格的框架无关 UI Core。视口、选区、编辑、投影和命令状态全部由 `@einfach/core` atom 组织；工作簿数据和计算只在 Rust/WASM 中。`rust-worker` 是纯 RPC 传输，`rust-workbook` 定义类型化业务命令，`rust-runtime` 是唯一带 Worker/WASM 副作用的入口。React、Solid、Vue 运行时不得进入本包。

仓库级三层架构见 [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)；本包的硬约束、准入检查与测试门禁见 [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md)。

## Feature 归属与设计文档

**wave 模型已退役。** Wave 1-8 的划分不再反映工作组织方式 —— `tables`、`outline`、
`formula-functions` 等已上线 feature 不属于任何 wave，后续工作改用 parity 编号（#27、#29、#32）
组织。原先的 wave 表与各 feature 的一次性设计稿已归档到 [`docs/archive/`](./docs/archive/INDEX.md)。

现在的入口是：

| 想知道 | 去读 |
|---|---|
| 某个 feature 的 atom 清单、上限、测试面 | 该 feature 的 `src/<feature>/README.md`（**权威**） |
| 某个事实归引擎还是归 UI core | [`../solid-excel/docs/CANONICAL_OWNERSHIP.md`](../solid-excel/docs/CANONICAL_OWNERSHIP.md) |
| 归属判据与那次翻转的理由 | [ADR 0003](../../docs/decisions/0003-engine-owns-filter-sort.md) |
| 仍在维护的 feature 契约文档 | `docs/` 下现存的几份（frozen-panes、filter-sort、cell-format-expansion、comments-notes） |

Charts、images 与浮动对象明确不在范围内。

## 模块清单

每个 feature 在自己的 `README.md` 里记录 source / derived / command atom 的分类、有界缓存的上限与测试面 —— **那才是该 feature 的权威契约**，本表只做索引。

| 模块 | 职责 | README |
|---|---|---|
| `src/auto-fill/` | 填充序列 locale 状态、纯序列识别，与填充柄共享的命令/请求路径 | [✓](./src/auto-fill/README.md) |
| `src/backend/` | 投影、变更和工作表操作的请求/结果类型；不包含统一 backend 对象 | [✓](./src/backend/README.md) |
| `src/clipboard/` | 复制/剪切/粘贴 UI 状态与分块命令契约 | [✓](./src/clipboard/README.md) |
| `src/comments/` | 单元格锚定的备注与线程化批注的编辑器权属 | [✓](./src/comments/README.md) |
| `src/conditional-formatting/` | 条件格式规则编辑器状态与操作契约 | [✓](./src/conditional-formatting/README.md) |
| `src/copy-as/` | 把可见投影序列化为 TSV / HTML / PNG 的纯编码器 | [✓](./src/copy-as/README.md) |
| `src/custom-formulas/` | 宿主注册的自定义公式注册表（含异步），名称校验与内置遮蔽名单 | [✓](./src/custom-formulas/README.md) |
| `src/data-validation/` | 按区间的数据验证规则与编辑期诊断状态 | [✓](./src/data-validation/README.md) |
| `src/diagnostics/` | toast / 状态栏 / 调试面板的 UI 状态（有界缓冲） | [✓](./src/diagnostics/README.md) |
| `src/editing/` | 单元格编辑器草稿、来源、提交与取消 | [✓](./src/editing/README.md) |
| `src/filter-sort/` | 按表的列级筛选可见性规则，以及物理排序命令（引擎为准，本层是投影缓存） | [✓](./src/filter-sort/README.md) |
| `src/find-replace/` | 查找/替换查询状态、游标导航与搜索替换契约（500 坐标上限） | [✓](./src/find-replace/README.md) |
| `src/format-cells/` | 「设置单元格格式」对话框的表单状态 | — |
| `src/format-painter/` | 格式刷会话状态 | — |
| `src/formula-bar/` | 公式栏草稿、焦点、诊断，与引用拾取的接线 | [✓](./src/formula-bar/README.md) |
| `src/formula-functions/` | 内置函数元数据（签名、分类）供自动补全与提示使用 | — |
| `src/formula-reference/` | 公式引用拾取会话：进入拾取模式、把 A1/A1:B2 token 插入草稿 | [✓](./src/formula-reference/README.md) |
| `src/go-to/` | 「定位」/「定位条件」对话框背后的 atom 层 | [✓](./src/go-to/README.md) |
| `src/history/` | 撤销/重做栈状态与 Rust 事务派发契约（上限 100） | [✓](./src/history/README.md) |
| `src/internal/` | 包内部工具，不对外导出 | — |
| `src/keyboard/` | 框架无关的键盘导航/编辑/引用拾取命令状态 | [✓](./src/keyboard/README.md) |
| `src/menu/` | 菜单开合、紧凑目标、高亮与命令意图 | [✓](./src/menu/README.md) |
| `src/menu-bar/` | 文件/编辑/插入等顶层菜单栏的框架无关状态 | [✓](./src/menu-bar/README.md) |
| `src/name-box/` | 名称框（左上角地址框）的输入与跳转状态 | — |
| `src/named-ranges/` | 有界名称注册表缓存（上限 500）与名称管理器对话框状态 | [✓](./src/named-ranges/README.md) |
| `src/operations/` | 框架无关的表格操作意图（批量插入/删除行列等） | [✓](./src/operations/README.md) |
| `src/outline/` | 行列分组与 Excel outline 语义（UI core canonical） | [✓](./src/outline/README.md) |
| `src/paste-special/` | 选择性粘贴能力：冻结会话、表单草稿、变更证据 | [✓](./src/paste-special/README.md) |
| `src/pointer/` | 拖拽选区、填充柄、行列改尺寸、自动滚动的进行中状态 | [✓](./src/pointer/README.md) |
| `src/presence/` | 远端协作者光标与编辑归属（光标上限 32） | [✓](./src/presence/README.md) |
| `src/print/` | 按表的打印配置：打印区域、手动分页、缩放、方向、页眉页脚 | [✓](./src/print/README.md) |
| `src/projection/` | 当前可见窗口或指定区间的有界显示投影契约 | [✓](./src/projection/README.md) |
| `src/protection/` | 工作表保护与锁定单元格状态（解锁区间上限 256） | [✓](./src/protection/README.md) |
| `src/remove-duplicates/` | 「删除重复项」对话框：选区 + 列选择 + 结果统计 | [✓](./src/remove-duplicates/README.md) |
| `src/rich-types/` | 结构化单元格值的判别联合（超链接、富文本 run、值种类元数据） | [✓](./src/rich-types/README.md) |
| `src/rust-worker/` | 与表格业务无关的 Worker RPC 传输 | [✓](./src/rust-worker/README.md) |
| `src/rust-workbook/` | 初始化、导入、可见区投影和单元格写入四条类型化 Rust 命令 | — |
| `src/selection/` | 活动单元格、锚点/焦点区间、行列/全选，以及名称框锚点 | [✓](./src/selection/README.md) |
| `src/shared/` | 跨 feature 的基础类型与工具（`CellCoord`、`CellRange`、`SheetRef`、`SpreadsheetError`） | [✓](./src/shared/README.md) |
| `src/sheet-tabs/` | 工作表标签菜单、改名、删除与标签交互流程 | [✓](./src/sheet-tabs/README.md) |
| `src/spill/` | 动态数组溢出区的可见性：当前选区所在数组的锚点与外接矩形（上限 1） | [✓](./src/spill/README.md) |
| `src/status-bar/` | 状态栏聚合值与缩放的 UI 状态 | — |
| `src/tables/` | Excel Table（结构化引用、汇总行）—— parity #32 | [✓](./src/tables/README.md) |
| `src/text-to-columns/` | 三步「分列」向导：把单列选区按分隔符或定宽拆开 | [✓](./src/text-to-columns/README.md) |
| `src/toolbar/` | 工具栏 / ribbon UI 状态与命令可用性 | [✓](./src/toolbar/README.md) |
| `src/viewport/` | 滚动与尺寸度量，派生可见行列窗口，冻结象限 | [✓](./src/viewport/README.md) |
| `src/workspace/` | 围绕当前工作簿/工作表的 UI 视图生命周期 | [✓](./src/workspace/README.md) |
| `src/createSpreadsheetUi.ts` | 把 Rust connection 与 store 接在一起 | — |

## Rust connection

每个 store 的 `rustWorkbookConnectionAtom` 只保存一个 Worker 连接资源，不保存工作簿数据。
投影 atom 发送 `projection.readVisible`，编辑 command atom 发送 `cell.setInput`；产品启动流程发送
`workbook.initialize` 和 `workbook.importCells`。没有 `SpreadsheetBackend` 聚合接口，也没有按框架
区分的 engine adapter。新增能力时增加一条明确命令及对应 atom，不向连接对象堆可选方法。

## Atom conventions

- `debugLabel = 'spreadsheet.<feature>.<name>'` on every atom (e.g. `spreadsheet.findReplace.cursor`).
- No per-cell, per-row, or per-column atom families. Large-table data flows through the visible-window projection or a bounded cache; caps are documented per feature.
- Mutation requests carry optional `requestId` / `revision` / `cancelToken` so workers can drop stale work.

## Testing

单测在 `test/` 下，全部是 atom 级。每个测试用 `createStore()` 建**新** store 以隔离 atom 交互。

规模现场算，不记数字：`npx jest excel/spreadsheet-ui-core --listTests | wc -l`。

```bash
# Whole package
npx jest excel/spreadsheet-ui-core --no-coverage

# Single feature
npx jest excel/spreadsheet-ui-core/test/<feature>.test.ts --runInBand

# Type + boundary gate
npx tsc -p excel/spreadsheet-ui-core/tsconfig.json --noEmit --pretty false
npx jest excel/spreadsheet-ui-core/test/package-boundary.test.ts --runInBand
```

`package-boundary.test.ts` 把 Solid、React、DOM runtime API 和内联 WASM glue 挡在普通 atom 模块之外；
`rust-worker-boundary.test.ts` 单独保证传输目录不依赖表格业务或框架运行时。

## 开发约定

包边界硬约束、实现准入检查、测试门禁与 review 重点见
[`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md)。

要点：本包必须保持框架无关；状态只能用 einfach atom；**不允许 per-cell / per-row / per-column
的 atom 家族** —— 大表只能走可见窗口投影或有上限的缓存，每个缓存在自己的 feature README 里
声明上限。
