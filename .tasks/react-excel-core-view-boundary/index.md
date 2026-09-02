# React Excel · Core / View 边界收敛

创建：2026-09-02

状态：running

## 目标

让 `excel/spreadsheet-ui-core` 独占 atom 状态机、Rust backend 调用与请求编排；让
`excel/react-excel` 只保留 React 订阅、DOM 事件、焦点、布局和产品启动代码。

本树是架构边界修正，不增加新的 Excel 用户功能。现有 1000 行 Rust 工作簿、投影滚动、选择与
连续单格编辑必须保持可用。

## 全局约束

- 不建立新的插件系统、生命周期、Command Bus 或通用事件总线；现有 Einfach atom 是唯一状态与命令面。
- `spreadsheet-ui-core` 负责调用 Rust backend，并把结果写回 atom；React workbook 代码不得直接编排
  backend transport、resolve/reject、重试或 history recorder。
- React 可以写 UI-core 暴露的 writable atom；这属于视图输入适配，不算业务状态复制。
- React 本地只允许渲染器私有状态，例如 loading/error 展示、滚动窗口、DOM pointer capture、focus 和 ref。
- 生产路径只接现有 Rust/WASM Worker；禁止 TS engine、TS worker 或静态数据 fallback。
- 本树不迁移 Solid/Vue；新增 UI-core API 必须是 additive，不能破坏现有框架调用方。
- 每个叶子完成实现、独立 review 和验证后暂停，等用户验收再进入下一叶。
- 普通文件物理行数 `≤300`，每个文件只负责一个业务点或抽象；禁止 barrel 和 `utils` 大杂烩。
- `.project-lines` 继续暂停，不作为执行输入，也不更新。
- 未经用户要求不提交；任务状态与报告不伪造为已 review。

## 覆盖矩阵

| id | 表面 / 状态 | 精确入口或路径 | 归属叶子 | 验证证据 | 状态 |
|---|---|---|---|---|---|
| B-001 | 首屏与滚动投影 | `react-excel/src/workbook/projection/use-workbook-viewport.ts` | 001 | core command tests + React projection tests | running |
| B-002 | 单格提交、失败与重试 | `react-excel/src/workbook/editing/use-cell-edit.ts` | 002 | React editing tests + core bound-editing tests | pending |
| B-003 | Store 创建与 selection bounds 初始化 | `react-excel/src/app/App.tsx`、`workbook/runtime/WorkbookRuntimeProvider.tsx` | 003 | App/provider tests + source audit | pending |
| B-004 | React workbook 无越界 atom/backend 编排 | `react-excel/src/workbook/**` | 004 | 静态扫描 + 全量 React 验证 | pending |

## 阶段与优先级

```text
P0 / 001 Core 接管可见投影
  └─ P0 / 002 Core 接管单格提交
      └─ P1 / 003 Core 接管 Store 初始化
          └─ P1 / 004 审计 React 只剩视图职责
```

| id | 交付点 | priority | model | status | base | report | review |
|---|---|---|---|---|---|---|---|
| 001 | 连续投影只由 UI-core 调 Rust | P0 | gpt-5.6-sol | running | 6f07cae2568596331a2be333791203694d59bc17 | pending | pending |
| 002 | 单格提交只由 UI-core 编排 | P0 | gpt-5.6-sol | pending | 等 001 done 后写入 | pending | pending |
| 003 | 生产 Store 只由 UI-core 创建和初始化 | P1 | gpt-5.6-terra | pending | 等 002 done 后写入 | pending | pending |
| 004 | React view-only 边界审计通过 | P1 | gpt-5.6-sol | pending | 等 003 done 后写入 | pending | pending |

## 当前进度

- 001 已有未提交实现和本地验证，尚未生成执行报告，也没有独立 review，因此保持 `running`。
- 002、003、004 不得在 001 review 和用户验收前开工。

## 决策与变更

- 裁决：不再设计独立插件运行时 — atom 层与框架视图层已经覆盖当前扩展需求；错了的代价是未来若需要
  第三方动态安装、热卸载或版本协商，需要另开独立 Plugin Host 任务。
- 裁决：`spreadsheet-ui-core` 是状态与 Rust 编排核心，React/Solid/Vue 是视图实现 — 避免每个框架重复
  transport 和状态机；错了的代价是 UI-core API 需要承担更稳定的跨框架合同。
- 裁决：新建本树，不修改两个已经完成的 React 历史任务目标 — 保留已验收 demo 和目录迁移的事实；
  错了的代价是任务记录分散在三棵树，但边界和提交阶段不会被混写。

## 遗留与发现

- `spreadsheet-ui-core/src/projection/index.ts` 是存量超限核心文件；001 只通过独立 command 文件复用其
  现有 atom，没有顺手拆解该状态机。
- Solid 和 Vue 目前也各自存在 visible projection transport；本树只保证新增 UI-core 能力可被它们后续
  消费，不在 React 验收批次中同时迁移。
