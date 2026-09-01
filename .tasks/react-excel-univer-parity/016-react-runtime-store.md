---
id: "016"
title: 建立 React runtime external store
kind: leaf
parent: M0
depends_on: ["015"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01g"]
files:
  - excel/react-excel/src/runtime/rust-workbook-runtime.ts
  - excel/react-excel/src/runtime/use-rust-workbook-runtime.ts
  - excel/react-excel/test/react-runtime-store.test.tsx
  - .tasks/react-excel-univer-parity/reports/016-report.md
---

# 建立 React runtime external store

## 目标与粒度

实现 index `createRustWorkbookRuntime(factory)`、state/store 与精确签名
`useRustWorkbookRuntime(runtime: RustWorkbookRuntime): RustWorkbookRuntimeState`。预计 15–20 分钟；不组装默认 Worker/seed。

## 行为

创建即 loading 并启动 generation factory；fulfilled 发布 ready，rejected 发布 error。retry 先 dispose 当前/在途 generation、generation id +1、再 loading；late generation 立即 dispose 且不能覆盖。
dispose 幂等、清 listeners、阻止 retry/late publish。hook 只用 `useSyncExternalStore`，不复制 state/backend identity。

## 验收

- `pnpm exec jest excel/react-excel/test/react-runtime-store.test.tsx --runInBand --no-coverage` 覆盖 loading/ready/error/retry/ABA/StrictMode/dispose/listener cleanup。
- 两实现文件均 ≤300 行；零 demo import。

写 `reports/016-report.md`；不提交。
