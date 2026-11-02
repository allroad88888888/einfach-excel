# W0：共享状态和宿主边界

> 此波次的工作不是“补一个界面”。它负责让后续模型可以在不争用同一状态文件的前提下修复交互。
> 所有范围外文件只读；变更导致文件超过 300 行时，按职责拆分是交付的一部分。

| 执行 Issue                       | 唯一模型                 | 判定 | 独占范围                                                                                                      | 依赖   | 交付目标与非目标                                                                                                                                     | 证据                                                                                 |
| -------------------------------- | ------------------------ | ---- | ------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| IX-001 Provider / Store 所有权   | `model-provider`         | 重构 | `solid-excel/src/provider/**`                                                                           | 无     | 每工作簿只经 Einfach Store 注入；移除非必要 Context 产品入口，拆 Provider 生命周期桥。**不改** grid 或功能域命令。                                   | `vnext-provider` 测试；重挂载与独立 Store 证明；无新增本地产品状态。                 |
| IX-002 Grid 原子订阅和类型边界   | `model-grid-host`        | 重构 | `solid-excel/src/grid/**`                                                                               | IX-001 | 以窄类型 feature adapter 和 `@einfach/solid` 订阅替代 `Record<string, any>` runtime 与 `renderTick`/订阅扇出。**不改** core selection/editing 语义。 | grid、overlay、scroll-anchor 测试；没有以 signal 保存 selection/editing/projection。 |
| IX-003 Worker runtime 句柄所有权 | `model-worker-runtime`   | 重构 | `solid-excel/src/adapter/worker-*.ts` 中的运行时资源、session、snapshot 与 workbook handler；专属新模块 | IX-001 | 把 session 与 custom-formula 句柄收进每 workbook runtime；UI 的期望/错误仍在 Atom。**不重写** WASM 引擎。                                            | worker session/custom-formula 回归；多 workbook 隔离证据。                           |
| IX-004 命令壳契约                | `model-command-shell`    | 重构 | `src/commands/**`（新）及专属测试                                                                       | IX-001 | 拆出纯命令解析、可用性 projection、presentation adapter。**不在本 Issue 重做**具体格式/数据命令，也不在超限菜单壳中继续堆代码。                      | menu/toolbar 既有单测与 command-shell 单测；每项命令继续走 command Atom。            |
| IX-005 Overlay 焦点与关闭契约    | `model-overlay-contract` | 重构 | `solid-excel/src/overlay/**`（新）及专属测试                                                            | IX-001 | 定义可复用 focus return、Escape、焦点陷阱和 anchor 生命周期接口；open/draft/pending/error 仍由领域 Atom。**不批量迁移**既有 dialog。                 | 新契约组件测试和键盘路径测试。                                                       |
| IX-006 用户反馈与恢复状态面      | `model-feedback-surface` | 重构 | `solid-excel/src/feedback/**`（新）及专属测试                                                           | IX-001 | 定义 command failure、loading、retry/recovery 的可见呈现契约。**不重做**各领域已有重试状态机，也不抢跑具体业务面的迁移。                             | feedback 组件测试；一条失败→提示→重试契约路径。                                      |

## 审计依据

- Grid 的 `grid-runtime.ts` 是无类型 `Record<string, any>`，`grid-view-state.ts` 与
  `grid-lifecycle.ts` 用 signal/tick 聚合多个 Atom 更新；这是唯一需要先重构的 UI 状态响应边界。
- Provider 有每工作簿 Store 的正确方向，但 custom-formula 同步账本和 history retry 仍有闭包或
  `WeakMap` 侧通道；它们只能由 IX-001 的模型处理。
- `SpreadsheetToolbar.tsx`（1,978 行）、`SpreadsheetMenuBar.tsx`（1,062 行）、
  `SpreadsheetContextMenu.tsx`（964 行）不能由后续页面 Issue 并行修改。
- 对话框现状各自绑定 Escape 和焦点，尚无通用契约；diagnostics 已有 Atom，但没有完整通知渲染闭环。

## 第一批交付记录（已复验）

| 执行 Issue | 结果         | 已验证边界                                                                                                                  | 后续不应误判为已完成的范围                                                                    |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| IX-001     | 完成         | Provider 只注入 Einfach Store；custom-formula ledger 转为 provider-local bridge；history retry 目标回到 Store-scoped Atom。 | 保留的 raw Context 仅为兼容出口，内部没有消费者；外部直读者需在后续兼容性版本中迁移。         |
| IX-002     | 完成         | Grid 直接消费 `@einfach/solid` Atom，移除 Proxy/`Record<any>` runtime、`renderTick` 和宽订阅刷新。                          | 后续 grid 体验叶子仍须逐条修复；现有未改的 `SpreadsheetGridOverlay.tsx` 仍为 713 行存量文件。 |
| IX-003     | 完成         | session、subscription、snapshot、custom formula 句柄归每 worker runtime owner；新建工作簿前释放旧资源。                     | Dedicated Worker 终止仍依赖浏览器 isolate 回收，协议未新增 dispose RPC。                      |
| IX-004     | 基础契约完成 | 菜单栏、右键菜单和工具栏可用性被解析为纯 command presentation；执行只委托既有 command Atom。                                | 1,062/964/1,978 行的既有 Menu/ContextMenu/Toolbar 尚未迁移，留给 UI-303 至 UI-305。           |
| IX-005     | 完成         | overlay 的 active/close、焦点归还、Escape、Tab trap、anchor DOM 生命周期成为独立契约。                                      | 尚无跨 feature 的 overlay stack 或 modal inert；由 UI-505 的串行迁移处理。                    |
| IX-006     | 基础契约完成 | Atom 状态可被映射为 loading/error/retry feedback；retry 仍由原 command 回调拥有。                                           | 尚未接入具体业务页面，UI-506、UI-508 负责迁移。                                               |

根侧复验：相关 Jest **13 suites / 190 tests** 通过，且
`npx tsc --noEmit -p excel/solid-excel/tsconfig.json` 与 `git diff --check` 通过，并已按 Issue 独立提交。

对应独立提交：IX-001 `8c63284`；IX-002 `5f9122b`；IX-003 `b09b5fa`；IX-004 `fa25a2d`；
IX-005 `03ab50e`；IX-006 `222c913`。
