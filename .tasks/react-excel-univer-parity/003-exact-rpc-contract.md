---
id: "003"
title: 冻结 exact Rust RPC contract
kind: leaf
parent: M0
depends_on: ["002"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01b", "C01f"]
files:
  - excel/excel-worker/src/protocol/envelope.ts
  - excel/excel-worker/src/protocol/cell-wire.ts
  - excel/excel-worker/src/protocol/capability-wire.ts
  - excel/excel-worker/src/protocol/client-contract.ts
  - excel/excel-worker/src/protocol/cell-input-classifier.ts
  - excel/excel-worker/test/exact-rpc-contract.test.ts
  - .tasks/react-excel-univer-parity/reports/003-report.md
---

# 冻结 exact Rust RPC contract

## 目标与粒度

逐名实现 index 的 `RustCommand`、payload/result、envelope、cell/seed wire 与 `WorkerWorkbookClient` 类型。预计 15–20 分钟；无 transport/runtime。

## 约束

- command set 恰为 index 八项；manifest commands 排序固定为 index 顺序、无重复。
- coordinate 使用 zero-based row/col，A1 string 只用于三个单格 Rust binding command。
- `RustImportCellWire` 的 null 没有 value，其它 kind/value 必须匹配；所有 public array 都 readonly。
- 本叶唯一实现 index `toImportCellWire`：先取 `input.trim()`；空→null、首字符 `=`→formula、大小写 TRUE/FALSE→boolean、finite number→number，其余 trimmed input→text。
- formula result 只允许 exact `{ok:true,installed:true}` 或已应用的 `installed:false` diagnostic；后者由 `#VALUE!/#CYCLE!` 精确映射稳定 code，绝不是 RPC rejection。
- runtime/client 后续只 import 这些类型，不重新声明 wire。

## 验收

- `pnpm exec jest excel/excel-worker/test/exact-rpc-contract.test.ts --runInBand --no-coverage` 覆盖八组 request/result、两种 applied formula 分支、manifest exact set、structured error、invalid cell union 与 empty/formula/finite-number/boolean/text 分类向量。
- `pnpm exec tsc -p excel/excel-worker/tsconfig.json --noEmit --pretty false` 通过。
- 五个实现文件各自单职责且 ≤300 行。

写 `reports/003-report.md`；不提交。
