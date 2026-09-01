<!-- doc-check: allow-stale-paths -->
# React Excel · Univer parity 任务树终审

结论：**NEEDS_CHANGES**

审查日期：2026-09-01  
审查范围：`index.md`、`stages.md`、全部 58 个叶子，以及指定架构文档和当前
`spreadsheet-ui-core` / `react-excel` / 相关 Solid 参考实现。只审查，未修改任务树、阶段或产品代码。

## 已确认成立的基础事实

- 叶子数恰为 58；旧总账 #01–#41 在 `index.md:39-81` 均有编号映射，当前 UI-core 的顶层
  feature modules 也都能在树里找到粗粒度归属。
- 声明的依赖图无环、没有不存在的 task id，也没有依赖更晚阶段的边。
- 20 个阶段每阶段均含 2–4 个 Issue；全部叶子的 `title/model/status/priority/stage/base` 与状态表、
  阶段表一致，当前均为 `pending`、`base: null`，符合 `index.md:253-258`。
- 阶段门在文档语义上明确：`index.md:12-14` 与 `stages.md:5-12` 都要求当前阶段经用户
  `accepted` 后才允许下一阶段，因而编排者严格执行账本时会阻止跨阶段预取。
- 图表、插入图片、形状和浮动对象不属于旧 41 项；当前 UI-core barrel
  `excel/spreadsheet-ui-core/src/index.ts:1-58` 也没有相应 canonical module。将它们留在范围外、
  同时保留 Copy As PNG，和 `index.md:30-35` 的裁决一致，范围判断合理。

## Critical

### C1. 没有一条可执行的真实 WASM/demo backend 接线，S02 以后大多数能力只能被隐藏

证据：当前 demo 的三个 required 方法全部直接抛错（`excel/react-excel/demo/App.tsx:22-30`）。
002 明确只交付 required 三端口、不扩展可选能力（`002-real-workbook-host.md:28-43`）；710 却要求
“demo 真实 WASM backend”完成读写刷新（`710-backend-capability-wasm-contract.md:41-44`），但它的
`files` 只有 provider capability、测试和一份 E2E（同文件 `:15-18`），不能修改 demo backend、
`App.tsx` 或 `package.json`。React 包当前依赖也只有 core/UI-core（
`excel/react-excel/package.json:20-44`）。现有 WASM worker factory 的正式入口位于 Solid 包子路径，
架构明确要求宿主从该子路径消费（`docs/ARCHITECTURE.md:109-123`）。

影响：sheet 生命周期、history、格式、结构、筛选、Table、导入导出等可选能力在默认 demo 中均会
fail-closed；这虽不造假，却使 `stages.md:29-44` 的人工成功路径不可验，整棵树无法按阶段验收。

修订：在 S00/S01 新增并前置一个“真实运行时组装”叶子，明确拥有
`react-excel/package.json`、demo backend、`App.tsx`、worker lifecycle 与 WASM E2E。要么把
`@einfach/solid-excel/worker-factory` 作为仅 demo 的无 Solid-runtime 子路径依赖并做 bundle 边界测试，
要么先抽出 framework-neutral backend adapter 包。随后把需要 supported-path 验收的叶子依赖到它；
required-only 内存 backend 只能保留为降级 fixture。

### C2. 产品组装与公开导出没有 owner，许多“完成”的组件既挂不上 demo 也无法被包消费者导入

证据：当前 demo 只在 `App.tsx:61-72` 组装 header/ribbon/formula bar/grid/footer，package 根导出只在
`excel/react-excel/src/index.ts:1-53`。只有 001 的 `files` 包含 `src/index.ts`
（`001-freeze-react-product-boundary.md:15-19`），而 004 承诺多个“命名导出”却没有该文件
（`004-univer-design-primitives.md:15-20,38-43`）。S02 的 106/108/109 分别只拥有 feature 目录和
测试（`106-selection-namebox-go-to.md:15-19`、`108-cell-editing-ime.md:15-19`、
`109-keyboard-context-menu.md:15-19`），都不能修改 `DemoGrid.tsx`、`FormulaBar.tsx` 或 `App.tsx`；
但 S02 立即要求用户定位、直接编辑和右键菜单（`stages.md:29`）。相同问题贯穿后续 dialog、overlay、
presence、protection、revision 和 mobile 叶子。

影响：单测可证明孤立组件存在，却不能证明入口、焦点链、网格 overlay 和 demo 主路径可达；这正违反
归档完成定义“默认 UI 可进入”的要求（`excel/solid-excel/docs/archive/online-excel-parity/README.md:1299-1311`）。

修订：为每个阶段增加一个串行的 composition 叶子，独占该阶段需要的 `App/DemoGrid/Ribbon/Footer`
等汇聚文件；或把精确汇聚文件划进相应功能叶子并用依赖串行化。另设 package-surface 叶子在所有
公共组件稳定后更新 `src/index.ts` 与 `package.json#exports`，并以真实 package import 验收。

### C3. 多个旧总账能力被写成“只做 React presentation”，但所需 canonical 合同在当前仓库并不存在

证据与影响：

- #23：307 声称“完整”边框/旋转投影（`307-complete-format-projection.md:23-45`），当前合同只有
  top/right/bottom/left 四边（`excel/spreadsheet-ui-core/src/backend/types.ts:340-356`），没有 diagonal，
  也没有相邻 shared-edge 的 owner/write-order/tie 合同；归档仍把这些列为明确缺口
  （`excel/solid-excel/docs/archive/online-excel-parity/README.md:116-118`）。React projector 无法自行裁决。
- #24：401 的 `files` 只有 React（`401-formula-parser-reference-presentation.md:15-18`），却验收 R1C1、
  named reference（同文件 `:33-45`）。当前 UI-core parser 的 token regex 只识别 A1/A1:B2/带 sheet 的
  A1（`excel/spreadsheet-ui-core/src/formula-reference/parser.ts:41-47`），解析结果也只来自这条 regex
  （同文件 `:62-109`）。
- #32：504 要求 resize、列管理、筛选、样式、totals 和 structured reference
  （`504-excel-table-lifecycle.md:23-44`），但 canonical descriptor 只有 name/range/headers/totals/columns
  （`excel/spreadsheet-ui-core/src/tables/types.ts:14-31`），controller port 只有 CRUD、列改名和 totals
  （同文件 `:220-228`）；UI-core README 还明确记录 UI 与 undo 缺口
  （`excel/spreadsheet-ui-core/src/tables/README.md:80-93`）。
- #39：canonical 口径要求 Sheet Views 是 UI-core 视图事实
  （`excel/solid-excel/docs/CANONICAL_OWNERSHIP.md:114`），但 UI-core barrel 没有 sheet-views module
  （`excel/spreadsheet-ui-core/src/index.ts:1-58`），607 却只允许改 React 目录
  （`607-sheet-views.md:15-17,28-39`）。

修订：在 React 叶之前增加 UI-core/backend contract 叶子并给出精确类型、能力门和 adapter 证据。
若不准备补 canonical 合同，就必须收窄目标、在覆盖矩阵标为明确 gap，且不能宣称 #23/#24/#32/#39
完整覆盖。

### C4. workspace、文件、打印和重算叶子消费了不存在的端口/状态，现有 `files` 也不足以创建完整闭环

证据：704 声称消费 backend lifecycle/recovery descriptor（`704-workspace-recovery-stale-guard.md:34-43`），
但当前 workspace module 只拥有 active sheet 与 projection revision，且不直接读 backend
（`excel/spreadsheet-ui-core/src/workspace/README.md:3-18`）。701/702 消费未给签名的 workbook replacement、
XLS/XLSX import/export port（`701-import-workbook-and-text.md:23-44`、
`702-export-workbook-and-text.md:22-43`）；当前 backend 只有 cell/chunk import 与 range TSV/image export
（`excel/spreadsheet-ui-core/src/backend/types.ts:1091-1121`），没有 workbook file codec。703 声称现有 print
projection 提供完整页模型（`703-page-setup-print-preview.md:24-39`），实际 print module 仅有 per-sheet config
和 dialog session（`excel/spreadsheet-ui-core/src/print/README.md:3-23`）。405 需要 manual/auto recalc/cancel
（`405-recalc-async-formula-errors.md:23-45`），完整 `SpreadsheetBackend` 接口到
`excel/spreadsheet-ui-core/src/backend/types.ts:1304` 没有 recalc port。

影响：实现 agent 只能在 React 自建第二份产品状态/算法、偷偷扩文件范围，或交 mock/no-op；三种都违反
全局约束。

修订：拆成“canonical/host port 合同 → adapter/真实 fixture → React UI”三层叶子。先冻结 workbook
lifecycle、file codec、pagination model、calculation status/command 的精确请求/结果/取消/identity 合同，
把所需 UI-core/backend/package files 列入范围，再安排 React 表面。

### C5. 外部服务能力没有真实集成或可验收环境，却被阶段表当作完整成功路径

证据：index 已承认 connector、Show Changes、Version History 需要宿主服务
（`index.md:247-250`）。505 不实现网络/凭据存储（`505-external-data-connectors.md:23-31`）；601 的 durable
comments 依赖未定义的宿主 port（`601-comment-threads.md:29-40`）；602 再消费 identity/notification ports
（`602-notes-tasks-notifications.md:29-39`）；605/606 只消费 durable revision service 而不实现存储
（`605-show-changes.md:23-39`、`606-version-history.md:23-38`）。但 S13/S16/S17 要用户实际新增批注、看协作者、
恢复版本和刷新连接（`stages.md:40-44`），711 又明确禁止用 mock happy path 判完成
（`711-feature-coverage-audit.md:39-42`）。

影响：无服务时入口应隐藏，用户没有成功路径；用 fake service 又过不了终审。阶段没有可达到的 accepted
定义。

修订：对每项明确二选一：提供用户/仓库已有的真实 service adapter 与集成环境；或把交付定义改为
“port contract + unsupported/fail-closed verified”，supported path 标 `externally_unverified`，不得进入完整
parity/RC 结论。mock 只可用于组件契约测试，不能作为产品完成证据。

### C6. 跨 agent 的消费/产出不是可执行签名，独立叶子会被迫猜接口

证据：002 的 `seed`、projection bridge 没有类型（`002-real-workbook-host.md:38-43`）；003 只给类型名不
给 props/result（`003-visible-window-grid.md:38-43`）；004 只列组件名（
`004-univer-design-primitives.md:38-43`）。外部端口更严重：505 的 list/refresh/cancel/status、602 的
identity/notification、605/606 的 revision、701/702 的 import/export 都没有完整 request/result/error/
cancel 签名。与此同时任务树工作方式要求下游只能靠文档对齐，不能依赖相邻 agent 的隐含设计。

影响：即使文件不冲突，组件 props、capability key、ticket/revision 语义也会漂移；后续集成叶只能大改
前序产物，10–20 分钟与独立否决都失真。

修订：所有跨叶接口必须给 TypeScript 签名（props、request/result discriminated union、capability key、
error/cancel/stale 语义）及唯一 owner；下游逐字写“消费 task N 的 `Foo` 签名”。共享设计原语和 host
service ports 尤其需要先冻结。

## Important

### I1. 两组 dependency-ready 任务会真实写同一文件面

- S01：005 拥有 `e2e/**`（`005-browser-acceptance-harness.md:15-18`），710 同时拥有其子文件
  `e2e/wasm-backend.spec.ts`（`710-backend-capability-wasm-contract.md:15-18`）；003 完成后两者可并发。
- S05：102 拥有 `src/grid/**`（`102-row-column-structure.md:15-18`），103/105 分别拥有其
  `resize/**`、`headers/**`、`freeze/**` 子树（`103-row-column-sizing-hidden.md:15-18`、
  `105-freeze-panes.md:15-18`）；三者同为独立 ready。

修订：缩窄 102/005 到精确文件，或添加依赖并声明集成 owner。S07 的 302→303、S13 的 601→602 虽有
路径包含关系，但依赖已串行，不构成当前并发冲突。

### I2. 图虽无环/无未来依赖，但存在明确的缺失消费依赖

证据：701 消费 704 的 workspace loading state，却仅依赖 002/004（
`701-import-workbook-and-text.md:6,35-39`）；702 的验收要重新导入产物，却不依赖 701
（`702-export-workbook-and-text.md:6,40-43`）；606 明说 ACK 后由 704 rehydrate，却只依赖 605
（`606-version-history.md:6,40-43`）；605 用 Go To 定位却不依赖 106
（`605-show-changes.md:6,28-38`）；707 消费 selection/editing/mobile breakpoint，却只依赖 003/004
（`707-mobile-touch-workspace.md:6,35-39`）；709 验收 mobile 与 export，却和 707 同阶段并行且不依赖 702/707
（`709-accessibility-gate.md:6,32-44`）。

修订：补直接依赖或把跨功能验证移入 711/712。阶段串行可以保证“此前阶段已完成”，但不能修复同阶段
消费，也不能替代任务文档所承诺的接口依赖。

### I3. “每批 2–4 个用户可验功能”只在 Issue 数量上成立

证据：S00 含产品边界文档，S01 的 005/710 是测试架与契约，用户实际只看到网格；S19 的 711/712
都是审计门（`stages.md:27-28,45-46`）。另 704 的 loading/error/recovery 是打开真实工作簿的基础 P0
路径，却被放到 P2/S14（`704-workspace-recovery-stale-guard.md:13-14,22-43`）；Find/Replace 直到 S12，
晚于自定义公式和 Table（`stages.md:37-39`）。

修订：把 S00/S01 定义为明确的 infrastructure milestone，不声称 2–4 个用户功能；把 workspace boundary
前移到 P0。将 Find/Replace 提前到核心编辑阶段，或记录为何复杂公式/Table 比它优先的用户价值裁决。

### I4. 多个叶子显著超过 10–20 分钟且混合职责

代表性证据：004 同时交付五类交互原语与 token（`004-univer-design-primitives.md:24-43`）；202 同时做
copy/cut/paste 与 TSV/HTML/PNG（`202-clipboard-copy-as.md:23-41`）；302 是五页签完整格式会话
（`302-format-cells-dialog.md:22-43`）；305 同时做多类规则、管理器和 grid layer
（`305-conditional-formatting.md:23-45`）；504 是完整 Table 产品线；703 是完整 page setup/pagination/print；
705 同时是七菜单和反馈/诊断系统；706 同时是主题、i18n、RTL、responsive；709 是全产品 a11y；711 要在
15–20 分钟审 41+27 项（`711-feature-coverage-audit.md:21-42`）；712 要跑全 browser/build/type/test 主链
（`712-release-candidate-acceptance.md:23-44`）。

影响：违反任务树的粒度、单一职责和独立验收标准；`one-file-one-thing` 的一句话测试也无法通过 705/706
等目标。未发现需要再合并的明显过小叶，主要问题是过大。

修订：按可独立验收的业务点拆，不按文件机械切。至少拆 design overlay primitives、clipboard 与 Copy As、
Format Cells tabs、CF editor/projection、Table lifecycle、print config/pagination/browser print、menu registry/
feedback、theme/i18n/responsive，以及 audit 与执行门。

### I5. 横切覆盖矩阵不足以支撑 i18n/a11y/responsive 的完成门

证据：矩阵把 theme/i18n 压成 C-023、a11y/browser 压成 C-025（`index.md:108-113`）；706/709 只列
概括性 surface（`706-theme-i18n-responsive-chrome.md:32-45`、`709-accessibility-gate.md:32-44`）。706 的
`files` 不含任何既有业务组件，709 的 `files` 也不含 toolbar/menu/dialog 等实现文件，因此发现硬编码或
焦点 bug 时无权修复。

修订：从所有路由/菜单/toolbar/dialog/empty/loading/error/mobile surface 展开逐行矩阵，列 owner、locale、
keyboard、focus、reduced-motion、viewport 证据。709 应为只报告的覆盖审计；实际修复开 discovered leaf，
或预先给各领域叶子分配自己的横切矩阵行。

### I6. 覆盖矩阵的“精确路径/归属”与叶子并不一致

证据：C-013 写 `src/dialogs/**`，实际 205/206/207 分别是 `text-to-columns/**`、`find-replace/**`、
`history/**`；C-015 写 `src/rules/**`，实际是 `conditional-formatting/**` 与 `data-validation/**`；C-018
写 `src/data/**`，实际是 `filter-sort/**`/`remove-duplicates/**`（`index.md:99-105`）。C-021 的入口漏掉
607 的 `sheet-views/**`；C-023 漏 i18n/responsive 路径。任务覆盖声明也有反向遗漏：005 声称 C-025、710
声称 C-001、712 声称 C-027，但矩阵 owner 分别没列 005/710/712（`index.md:87,111-113` 对照
`005-browser-acceptance-harness.md:33-40`、`710-backend-capability-wasm-contract.md:32-39`、
`712-release-candidate-acceptance.md:32-39`）。

修订：使用实际计划路径逐行重写；owner 列必须与每个叶子的“覆盖矩阵行”双向一致。

### I7. fail-closed 总则没有表达 UI-core canonical 例外，自定义公式还存在现成的 core-only 假成功风险

证据：index 对“所有可选 backend 能力”一概要求隐藏/禁用（`index.md:18-21`），710 也把 required 三
端口之外概括为 capability-driven（`710-backend-capability-wasm-contract.md:29-39`）。但 protection 明确是
UI-core canonical，backend ports 只是持久化 hook；端口全缺仍保留完整功能
（`excel/spreadsheet-ui-core/src/protection/README.md:3-10`）。反方向，自定义公式当前在 backend ports 缺失时
允许 registry core-only accepted change、跳过 worker 调用
（`excel/spreadsheet-ui-core/src/custom-formulas/README.md:60-66`），403 的验收没有 unsupported 零注册断言
（`403-custom-formulas.md:35-44`）。

修订：能力矩阵按 canonical 类别分四种：engine-required optional、UI-core canonical + optional persistence、
adapter overlay、external service。对 403 明确要求无 register/unregister 双端口时 hook 不发布“已注册”产品
状态，并测试零 backend side effect；不得套用现有 core-only accepted 语义冒充可计算公式。

### I8. 最终浏览器/命令验收没有被任何叶子完整配置

证据：当前 Playwright 只扫描 `e2e/adapter-selection`、单一 Desktop Chrome
（`excel/react-excel/playwright.config.ts:34-59`）；005 只承诺 desktop/mobile，没有 WebKit
（`005-browser-acceptance-harness.md:21-45`）。712 要 Chromium/WebKit × desktop/390px
（`712-release-candidate-acceptance.md:23-43`），但其 `files` 不含 Playwright config 或 package scripts
（同文件 `:15-18`）。包脚本也只有 demo build/typecheck/e2e，没有 unit/build/typecheck 总命令，WebKit 安装
脚本仍只装 Chromium（`excel/react-excel/package.json:27-44`）。

修订：让 005 一次冻结最终 project matrix、testDir、artifact policy 和 install command，或给 712 配置文件
所有权；在 index 写出 RC 的精确可复制命令，不用“package build/typecheck/unit/e2e 全部通过”代替。

### I9. #10–#12 仍只覆盖标签，不闭合归档明确记录的语义缺口

证据：归档总账指出 #10 cut 仍立即清源、#11 仍缺 comments/column-widths、#12 仍缺
Worker/date/weekday/month/custom/formula 系列（`excel/solid-excel/docs/archive/online-excel-parity/README.md:104-107`）。
202 的验收没有 cut 时机与 undo（`202-clipboard-copy-as.md:43-46`）；203 的选项没有 column widths/comments
（`203-paste-special.md:22-44`）；204 还明确“首期只声称 backend 已支持的序列类型”
（`204-auto-fill-series.md:29-45`），树内没有后续叶子补齐。

修订：把这些剩余语义写入现叶验收或新增后继叶，并让 711 按归档 gap 逐条核证；否则总账映射必须标
`partial`，不能在 RC 报告中视为 #10–#12 完成。

## Minor

### M1. 102 写错了现有 command 名称

102 消费 `runStructuralCommand`（`102-row-column-structure.md:36-40`），真实导出是
`runStructuralCommandAtom`（`excel/spreadsheet-ui-core/src/structural-commands/index.ts:1-10`）。

修订：改成真实符号并给 `RunStructuralCommandInput/Outcome` 精确签名。

### M2. “所有新增组件文件 wc -l”不是可复制验收命令

004 的第二条验收只写“所有新增组件文件 `wc -l`”（`004-univer-design-primitives.md:45-48`），没有确定
文件集，执行 agent 可以漏检非 component helper/test。全局 300/500 规则虽正确，仍需机械命令。

修订：列出该叶预期新文件，或用受控 `find ... -type f` + `wc -l` 并明确 locale/fixture 等例外；reviewer
同时检查一句话职责，不只查行数。

## 放行前最低修订顺序

1. 先修 C1/C2：冻结真实 WASM runtime 组装、demo composition 与 package export owner。
2. 再修 C3/C4/C5/C6：为缺失 canonical/host/service 能力建前置合同叶，给精确 TypeScript 签名和真实验收层级。
3. 重算 DAG、并发 files 与阶段内容，前移 workspace P0，消除 S01/S05 冲突和同阶段缺失依赖。
4. 按职责拆过大叶，展开 i18n/a11y/responsive 覆盖矩阵，再同步 index/stages/status 元数据。
5. 最后重新跑静态图校验，并由独立 reviewer 复核 #01–#41 的“归档缺口 → 任务验收”逐条闭合关系。

在上述 Critical 未修前，不应开始 S00；否则早期 demo 可能看起来有 chrome/网格，但后续阶段会系统性地
落入“入口隐藏、孤立组件、mock happy path 或 React 自建事实”的死路。
