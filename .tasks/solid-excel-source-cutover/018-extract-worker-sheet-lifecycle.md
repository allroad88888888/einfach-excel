---
id: "018"
title: 抽出 TS worker sheet lifecycle 边界
kind: leaf
parent: W0
depends_on: ["017"]
discovered_from: "002"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts
  - excel/solid-excel/src-vnext/adapter/worker-runtime-ts/sheet-lifecycle.ts
  - excel/solid-excel/test/vnext-worker-sheet-rename.test.ts
  - excel/solid-excel/test/vnext-print-config-runtime.test.ts
  - excel/solid-excel/test/vnext-conditional-format-revision.test.ts
---

# 抽出 TS worker sheet lifecycle 边界

## 目标

把 sheet create/rename/remove/move/rebuild 状态迁移语义收口到一个服务。

## 粒度

这些动作共同改变 sheet registry 与 workbook identity；print config、conditional format、viewport、custom formula、session invalidation 都是重建时必须原子保留或失效的伴随状态。

## 上下文

把 `rebuildPreservingCells` 及四个 sheet command 的状态变更迁入 `sheet-lifecycle.ts`。通过显式依赖调用 014–017 服务，禁止反向导入装配壳；保持 sheet id/index/name、公式重绑定、尺寸 rename、import/snapshot session 清理语义。

## 覆盖矩阵行

- `C-013`：TS backend sheet lifecycle parity。
- `C-018`：lifecycle 文件职责与行数。

## 接口

### 消费

- 013–017 的 state、cell snapshot、formula、viewport、transfer services。

### 产出

- `sheet-lifecycle.ts`：显式 `init/add/rename/remove/move` 与 rebuild 服务，供 dispatcher 调用。

## 验收标准

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/sheet-lifecycle.ts` → 不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-worker-sheet-rename.test.ts excel/solid-excel/test/vnext-print-config-runtime.test.ts excel/solid-excel/test/vnext-conditional-format-revision.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `rg -n '^function rebuildPreservingCells' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 017 审查通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执按 `DONE` 处理；主文件 774→662，新模块 149 行，24 个相关测试与 tsc 通过；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核行数与原文件单调下降证据，任务完成。
