# 023 独立审查

## 结论

**REJECTED**

## Findings

### Important — clipboard ledger 仍把具体实现职责指向 composition root

`excel/solid-excel/e2e/clipboard/CASES.md:5` 声称
`src/grid/SpreadsheetGrid.tsx` 承载 `copySelectionToClipboard` /
`pasteFromClipboard`。该路径确实存在，但文件是 grid 的薄 composition root：
`excel/solid-excel/src/grid/SpreadsheetGrid.tsx:16,98` 只引入并调用
`installGridClipboard`。两个被点名的函数实际仅位于
`excel/solid-excel/src/grid/grid-clipboard.ts:82,170`。

因此 `023-report.md:30,45,51` 的 35 路径 `test -e` 只证明了实体存在，
不能证明职责映射正确；`023-report.md:64` 所述本叶路径残留已清零也尚不成立。
应将 ledger 的该职责路径改为 `src/grid/grid-clipboard.ts`，并同步更正
023 报告的目标清单与验收结论。首审 Important 中 clipboard 这一条已从
悬空的 `src-vnext` 路径改到真实目录，但未完成任务要求的“路径与职责同时准确”，
故首审 Important 未完全关闭。

### Minor — i18n/a11y ledger 的非超限行数少记 1 行

`excel/solid-excel/e2e/i18n-a11y/CASES.md:7` 记录
`a11y-surfaces.spec.ts` 为 236 行；按 `wc -l` 物理行口径，最终文件是 237 行。
仍小于 300 行上限，不改变“无超限债务”结论，但精确数字应刷新。

## 复核证据

- 023 工作树增量仅落在任务白名单的 9 个产品文件；
  `toolbar-colors.spec.ts` 唯一变更是一行 `//` 注释，断言与执行逻辑未变。
- 报告列出的 35 个目标均有实体；除上述 clipboard 职责错配外，
  demo/current/legacy 分层及其他职责指向未见错误。
- `grid-overlays.css:83-89` 确实定义 `.cell-display` 链路依赖的
  `background-color: inherit`；toolbar 注释路径正确。
- `legacy/sheet-store.ts:290` 确实定义
  `STRUCTURAL_SNAPSHOT_MAX = 2000`；`limits.ts` 的 legacy precedent 路径正确。
- `worker-factory.ts` 分别 spawn `worker-runtime.ts` 与 `worker-entry-ts.ts`；
  后者 import `worker-runtime-ts.ts`，前者安装 WASM-lite runtime。worker entry 叙述正确。
- 9 个产品文件分别为 62、37、33、59、42、51、213、178、18 行，
  均 `<=300`，且仍保持原 ledger/spec/常量/入口壳职责。
- 已登记的超限历史 spec 最终行数为 434、315、403、340、308、1484、524，
  与 023 报告及相应 CASES 记录一致；本叶未修改这些文件，符合存量债务处理口径。
- 轻量复核 `git diff --check -- <9 files>` 通过。未重复执行报告中的
  docs/typecheck/lint 重型验证。

## R1 复审

**APPROVED**

未发现新的 Critical、Important 或 Minor。首审两项 finding 均已关闭：

- `excel/solid-excel/e2e/clipboard/CASES.md:5-6` 现将
  `copySelectionToClipboard` / `pasteFromClipboard` 精确指向
  `src/grid/grid-clipboard.ts`，并明示 `SpreadsheetGrid.tsx` 只负责
  composition/install。实际源码中两函数仅位于
  `grid-clipboard.ts:82,170`；`SpreadsheetGrid.tsx:16,43,98` 分别是 import、
  薄 composition root 说明与 `installGridClipboard(runtime)` 调用。
- `excel/solid-excel/e2e/i18n-a11y/CASES.md:7` 已记为 237 行，
  与 `wc -l excel/solid-excel/e2e/i18n-a11y/a11y-surfaces.spec.ts` 一致，
  仍无超限债务。

R1 同步更新了 `023-report.md` 的职责映射、35 项目标清单与验收结论。
独立轻量复核确认：数组仍为 35 项且零缺失；9 个产品文件为
18–213 行；旧 `src-vnext` 与本叶目标的旧 Table/App/store/demo/worker/styles
路径扫描为零；toolbar 仍只改 `//` 注释；limits precedent、
TS/WASM worker entry 叙述及已登记的历史超限债务无回归。
`git diff --check -- <R1 files>` 通过。未重复报告中的重型验证。
