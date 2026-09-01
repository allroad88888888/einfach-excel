---
id: "001"
title: 打开并灌入 1000 行 Rust 工作簿
kind: leaf
depends_on: []
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
files:
  - excel/solid-excel/package.json
  - excel/react-excel/package.json
  - pnpm-lock.yaml
  - excel/react-excel/demo/App.tsx
  - excel/react-excel/demo/rust-demo-backend.ts
  - excel/react-excel/demo/rust-demo-seed.ts
  - excel/react-excel/test/rust-demo-backend.test.ts
  - .tasks/react-excel-rust-demo/reports/001-report.md
---

# 打开并灌入 1000 行 Rust 工作簿

## 目标

让 demo 在显示网格前完成现有 Rust backend 的初始化与数据导入。

## 实现合同

- 在 `@einfach/solid-excel` 只新增 `./worker-backend` package export；`solid` 指向
  `./src/adapter/worker/backend.ts`，`types` 指向
  `./@types/src/adapter/worker/backend.d.ts`，`import/default` 均指向
  `./esm/src/adapter/worker/backend.mjs`；不改任何实现。
- `createWorkerWorkbookSpreadsheetBackend` 只从
  `@einfach/solid-excel/worker-backend` 导入。
- Rust Worker constructor 只从
  `@einfach/solid-excel/vnext-worker-runtime?worker` 导入；factory 是
  `() => new RustWorkbookWorker()`，禁止 import `worker-factory` 子路径。
- sheet 配置固定为 `{ id: 'orders', name: 'Orders' }`。
- `afterInit` 使用现有 client 的 `beginImport({ mode: 'direct' })`、`importChunk`、
  `commitImport`，把表头与 1000×8 数据按有限 chunk 写进 Rust。
- 检查 import stats；错误或拒绝使初始化失败，不显示静态 fallback。
- App 明确呈现 loading、error、ready；卸载时 `backend.dispose()`。
- 本叶允许 ready 后暂时沿用旧网格外观；真实投影由 002 接管。

## 验收

- 单测证明 backend export 精确落到既有中性入口，导入恰好 8008 个单元格。
- `! rg -n "from ['\"]solid-js(['\"]|[^[:alnum:]_.-])" excel/solid-excel/src/adapter` 通过。
- `! rg -n "from ['\"]@einfach[^[:alnum:]_.-]solid(['\"]|[^[:alnum:]_.-])" excel/solid-excel/src/adapter` 通过。
- `! rg -n "worker-factory|defaultExcelCoreTsWorkerFactory|worker-runtime-ts|worker-entry-ts|@einfach/excel-core-ts" excel/react-excel/demo` 通过。
- `pnpm --filter @einfach/react-excel typecheck:demo` 通过。
- `pnpm --filter @einfach/react-excel build:demo` 通过。
- build 后 `find excel/react-excel/dist -type f` 能定位一个 worker JS 与 WASM asset；
  `! rg -n "worker-entry-ts|worker-runtime-ts|excel-core-ts|defaultExcelCoreTsWorkerFactory" excel/react-excel/dist` 通过。
- 所有新增/大改普通文件 `wc -l` ≤300。

写 `reports/001-report.md`；执行 agent 不提交。
