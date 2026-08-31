---
id: "023"
title: 清理已迁移 src 路径残留
kind: leaf
parent: W3
depends_on: ["021", "022"]
discovered_from: "012"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/e2e/clipboard/CASES.md
  - excel/solid-excel/e2e/demos/CASES.md
  - excel/solid-excel/e2e/i18n-a11y/CASES.md
  - excel/solid-excel/e2e/perf-virtual/CASES.md
  - excel/solid-excel/e2e/smoke/CASES.md
  - excel/solid-excel/e2e/worker-backend/CASES.md
  - excel/solid-excel/e2e/format/toolbar-colors.spec.ts
  - excel/solid-excel/src/adapter/worker/limits.ts
  - excel/solid-excel/src/adapter/worker-entry-ts.ts
  - .tasks/solid-excel-source-cutover/reports/023-report.md
---

# 清理已迁移 src 路径残留

## 目标

修正最终总复核发现的 9 个现行测试说明、spec 与源码注释，使已经从旧 `src` 迁往 `demo`、`legacy`、styles 包或 canonical worker runtime 的路径准确可定位。

## 粒度

只处理同一个物理目录 cutover 遗漏的当前引用，不改测试行为、产品行为或历史 allowlist。

## 上下文

- CASES ledger 要明确区分 `demo/` 壳、`legacy/` 旧 Table/store/demos 与现役 `src/` 组件。
- toolbar 颜色断言的 `.cell-display` 规则来自 `excel/spreadsheet-ui-styles/styles/grid-overlays.css`。
- worker limit 注释引用 legacy precedent；TS worker entry 必须准确区分 `worker-runtime-ts.ts` 与 canonical WASM-lite `worker-runtime.ts`。
- 不做机械字符串替换；逐个验证正文中的所有受迁移影响路径真实存在，必要时同步局部职责叙述。

## 覆盖矩阵行

- `C-012`、`C-016`。

## 接口

### 消费

- 任务 006–008 的 demo/legacy/current 最终布局。
- 012 最终首审的 Important finding。

### 产出

- 9 个现行文件中已迁移旧 `src` 路径全部指向真实职责位置。

## 验收标准

1. 对 9 个产品文件中的源码路径执行存在性核验 → 零悬空目标。
2. `npm run check:docs` → 零死链。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零诊断。
4. `npm run lint:check` → 零错误。
5. `git diff --check` → 零错误。
6. 修改不得改变 spec 断言/执行逻辑；仅允许注释路径修正。

## 执行记录（仅编排者回写）

- 2026-08-31：由 012 最终独立首审发现并派发，范围为 reviewer 精确列出的 9 个现行文件。
- 2026-08-31：首审发现 clipboard 函数职责误指 composition root；R1 改指 `grid-clipboard.ts` 并校正 ledger 行数后复审 `APPROVED`。
