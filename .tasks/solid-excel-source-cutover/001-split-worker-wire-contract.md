---
id: "001"
title: 重建 worker RPC 协议边界
kind: leaf
parent: W0
depends_on: []
discovered_from: null
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-protocol.ts
  - excel/solid-excel/src-vnext/adapter/worker-protocol/**
  - excel/solid-excel/src-vnext/adapter/index.ts
  - excel/solid-excel/test/vnext-worker-boot-failure.test.ts
  - excel/solid-excel/test/vnext-worker-wire-telemetry.test.ts
  - excel/solid-excel/test/package-vnext-subpath.test.ts
---

# 重建 worker RPC 协议边界

## 目标

把 1543 行 `worker-protocol.ts` 拆为按 wire 领域聚类的类型模块与单独的 RPC client，实现保持全部现有导出名、消息形状、错误语义和订阅生命周期不变。

## 粒度

这是一个协议边界重构；继续按单个类型拆会造成过度碎片，按 cell/range、format、table/filter、persistence/capability、client 五类形成可独立阅读的模块。

## 上下文

当前文件同时定义约 70 个 wire 类型、`WorkerWorkbookClient`、pending/subscriber 生命周期和 `createWorkerWorkbook`。保留 `worker-protocol.ts` 作为 adapter 边界 barrel；实现放进 `worker-protocol/`，每个文件必须能用一句话说明职责。

## 覆盖矩阵行

- `C-007`：worker 公共协议形状。
- `C-018`：现役文件行数。

## 接口

### 消费

- 现有 `WorkerWorkbookClient` 与全部 `*Wire` 名称：全仓调用方不改签名。

### 产出

- `worker-protocol.ts`：兼容 barrel，供任务 002、008 继续按原路径消费。
- `worker-protocol/client.ts`：唯一拥有 pending request、worker failure、subscriber 与 dispose 生命周期。

## 验收标准

1. `find excel/solid-excel/src-vnext/adapter/worker-protocol -type f -print0 | xargs -0 wc -l` → 每个普通文件不超过 300 行，barrel 不超过 120 行。
2. `npx jest excel/solid-excel/test/vnext-worker-boot-failure.test.ts excel/solid-excel/test/vnext-worker-wire-telemetry.test.ts excel/solid-excel/test/package-vnext-subpath.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：派发执行，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE_WITH_CONCERNS`；9 个定向测试通过，barrel 6 行、子模块最高 286 行，全量 tsc 被并行任务 004 的中间态阻断；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核行数验收，旧 77 个显式导出零缺失；任务完成，全量 tsc 留待共享工作树稳定后补证。
