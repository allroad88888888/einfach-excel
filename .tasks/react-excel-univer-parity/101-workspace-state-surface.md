---
id: "101"
title: 建立 workspace 状态表面
kind: leaf
parent: S01
depends_on: ["020"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C02"]
files:
  - excel/react-excel/src/workspace/SpreadsheetWorkspaceBoundary.tsx
  - excel/react-excel/src/workspace/workspace-status.tsx
  - excel/react-excel/test/workspace-state-surface.test.tsx
  - .tasks/react-excel-univer-parity/reports/101-report.md
---

# 建立 workspace 状态表面

## 目标与粒度

把 public Rust runtime 的 loading/ready/error/retry 呈现为可访问边界。预计 10–15 分钟。

## 精确合同

逐字实现 index `SpreadsheetWorkspaceBoundaryProps`；组件通过 task016
`useRustWorkbookRuntime(runtime)` 订阅，只有 ready 时调用 `children(state: RustWorkbookReadyState)`。
`workspace-status.tsx` 只负责 loading 与 error UI：loading 有 status 文本，error 有 alert、错误摘要、retry button。
retry 一次调用 runtime.retry，focus 在新 error/ready 后恢复到合理入口；不做 authoritative restore。

## 验收

- `pnpm exec jest excel/react-excel/test/workspace-state-surface.test.tsx --runInBand --no-coverage` 通过，覆盖三态、retry、focus、unmount。
- 组件不使用 React state 镜像 runtime phase/backend identity；无 fallback backend。
- 两个实现文件均 ≤300 行。

## 报告

写 `reports/101-report.md`，含 a11y 与 state-source 证据；不提交。
