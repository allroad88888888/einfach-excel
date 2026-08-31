---
id: "010"
title: 将仓内可执行消费者迁到 canonical 包入口
kind: leaf
parent: W2
depends_on: ["009"]
discovered_from: null
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/excel-site/src/**
  - excel/excel-site/astro.config.mjs
  - excel/excel-site/vite.config.ts
  - templates/vite-starter/**
  - excel/rust/wasm/README.md
  - docs/recipes/**
  - docs/QUICKSTART.md
---

# 将仓内可执行消费者迁到 canonical 包入口

## 目标

把官网、starter 和可复制配方从 `/vnext`、`/vnext-worker-factory`、`/vnext-styles.css` 迁到根入口、`/worker-factory`、`/styles.css`。

## 粒度

这些文件共同构成外部用户复制路径；代码与同页片段必须一起迁移，避免示例与真实消费者漂移。

## 上下文

不要迁移日期化 observation 中记录的历史命令。Astro/Vite optimizeDeps 与 alias 必须使用 canonical 子路径；安装依赖清单不变。

## 覆盖矩阵行

- `C-010`、`C-011`、`C-013`。

## 接口

### 消费

- 任务 009 产出的 canonical package entries。

### 产出

- 官网与 starter 成为 canonical 入口的真实编译见证。

## 验收标准

1. `npm run typecheck -w @einfach/excel-site && npm run check:docs -w @einfach/excel-site` → 全绿。
2. `npm run build -w @einfach/excel-site` → 成功。
3. `npm --prefix templates/vite-starter run build` → starter 构建成功。
4. `git grep -n '@einfach/solid-excel/vnext' -- excel/excel-site/src templates/vite-starter docs/QUICKSTART.md docs/recipes` → 零结果。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 009 审查通过后派发，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE_WITH_CONCERNS`；site type/docs/build 与残留扫描通过，starter 因无本地 node_modules 未启动。编排者要求用当前 tarball 无保存安装依赖后补跑，不接受环境缺包作为最终证据。
- 2026-08-31：当前 solid-excel tarball 已编译 880 modules，但 registry styles@0.1.0 缺 `filter-dropdown.css`；编排者要求同时安装当前 workspace styles tarball，排除混版依赖后完成 starter build。
- 2026-08-31：最终回执 `DONE`；当前 solid-excel+styles tarballs 下 starter build 886 modules 通过，site type/docs/build 与残留扫描全绿，验证产物已清理；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：Astro recipe 漏 `/worker-factory` optimizeDeps，Next/Nuxt recipe 残留旧 factory，WASM README 残留 src-vnext；重派并扩大残留扫描。
- 2026-08-31：R1 回执 `DONE`；四处 current 文档漂移修正，更宽残留扫描为零，site type/docs/build 全绿；进入复审。
- 2026-08-31：R1 复审 `APPROVED`；编排者复核任务路径宽残留扫描为零，任务完成。
