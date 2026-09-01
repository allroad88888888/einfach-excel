---
id: "012"
title: 建立 backend session 与 manifest gate
kind: leaf
parent: M0
depends_on: ["011"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01g"]
files:
  - excel/excel-worker/src/backend/types.ts
  - excel/excel-worker/src/backend/session.ts
  - excel/excel-worker/src/backend/sheet-lookup.ts
  - excel/excel-worker/src/backend/manifest-gate.ts
  - excel/excel-worker/test/backend-session.test.ts
  - .tasks/react-excel-univer-parity/reports/012-report.md
---

# 建立 backend session 与 manifest gate

## 目标与粒度

实现 index `RustWorkerBackendOptions` 与 `RustBackendSession`。预计 15–20 分钟；只跑 targeted test。

## 行为

`createRustBackendSession(options)` precedence：显式 client 优先，否则用 workerFactory 创建 client，两者皆无同步抛错。
`ready` 是 lazy cached single-flight 的普通方法（不以 `async` 再包一层）：首次创建并保存唯一 Promise，严格执行 `initWorkbook → describeCapabilities → exact manifest validation → afterInit(client,sheets)`；并发/后续调用原样返回该 Promise，三步各精确一次且成功 sheets identity 稳定。失败是该 session 的 sticky rejection、dispose client、永不发布；retry 只能由 task016/017 新建 session。
null/extra/missing/duplicate command、runtime/version 错误统一 `RUST_CAPABILITY_MANIFEST_INVALID`。dispose 后 late ready/afterInit 不发布 sheets。
sheet map 产出 index `RustWorkerSheet`：string option 只传 name；object 的非空唯一 id 按位置覆盖 wire id，index/name 以 wire 为准；空/重复 id 或数量错位 fail-closed。
resolveSheet、revision/assertRevisionCapacity/bumpRevision 完全按 index 签名；revision 只接受 non-negative safe integer，默认0、首次 bump为1；`assertRevisionCapacity()` 在 MAX 抛 `RUST_REVISION_EXHAUSTED`，bump 同样 fail-closed 且原值不变。

## 验收

- `pnpm exec jest excel/excel-worker/test/backend-session.test.ts --runInBand --no-coverage` 覆盖 precedence、并发/重复 ready Promise identity、init/manifest/afterInit各一次、stable sheets、sticky failure/new-session retry、ABA/dispose、sheet lookup、invalid initial revision、0→1 与 capacity/bump 溢出 fail-closed。
- 坏 manifest 零 afterInit/read/write；四实现文件均 ≤300 行。

写 `reports/012-report.md`；不提交。
