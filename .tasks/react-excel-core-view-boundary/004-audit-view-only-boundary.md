---
id: "004"
title: React view-only 边界审计通过
kind: leaf
parent: null
depends_on: ["001", "002", "003"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-02
done: null
base: null
files:
  - excel/react-excel/src/**
  - excel/react-excel/test/**
  - excel/spreadsheet-ui-core/src/**
  - .tasks/react-excel-core-view-boundary/reports/004-report.md
---

# React view-only 边界审计通过

## 目标

用静态证据和整体验证证明 React workbook 没有复制 atom 状态机或 Rust transport 编排，且三轮边界迁移
没有破坏现有产品行为。

## 交付边界

这是横切覆盖门，只报告漏项，不实现新功能。发现漏项后由编排者新增 `discovered_from: 004` 修复叶，
不得在审计中顺手修改产品代码。

## 上下文

- 允许：React subscription hooks、writable atom 的 UI 输入、DOM 事件、focus/ref、滚动窗口和启动状态。
- 禁止：React 内声明 Einfach atom、直接调用 workbook backend mutation/read、维护 projection/editing
  请求队列、向 core command 注入 history/refresh transport。
- 产品启动层可以创建和 dispose 现有 Rust Worker backend；这不等于 workbook 视图编排 backend 操作。

## 覆盖矩阵行

- `B-004`：React workbook 全目录与 B-001/B-002/B-003 的整体回归证据。

## 接口

### 消费

- 001、002、003 的已审查 diff、报告与公开 atom 接口。

### 产出

- `reports/004-report.md`：逐类列出允许项、禁止项、扫描证据与遗漏；不产生产品代码。

## 验收标准

1. `rg -n "(^|[^[:alnum:]_])atom(<[^>]+>)?\\(" excel/react-excel/src` 零命中。
2. `rg -n "core\\.backend|readVisibleProjection|setCellInput|resolveProjectionAtom|rejectProjectionAtom|historyEntryRecorder|refreshProjection" excel/react-excel/src/workbook`
   零命中。
3. 人工分类所有 `useState`/`useReducer`/`useRef`，每一处都能证明是渲染器或启动状态。
4. React 全量 test/typecheck/build、core build、ESLint、cycle audit 与 `git diff --check` 通过。
5. B-001 至 B-004 每行均有验证证据；任何漏项必须新开修复叶或明确记为范围外，不能把 004 标 done。

## 执行记录（仅编排者回写）

- 等 001、002、003 全部 done 后写入 base 并派发独立审计。
