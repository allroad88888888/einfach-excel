---
id: "111"
title: 组装默认 Rust demo
kind: leaf
parent: S01
depends_on: ["110"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C01g", "C02", "C03", "C04", "C05", "C06a", "C06b", "C06c", "C07"]
files:
  - excel/react-excel/demo/App.tsx
  - excel/react-excel/demo/main.tsx
  - excel/react-excel/test/default-rust-demo.test.tsx
  - .tasks/react-excel-univer-parity/reports/111-report.md
---

# 组装默认 Rust demo

## 目标与粒度

默认 route 经 public API 进入 Rust runtime/workspace/provider/editable grid。预计 10–15 分钟；只做 composition 与全 demo build。

module scope 创建 `createDefaultRustWorkbookRuntime()`；App用 WorkspaceBoundary，ready backend创建Provider并组合六个demo组件。
main明确root unmount/runtime dispose，StrictMode不重复seed。禁止 no-op backend、debug query switch、Static/TS fallback、demo→src深导入。

## 验收

- `pnpm exec jest excel/react-excel/test/default-rust-demo.test.tsx --runInBand --no-coverage` 覆盖 loading/ready/error/retry/composition/dispose。
- `pnpm --filter @einfach/react-excel typecheck:demo` 与 `build:demo` 通过；禁用token/demoBackend零匹配。
- 两文件 ≤300行。

写 `reports/111-report.md`；不提交。
