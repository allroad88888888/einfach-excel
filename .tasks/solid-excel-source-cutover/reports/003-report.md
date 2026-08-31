# 003 执行报告

## 改动摘要

- 将 1371 行 `static-formula-eval.ts` 收口为 110 行公开 orchestrator，保留 `evaluateFormula`、`formatEvalResult`、structured-reference 公共类型及 rewrite 导出。
- 新建 `static-formula/` 职责模块：引用解析、tokenizer、parser、值语义、criteria、基础函数分派、VLOOKUP、SUBTOTAL、数值聚合、structured-reference rewrite、共享类型。
- 本次为纯边界重建；公式分支、返回值和错误显示逻辑未扩展。

## 验收命令与结果

1. `find excel/solid-excel/src-vnext/adapter/static-formula -type f -print0 | xargs -0 wc -l`
   - 通过。最大文件为 `tokenizer.ts` 257 行，其次 `parser.ts` 254 行；全部普通文件不超过 300 行。
2. `npx jest excel/solid-excel/test/static-formula-eval-arithmetic.test.ts excel/solid-excel/test/static-formula-eval-error-literals.test.ts excel/solid-excel/test/static-formula-eval.test.ts excel/solid-excel/test/vnext-static-tables.test.ts --runInBand`
   - 通过。4 suites、145 tests 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`
   - 未通过全包门。task 003 自身错误已清零；当前输出仅剩并发 task 001 的 `worker-protocol/**`/worker 公共导出错误及并发 task 004 的 `OverlayContext.fill` 错误，均不在本任务 files 边界。
4. `git diff --check`
   - 通过，无空白错误。

## 已完成覆盖矩阵行及证据

- C-012：本任务指定 static backend 四组 Jest 全绿（145/145）。
- C-018：`static-formula/**` 所有文件均小于等于 300 行；公开 orchestrator 为 110 行。

## 未验证项

- 全包 TypeScript 零错误未能在并发工作树上取得；task 003 路径已通过同一次 tsc 输出的定向审计（输出中无 `static-formula` 错误）。需待 task 001/004 收口后由编排者重跑完整命令。

## 范围外发现

- 并发 task 001 当前仍有 worker protocol 类型/导出错误。
- 并发 task 004 当前使 `vnext-grid-overlay.test.tsx` 的 `fill` 属性与 `OverlayContext` 不匹配。

## 疑虑

- 无产品语义疑虑。唯一验收缺口是共享工作树并发改动导致的全包 tsc 非零。

## 建议后续动作

- 等 task 001 与 task 004 完成后，编排者重跑完整 `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`，若零错误即可关闭本任务的最后一个环境性验收缺口。
