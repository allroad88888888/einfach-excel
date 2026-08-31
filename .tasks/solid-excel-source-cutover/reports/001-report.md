# 001 执行报告

## 改动摘要

- 将 1543 行 `src-vnext/adapter/worker-protocol.ts` 收口为 6 行兼容 barrel，保留原路径与原有公开导出名。
- 按 wire 领域拆出 `format.ts`、`cell-range.ts`、`table-filter.ts`、`persistence-capability.ts` 与 `client-contract.ts`。
- 将 RPC client 实现迁入 `worker-protocol/client.ts`；pending request、worker failure、subscriber、listener 与 dispose 生命周期只由该文件持有。
- 将无状态命令映射按 workbook/format、table/filter、data/persistence 聚类，避免生命周期实现重新膨胀；消息 command、payload、返回形状、错误 detail 和订阅清理语义保持不变。
- 未改任务 files 边界外的产品文件，未提交。

## 逐条验收命令与结果

1. `find excel/solid-excel/src-vnext/adapter/worker-protocol -type f -print0 | xargs -0 wc -l`：通过。各文件行数为 228、264、287、28、88、32、48、126、207、1，全部不超过 300 行；`wc -l excel/solid-excel/src-vnext/adapter/worker-protocol.ts` 为 6，低于 barrel 120 行上限。
2. `npx jest excel/solid-excel/test/vnext-worker-boot-failure.test.ts excel/solid-excel/test/vnext-worker-wire-telemetry.test.ts excel/solid-excel/test/package-vnext-subpath.test.ts --runInBand`：通过。3/3 suites、9/9 tests 通过，0 snapshots。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`：本任务代码零错误，但命令整体未通过；唯一错误位于范围外 `excel/solid-excel/test/vnext-grid-overlay.test.tsx:135`，`fill` 不属于 `OverlayContext`。该文件属于并行任务 004 的 files 边界，未越界修改。
4. `git diff --check -- excel/solid-excel/src-vnext/adapter/worker-protocol.ts excel/solid-excel/src-vnext/adapter/worker-protocol`：通过，无 whitespace error。

## 已完成覆盖矩阵行及证据

- C-007（worker 公共协议形状）：原路径 barrel 继续导出全部既有 `*Wire`、`WorkerLike`、`WorkerWorkbookOptions`、`WorkerWorkbookClient` 与 `createWorkerWorkbook`；指定 boot failure、wire telemetry、package vnext subpath 测试全部通过。
- C-018（现役文件行数）：worker protocol 目录所有普通文件均 ≤300 行，兼容 barrel 6 行；具体证据见验收命令 1。

## 未验证项

- 全量 TypeScript 命令无法取得进程级零退出码，因为范围外并行任务的 `vnext-grid-overlay.test.tsx:135` 尚有一个 `OverlayContext.fill` 类型错误。
- 未运行任务未要求的完整 Jest 或浏览器 E2E。

## 范围外发现

- 并行任务 004 当前在 `excel/solid-excel/test/vnext-grid-overlay.test.tsx:135` 留有类型错误；本任务未修改。

## 疑虑

- 无协议行为疑虑。唯一交付疑虑是验收标准 3 被范围外并行改动阻挡，需待任务 004 收口后复跑。

## 建议后续动作

- 任务 004 完成后，由编排者复跑 `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`，补齐验收标准 3 的全绿证据。
- 后续任务 002、008 继续从 `src-vnext/adapter/worker-protocol.ts` 兼容路径消费，无需改调用签名。
