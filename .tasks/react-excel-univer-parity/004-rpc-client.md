---
id: "004"
title: 实现 exact RPC client
kind: leaf
parent: M0
depends_on: ["003"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01b"]
files:
  - excel/excel-worker/src/protocol/client.ts
  - excel/excel-worker/src/protocol/client-error.ts
  - excel/excel-worker/test/rpc-client.test.ts
  - .tasks/react-excel-univer-parity/reports/004-report.md
---

# 实现 exact RPC client

## 目标与粒度

实现 index `WorkerWorkbookClient` 的八个方法与 dispose。预计 15–20 分钟；只跑 targeted test，不做全包 typecheck。

## 行为

`createWorkerWorkbookClient(factory: WorkerFactory): WorkerWorkbookClient` 独占递增 id/pending map；方法把 index payload 精确装入 `{id,cmd,payload}`。
message 只接合法同 id response；error/messageerror 以 `RUST_WORKER_FAILED` 拒绝全部 pending。dispose 幂等，移除三个 listener、拒绝 pending、terminate；dispose 后零 postMessage，late ACK 忽略。

## 验收

- `pnpm exec jest excel/excel-worker/test/rpc-client.test.ts --runInBand --no-coverage` 覆盖八个 payload、乱序 correlation、structured error、crash、late ACK、double dispose。
- client/error 均 ≤300 行；零 Solid/TS token。

写 `reports/004-report.md`；不提交。
