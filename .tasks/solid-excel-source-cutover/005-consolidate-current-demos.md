---
id: "005"
title: 为现役 Demo 建立非 vnext 命名的公共边界
kind: leaf
parent: W0
depends_on: []
discovered_from: null
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/src-vnext/demos/**
  - excel/solid-excel/src-vnext/index.tsx
  - excel/solid-excel/src/App.tsx
  - excel/solid-excel/test/vnext-menu-bar.test.tsx
  - excel/solid-excel/test/package-entry.test.ts
---

# 为现役 Demo 建立非 vnext 命名的公共边界

## 目标

把两个超限 Demo 的 seed、probe、workbook host 拆开，并提供 `SpreadsheetSmokeDemo`、`SpreadsheetWorkerDemo`、`SpreadsheetTsWorkerDemo`、`SpreadsheetWorkbenchDemo` 四个 canonical 名称。

## 粒度

每个 Demo 仍是一个用户场景；只把稳定 seed/probe/runtime 从组件渲染中抽出，不按 UI 控件碎片化。

## 上下文

现有 `VNext*` 名称由 package `/demos` 消费。保留这些名称作为同对象别名，默认 App 改用 canonical 名称；nav id、URL backend 选择和测试入口不变。

## 覆盖矩阵行

- `C-003`：默认 Demo 组件集合。
- `C-009`：`./demos` 导出面。
- `C-018`：Demo 文件行数。

## 接口

### 消费

- 现有四个 `VNext*Demo` 行为与 testid。

### 产出

- `src-vnext/demos/index.ts`：canonical 名称与兼容别名的唯一 Demo barrel。
- seed/probe 模块：不渲染 DOM，只提供对应 Demo 所需数据或调试生命周期。

## 验收标准

1. `find excel/solid-excel/src-vnext/demos -type f -print0 | xargs -0 wc -l` → i18n 资源外每个文件不超过 300 行。
2. `npx jest excel/solid-excel/test/vnext-menu-bar.test.tsx excel/solid-excel/test/package-entry.test.ts --runInBand` → 全绿。
3. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts --project=wasm` → canonical Demo 可见路径通过。

## 执行记录（仅编排者回写）

- 2026-08-31：派发执行，model=`gpt-5.6-terra`，base=`723082739d66140ac697a5a9c203a6fd99649d4a`。
- 2026-08-31：执行回执 `DONE`；Demo 最大 237 行，84 个 Jest 与 19 个 wasm Playwright smoke 通过；进入独立审查。
- 2026-08-31：独立审查 `REJECTED`（R1）：worker seed 混入 probe/debug 状态，workbook host 仍内嵌 logger 生命周期；重派原执行 agent 做真实 seed/probe/host 三分并清理测试噪音。
- 2026-08-31：R1 回执 `DONE`；拆出 config、seed、probe 生命周期、probe logger、workbook host 五个职责文件，84 个 Jest 与 19 个 smoke 复验通过；进入复审。
- 2026-08-31：R1 复审 `REJECTED`（R2）：host 仍包含 selection 初始化、custom formula 注册生命周期、probe logger 挂载；重派抽出 runtime 初始化并把 logger 组合移到 Demo 外壳。
- 2026-08-31：R2 回执 `DONE`；新增无 DOM runtime bootstrap，host 降到纯 UI surface，84 个 Jest 与 19 个 smoke 通过；进入第二次复审。
- 2026-08-31：R2 复审 `APPROVED`；编排者复核 Demo 行数验收（最大 237 行），任务完成。
