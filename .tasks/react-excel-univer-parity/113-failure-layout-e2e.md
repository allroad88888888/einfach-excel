---
id: "113"
title: 验证 S01 failure 与 layout E2E
kind: leaf
parent: S01
depends_on: ["112"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C02", "C03", "C04", "C05", "C07"]
files:
  - excel/react-excel/e2e/s01/failure-layout.spec.ts
  - .tasks/react-excel-univer-parity/reports/113-report.md
---

# 验证 S01 failure 与 layout E2E

## 目标与粒度

只验 WASM load failure/retry、desktop/mobile overflow、focus 与截图。预计 15–20 分钟。

spec 用 Playwright route 暂时阻断 `.wasm`/worker request，确认 visible alert+retry；解除阻断后点 retry进入workbook，不能注入替代backend。
desktop 1440×900、mobile 390×844 断言页面无横向overflow、toolbar/grid各自滚动、focus-visible；console/pageerror预期仅记录受控启动失败，其余为0。截图写Playwright output不提交。

## 验收

- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/s01/failure-layout.spec.ts --list --project=chromium-desktop --project=webkit-desktop --project=chromium-mobile --project=webkit-mobile` 恰四项。
- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/s01/failure-layout.spec.ts --project=chromium-desktop --project=webkit-desktop --project=chromium-mobile --project=webkit-mobile` 全绿。
- report记录截图路径与允许的单一受控错误；spec ≤300行。

写 `reports/113-report.md`；不提交。
