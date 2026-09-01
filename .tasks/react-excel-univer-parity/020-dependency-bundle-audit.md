---
id: "020"
title: 冻结 dependency 与 bundle audit
kind: leaf
parent: M0
depends_on: ["019"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01a", "C01h"]
files:
  - .dependency-cruiser.cjs
  - rules/react-rust-bundle-boundary.test.mjs
  - excel/react-excel/package.json
  - .tasks/react-excel-univer-parity/reports/020-report.md
---

# 冻结 dependency 与 bundle audit

## 目标与粒度

把 excel-worker/react-excel 纳入 dependency graph，并扫描 E2E build artifact 的 Rust-only route。预计 10–15 分钟。

## 行为

dependency-cruiser includeOnly 加两个 src tree，禁止 React/excel-worker 到 Solid/TS core edge。bundle test 先读 Vite manifest，定位 wasm-backend entry/worker/assets，断言存在 `.wasm` 与 Rust worker chunk，零禁用 token/TS worker URL。
package scripts补 `typecheck`、`test:unit`、`verify = typecheck + unit + build:e2e + boundary + targeted wasm e2e`，不安装浏览器。

## 验收

- `pnpm --filter @einfach/react-excel run build:e2e` 后 `node --test rules/react-rust-bundle-boundary.test.mjs` 通过。
- `pnpm exec depcruise --config .dependency-cruiser.cjs excel/excel-worker/src excel/react-excel/src` 与 `pnpm --filter @einfach/react-excel run verify` 通过。
- 普通文件 ≤300 行。

写 `reports/020-report.md`；不提交。
