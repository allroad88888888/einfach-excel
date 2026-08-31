---
id: "011"
title: 统一现行架构文档术语
kind: leaf
parent: W2
depends_on: ["010"]
discovered_from: null
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - CLAUDE.md
  - CONTRIBUTING.md
  - README.md
  - README.zh-CN.md
  - docs/**
  - excel/solid-excel/README.md
  - excel/solid-excel/docs/**
  - excel/spreadsheet-ui-core/src/**/README.md
---

# 统一现行架构文档术语

## 目标

更新所有现行规范、架构图、教程和源码引用，使 `src` 表示现役实现、`legacy` 表示旧实现，并写清 npm 入口迁移。

## 粒度

这是同一术语的横切文档迁移；按文档逐 issue 会让同一架构在多个页面暂时互相矛盾。

## 上下文

只改现行事实。两个 archive 树、日期化 observation、旧 ADR 的历史正文保留旧路径；若链接检查需要，使用仓内既有 stale-path 标注机制，不改写事件发生时的路径。

## 覆盖矩阵行

- `C-016`、`C-017`。

## 接口

### 消费

- 任务 009 的 ADR 0020 与最终 exports。

### 产出

- 现行文档统一使用 `excel/solid-excel/src` 和 canonical npm imports。

## 验收标准

1. `npm run check:docs` → 零死链。
2. `git grep -n 'excel/solid-excel/src-vnext\|@einfach/solid-excel/vnext' -- CLAUDE.md CONTRIBUTING.md README.md README.zh-CN.md docs/ARCHITECTURE.md docs/QUICKSTART.md excel/solid-excel/README.md` → 零结果。
3. `git diff --check` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 010 复审通过后派发，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：首审 `REJECTED`；进入 R1 修复错误 worker 示例、悬空路径与被机械改写的历史证据。两处越界源码注释和两条跨白名单死链转由发现叶 020 接管。
- 2026-08-31：R1 复审 `APPROVED`；错误示例、路径、职责描述与历史快照均已闭环，文档检查恢复为绿。
