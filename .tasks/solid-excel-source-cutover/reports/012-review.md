# 012 最终独立审查

## 结论

**REJECTED**

## Findings

### Important — C-016 的 stale-path 审计只覆盖 `src-vnext`，现行测试说明与源码注释仍指向已消失的旧 `src` 路径

`012-report.md` 中 `git grep 'src-vnext'` 的 47 文件分类和 `unexpected=0` 本身可复核，但该谓词无法发现“旧实现已从 `src` 迁入 `legacy`”与“demo 壳已从 `src` 迁出”后的悬空路径。当前工作树仍有以下现行文件与不存在目标的对应关系：

- `excel/solid-excel/e2e/clipboard/CASES.md:6`：`src/Table.tsx`，实际已在 `legacy/Table.tsx`。
- `excel/solid-excel/e2e/demos/CASES.md:3-4`：`src/demos/Demo{Budget,Grades,Sales}.tsx`、`src/Table.tsx`、`src/sheet-store.ts`，实际均已在 `legacy/`。
- `excel/solid-excel/e2e/i18n-a11y/CASES.md:3`：`src/LocaleSwitcher.tsx`，实际已在 `demo/LocaleSwitcher.tsx`。
- `excel/solid-excel/e2e/perf-virtual/CASES.md:3-4`：把旧 Table、`DemoMillion.tsx`、`DemoLarge.tsx` 与 `sheet-store.ts` 仍归在 `src/`，实际已在 `legacy/`。
- `excel/solid-excel/e2e/smoke/CASES.md:3`：`src/App.tsx`、`src/Table.tsx`、`src/sheet-store.ts` 均已消失；对应职责现在分属 `demo/App.tsx` 与 `legacy/`。
- `excel/solid-excel/e2e/worker-backend/CASES.md:6`：`excel/solid-excel/src/wasm-workbook-proxy.ts`，实际已在 `legacy/wasm-workbook-proxy.ts`。
- `excel/solid-excel/e2e/format/toolbar-colors.spec.ts:111`：`excel/solid-excel/src/styles.css` 不存在；该断言所述 `.cell-display` 规则实际在 `excel/spreadsheet-ui-styles/styles/grid-overlays.css:83-89`。
- `excel/solid-excel/src/adapter/worker/limits.ts:60`：`excel/solid-excel/src/sheet-store.ts` 不存在，注释明示说的 legacy precedent 已在 `legacy/sheet-store.ts`。
- `excel/solid-excel/src/adapter/worker-entry-ts.ts:10`：`src/wasm-workbook-worker.ts` 不存在；现役 WASM worker 叶入口是同目录的 `worker-runtime.ts`，旧壳文件已在 `legacy/`。

这些是当前 E2E case ledger、当前 spec 和当前 `src` 中的路径，不属于 archive、日期化 observation 或旧 ADR allowlist。因此 `012-report.md` 对 C-016 的证据只证明了“无未许可 `src-vnext`”，不能支持“现行引用全部准确”或整树可关闭。应先将上述现行路径扶正，再用同时覆盖 `src-vnext` 与已迁移旧 `src` 路径的精确扫描重审 C-016/012。

未发现 Critical。其余已登记的 Minor、legacy/存量超限债务与历史 allowlist 不构成本次拒绝理由。

## R2 复审

**APPROVED**

首审 Important 已完整关闭，未发现新的 Critical 或 Important：

- 独立复跑 012 R2 的 PCRE 谓词，它同时覆盖 `src-vnext` 与首审点名的旧 `src/{App,Table,sheet-store,demos,LocaleSwitcher,styles,wasm-worker/proxy}` 形态；对 023 的 9 个现行文件扫描为 exit 1、零匹配。该谓词可直接复制执行，不再用单一 `src-vnext` 搜索代替旧 `src` 迁移审计。
- 023 列出的 35 个新目标独立核对为 `count=35 missing=0`。职责定向也与实体一致：clipboard 函数定义在 `grid-clipboard.ts:82,170`，`SpreadsheetGrid.tsx` 只 import/install；factory 分别 spawn WASM `worker-runtime.ts` 与 TS `worker-entry-ts.ts`，后者委派 `worker-runtime-ts.ts`；CSS inherit 规则与 legacy 2000-cell precedent 均在报告所指目标内。
- clipboard R1 语义修正准确：`e2e/clipboard/CASES.md:5-6` 现明示实现属于 `grid-clipboard.ts`，composition/install 属于 `SpreadsheetGrid.tsx`，不再以“路径存在”冒充“职责正确”。
- 9 文件最终改动只是 CASES ledger 与注释扶正；`toolbar-colors.spec.ts` 仅一行 `//` 目标变更，没有断言、执行流程、常量或 worker 入口接线变化。文件当前均为 18–213 行，无新超限或职责混合。
- 因此 C-012 的测试/深层引用路径与 C-016 的现行文档路径已可关闭。023 未触及 package manifest、barrel、Rollup 或运行时逻辑；静态复核仍为 export target 零缺失、四组 canonical/compat worker alias 完全相等。R2 报告已重跑 docs/tsc/lint/diff 轻量门，复用 R1 的 build、E2E、pack、site/starter 重型证据合理。

### Minor（非阻断）

- `012-report.md` 的 C-018 仍复用 `553 文件 / 55665 行`，并称 023 的两个 `src` 注释是等行替换。当前独立 `wc -l` 结果是 **553 文件 / 55666 行**；`worker-entry-ts.ts` 的注释由 17 行增至 18 行，`limits.ts` 仍为 178 行。这一行证据误差不改变 C-018：超过 300 行的仍只有原登记的三个复杂例外与两个 i18n 资源。

R2 最终裁决：C-001～C-018 无未关闭的 Critical/Important；012 与整棵 `solid-excel-source-cutover` 任务树可关闭。
