# 023 执行报告：清理已迁移 src 路径残留

四态：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`。

## 实现与职责映射

| 原悬空指向 / 含混职责 | 最终真实位置 |
|---|---|
| 旧 `src-vnext/grid/SpreadsheetGrid.tsx` 所述 clipboard 实现 | `excel/solid-excel/src/grid/grid-clipboard.ts`；`SpreadsheetGrid.tsx` 只 composition/install |
| 旧 `src/Table.tsx` | `excel/solid-excel/legacy/Table.tsx` |
| 旧 `src/demos/Demo{Budget,Grades,Sales}.tsx` | `excel/solid-excel/legacy/demos/Demo{Budget,Grades,Sales}.tsx` |
| 旧 `src/demos/Demo{Million,Large}.tsx` | `excel/solid-excel/legacy/demos/Demo{Million,Large}.tsx` |
| 旧 `src/sheet-store.ts` 及 structural limit precedent | `excel/solid-excel/legacy/sheet-store.ts` |
| 旧 `src/App.tsx` demo 壳 | `excel/solid-excel/demo/App.tsx` |
| 旧 `src/LocaleSwitcher.tsx` | `excel/solid-excel/demo/LocaleSwitcher.tsx` |
| 旧 `src/wasm-workbook-proxy.ts` | `excel/solid-excel/legacy/wasm-workbook-proxy.ts` |
| 旧 `excel/solid-excel/src/styles.css` | `excel/spreadsheet-ui-styles/styles/grid-overlays.css` |
| 旧 `src/wasm-workbook-worker.ts` 的现役入口叙述 | TS bundle 壳 `worker-entry-ts.ts` 委托 `worker-runtime-ts.ts`；canonical WASM-lite 叶入口为 `worker-runtime.ts` |

- CASES ledger 现已明确分层：`demo/` 是演示与导航壳，`legacy/` 是旧 Table/store/demos，`src/` 是 current grid、对话框、demo 组装、provider 与 worker adapter。
- `toolbar-colors.spec.ts` 仅替换一行 `//` 注释路径；断言、执行流程与测试数据均未改动。
- R1 依 `wc -l` 将 i18n/a11y ledger 的 `a11y-surfaces.spec.ts` 行数从 236 刷新为 237；仍小于 300，“无超限债务”结论不变。

## 路径存在性核验

对 9 个产品文件里的所有源码职责引用逐一执行下列命令：

```zsh
target_refs=(
  excel/spreadsheet-ui-core/src/{clipboard,paste-special,selection,viewport}
  excel/spreadsheet-ui-core/src/backend/types.ts
  excel/solid-excel/src/grid/grid-clipboard.ts
  excel/solid-excel/src/{paste-special,i18n,find-replace,format-cells,go-to,named-ranges,demos}
  excel/solid-excel/src/format-cells/format-cells-dialog-focus.ts
  excel/solid-excel/src/provider/SpreadsheetUiProvider.tsx
  excel/solid-excel/src/adapter/{worker-workbook-backend.ts,worker-runtime.ts,worker-runtime-ts.ts,worker-protocol.ts,worker-factory.ts,worker-entry-ts.ts}
  excel/solid-excel/demo/{App.tsx,LocaleSwitcher.tsx}
  excel/solid-excel/legacy/{Table.tsx,sheet-store.ts,wasm-workbook-proxy.ts}
  excel/solid-excel/legacy/demos/{DemoBudget.tsx,DemoGrades.tsx,DemoSales.tsx,DemoMillion.tsx,DemoLarge.tsx}
  excel/spreadsheet-ui-styles/styles/grid-overlays.css
  excel/rust/wasm/src/lib.rs
  excel/rust/excel-core/src/{workbook.rs,auto_fill.rs}
)
for target_ref in "${target_refs[@]}"; do test -e "$target_ref"; done
```

结果：R1 将 composition root 等量替换为真实 clipboard 实现文件，清单仍为 35 项；exit 0，`PATH_EXISTENCE_OK count=35`，零悬空目标。另外通过 `rg --pcre2` 对原 `src-vnext`、旧 Table/App/store/demo/worker/styles 谓词扫描 9 文件，exit 1、零残留。

职责不只核对路径名：`grid-clipboard.ts` 实际定义 `copySelectionToClipboard` / `pasteFromClipboard`，`SpreadsheetGrid.tsx` 只 import 并调用 `installGridClipboard`；`worker-factory.ts` 实际分别 spawn `worker-runtime.ts` 与 `worker-entry-ts.ts`，后者实际 import `worker-runtime-ts.ts`；`worker-runtime.ts` 实际安装 WASM-lite runtime；`grid-overlays.css` 实际含有本断言所述的 `background-color: inherit` 规则；legacy `sheet-store.ts` 实际定义 `STRUCTURAL_SNAPSHOT_MAX = 2000`。

## 六项验收

1. **通过**：上述 35 个源码职责目标逐个 `test -e`，零悬空；旧路径精确扫描零结果。
2. **通过**：R1 复跑 `npm run check:docs` → `352 份活文档零死链；2837 份文件（含源码注释）无失效路径`。
3. **通过**：`npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → exit 0，零诊断。
4. **通过**：`npm run lint:check` → exit 0，零 ESLint error。
5. **通过**：`git diff --check` → exit 0，零 whitespace error。
6. **通过**：`git diff --unified=0 -- excel/solid-excel/e2e/format/toolbar-colors.spec.ts` 仅有一行 `//` 注释路径的删增；`awk` 检查所有变更行均匹配 `^[+-][[:space:]]*//`。

## 范围、行数与风险

- 首执行仅修改 023 白名单的 9 个产品文件并新增本报告；R1 只修改 `clipboard/CASES.md`、`i18n-a11y/CASES.md` 与本报告。未修改任务定义、index 或其他产品文件，未 commit，未派生 agent。
- 9 个修改后产品文件为 18–213 行，全部 `<=300`，均保持原 ledger/spec/常量/入口壳职责。
- 路过存量超限 spec 只登记不重构：`perf-virtual/million-demo.spec.ts` 434 行、`file-import.spec.ts` 315 行；`smoke/vnext-smoke.spec.ts` 403 行、`vnext-real-backend-smoke.spec.ts` 340 行、`regression.spec.ts` 308 行；`worker-backend/worker-workbook.spec.ts` 1484 行、`vnext-worker-backend.spec.ts` 524 行。本叶未改动这些 spec。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`；R1 已关闭 clipboard 实现职责错配与 a11y 行数误差，C-012/C-016 中本叶接管的 9 个迁移后路径残留已清零。
