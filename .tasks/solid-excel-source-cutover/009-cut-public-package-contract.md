---
id: "009"
title: 切换 Solid 包公开入口契约
kind: leaf
parent: W2
depends_on: ["008"]
discovered_from: null
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/package.json
  - excel/solid-excel/src/index.ts
  - excel/solid-excel/src/public.ts
  - excel/solid-excel/legacy/index.tsx
  - excel/solid-excel/legacy/demos/index.ts
  - excel/solid-excel/test/package-entry.test.ts
  - excel/solid-excel/test/package-vnext-subpath.test.ts
  - excel/solid-excel/test/package-css-side-effects.test.ts
  - rollup.solid-excel.mjs
  - docs/decisions/0020-solid-excel-root-cutover.md
  - .changeset/solid-excel-root-cutover.md
---

# 切换 Solid 包公开入口契约

## 目标

让 `@einfach/solid-excel` 直接导出现役 public API，新增无 vnext 名称的 worker/style 子路径，同时保留现有 vnext 子路径别名与 `/legacy`。

## 粒度

package exports、预编译入口、类型路径、CSS 副作用和迁移说明构成一个发布契约，必须原子验收。

## 上下文

最终契约：`.` → `src/index.ts`；`./vnext` → `src/public.ts`；`./legacy` → `legacy/index.tsx`；`./demos` → `src/demos/index.ts`；`./i18n` → `src/i18n/index.ts`。新增 `./worker-factory`、`./worker-runtime`、`./worker-runtime-full`、`./worker-runtime-core`、`./styles.css`；旧 `./vnext-*` 全部指向同一实现。根入口不含 Demo 或 worker factory。

## 覆盖矩阵行

- `C-006`、`C-007`、`C-008`、`C-009`、`C-014`。

## 接口

### 消费

- 任务 008 的 `src/public.ts`、`legacy/index.tsx` 与 worker leaves。

### 产出

- canonical npm import 面，供任务 010 迁移消费者。
- ADR 0020：记录 root breaking cutover 与兼容别名策略。
- minor changeset：明确旧根消费者改用 `/legacy`。

## 验收标准

1. `npx jest excel/solid-excel/test/package-entry.test.ts excel/solid-excel/test/package-vnext-subpath.test.ts excel/solid-excel/test/package-css-side-effects.test.ts --runInBand` → 全绿。
2. `npm run build:publish` → 成功。
3. `pnpm --filter @einfach/solid-excel pack --pack-destination "$(mktemp -d)"` → tarball 同时含 `src`、`legacy`、对应 `esm`/`@types`，不含 `demo`、`bench`、`test`、`e2e`。
4. `git diff --check` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：W1 全部复审通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：build:publish 发现前序遗漏：legacy demos bridge 仍从不再导出 demos 的 current root barrel 导入；编排者将 `legacy/demos/index.ts` 纳入本叶，授权最小改到 `../../src/demos` 后继续。
- 2026-08-31：执行回执 `DONE`；3 个 package tests、build:publish、2848 项 tarball 与 packed consumer probes 通过；进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；编排者复核 exports/files/sideEffects，任务完成。
