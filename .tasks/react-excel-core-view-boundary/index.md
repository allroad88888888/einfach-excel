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
- 默认不迁移 Solid/Vue；但用户随后明确要求删除旧 `commitEditingAtom` 并检查 Vue 是否能同步移除，因此
  001 可做这条 editing API 的仓库内一次性迁移，禁止借机扩大到其它 Solid/Vue 链路。
- 每个叶子完成实现、独立 review 和验证后暂停，等用户验收再进入下一叶。
- 普通文件物理行数 `≤300`，每个文件只负责一个业务点或抽象；禁止 barrel 和 `utils` 大杂烩。
- `.project-lines` 继续暂停，不作为执行输入，也不更新。
- 未经用户要求不提交；任务状态与报告不伪造为已 review。

## 覆盖矩阵

| id | 表面 / 状态 | 精确入口或路径 | 归属叶子 | 验证证据 | 状态 |
|---|---|---|---|---|---|
| B-001 | Selection 读写与 pointer 选择 | `react-excel/src/workbook/selection/**` | 001 | core command tests + React selection tests | done |
| B-002 | 首屏与滚动投影 | `react-excel/src/workbook/projection/**` | 001 | core command tests + React projection tests | done |
| B-003 | 单格启动、提交、失败与重试 | `react-excel/src/workbook/editing/**` | 001 | core command tests + React editing tests | done |
| B-004 | 显式 Provider 与 hooks store 隔离 | `react-excel/src/workbook/runtime/**` | 001 | provider isolation tests + source audit | done |
| B-005 | Store 创建与 selection bounds 初始化 | `react-excel/src/app/App.tsx`、`workbook/runtime/WorkbookRuntimeProvider.tsx` | 003 | App/provider tests + source audit | pending |
| B-006 | React workbook 无越界 atom/backend 编排 | `react-excel/src/workbook/**` | 004 | 静态扫描 + 全量 React 验证 | pending |
| B-007 | React 产品零 `useState/useReducer` | `react-excel/src/**` | 001 | runtime/window atom tests + static scan | done |

## 阶段与优先级

```text
P0 / 001 三条现有链统一使用 React atom hooks + UI-core command atoms
  └─ P1 / 003 Core 接管 Store 初始化
      └─ P1 / 004 审计 React 只剩视图职责
```

| id | 交付点 | priority | model | status | base | report | review |
|---|---|---|---|---|---|---|---|
| 001 | Selection / projection / editing 统一 atom 接入 | P0 | gpt-5.6-sol | done | 6f07cae2568596331a2be333791203694d59bc17 | `reports/001-report.md` | `reports/001-review.md` |
| 002 | 单格提交只由 UI-core 编排（已合并到 001） | P0 | gpt-5.6-sol | skipped | n/a | n/a | n/a |
| 003 | 生产 Store 只由 UI-core 创建和初始化 | P1 | gpt-5.6-terra | pending | 等 001 done 后写入 | pending | pending |
| 004 | React view-only 边界审计通过 | P1 | gpt-5.6-sol | pending | 等 003 done 后写入 | pending | pending |

## 当前进度

- 001 三审后的 editing 拆分、Rust history 边界与滚动 retained projection 已完成三轮增量复审；最后
  `APPROVED`。当前暂停在用户验收点，未启动 003。
- 002 的 editing 范围已合并进 001，标记 `skipped`，避免同一链拆成两次无法独立验收的迁移。
- 003、004 不得在用户验收 001 前开工。

## 决策与变更

- 裁决：不再设计独立插件运行时 — atom 层与框架视图层已经覆盖当前扩展需求；错了的代价是未来若需要
  第三方动态安装、热卸载或版本协商，需要另开独立 Plugin Host 任务。
- 裁决：`spreadsheet-ui-core` 是状态与 Rust 编排核心，React/Solid/Vue 是视图实现 — 避免每个框架重复
  transport 和状态机；错了的代价是 UI-core API 需要承担更稳定的跨框架合同。
- 裁决：新建本树，不修改两个已经完成的 React 历史任务目标 — 保留已验收 demo 和目录迁移的事实；
  错了的代价是任务记录分散在三棵树，但边界和提交阶段不会被混写。
- 变更：用户要求三条现有链一次统一成标准 atom 接入，因此 002 合并到 001；错了的代价是本次 review
  面更大，但可以一次消除三套手写订阅与 setter 包装，避免中间态继续扩散。
- 变更：用户明确要求 React 产品零 `useState/useReducer`，覆盖原先“renderer-private 可用”的宽松规则；
  可见窗口复用 UI-core viewport atoms，Rust 启动状态新增 UI-core runtime atom，但 backend 创建/销毁仍留
  产品 effect。错了的代价是 DOM 私有状态未来也需建 atom；当前 React 仅保留 `useRef` 表达 DOM 身份。
- 裁决：001 复审继续保留原始 base `6f07cae2568596331a2be333791203694d59bc17`；后续改动是同一未提交
  工作区中的连续返修，若改写为当前 HEAD 会让 reviewer 漏审此前未提交差异。代价是复审范围较大，但证据完整。
- 变更：用户在 001 三审后明确要求删除 `commitEditingAtom`，并要求检查 Vue 调用方能否一起清掉；该明确
  指令覆盖本树最初的 additive / 不迁移框架约束，仅限此 editing API。错了的代价是对仓库外未知消费者
  产生源码兼容破坏；当前 package 仍是 workspace 内部版本，仓库内调用方必须一次迁完并由跨框架测试兜底。
- 裁决：`editing/session-atoms.ts` 中的 `debugger` 是用户亲自加入、用于现场追踪编辑入口的诊断点；agent
  不得擅自删除，也不把它冒充成本叶新增产物。代价是开启 DevTools 时会暂停，最终清理需由用户明确授权。

## 遗留与发现

- `spreadsheet-ui-core/src/projection/index.ts` 是存量超限核心文件；001 只通过独立 command 文件复用其
  现有 atom，没有顺手拆解该状态机。
- Solid 和 Vue 目前也各自存在 visible projection transport；本树只保证新增 UI-core 能力可被它们后续
  消费，不在 React 验收批次中同时迁移。
- B-007 reviewer 认为当前 attempt-local `active` + 幂等 dispose 足以处理 StrictMode 与晚到 Promise，
  但尚无显式 StrictMode/late-settlement 自动化用例；记为非阻塞测试风险，不冒充已覆盖。
