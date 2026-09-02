---
id: "003"
title: 生产 Store 只由 UI-core 创建和初始化
kind: leaf
parent: null
depends_on: ["001"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-02
done: null
base: null
files:
  - excel/spreadsheet-ui-core/src/createSpreadsheetUi.ts
  - excel/spreadsheet-ui-core/src/selection/**
  - excel/spreadsheet-ui-core/test/**
  - excel/react-excel/src/app/App.tsx
  - excel/react-excel/src/workbook/runtime/**
  - excel/react-excel/test/**
  - .tasks/react-excel-core-view-boundary/reports/003-report.md
---

# 生产 Store 只由 UI-core 创建和初始化

## 目标

React 产品不再创建 Einfach store 或直接初始化 selection bounds；生产 store 由
`createSpreadsheetUi` 创建，并在同一入口完成初始 bounds 写入。

## 交付边界

Store 所有权决定 atom 隔离、backend 绑定和未来多工作簿行为，值得独立 review。测试仍可显式注入 store
以读取断言，但生产 `App.tsx` 不拥有它。

## 上下文

- 当前 `App.tsx` 在模块级调用 `createStore()`，随后写 `setSelectionBoundsAtom`。
- `createSpreadsheetUi` 已能创建缺省 store，并在 001 后负责绑定 backend。
- 产品仍需要把 1001 行、8 列的初始 bounds 作为配置传给 core；它不是 React 本地状态。

## 覆盖矩阵行

- `B-003`：默认 store、注入测试 store、初始 selection bounds、多实例隔离。

## 接口

### 消费

- `setSelectionBoundsAtom`：UI-core 内部初始化现有 selection 状态。

### 产出

- `SpreadsheetUiCoreOptions.initialSelectionBounds?: SelectionBounds`：创建 core 时一次性初始化 bounds。
- `WorkbookRuntimeProviderProps.initialSelectionBounds: SelectionBounds`：只传配置，不暴露 setter。

## 验收标准

1. `rg -n "createStore|setSelectionBoundsAtom" excel/react-excel/src` 零命中。
2. Core tests 证明缺省 store、注入 store和两个 core 实例互不污染。
3. React tests 继续能断言 selection，生产 App 仍显示 1000 条数据并能到达最后一行。
4. 两包 typecheck、React test/build、范围 ESLint、cycle audit 与 `git diff --check` 通过。
5. 不把 store 转移到新的 React singleton、context helper 或模块级缓存。

## 执行记录（仅编排者回写）

- 等 001 独立 review 与用户验收后写入 base 并派发。
