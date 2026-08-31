---
id: "007"
title: 迁移旧表格实现到 legacy 树
kind: leaf
parent: W1
depends_on: ["006"]
discovered_from: null
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src/**
  - excel/solid-excel/legacy/**
  - excel/solid-excel/demo/App.tsx
  - excel/solid-excel/test/**
  - excel/solid-excel/test/Cell.test.tsx
  - excel/solid-excel/test/ContextMenu.test.tsx
  - excel/solid-excel/test/Table.test.tsx
  - excel/solid-excel/test/file-import.test.ts
  - excel/solid-excel/test/js-sheet.test.ts
  - excel/solid-excel/test/observe-cell.test.ts
  - excel/solid-excel/test/sheet-store.test.ts
  - excel/solid-excel/test/wasm-sheet-proxy.test.ts
  - excel/solid-excel/test/wasm-workbook-proxy.test.ts
  - excel/solid-excel/test/workbook-store.test.ts
  - excel/solid-excel/test/worker-workbook-store.test.ts
  - excel/solid-excel/package.json
  - rollup.solid-excel.mjs
---

# 迁移旧表格实现到 legacy 树

## 目标

把任务 006 后剩余的旧 `src/` 原样迁到 `legacy/`，更新 legacy tests 与临时发布入口，不改变旧 API 行为。

## 粒度

这是同型机械路径搬迁；逐文件拆 issue 会制造无效中间树。存量超限文件只搬迁、不重构，已在 index 记账。

## 上下文

搬迁后 `src/` 路径暂时空缺，现役仍在 `src-vnext/`；任务 008 随后占用 `src/`。此任务必须保持包根与 `/legacy` 临时指向 `legacy/index.tsx`，让 legacy tests 可独立运行。

## 覆盖矩阵行

- `C-002`、`C-004`、`C-012`。

## 接口

### 消费

- 旧 `src/index.tsx` 的完整导出面。

### 产出

- `legacy/index.tsx`：旧 API 唯一源码入口。
- `legacy/demos/index.ts`：`?legacy=1` 的旧 Demo 集合。

## 验收标准

1. `test ! -d excel/solid-excel/src && test -f excel/solid-excel/legacy/index.tsx` → 路径状态符合阶段目标。
2. `npx jest excel/solid-excel/test/Cell.test.tsx excel/solid-excel/test/Table.test.tsx excel/solid-excel/test/sheet-store.test.ts excel/solid-excel/test/wasm-workbook-proxy.test.ts --runInBand` → legacy 代表组全绿。
3. `npx jest excel/solid-excel/test/package-entry.test.ts --runInBand` → 临时根入口与 `/legacy` 均可导入。

## 执行记录（仅编排者回写）

- 2026-08-31：依赖 006 复审通过后派发，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE`；36 个 100% rename、104 个 legacy 测试与映射后的 package entry probe 通过；原 package-entry 命令受 workspace self-reference resolver 阻断。
- 2026-08-31：编排者在审查前补正 files：加入迁移必需的 `demo/App.tsx` 与 `test/**` 消费面；它们与 008 串行，不产生兄弟写入冲突。进入独立审查。
- 2026-08-31：独立审查 `APPROVED`；类型打包清单 Minor 与 E2E 深层路径 Info 记入 index，任务完成。
