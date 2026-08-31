# 003 独立审查

## 结论

APPROVED。范围内未发现语义回归、运行时循环依赖或假拆分；两个可验证验收项通过，完整 TypeScript 门因共享工作树的范围外改动只能标记为无法核实。

## 审查范围

- 任务文件：`.tasks/solid-excel-source-cutover/003-split-static-formula-evaluator.md`
- 执行报告：`.tasks/solid-excel-source-cutover/reports/003-report.md`
- 基线：`723082739d66140ac697a5a9c203a6fd99649d4a`
- 已检查范围 diff、`git status --short`，并直接阅读未跟踪目录 `excel/solid-excel/src-vnext/adapter/static-formula/` 下全部 11 个文件。
- 按要求未重跑执行报告声称已运行的 Jest、tsc 或 `git diff --check`。

## 验收标准

1. ✅ **拆分文件均不超过 300 行。** `wc -l` 显示目录内最大文件为 `tokenizer.ts` 257 行，其次为 `parser.ts` 255 行；其余文件为 6–165 行。公开 orchestrator `static-formula-eval.ts` 为 110 行。由此 C-018 在本任务范围内满足。
2. ✅ **指定 static backend 测试全绿。** 执行报告记录指定的 4 个 Jest suites、145 tests 全部通过；依任务要求不重跑。该证据覆盖 C-012。
3. ⚠️无法核实 **完整 tsc 零错误。** 执行报告明确记录全包命令非零，但输出只涉及并行任务 001 的 worker 路径及任务 004 的 overlay 路径，均在本审查 diff 外；报告同时称本任务路径没有诊断。因共享工作树并非基线加本任务改动的隔离状态，不能把该环境性结果判为本任务 ❌，也不能确认完整门已通过。

## 语义与边界核对

- ✅ **公开入口保持。** `static-formula-eval.ts:8-34` 继续提供 `EvalResult`、lookup/origin/structured-reference 类型、`RangeRef` 以及 structured-reference rewrite 导出；`evaluateFormula` 和 `formatEvalResult` 仍分别位于 `:36-53` 与 `:99-110`。
- ✅ **错误文本保持。** `tokenizer.ts:48-58` 保留原有 13 个错误字面量及其逐字拼写；`subtotal.ts:47-76` 保留 `#ARGS!`、`#TYPE!`、`#VALUE!` 的原分支；`value.ts:20-26`、`parser.ts:195-219` 保留算术强制转换和 `#DIV/0!`/`#ERROR!` 传播；公开显示边界仍通过 `errorDisplayToken` 折叠内部错误码（`static-formula-eval.ts:99-109`）。
- ✅ **structured reference 语义保持。** tokenizer 中 table-less/table-qualified 引用仍调用 resolver，并区分 `null` 解析失败、range 与 error resolution（`tokenizer.ts:93-123,213-222`）；1×1 range 的值上下文折叠及宽 range 的 `#ERROR!` 保留（`parser.ts:155-165`）；重写逻辑仍避开字符串字面量并只处理 bracket form（`structured-reference.ts:42-84`）。
- ✅ **函数分派保持。** `functions.ts:68-164` 仍显式分派 IF、criteria、标量/文本/布尔/数学、VLOOKUP、SUBTOTAL，并仅让 SUM/AVERAGE/COUNT/MIN/MAX 落入 numeric aggregate；tokenizer 的函数白名单与基线一致（`tokenizer.ts:17-40`）。SUBTOTAL 的 hidden/filter-hidden 两套行语义及各模式错误传播保留在 `subtotal.ts:40-153`。
- ✅ **无运行时循环依赖。** 运行时主链为 orchestrator → tokenizer/parser → functions → criteria/aggregate/vlookup/subtotal/value/types；`structured-reference` → tokenizer。`tokenizer.ts:1` 对 orchestrator 的回指是 `import type`，不会形成运行时环。未使用无脑 barrel 文件。
- ✅ **非假拆分。** parser、tokenizer、criteria、聚合、VLOOKUP、SUBTOTAL、structured-reference rewrite 和引用解析均有独立变化原因；共享 `RangeRef` 与 value 语义确被多个模块复用。没有 `partN`、`utils` 大杂烩或纯转发拆分。

## 质量发现

### Critical

无。

### Important

无。

### Minor

- `functions.ts:68` 的 `applyFunction` 签名挤在单行且文件内缩进不一致，`criteria.ts:99-100`、`parser.ts:253-255` 也残留多余空行。这不改变行为或验收结果，但降低可读性，建议后续仅做格式化整理。

## 覆盖矩阵

- C-012：✅ 执行报告记录本任务指定四组 static backend suites 共 145/145 通过。
- C-018：✅ 新目录全部普通文件 ≤300 行，公开 orchestrator 110 行；最大文件 257 行。
