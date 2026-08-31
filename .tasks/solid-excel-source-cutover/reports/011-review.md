# 011 独立审查：统一现行架构文档术语

## 结论

**REJECTED**

`@einfach/solid-excel` 根入口、`/worker-factory`、`/worker-runtime*` 与 `/styles.css`
的 canonical 路径和 `excel/solid-excel/package.json#exports` 一致，兼容 `/vnext*`
入口也仍按约束保留；但本轮存在白名单越界、必过死链门仍为红、不可运行的 worker
示例，以及把历史快照或已下沉源码机械改写成错误“当前事实”的问题。

## 审查范围与证据

- 基准：`723082739d66140ac697a5a9c203a6fd99649d4a` 到当前工作树。
- 已完整读取：任务树 `index.md`、`011-update-current-docs.md`、`reports/011-report.md`、
  仓库全局文件职责约束、`one-file-one-thing` 与 `task-tree` 技能说明。
- 已对照：`excel/solid-excel/package.json#exports`、ADR 0020、当前 `src/index.ts` /
  `src/public.ts` / `worker-factory.ts`。
- 未重复运行执行者已报告的重型测试。独立执行的轻量核对：任务指定 stale grep
  零命中，`git diff --check` 退出 0；路径存在性扫描、导出符号核对与 AD-311
  所载命令的只读计数见下列问题。
- 历史保护通过：两个 `archive/**` 树、日期化 `*OBSERVATION*` 与既有
  `docs/decisions/0001`–`0019` 均无 tracked diff。`docs/decisions/0020-*` 是任务 009
  新增的当前 ADR，不属于被误改的旧 ADR。
- AD-393 未被冒领完成：`docs/adoption-issues/AD-300-framework-adapters.md:55`
  仍只写“版本协同落地”，没有完成标记。

## 必须修复的问题

### Important — 011 写出了 `files` 白名单

- `excel/spreadsheet-ui-core/src/copy-as/encodeSelectionAsImage.ts:23`
- `excel/spreadsheet-ui-core/src/operations/format/numberFormat.ts:11`

任务只允许 `excel/spreadsheet-ui-core/src/**/README.md`，上述两个 `.ts` 注释不在
allowlist；它们却把 `src-vnext` 改成了 `src`。这也直接反驳执行报告“仅修改 011
白名单”的范围结论。

要求修复：在 011 中还原这两处；若确实需要同步源码注释，由编排者先显式扩展任务
范围或另开有精确 `files` 的叶子，不能以文档横切任务隐式越界。

### Important — 必过的 `check:docs` 仍失败

- `excel/excel-site/docs/SITE_REBUILD_PLAN_2026-08-04.md:193`
  仍链接 `../../solid-excel/src-vnext/adapter/worker-workbook-backend.ts`。
- `excel/spreadsheet-ui-core/docs/frozen-panes.md:135`
  仍链接 `../../solid-excel/src-vnext/adapter/static-backend.ts`。

两条目标均不存在，执行报告也确认 `npm run check:docs` 退出 1。验收标准 1 要求
零死链；“文件在白名单外”只能说明需要编排者裁决，不能把失败门降级为可批准风险。

要求修复：由编排者扩展 011 白名单或新增 discovered 修复叶，把两条链接分别改为
`../../solid-excel/src/adapter/worker-workbook-backend.ts` 与
`../../solid-excel/src/adapter/static-backend.ts`；随后重新取得 `npm run check:docs`
退出 0 的证据。

### Important — canonical worker 示例导入了不存在的导出

- `excel/solid-excel/README.md:75`

示例写成：

```ts
import { createWorker } from '@einfach/solid-excel/worker-factory'
```

`worker-factory.ts` 实际只导出 `defaultVNextWorkbookWorkerFactory` 与
`defaultExcelCoreTsWorkerFactory`，不存在 `createWorker`。子路径名称虽与 exports
一致，但教程不可复制运行，未满足“canonical worker 入口准确”。

要求修复：改用真实导出名并给出与后端接线一致的示例；至少静态核对示例符号确实由
`worker-factory` 导出。

### Important — stale scan 不完整，现行文档仍把不存在的路径写成当前源码

- `docs/BENCHMARK.md:34-35,50` 仍写
  `excel/solid-excel/src/bench/{registry,types}.ts`；现役位置是
  `excel/solid-excel/bench/{registry,types}.ts`。
- `excel/solid-excel/docs/STRUCTURAL_UNDO.md:4,111` 仍把 legacy 实现写成
  `src/sheet-store.ts`、`excel/solid-excel/src/types.ts`；实际是
  `legacy/sheet-store.ts`、`excel/solid-excel/legacy/types.ts`。同文第 8 行已声明
  legacy 位于 `legacy/`，正文因此自相矛盾。
- `docs/FRAMEWORK_EDITING_PORTABILITY_BOUNDARIES.md:22-24` 把三个已下沉模块写成
  不存在的 Solid 路径。真实位置分别是
  `spreadsheet-ui-core/src/projection/editable-source-text.ts`、
  `spreadsheet-ui-core/src/editing/commit-feedback.ts`、
  `spreadsheet-ui-core/src/formula-reference/arrow-pick.ts`；“当前仍位于 Solid
  适配器”的边界结论也已失真。
- `docs/FRAMEWORK_SELECTION_PORTABILITY_BOUNDARIES.md:23` 同样把 arrow-pick 规则
  写到不存在的 `solid-excel/src/grid/grid-formula-reference-keyboard.ts`。
- `docs/interaction-execution/W7-presence-grid-placement.md:59` 把样式改成不存在的
  `solid-excel/src/styles/presence-overlay.css`；当前文件在
  `excel/spreadsheet-ui-styles/styles/presence-overlay.css`。

执行报告的扫描只证明若干字符串零命中，没有验证替换后的路径存在，也没有覆盖
`src/bench`、相对 `src/sheet-store.ts` 等形态；所以“现行源码引用已统一”的结论不完整。

要求修复：逐项改到真实当前路径，并同步修改“职责仍在 Solid”之类已过时的正文判断；
补一份对任务白名单内现行 Markdown 的 cutover 路径存在性扫描结果，而不只搜索旧字符串。

### Important — 历史审计正文被机械改写后变成伪当前证据

- `docs/adoption-issues/AD-100-publish-pipeline.md:68,74` 把固定提交
  `8aadfff` 当时的 `src` / `src-vnext` 发布物改成了重复的 `src` / `src`，既破坏
  历史事实也形成明显病句。
- `docs/interaction-execution/AD-311-solid-coupling-audit.md:5-18` 与
  `docs/interaction-execution/AD-311-solid-coupling-audit-tsx.md:4-6` 把旧审计命令改为
  扫当前 `src`，却保留旧结果“24 TS 文件 / 25 条、99 TSX 文件 / 111 条”和旧 ledger。
  对当前树执行文中同口径命令，实际为 **25 TS 文件 / 26 条、109 TSX 文件 /
  121 条**，因此正文声称的完整清单不成立。

这违反任务“只改现行事实、历史正文保留当时路径”的原则；简单替换目录名不能把旧
实测快照升级成当前实测。

要求修复：AD-100 恢复提交当时的 `src-vnext` 历史事实。AD-311 要么恢复旧路径并明确
它是当时审计快照，要么完整重跑审计、更新计数与 ledger；不能只改命令和标题路径。

### Minor — 路过的存量超限文档未在报告中记账

- `docs/PARITY_BACKLOG_HANDOFF_2026-08-04.md` 当前 384 行，本轮改了 3 个历史路径
  片段，但执行报告未按 `one-file-one-thing` 的“路过存量超限文件”规则指出该债务。

要求修复：本任务不应顺手拆该历史文件；在执行报告中记明其存量超限，且结合上一项
恢复不应机械改写的历史片段。

## 验收项判定

1. `npm run check:docs`：**❌**，执行报告确认仍有 2 条死链。
2. 任务指定的七文件 stale grep：**✅**，独立核对零命中；但不能覆盖上列替换后悬空路径。
3. `git diff --check`：**✅**，独立核对退出 0。
4. `files` 白名单：**❌**，存在两个 UI-core `.ts` 越界。
5. src / legacy 与 canonical npm 入口准确性：**❌**，路径名称总体切换正确，但
   worker 示例、bench/legacy/已下沉模块引用仍不准确。
6. archive / observation / 旧 ADR / AD-393 保护：**✅**，指定历史树与既有 ADR 无误改，
   AD-393 未标完成；但 AD-100 与 AD-311 这两份历史证据另有上列内容失真。

---

## R1 复审结论

**APPROVED**

首审全部 Important / Minor 已闭环；未发现新的阻断项。

### 首审问题复核

1. **白名单越界：✅ 已闭环。**
   `020-close-cross-scope-doc-references.md` 已以精确 `files` 显式接管两个 UI-core
   `.ts` 注释和两份跨范围 Markdown；当前四处 diff 均只做目标路径扶正，范围归属已记入
   index 与 020 报告，不再冒充 011 白名单内改动。
2. **`check:docs`：✅ 已闭环。**
   更新后的 011 与 020 报告均记录同一工作树结果：`340 份活文档零死链；2823 份文件
   （含源码注释）无失效路径`。两条原死链现分别指向存在的
   `src/adapter/worker-workbook-backend.ts` 与 `src/adapter/static-backend.ts`。
   复审未重复运行该已报告验证。
3. **worker 示例：✅ 已闭环。**
   `excel/solid-excel/README.md:75-80` 从根入口导入
   `createWorkerWorkbookSpreadsheetBackend`，从 `/worker-factory` 导入真实导出
   `defaultVNextWorkbookWorkerFactory`，并将 factory 传入 backend；选项类型允许仅提供
   `workerFactory`，示例接线成立。
4. **路径与职责：✅ 已闭环。**
   `docs/BENCHMARK.md` 已改到顶层 `bench/`；`STRUCTURAL_UNDO.md` 已改到
   `legacy/sheet-store.ts` 与 `legacy/types.ts`；两份 portability boundary 已改到 UI-core
   的 editable-source-text、commit-feedback、arrow-pick，并同步声明职责已下沉；W7 已改到
   `spreadsheet-ui-styles/styles/{presence-overlay,index}.css`。
5. **历史正文：✅ 已闭环。**
   AD-100 已恢复到 base；AD-311 恢复 `src-vnext` 审计命令与旧计数，并明确标为
   audit-time snapshot，不再声称是当前树清单；
   `PARITY_BACKLOG_HANDOFF_2026-08-04.md`、
   `REMOTE_RESTART_PLAN_2026-07-28.md`、两个 archive 树、日期化 observation 与既有
   ADR 0001–0019 均无 tracked diff。
6. **存量超限记录：✅ 已闭环。**
   011 R1 报告已记录 384 行日期化历史文档债务，并明确本叶只恢复历史路径、不顺手拆分；
   020 也记录 `numberFormat.ts` 基线与当前均为 338 行且仅接管单行注释。
7. **路径存在性扫描：✅ 已闭环。**
   复审独立从当前 011 范围 diff 提取
   `excel/solid-excel/{src,legacy,bench}/...` 字面路径并逐项 `test -e`，结果
   `missing_count=0`；首审点名的 UI-core 与 styles 目标也全部存在。

### R1 验收判定

- 任务指定 stale grep：报告为零命中；当前七个 canonical 文档未见旧入口残留。
- `git diff --check`：011 R1 报告为退出 0。
- canonical root / worker / runtime / styles：继续与 package exports 一致；兼容
  `/vnext*` 仅保留在 exports 与允许的历史正文。
- AD-393：仍未标记完成。

R1 最终结论：**APPROVED**。
