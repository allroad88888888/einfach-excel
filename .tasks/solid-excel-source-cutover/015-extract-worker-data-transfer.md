---
id: "015"
title: 抽出 TS worker 数据传输边界
kind: leaf
parent: W0
depends_on: ["014"]
discovered_from: "002"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/import-session.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/export-session.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/persistence.ts
  - excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts
  - excel/solid-excel/test/vnext-worker-runtime-resources.test.ts
---

# 抽出 TS worker 数据传输边界

## 目标

把 import、export、snapshot、persistence 的会话状态转换迁出 runtime 装配壳。

## 粒度

四组命令共享 SparseCell wire 与 session invalidation 契约，合并成一个数据传输边界；按 import/export/persistence 三种生命周期落文件，不按 command case 切片。

## 上下文

保持 import stats、atomic/direct session、chunk rows clamp、TSV 文本、snapshot cursor、cancel 语义、persistence v1 的 cell/size/print/conditional-format 数据形状。sheet rebuild 由 018 提供；本叶用显式 callback/service 接口消费，禁止反向导入装配壳。

## 覆盖矩阵行

- `C-013`：TS backend 数据迁移 parity。
- `C-018`：传输模块职责与行数。

## 接口

### 消费

- 013 的 runtime state；014 的 SparseCell/range 服务。

### 产出

- `import-session.ts`、`export-session.ts`：唯一管理各自 session 状态转换。
- `persistence.ts`：只编排 persistence wire 与显式 restore callback，不拥有 workbook lifecycle。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/{import-session,export-session,persistence}.ts` → 每个文件不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `rg -n '^function (importCells|exportRangeTsv|snapshotSparse)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 014 复审通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执按 `DONE` 处理；主文件 1501→1241，新模块 153/79/62 行，44 个相关测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核行数与原文件单调下降证据，任务完成。
