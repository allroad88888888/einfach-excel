---
id: "003"
title: 重建 static 公式求值模块边界
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
  - excel/solid-excel/src-vnext/adapter/static-formula-eval.ts
  - excel/solid-excel/src-vnext/adapter/static-formula/**
  - excel/solid-excel/test/static-formula-eval-arithmetic.test.ts
  - excel/solid-excel/test/static-formula-eval-error-literals.test.ts
  - excel/solid-excel/test/static-formula-eval.test.ts
  - excel/solid-excel/test/vnext-static-tables.test.ts
---

# 重建 static 公式求值模块边界

## 目标

把 1371 行 static evaluator 拆为 tokenizer/parser、criteria、函数实现、structured reference rewrite 与公开 orchestrator，保持求值结果和错误文本逐字一致。

## 粒度

语法、criteria、函数库、structured reference 各有独立变化原因；`evaluateFormula` 保持唯一装配入口。

## 上下文

该 evaluator 是 static backend 的对照实现，不是 Rust/TS 引擎替代品。不要扩展公式能力，不要借拆分修正现有语义。

## 覆盖矩阵行

- `C-012`：static backend 单测。
- `C-018`：现役文件行数。

## 接口

### 消费

- 现有 `EvalCellLookup`、`EvalOrigin`、`StructuredRefResolver`。

### 产出

- `static-formula-eval.ts` 继续导出 `evaluateFormula`、`formatEvalResult`、structured ref 公共类型与 rewrite 函数。

## 验收标准

1. `find excel/solid-excel/src-vnext/adapter/static-formula -type f -print0 | xargs -0 wc -l` → 每个普通文件不超过 300 行。
2. `npx jest excel/solid-excel/test/static-formula-eval-arithmetic.test.ts excel/solid-excel/test/static-formula-eval-error-literals.test.ts excel/solid-excel/test/static-formula-eval.test.ts excel/solid-excel/test/vnext-static-tables.test.ts --runInBand` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：派发执行，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE_WITH_CONCERNS`；145 个定向测试通过，所有拆分文件不超过 300 行，全量 tsc 被并行任务 001/004 的中间态阻断；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核行数验收（最大 257 行）。一个格式 Minor 记入 index，不进入修复循环；任务完成。
