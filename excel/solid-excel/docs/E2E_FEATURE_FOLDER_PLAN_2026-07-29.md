# E2E 按功能点分目录测试计划（2026-07-29）

> 本文取代 `E2E_TEST_PLAN.md` 作为 e2e 套件的**当前**规划文档。旧文档保留为
> 2026-05-14 时点的历史快照（23 spec / 162 用例时代），不再更新。
> 本轮执行方式：每个功能组派一个子 agent，按第 6 节分工并行迁移 + 补缺口。

## 1. 背景与目标

现状：`excel/solid-excel/e2e/` 平铺 87 个 spec（≈1174 个用例，19k 行）+
`helpers.ts` + `BACKEND_PARITY.md`。CI 为 4 片矩阵（`e2e.yml`，advisory 模式）。
平铺目录已经无法回答"某功能点覆盖了哪些场景、缺哪些"。

目标：

1. **每个功能点一个文件夹**，功能点边界对齐 `spreadsheet-ui-core/src/<feature>` 与
   `src-vnext/<feature>` 的模块划分。
2. 每个文件夹一份 **`CASES.md`**：枚举该功能点的全部 e2e 场景 —— 存量用例映射 +
   缺口清单（本轮补 / 明确延后）。
3. **补齐 P1 缺口**：每个文件夹按 CASES.md 写新 spec（≤300 行/文件），本地跑绿。
4. 全程**不破坏** CI 4 片矩阵、不改 `playwright.config.ts`、不改 `helpers.ts`。

## 2. 迁移不变式（已核实）

- `testDir: './e2e'` 递归拾取子目录 → 分目录**零配置**。
- 存量 spec 唯一的相对导入是 `./helpers`（70 个文件）→ 迁移后改 `../helpers`。
  无 fixture / `__dirname` / `import.meta` 路径依赖。
- `--shard=x/4` 按测试文件均分，与目录层级无关；`workers: 1` +
  `fullyParallel: false` 不变。
- `helpers.ts`、`BACKEND_PARITY.md` 留在 `e2e/` 根（BACKEND_PARITY.md 按裸文件名
  引用 spec，迁移后仍可检索，不改）。
- 一律 `git mv` 保留历史；本轮**不 commit**，留工作区由用户验收。

## 3. 目录划分

24 个功能点文件夹。「迁入」列出全部 87 个存量 spec 的去向（互斥、无遗漏）。

| # | 文件夹 | 功能点 | 迁入的存量 spec | 主要缺口方向 |
|---|---|---|---|---|
| 1 | `smoke/` | 冒烟 + 回归钉子 | smoke, vnext-smoke, vnext-real-backend-smoke, excel-table-static, regression | 首屏错误守卫全 demo 扫一遍 |
| 2 | `demos/` | 示例 demo 烟测 | demo-budget, demo-grades, demo-sales | demo 内代表性编辑链路 |
| 3 | `formula/` | 公式引擎 UI 链路 | formula-bar, formula-flow, formula-functions, formulas-wasm, workbook-chain | 公式自动补全（`src-vnext/formula-autocomplete/` **零覆盖**）、引用模式高亮 |
| 4 | `custom-formulas/` | 自定义公式 Wave 8 | custom-formulas | 异步 `#BUSY!` 竞态、注销后单元格降级、数组参数 marshaling |
| 5 | `editing/` | 单元格编辑会话 | vnext-direct-edit-real-backend | Escape 取消、blur 提交、覆写 vs 进入编辑、只读态 |
| 6 | `clipboard/` | 剪贴板复制粘贴 | selection-clipboard, audit-clipboard, vnext-clipboard-real-backend, paste-special | 外部 TSV/HTML 粘贴矩阵、粘贴越界裁剪 |
| 7 | `copy-as/` | Copy as HTML/MD/PNG | copy-as, copy-as-png | ClipboardItem 被拒的 writeText 降级 |
| 8 | `selection/` | 选区 + 右键菜单 | vnext-selection-real-backend, range-ops, context-menu | 多 range 选区（Ctrl+Click）、全选/整行整列 |
| 9 | `navigation/` | 键盘导航 + Go To | go-to | Ctrl+Home/End、PageUp/Down、Tab 环绕 |
| 10 | `format/` | 文本/样式格式化 | format, audit-format, toolbar-alignment, toolbar-borders, toolbar-colors, toolbar-clear-format, toolbar-font-family, toolbar-font-size, toolbar-text-style, toolbar-format-painter | 格式刷双击连刷、混合格式 range 的 toolbar 态 |
| 11 | `number-format/` | 数字格式 | toolbar-number-format, toolbar-more-number-formats | 自定义格式串往返、locale 相关渲染 |
| 12 | `toolbar-shell/` | 菜单栏/工具栏/状态栏壳 | toolbar-buttons, toolbar-dropdown-viewport, vnext-wave5, vnext-status-bar-real-backend, vnext-ts-failclosed-menu | 后端 port 缺失时的 fail-closed 隐藏矩阵 |
| 13 | `merge-freeze/` | 合并 + 冻结 | toolbar-merge, vnext-merge-real-backend, freeze-panes, vnext-freeze-real-backend | 合并区键盘导航跳跃、冻结线拖拽滚动交互 |
| 14 | `rows-cols-outline/` | 行列结构 + 分组 | audit-structural, vnext-hidden-rows-real-backend, vnext-outline-real-backend, vnext-subtotal-hidden-real-backend | 插入/删除行列后公式 `#REF!`、多级 outline 折叠 |
| 15 | `filter-sort/` | 筛选排序 | toolbar-filter-sort, vnext-filter-sort-real-backend, vnext-sort-real-backend, vnext-reapply-filter-real-backend, vnext-filter-structural-shift-real-backend | 筛选态下编辑/粘贴的可见性、排序稳定性 |
| 16 | `data-ops/` | 分列 + 去重 | remove-duplicates, text-to-columns, vnext-text-to-columns-real-backend, vnext-worker-remove-duplicates-real-backend | 按显示值去重（ROADMAP 锁定语义）、分列预览 |
| 17 | `history/` | 撤销重做 | undo-redo, audit-history, toolbar-history, vnext-worker-undo-real-backend | 100 条上限逐出、跨 sheet 撤销落点 |
| 18 | `find-replace/` | 查找替换 | toolbar-find-replace | 正则/大小写/整词矩阵、500 匹配上限、replace-all undo 单步 |
| 19 | `named-ranges-tables/` | 命名区域 + 表格 | toolbar-name-manager, name-manager-table-actions, vnext-table-real-backend, vnext-table-totals-real-backend, vnext-table-undo-real-backend | 名称冲突校验、500 上限、表格扩展行 |
| 20 | `comments/` | 批注/评论 | toolbar-comment | 线程回复/解决/删除、指示器渲染 |
| 21 | `data-validation/` | 数据校验 | toolbar-data-validation | 下拉列表选择、拒绝提交路径、圈释无效数据 |
| 22 | `conditional-format/` | 条件格式 | toolbar-conditional-format | 规则叠加优先级、色阶/数据条渲染、规则管理器 |
| 23 | `protection/` | 保护锁定 | vnext-protection-real-backend | 锁定单元格编辑拦截 toast、解锁 range 256 上限、密码流 |
| 24 | `sheets/` | 工作表生命周期 | multisheet-ui, vnext-sheet-lifecycle-real-backend | 重命名后公式引用跟随、拖拽排序 |
| 25 | `worker-backend/` | worker RPC / 后端桥 | worker, worker-workbook, vnext-worker-backend, vnext-worker-ts, vnext-worker-ts-lambda | revision/cancelToken 陈旧请求丢弃 |
| 26 | `perf-virtual/` | 虚拟化 + 性能观测 | million-demo, virtualize, render-counter, observability, file-import | 横向虚拟化边界、滚动中编辑 |
| 27 | `i18n-a11y/` | 国际化 + 可访问性 | i18n, a11y-surfaces | locale 切换后对话框文案、焦点陷阱/Escape 关闭 |

## 4. `CASES.md` 约定

每个文件夹一份，格式统一：

```markdown
# <功能点> — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/<feature>/ + src-vnext/<feature>/
> 存量 spec 行数超限登记（如有）：xxx.spec.ts N 行（历史文件，只登记不拆）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| FR-01 | 简单查找命中 | 打开对话框→输入→Find | 高亮+计数 | ✅ 存量 | toolbar-find-replace #"finds…" |
| FR-07 | 500 匹配上限 | 构造 600 命中 | 截断提示 | 🆕 本轮 | find-limits.spec.ts |
| FR-09 | 正则超时 | 灾难回溯 pattern | 错误码提示 | ⏳ P2 延后 | — |
```

状态取值：`✅ 存量`（映射到已迁入 spec 的具体 test 标题）/ `🆕 本轮`（新写）/
`⏳ P2 延后`（记录理由）/ `⚠️ 疑似 bug`（新用例暴露的产品问题，spec 用
`test.fixme` 挂起并在 agent 汇报中上报，**不擅自改产品代码**）。

存量映射不要求逐 test 精确到行，但每个存量 spec 文件必须在其所属 CASES.md
中至少出现一次（防止"迁了但没人认领场景"）。

## 5. 新增 spec 规范

- 文件放在所属功能文件夹内，命名描述场景（如 `find-limits.spec.ts`），
  **≤300 行**（全局硬规则；存量超限文件只登记不拆）。
- `import { … } from '../helpers'`；优先复用 `gotoDemo` / `gotoRoot` /
  `typeIntoCell` / `expectDisplay` / `grantClipboard` / `guardConsoleErrors`。
  需要新公共 helper 时**先放本文件夹局部**，不改根 `helpers.ts`。
- 双后端意识：同一 spec 会以 `wasm` 与 `ts` 两个 project 各跑一遍。仅当功能
  明确单后端时才按 `test.info().project.name` 跳过（参考
  `vnext-ts-failclosed-menu.spec.ts` 的写法）。
- 断言产品可见结果（单元格文本、class、aria、toast），不戳内部状态；
  `?debug=1` 探针类断言仅限 `perf-virtual/`。
- Prettier 口径：无分号、单引号、100 列。无 console。

## 6. 子 agent 分工

11 个 agent，文件夹互斥、无共享写入面。每个 agent 的固定流程：

1. 读本文档 + 自己名下存量 spec + 对应功能源码（`spreadsheet-ui-core/src/`、
   `src-vnext/`）。
2. 建文件夹，`git mv` 迁入名下 spec，改 `../helpers` 导入。
3. 写各文件夹 `CASES.md`（存量映射 + 缺口），按缺口写新 spec（每文件夹 1–3 个）。
4. 验证：`npx playwright test e2e/<folder> --list` 全量可解析；
   **只跑新增 spec** 至绿（或 `test.fixme` + ⚠️ 登记）。

| Agent | 文件夹 | 迁移文件数 | 缺口重点 |
|---|---|---|---|
| A1 冒烟示例 | smoke/, demos/ | 8 | 全 demo 首屏 console 守卫 |
| A2 公式 | formula/, custom-formulas/, editing/ | 7 | **formula-autocomplete 零覆盖**、异步自定义公式 |
| A3 剪贴板 | clipboard/, copy-as/ | 6 | 外部粘贴矩阵、降级路径 |
| A4 选区导航 | selection/, navigation/ | 4 | 多 range 选区、Ctrl+Home/End |
| A5 格式化 | format/, number-format/ | 12 | 混合格式态、自定义格式串 |
| A6 壳层 | toolbar-shell/, i18n-a11y/ | 7 | fail-closed 隐藏矩阵、焦点陷阱 |
| A7 结构 | merge-freeze/, rows-cols-outline/ | 8 | 合并区导航、`#REF!` 链路 |
| A8 数据操作 | filter-sort/, data-ops/ | 9 | 筛选态编辑、显示值去重 |
| A9 历史与名称 | history/, named-ranges-tables/ | 9 | 100 条逐出、名称冲突 |
| A10 对话框族 | find-replace/, comments/, data-validation/, conditional-format/, protection/ | 5 | **本轮最大补缺区**：五个功能各只有 1 个 toolbar 级 spec |
| A11 平台 | sheets/, worker-backend/, perf-virtual/ | 12 | revision 陈旧丢弃、横向虚拟化 |

执行约束（每个 agent 都适用）：

- 只动自己名下文件夹；不改 `helpers.ts`、`playwright.config.ts`、
  `.github/workflows/*`、产品源码；不 commit。
- 本地验证共享跑在 `127.0.0.1:5174` 的 dev server：
  `EINFACH_E2E_REUSE_SERVER=1 npx playwright test e2e/<folder>/<新spec> --project=wasm`
  （server 由主会话预先拉起，**不要自己再起**，否则 strictPort 冲突）。
- 新用例跑不绿先怀疑用例本身；确认是产品 bug 才标 ⚠️ + `test.fixme`。

## 7. 验收门禁（主会话收尾执行）

1. `e2e/` 根不再有 `*.spec.ts`（只剩 `helpers.ts` + `BACKEND_PARITY.md` + 文件夹）。
2. `npx playwright test --list` 解析通过，用例数 ≥ 迁移前基线（1174 × 2 project）。
3. `npm run eslint` 对 e2e 无新增告警；新文件全部 ≤300 行。
4. 每个文件夹有 `CASES.md`，87 个存量 spec 每个都被某份 CASES.md 引用。
5. 新增 spec 本地 `--project=wasm` 绿（fixme 除外，逐条列入汇报）。
6. CI 不改：4 片矩阵照旧，advisory 模式照旧。

## 8. 存量超限文件登记（只登记，不在本轮拆）

`wc -l` 口径 >500 行的历史 spec：`worker-workbook.spec.ts`（1484）、
`audit-format.spec.ts`（1036）、`vnext-worker-backend.spec.ts`（527）。
按全局规则属"路过存量超限文件"，各自 CASES.md 登记，拆分另立专项。

## 9. 执行结果（2026-07-29 当日完成）

11 个 agent 全部交付,第 7 节门禁全过:

- 迁移零损耗:`--list` 基线 1180 用例/87 文件 → 收尾 **1522 用例/140 文件**
  (新增 171 用例 × 2 project,53 个新 spec 文件,全部 ≤300 行)。
- 27 份 CASES.md 齐;全部 140 个 spec(含 87 存量)按文件名 stem 都被所属
  CASES.md 引用;工作区改动仅 e2e/ + docs/(87 个 R + 82 个新增文件),未 commit。
- 新增用例本地 `--project=wasm` 实跑:**165 绿 + 6 fixme**(A6 的 16 例另跑了
  `--project=ts` 双确认)。
- 勘误:第 3 节"formula-autocomplete 零覆盖"过时——存量 formula-flow 已有 8 条
  autocomplete 场景;真实缺口(Enter 接受/回绕/键盘取引用)已按 formula/CASES.md 补齐。

**⚠️ 疑似产品 bug(4 项,均 `test.fixme` 钉住,修复后去 fixme 即转绿):**

1. 公式编辑键盘取引用(point mode)不可达——core/grid 两头已实现,但编辑器
   `<input>` 上 `handleGridKeyDown` 对 INPUT target 提前 return 拦断
   (`formula/formula-reference-keyboard.spec.ts`,3 例)。
2. 合并区 active cell 落在被覆盖坐标(C3)而非锚点(B2),公式栏空、方向键按覆盖
   坐标步进(`merge-freeze/merge-selection-editing.spec.ts`)。
3. Replace / Replace All 不可撤销——UI 侧零 history 接线,静态后端已记 delta
   (`find-replace/replace-all-limits.spec.ts`)。
4. 删除被公式引用的 sheet 后,当前 sheet 上引用格持续显示陈旧值,切表触发重投影
   才变 `#REF!`(`sheets/sheet-rename-delete-refs.spec.ts`)。

已知基线问题(非本轮引入):e2e/ 不在 typed-lint 的 tsconfig 覆盖内,eslint 对
全部 e2e spec 同口径跳过;新文件以 prettier 口径核验。

## 10. 风险与回退

- **迁移半途态**：迁移是纯 `git mv` + 一行 import 改写,任一 agent 失败可
  `git checkout -- e2e/` 单独回退其文件夹,不影响其他 agent。
- **新用例引入 flake**：CI 仍是 advisory,不会卡合并;收尾时 flaky 新用例降级
  `test.fixme` 并在 CASES.md 标注。
- **双 project 翻倍成本**：新增用例控制在每文件夹 1–3 个 spec 文件,预计全量
  时长增幅 <15%,4 片 20 分钟上限内有余量(实测单片 ~8 分钟)。
