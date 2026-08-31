---
id: "016"
title: 抽出 TS worker 自定义公式边界
kind: leaf
parent: W0
depends_on: ["015"]
discovered_from: "002"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/custom-formulas.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/defined-names.ts
  - excel/solid-excel/test/vnext-worker-runtime-resources.test.ts
  - excel/solid-excel/test/vnext-worker-undo-ts.test.ts
---

# 抽出 TS worker 自定义公式边界

## 目标

把 custom formula 注册执行语义迁出 runtime 装配壳。

## 粒度

custom formula 与 defined name 都向 workbook 注册可执行符号，但变化原因独立，分别落文件并共享显式 value conversion 契约。

## 上下文

保持 sync/async source 编译、array return gate、error token、async pump settle dirty 通知、registry 重绑定、range/value/lambda name binding、debug counters 行为。不得把 `new Function` 或 async callable 状态复制回 dispatch。

## 覆盖矩阵行

- `C-013`：TS backend custom formula parity。
- `C-018`：formula/name 模块职责与行数。

## 接口

### 消费

- 013 的 runtime state；现有 `async-custom-pump` 与 `custom-array-return`。

### 产出

- `custom-formulas.ts`：注册、注销、value conversion、async callable registry。
- `defined-names.ts`：range/value/lambda name binding 的唯一实现。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/{custom-formulas,defined-names}.ts` → 每个文件不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-runtime-resources.test.ts excel/solid-excel/test/vnext-worker-undo-ts.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `rg -n '^function (registerCustomFormulaInWorker|unregisterCustomFormulaInWorker|defineNameInWorker|undefineNameInWorker)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 015 审查通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执按 `DONE` 处理；主文件 1241→946，新模块 168/86 行，51 个相关测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核行数与原文件单调下降证据，任务完成。
