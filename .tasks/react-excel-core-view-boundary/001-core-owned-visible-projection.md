---
id: "001"
title: 三条现有链统一由 UI-core atoms 驱动
kind: leaf
parent: null
depends_on: []
discovered_from: null
model: gpt-5.6-sol
status: done
created: 2026-09-02
done: 2026-09-02
base: 6f07cae2568596331a2be333791203694d59bc17
files:
  - pnpm-lock.yaml
  - excel/react-excel/package.json
  - excel/react-excel/SKILL.md
  - excel/react-excel/src/app/App.tsx
  - excel/react-excel/src/workbook/runtime/**
  - excel/react-excel/src/workbook/selection/**
  - excel/react-excel/src/workbook/projection/**
  - excel/react-excel/src/workbook/editing/**
  - excel/react-excel/src/workbook/grid/**
  - excel/react-excel/test/**
  - excel/spreadsheet-ui-core/src/createSpreadsheetUi.ts
  - excel/spreadsheet-ui-core/src/index.ts
  - excel/spreadsheet-ui-core/src/runtime/backend-state.ts
  - excel/spreadsheet-ui-core/src/runtime/**
  - excel/spreadsheet-ui-core/src/selection/**
  - excel/spreadsheet-ui-core/src/projection/**
  - excel/spreadsheet-ui-core/src/editing/**
  - excel/spreadsheet-ui-core/src/viewport/**
  - excel/spreadsheet-ui-core/test/**
  - .tasks/react-excel-core-view-boundary/reports/001-report.md
  - .tasks/react-excel-core-view-boundary/reports/001-review.md
---

# 三条现有链统一由 UI-core atoms 驱动

## 目标

Selection、projection、editing 的 React 接入全部改成显式 `@einfach/react` Provider、
`useAtomValue` 和 `useSetAtom`。跨多个 atom 或需要 Rust transport 的操作由
`spreadsheet-ui-core` 的语义 command atom 完成。React 产品源码不再使用 `useState/useReducer`。

## 交付边界

只迁移当前产品已经使用的三条链，不增加新功能，不迁 Store 创建职责，不引入 command bus 或插件层。
DOM focus、pointer capture、滚动测量、ref 和事件适配仍属于 React；业务状态组合与 Rust 调用属于 UI-core。

## 上下文

- `react-excel/SKILL.md` 是本叶的强制实现规范；执行 agent 必须完整读取后再改代码，不得修改该文件。
- `@einfach/react@^0.4.0` 已提供显式 `Provider`、`useAtomValue`、`useSetAtom`；禁止在 React 重写
  `useSyncExternalStore` 或直接包装 `store.setter`。
- `runVisibleProjectionAtom` 和 store-local backend binding 已在 `5aeb6723` 提交，本叶复核并继续消费。
- Selection pointer down/move 目前分别连续写两个 atom；应新增语义 command atom，使一次用户意图只有一个
  React setter 调用。pointer capture 继续留在 React。
- Editing 启动目前由 React 从 projection cells 查值；应新增 core command atom，从当前 projection 解析
  draft 后启动。提交与 refresh retry 应绑定当前 backend 和 visible window，React 不再注入 transport。
- Einfach async setter 不得用 rejected Promise 表达普通业务失败；异步 command 返回显式 outcome。
- 用户验收新增硬约束：`excel/react-excel/src` 中 `useState/useReducer` 必须零命中。`App.tsx` 的 Rust
  loading/error/ready 状态放入 UI-core runtime atom，产品 effect 仍负责创建、await、dispose backend；
  `use-grid-window.ts` 复用既有 viewport metrics/visible-window atoms，不另建 React 或重复 window atom。
- 更新 `excel/react-excel/SKILL.md` 的 Local React state 规则以记录该项目约定；`useRef` 仅继续保存 DOM
  元素、pointer identity/capture 等不触发渲染的身份，不得拿来绕过 atom 保存业务或可渲染状态。

## 覆盖矩阵行

- `B-001`：Selection 读取、点击、拖选、取消 pointer interaction。
- `B-002`：首屏投影、连续滚动最新窗口、Rust terminal failure。
- `B-003`：编辑启动、提交成功、mutation reject、refresh failure/retry、连续编辑两个 Cell。
- `B-004`：显式 Provider、注入 store、多 Provider 隔离。
- `B-007`：App Rust 启动状态、grid visible window、React 源码零 `useState/useReducer`。

## 接口

### 消费

- 既有 selection、projection、editing state atoms。
- `runVisibleProjectionAtom` 与 `spreadsheetBackendBindingAtom`。
- `@einfach/react` 的 `Provider`、`useAtomValue`、`useSetAtom`。

### 产出

- Selection pointer start/update 的 UI-core command atoms；React 每个语义动作只调用一个 setter。
- 从当前 projection 启动指定 Cell 编辑的 UI-core command atom。
- 绑定当前 backend、history unavailable 策略和可见窗口刷新的 editing commit/retry command atoms。
- React 三条链只用 `useAtomValue` / `useSetAtom` 连接公共 atoms；不得在 React 声明 atom。
- UI-core runtime lifecycle atom/commands 表达 loading、ready、error 及 backend binding；React effect 只
  持有外部资源的创建/销毁时序。
- React grid window 直接读取 UI-core `visibleWindowAtom`，滚动通过已有 viewport command 更新 metrics。

## 验收标准

1. `react-excel/package.json` 直接依赖 `@einfach/react@^0.4.0`，runtime 根使用显式 store Provider；测试证明
   两个 Provider 不串 state。
2. 删除 React 自制 `useSyncExternalStore` bridge；三条链读取使用 `useAtomValue`，写入使用
   `useSetAtom`。允许的 `useCallback` 仅限 DOM/ref、测量、focus、滚动和事件形状适配。
3. `rg -n "\\buse(State|Reducer)\\b" excel/react-excel/src` 零命中；App startup 与 grid window 各有
   UI-core atom 单测及 React 行为测试。React 源码仍不得声明 atom，也不得用非 DOM `useRef` 绕过状态。
4. Core tests 覆盖 pointer 组合命令、从 projection 启动编辑、投影并发/失败、editing mutation
   reject、refresh failure/retry，且一次提交只发送一次 Rust mutation。
5. React tests 保持点击/拖选、首屏/滚动、双击、Enter、blur、Escape、拒绝保留草稿和连续编辑通过。
6. 以下扫描零命中：
   - `rg -n "useSyncExternalStore|store\\.setter|store\\.getter" excel/react-excel/src/workbook`
   - `rg -n "core\\.backend|readVisibleProjection|setCellInput|historyEntryRecorder|refreshProjection" excel/react-excel/src/workbook`
   - `rg -n "(^|[^[:alnum:]_])atom(<[^>]+>)?\\(" excel/react-excel/src`
7. `pnpm --filter @einfach/spreadsheet-ui-core build`、React test/typecheck/build、范围 ESLint、
   `pnpm check:cycles`、`git diff --check` 全通过。新增或大改普通文件 `wc -l ≤300`。

## 执行记录（仅编排者回写）

- 2026-09-02：projection transport 已作为 `5aeb6723` 提交；按用户要求把本叶扩为三条现有链的标准
  React atom hooks + UI-core command atom 迁移。002 合并到本叶，等待统一执行报告和独立 review。
- 2026-09-02：初审 `REJECTED`，发现 pointer 状态分叉、unbound projection lane 未释放、editing
  refresh 覆盖新窗口、setter-only `useCallback` 四项阻塞；逐项返修并新增命中反例的定向测试。
- 2026-09-02：返修后二审 `APPROVED`。UI-core 97 suites / 2090 tests、React 7 suites / 16 tests、
  两包 build/typecheck、ESLint、cycles、边界扫描与 diff check 通过；本叶标记 `done`，暂停等待用户验收。
- 2026-09-02：用户验收指出 React 仍有两处 `useState`，拒绝原“renderer-private 可用”的规则；重新打开
  本叶，新增 B-007 与零 `useState/useReducer` 验收，等待实现和独立复审。
- 2026-09-02：App runtime lifecycle 与 grid visible window 已改由 UI-core atoms 驱动，项目 skill 同步
  收紧；三审 `APPROVED`。UI-core 99 suites / 2092 tests、React 8 suites / 19 tests、完整构建与边界扫描
  通过，本叶再次标记 `done` 并暂停等待用户验收。
