# 批注/评论 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/comments/ +
> excel/solid-excel/src-vnext/comments/SpreadsheetCommentThread.tsx
> 存量 spec 行数超限登记：无（toolbar-comment.spec.ts 114 行）

## 能力边界（按实现核实）

- 两个 demo 后端（wave5 静态 / worker 双 runtime）都**未实现** `postComment` /
  `resolveCommentThread` / `deleteComment` port → Post 走 fail-closed 路径，
  `comment-mutation-error`（role=alert）显示 "Comment post is unavailable"。
- 网格**无批注指示器渲染**（SpreadsheetGrid 无任何 comment 相关 DOM）。
- Resolve 按钮仅在 `session.threadId != null` 时渲染；工具栏/菜单入口打开
  session 均不带 threadId → demo 里 resolve 按钮永不可见。
- 面板锚点在打开时快照 active cell，**不跟随**后续选区移动（无同步 effect）；
  重开 session（open/close/再 open）会重置 draft 为空。

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| CM-01 | 工具栏批注按钮可见/本地化 | Wave5 → 查按钮属性 | tooltip/aria 非 raw key | ✅ 存量 | toolbar-comment #"comment button is visible, enabled, and has translated labels" |
| CM-02 | 打开面板并锚定 active cell | 点 D4 → comment | thread 可见，cell 标签含 D4 + sheet-1 | ✅ 存量 | toolbar-comment #"clicking comment opens a wave5 comment thread anchored to active cell" |
| CM-03 | 面板输入草稿并关闭 | 填 textarea → close | 值写入；关闭后 DOM 移除 | ✅ 存量 | toolbar-comment #"comment thread supports typing and can be closed" |
| CM-04 | 编辑中批注按钮禁用 | dblclick 进入 drafting | 按钮 disabled，Escape 后恢复 | ✅ 存量 | toolbar-comment #"comment button is disabled while cell is drafting" |
| CM-05 | 重开 session 草稿清空 + Escape 关闭 | 开→打字→Escape 关→重开 | Escape 移除面板；重开后 textarea 为空 | 🆕 本轮 | comment-thread-flows.spec.ts |
| CM-06 | 面板不跟随选区，重按钮才重锚 | 开在 D4 → 点 F6 → 再点 comment | 标签保持 D4；重按钮后变 F6 且草稿清空 | 🆕 本轮 | comment-thread-flows.spec.ts |
| CM-07 | 空草稿 Post 拒绝并提示 | 不输入直接 Post | alert "A non-empty comment body…" | ⏳ P2 延后 | —（reserve 命令里 port 缺失检查先于空草稿检查，demo 后端全都无 port → 该分支不可达；已由 ui-core 单测覆盖） |
| CM-08 | 无 port 后端 Post fail-closed | 有草稿点 Post | alert "Comment post is unavailable"，面板不关闭、草稿保留、无 resolve 按钮 | 🆕 本轮 | comment-thread-flows.spec.ts |
| CM-09 | 添加批注后单元格指示器出现/删除后消失 | — | — | ⏳ P2 延后 | —（无指示器渲染：网格不消费任何批注投影，且后端无 port，属产品未实现面） |
| CM-10 | 线程回复列表 / 多条回复 | — | — | ⏳ P2 延后 | —（面板无历史回复列表 UI，仅单 textarea；线程数据留在后端而 demo 后端无 port） |
| CM-11 | 解决/重开线程 | — | — | ⏳ P2 延后 | —（resolve 按钮仅 threadId 存在时显示，demo 无任何入口能带 threadId 打开 session） |
| CM-12 | 删除批注 | — | — | ⏳ P2 延后 | —（无删除 UI 入口；`deleteComment` port 仅存在于 backend 类型层） |

## 备注

- CM-07/CM-08 断言的是**用户可见** role=alert 文本 —— 这是 fail-closed 合同
  （评论 README：fulfillment 是 local evidence）在 UI 上的唯一表面。
- 若未来任一 demo 后端接上 comment port，CM-08 需要改写为真实提交路径，
  CM-09..12 从 ⏳ 转 🆕。
