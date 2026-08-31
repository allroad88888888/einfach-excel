# 021 执行报告：清理现行 src-vnext 残留

四态：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`。

## 实现

- 已关闭 012 的 F-012-1：9 份现行文件中的 15 处 `src-vnext` 物理路径均已改为现役 `solid-excel/src`。
- `excel-core-ts` 架构图的现役层名称同步从 “vnext UI” 改为 “Solid UI”；R1 已将 TS core 数据流、mutation flow 与 adapter 职责清单准确指向 `worker-runtime-ts.ts`，并将该层实际包名统一为 `@einfach/excel-core-ts`。该 runtime 通过 `worker-entry-ts.ts` 安装并持有 `@einfach/excel-core-ts` workbook state；WASM-lite `worker-runtime.ts` 不再被写成 TS runtime。
- 三份仍位于活 `excel-site/docs/mockups/` 的设计稿均已改写，未将其作为 allowlist 例外。

## 验收

1. **通过**：`rg -n 'src-vnext'` 对任务白名单的 9 份产品文件退出 1、零结果。
2. **通过**：逐个 `test -e` 核对改写后的目标：`excel/solid-excel/src`、`src/adapter`、`adapter/worker-runtime-ts.ts`、`adapter/async-custom-pump.ts`、`adapter/worker-workbook-backend.ts`、`adapter/error-display-token.ts`、`adapter/worker-custom-formulas.ts`、`provider/history-dispatch.ts` 与 `adapter/filter-predicate.ts` 全部存在；R1 还核对 `worker-entry-ts.ts` 安装 TS runtime、`runtime-state.ts` 从 `@einfach/excel-core-ts` 创建 workbook，而 `worker-runtime.ts` 是独立 WASM-lite 入口。
3. **通过**：`npm run check:docs` → `✅ 347 份活文档零死链；2832 份文件（含源码注释）无失效路径`。
4. **通过**：`git diff --check` 退出 0、零错误。

## 范围与风险

- 仅修改 021 精确白名单的 9 份产品文件并新增本报告；未改任务定义、index、archive 或其他产品文件，未 commit、未派生 agent。
- 路过但未拆分的存量超限文档/HTML：`excel/excel-core-ts/docs/ARCHITECTURE.md` 322 行、`excel/excel-site/docs/mockups/demo-async-formulas.html` 394 行、`demo-export-roundtrip.html` 393 行、`demo-viewport-projection.html` 344 行、`excel/rust/excel-core/src/CUSTOM_FORMULAS.md` 500 行、`excel/spreadsheet-ui-core/docs/filter-sort.md` 426 行。它们本叶均为必要的单行路径修正；不以压行名义做范围外文档或 HTML 重构。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`；F-012-1 的现行路径残留与三份 mockup 残留均已清零，R1 的 TS/WASM runtime 职责错配已关闭。
