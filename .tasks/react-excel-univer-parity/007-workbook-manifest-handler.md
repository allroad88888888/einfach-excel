---
id: "007"
title: 实现 workbook 与 manifest handler
kind: leaf
parent: M0
depends_on: ["006"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01c"]
files:
  - excel/excel-worker/src/runtime/handlers/workbook.ts
  - excel/excel-worker/test/workbook-manifest-handler.test.ts
  - .tasks/react-excel-univer-parity/reports/007-report.md
---

# 实现 workbook 与 manifest handler

## 目标与粒度

实现 index `RustCommandHandler` 的 initWorkbook/sheetList/describeCapabilities 分支。预计 10–15 分钟。

## 行为

handler 消费同一个 `RuntimeWorkbookContext`；init 调 `context.initialize`，空 sheets 得默认 Sheet1，非空按序 rename/add；sheetList 要求 initialized。
sheet wire 固定 `{id:'sheet-'+index,index,name}`，不冒充持久 identity。manifest 精确返回 index 八 command/runtime/version。其它 command 返回 `{handled:false}`；handler 不 postMessage。

## 验收

- `pnpm exec jest excel/excel-worker/test/workbook-manifest-handler.test.ts --runInBand --no-coverage` 覆盖 default/multi sheet、before-init、exact manifest、fallthrough。
- manifest command set 与 index 双向相等；文件 ≤300 行。

写 `reports/007-report.md`；不提交。
