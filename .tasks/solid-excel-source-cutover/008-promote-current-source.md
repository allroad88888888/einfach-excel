---
id: "008"
title: 将现役 src-vnext 物理迁到 canonical src
kind: leaf
parent: W1
depends_on: ["007"]
discovered_from: null
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/**
  - excel/solid-excel/src/**
  - excel/solid-excel/test/**
  - excel/solid-excel/e2e/**
  - excel/solid-excel/demo-remote/**
  - excel/solid-excel/vanilla-*/**
  - excel/solid-excel/package.json
  - excel/solid-excel/tsconfig.json
  - rollup.solid-excel.mjs
  - package.json
  - rules/.eslintrc
  - .dependency-cruiser.cjs
---

# 将现役 src-vnext 物理迁到 canonical src

## 目标

用 Git rename 将整个现役树迁到 `src/`，同步全部代码/测试/工具路径，使仓库不存在物理 `src-vnext` 目录。

## 粒度

这是不可拆的路径原子切换：source、259 个 Jest 文件、173 个 E2E spec 与构建工具必须在同一个工作树状态下解析。按文件拆会让任一中间状态无法 typecheck。

## 上下文

保留代码历史，用 `git mv` 而不是复制删除。相对 import 随目录整体移动；测试、remote demo、POC、root scripts、lint/cycle include、Rollup/tsconfig 的显式路径必须同步。历史文档由任务 011 处理，不在这里批量改。

## 覆盖矩阵行

- `C-001`、`C-012`、`C-014`、`C-015`、`C-018`。

## 接口

### 消费

- 任务 001–006 产出的最终现役树。

### 产出

- `excel/solid-excel/src/public.ts` 与 feature 子目录：唯一现役源码树。
- `/vnext` 等现有 package 子路径暂时指向新物理路径，供任务 009 切根。

## 验收标准

1. `test ! -d excel/solid-excel/src-vnext && test -f excel/solid-excel/src/public.ts` → 物理目录完成扶正。
2. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
3. `npm run lint:check && npm run check:cycles` → 零错误。
4. `git grep -n 'src-vnext' -- package.json rules .dependency-cruiser.cjs excel/solid-excel/test excel/solid-excel/e2e excel/solid-excel/demo-remote` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 007 审查通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE`；498 个 rename，无物理 src-vnext，tsc/lint/cycles/目标残留扫描通过；package-entry 仍受 workspace self-reference resolver 环境限制；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：package files 重复 `@types/src` 且漏 `@types/legacy`，package-entry 测试提前断言 009 才切换的 `esm/src/**`；重派修正 008 阶段 manifest/test 契约。
- 2026-08-31：R1 回执 `DONE`；files 同时含 `@types/src`/`@types/legacy`，测试恢复 `esm/src-vnext` 兼容断言，清理 eslint 重复 include，四项验收与 mapper package-entry 通过；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核 manifest 与物理路径门，任务完成。
