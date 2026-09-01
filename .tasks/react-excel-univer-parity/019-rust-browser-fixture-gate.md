---
id: "019"
title: 验证 Rust browser fixture
kind: leaf
parent: M0
depends_on: ["018"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01b", "C01c", "C01d1", "C01d2", "C01e1", "C01e2", "C01f", "C01g", "C01h"]
files:
  - excel/react-excel/e2e/wasm-backend/index.html
  - excel/react-excel/e2e/wasm-backend/main.tsx
  - excel/react-excel/e2e/wasm-backend/runtime.spec.ts
  - excel/react-excel/e2e/support/console-errors.ts
  - .tasks/react-excel-univer-parity/reports/019-report.md
---

# 验证 Rust browser fixture

## 目标与粒度

用最小 UI 证明真实 Worker/WASM ready→A1=42→edit→projection→dispose。预计 15–20 分钟。

## 场景

fixture HTML 使用相对 `./main.tsx`；main 只消费 task017 public `createDefaultRustWorkbookRuntime` 与 backend，显示 phase、A1 display、编辑按钮/结果；无 demo、Static、TS、debug client。
spec 只能点可见按钮/读 DOM，不 page.evaluate 直接 RPC。四 project 全跑同一 spec；捕获 console/pageerror。

## 验收

- 首次执行前确认已运行 task018 的 `pnpm --filter @einfach/react-excel run e2e:install`；随后 `pnpm --filter @einfach/react-excel run build:e2e` 必须通过，证明三个 multi-page input 都真实存在。
- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/wasm-backend/runtime.spec.ts --list --project=chromium-desktop --project=webkit-desktop --project=chromium-mobile --project=webkit-mobile` 恰四项。
- 同命令去 `--list`：loading→ready，A1精确42，编辑后由 projection显示新值，unmount零 error。
- fixture/spec/helper 各 ≤300 行。

写 `reports/019-report.md`；不提交。
