---
id: "112"
title: 验证 S01 core interaction E2E
kind: leaf
parent: S01
depends_on: ["111"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C01d1", "C01d2", "C01e1", "C01e2", "C01f", "C06a", "C06b", "C06c"]
files:
  - excel/react-excel/e2e/s01/core-interaction.spec.ts
  - .tasks/react-excel-univer-parity/reports/112-report.md
---

# 验证 S01 core interaction E2E

## 目标与粒度

只验真实 Rust demo 的 load、1000行bounded scroll、selection、edit→canonical refresh。预计 15–20 分钟。

spec 导航 `/demo/`，只用可见 UI；禁止 page.evaluate/backend/debug client。四project同场景：A1显示42、首次不点击直接键盘/F2命中ready sheet、滚到row1000、DOM计数有界、pointer/keyboard selection、编辑并等待Rust projection新值。

## 验收

- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/s01/core-interaction.spec.ts --list --project=chromium-desktop --project=webkit-desktop --project=chromium-mobile --project=webkit-mobile` 恰四项。
- 同命令去 `--list` 全绿；console/pageerror为0；spec ≤300行。

写 `reports/112-report.md`；不提交。
