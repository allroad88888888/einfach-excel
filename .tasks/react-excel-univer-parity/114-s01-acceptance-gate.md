---
id: "114"
title: 汇总 S01 acceptance gate
kind: leaf
parent: S01
depends_on: ["112", "113"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C00", "C01a", "C01b", "C01c", "C01d1", "C01d2", "C01e1", "C01e2", "C01f", "C01g", "C01h", "C02", "C03", "C04", "C05", "C06a", "C06b", "C06c", "C07"]
files:
  - .tasks/react-excel-univer-parity/reports/114-report.md
---

# 汇总 S01 acceptance gate

## 目标与粒度

只复跑固定验证并汇总证据，不改产品/测试。预计10–15分钟。

## 验收

- `pnpm --filter @einfach/react-excel run verify`、`pnpm --filter @einfach/react-excel typecheck:demo`、`pnpm --filter @einfach/react-excel build:demo` 全部通过。
- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/s01/core-interaction.spec.ts --list --project=chromium-desktop --project=webkit-desktop --project=chromium-mobile --project=webkit-mobile` 恰四项；同命令去 `--list` 全绿。
- `pnpm --filter @einfach/react-excel run test:e2e -- e2e/s01/failure-layout.spec.ts --list --project=chromium-desktop --project=webkit-desktop --project=chromium-mobile --project=webkit-mobile` 恰四项；同命令去 `--list` 全绿。
- Rust-only source/dependency/bundle scan为0违规；所有本阶段普通文件 `wc -l` ≤300。
- 报告逐行链接 coverage evidence、命令、截图路径，只给用户 3 条人工步骤：打开、滚动选择、单格编辑回读。
- 编排者独立review后把S01设 `awaiting_user` 并停止；不展开S02。

写 `reports/114-report.md`；不提交。
