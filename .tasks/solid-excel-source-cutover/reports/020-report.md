# 020 执行报告：收口跨范围文档引用

四态：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`。

## 实现

- 裁决后，日期化计划保留历史叙事，但将可点击的 worker backend 源码链接改为真实的 `../../solid-excel/src/adapter/worker-workbook-backend.ts`；无效的 stale-path marker 已移除。
- 现行 `excel/spreadsheet-ui-core/docs/frozen-panes.md` 的 static backend 链接已改为真实的 `../../solid-excel/src/adapter/static-backend.ts`。
- 显式接管 011 越界但意图正确的两处 UI-core 源码注释：`src/copy-as/encodeSelectionAsImage.ts` 指向 `solid-excel/src/copy-as/renderRangeAsImage.ts`，`src/operations/format/numberFormat.ts` 指向 `solid-excel/src/adapter/static-backend.ts`；两个目标均已核对存在。

## 验收

1. **通过**：`npm run check:docs` → `✅ 340 份活文档零死链；2823 份文件（含源码注释）无失效路径`。
2. **通过**：`rg -n 'src-vnext' excel/spreadsheet-ui-core/docs/frozen-panes.md excel/spreadsheet-ui-core/src/copy-as/encodeSelectionAsImage.ts excel/spreadsheet-ui-core/src/operations/format/numberFormat.ts` 零结果。
3. **通过**：`rg -n 'src-vnext' excel/excel-site/docs/SITE_REBUILD_PLAN_2026-08-04.md` 零结果。
4. **通过**：`git diff --check` 零错误。
5. **通过**：`test -f excel/solid-excel/src/adapter/worker-workbook-backend.ts && test -f excel/solid-excel/src/adapter/static-backend.ts && test -f excel/solid-excel/src/copy-as/renderRangeAsImage.ts`；三个现行目标均存在。

## 范围与风险

- 仅修改 020 `files` 白名单中的两份 Markdown，接管白名单中的两处既有 `.ts` 注释改动，并新增本报告；未改任务定义或 index，未 commit。
- `numberFormat.ts` 基线与当前均为 338 行，超过普通文件 300 行上限；本叶仅接管已有单行注释路径修正，未作范围外重构。
- 父任务裁决：日期化计划不是 observation/archive/旧 ADR；保留其历史叙事，但可点击的源码链接必须使用现行、可验证的 `src` 路径，且不使用无法豁免死链的 stale marker。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`；四项任务验收及目标路径存在性核对均通过。
