# UI Core 开发约定

`@einfach/spreadsheet-ui-core` 的硬约束、准入检查与测试门禁。

这些规则从 `AGENT_COLLABORATION.md` 抽出 —— 那份文档的多 agent 看板部分已随协作战役收尾归档，
但下面这些工程约束仍然生效。

## 包边界（硬约束）

- **必须保持框架无关**：不能依赖 Solid、React、DOM、worker、wasm、`navigator`、`window`。
  由 `test/package-boundary.test.ts` 拦截。
- **状态只能用 einfach atom/store**。不引入 Redux、Zustand、Jotai、MobX 等外部状态系统。
- **不允许 per-cell / per-row / per-column atom**。大表能力必须以可视窗口、有上限的缓存或
  backend port 为边界；每个有界缓存要在自己的 feature README 里声明上限。
- 每个 atom 设 `debugLabel = 'spreadsheet.<feature>.<name>'`（如 `'spreadsheet.findReplace.cursor'`）。
- atom 在各 feature 的 `README.md` 里分类为 **source** / **derived** / **command**。
- 工作簿事实（单元格值、公式、隐藏行、筛选规则）归引擎，UI 侧只持 backend ACK 后才写的投影缓存
  —— 判据见 [ADR 0003](../../../docs/decisions/0003-engine-owns-filter-sort.md)。

## 实现准入

从设计进入代码前确认：

- 是否需要扩展 `DisplayCell`、`SpreadsheetBackend`、keyboard intent、toolbar command、
  menu command 或 projection result。
- 是否保持可视窗口有界，不读取整张 sheet。
- 是否有明确 fallback：backend 不实现 optional port 时，UI core 如何隐藏或降级该入口。
- 是否影响 `excel/solid-excel/src-vnext` adapter；如果会，先列出 adapter 的后续任务。
- 变更请求是否需要带 `requestId` / `revision` / `cancelToken`，好让 worker 丢弃过期工作。

## 测试门禁

UI core 类型或 atom 改动：

```bash
npx tsc -p excel/spreadsheet-ui-core/tsconfig.json --noEmit --pretty false
npx jest excel/spreadsheet-ui-core/test/<feature>.test.ts --runInBand
npx jest excel/spreadsheet-ui-core/test/package-boundary.test.ts --runInBand
```

影响 `excel/solid-excel/src-vnext` adapter 或 UI：

```bash
npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false
npx jest excel/solid-excel/test/vnext-*.test.tsx excel/solid-excel/test/vnext-adapter.test.ts --runInBand
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts
```

视觉、交互、clipboard、worker 或 viewport 相关改动，再做一次浏览器验证并记录：URL、操作路径、
可视 cell 数、console warning/error、与 Excel 的交互一致性结论。

## Review 重点

先看风险，不先看风格：

- 状态来源是否唯一，是否复制了派生状态。
- 是否在 render / projection 循环里动态创建 atom。
- 是否引入全表扫描、全量 cell 数组、全量 row/column metadata。
- backend optional port 缺失时是否有降级路径。
- 类型导出是否破坏 package boundary。
- 是否需要 Solid adapter 或 e2e 补测试。
