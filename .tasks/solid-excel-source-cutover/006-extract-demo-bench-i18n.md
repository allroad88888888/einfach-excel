---
id: "006"
title: 清空旧 src 的非 legacy 职责
kind: leaf
parent: W1
depends_on: ["003", "004", "005", "019"]
discovered_from: null
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src/App.tsx
  - excel/solid-excel/src/main.tsx
  - excel/solid-excel/src/LocaleSwitcher.tsx
  - excel/solid-excel/src/styles.css
  - excel/solid-excel/src/bench/**
  - excel/solid-excel/src/i18n/**
  - excel/solid-excel/src-vnext/**
  - excel/solid-excel/demo/**
  - excel/solid-excel/bench/**
  - excel/solid-excel/index.html
  - excel/solid-excel/tsconfig.json
  - excel/solid-excel/e2e/helpers.ts
  - excel/solid-excel/e2e/demos/**
---

# 清空旧 src 的非 legacy 职责

## 目标

把本地 App 壳迁到 `demo/`、基准迁到 `bench/`、共享 i18n 迁入 `src-vnext/i18n/`，让旧 `src/` 只剩 legacy 实现。

## 粒度

三类移动共同服务“清空旧 src 的非 legacy 职责”；拆开会在 App、tsconfig、index.html 和 i18n import 间制造无法运行的中间态。

## 上下文

默认 `/` 只展示现役 Demo；`/?legacy=1` 展示旧 Demo parity 导航；`/?bench=1` 保持原基准契约。legacy E2E 由 `gotoDemo` 自动补 `legacy=1`，现役 helper 不得携带该参数。旧 392 行 Demo CSS 按 app shell/navigation 两个职责拆到 `demo/`。

## 覆盖矩阵行

- `C-003`、`C-004`、`C-005`、`C-009`、`C-013`。

## 接口

### 消费

- 任务 005 的 canonical Demo barrel。
- 既有 legacy Demo 名称与 benchmark registry。

### 产出

- `demo/main.tsx` 与 `demo/App.tsx`：唯一 Vite app 入口。
- `bench/BenchRoot.tsx` 与原 registry/types：保持 `?bench=1`。
- `src-vnext/i18n/index.ts`：供现役组件与 `/i18n` 包入口使用。

## 验收标准

1. `npm run build -w @einfach/solid-excel` → Vite 演示入口构建成功，产物不包含路径解析错误。
2. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts e2e/demos/demo-budget.spec.ts --project=wasm` → current 与 legacy 各一条通过。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零错误。
4. `wc -l excel/solid-excel/demo/*.{ts,tsx,css} 2>/dev/null` → 普通文件均不超过 300 行。

## 执行记录（仅编排者回写）

- 2026-08-31：W0 全部替代叶复审通过后派发，model=`gpt-5.6-sol`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE`；build/tsc、25 个 wasm current+legacy E2E 通过，Demo 文件 11–196 行；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：CSS 语法块跨文件断开且 navigation/import toolbar 职责交叉；`gotoDemo` 未覆盖冲突的 legacy/bench flag；重派按真实 CSS 职责与规范 query merge 修复。
- 2026-08-31：R1 回执 `DONE`；CSS 重排为四个完整职责，gotoDemo 规范覆盖 legacy 并删除 bench，新增冲突 query E2E，26/26 通过；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核 Demo CSS/TS/TSX 行数（最大 164）与 query merge，任务完成。
