# CHANGES_REQUIRED

复核日期：2026-09-01

复核基准：`97110f118bfcc792fda0b4a1fe5e9bc3c3fb69d4`

复核范围：完整阅读 `index.md`、`003-rust-cell-edit.md` 与
`reports/003-report.md`；按任务 `files` 静态核对 base 到当前工作树的全量 diff，
包括 untracked 新文件。未重跑 Jest、typecheck、build、bundle/source scan 或浏览器
验收；未修改产品、任务文件、index 或状态。

## 四点裁决

1. Enter 必须使用 `selection.activeCell`，不是 normalized range 的左上角。UI-core
   `getActiveCell` 对 cell/range 明确定义为 selection focus；range start 只是几何边界。
2. Enter 成功或 Escape 后 editor 卸载且焦点落到 body，会使下一次 Enter 无法到达仅绑定在
   grid 上的 handler，违反本叶“按 Enter 进入编辑”的连续键盘可达性；这是 Important。
3. visible-window queued refresh 与 ACK 后 `refresh-failed` retry 未发现 demo 内可复现的
   mutation/refresh 违例：同一 transport 串行 drain latest queue，refresh 再验 request id 与
   window；失败进入 refresh-only retry，mutation ticket 不会重发。
4. 当前 blur 路径未发现可复现的重复提交：同一 editor 的 `committingRef` 在 Enter promise
   完成前拦截 blur，UI-core active ticket 也会阻止重入。现有测试没有显式制造 Enter→blur
   竞态，修焦点时必须补定向防回归测试，尤其避免 Escape 恢复 grid 焦点触发 blur commit。

## Findings

### Critical

无。

### Important

1. **Enter 提交或 Escape 取消后没有把焦点还给 grid，键盘编辑链在第一次编辑后中断。**
   `DemoCellEditor.tsx:32-40` 只执行 `cancel()`/`commit()`，而
   `DemoGrid.tsx:83-90` 只在 grid 的 pointer down 时获取焦点。Enter 成功或
   Escape 使 input 卸载后，没有任何路径将焦点恢复到 `tabIndex=0` 的 grid；
   因此用户不能直接再按 Enter 进入下一次编辑。mutation reject 也有同类
   问题：`DemoCellEditor.tsx:56` 在 pending 期间 disabled input 会丢失焦点，reject 后
   cell 和 draft 虽保留，但 effect 只依赖 cell 坐标（`:17-19`），不会再将焦点
   恢复到可编辑草稿。

   最小修复合同：grid 保有 ref/聚焦 callback；Escape 取消与键盘 Enter 成功后
   恢复 grid 焦点，blur 提交不抢回用户新点击的目标；mutation reject 后重新聚焦
   仍保留的 editor/draft（可避免在 pending 时 disabled 掉焦点，或在已知 reject 后
   显式恢复 input）。定向测试必须断言 `document.activeElement`，并用真实焦点
   链连续进行 Enter → 提交 → Enter，不得像当前
   `rust-demo-cell-edit.test.tsx:137-142` 那样在 grid 实际没焦点时直接
   `fireEvent.keyDown(grid, ...)` 绕过用户可达性。同时覆盖 Enter 导致的 blur 不会
   二次发送 mutation。

2. **Enter 编辑错用 normalized range 左上角，而不是 selection active cell。**
   `DemoGrid.tsx:83-87` 传入 `selection.range.rowStart/colStart`；而 UI-core
   `selection/index.ts:186-199` 明确令 cell/range 的 active cell 等于 focus。用户反向拖选或
   active cell 不在左上角时，Enter 会编辑另一个单元格。最小修复是使用
   `selection.activeCell` 的 row/col，并加一个 anchor 与 focus 相反的 range 测试，断言
   Enter 初始草稿与 mutation 坐标均来自 focus cell。

### Minor

无。

## 静态验收核对

- `use-spreadsheet-viewport.ts:137-165` 串行 drain visible-window latest-only queue；
  `:239-265` 同时处理 `started`/`queued`，并在 await transport 后以 request id、
  ready status 与当前 bounded window 验证落地结果。后续请求 supersede queued refresh
  时进入 refresh-failed 且保留 refresh-only retry，符合本轮明确允许的语义。
- 终端 read reject 先写 `rejectProjectionAtom` 再 throw 原 error（`:157-164`）；初始
  effect 对 transport 有显式 catch（`:223-237`）。新增 viewport 测试覆盖当前
  bounded request、resolve-after-readback 与原 transport error 的可见拒绝。
- `use-demo-cell-edit.ts:66-82` 的 mutation `source` 是 provider `core.backend`，并明确
  传入 unavailable history recorder。ACK 后 refresh 与 retry 均只调 `viewport.refresh()`；
  不存在第二次 mutation 路径。定向测试已检查 refresh-failed lifecycle、
  acknowledged revision、可见反馈、refresh-only retry 与 mutation 始终一次。
- mutation reject 后 Core session/draft 保留，且 `busy` 不包含 `rejected`；测试能继续
  改草稿。但 Important 1 的焦点问题尚未让该重试成为完整键盘链。
- `DemoCellEditor.tsx:23-44` 的 `committingRef` 在 Enter commit 的整个 promise 期间保持
  true，blur 同路调用会被挡住；更底层 `runEditingCommitAtom` 也有 active ticket 串行门。
  因此当前没有 blur 二次 mutation 的静态违例。修复焦点时应以 deferred mutation 明确触发
  Enter 后 blur，断言 `setCellInput` 始终一次；Escape 聚焦 grid 前也必须先抑制 blur commit。
- Ribbon 中 Undo/Redo 已移除，demo 范围内无其他 Undo/Redo 展示；未增加
  history UI、TS worker/runtime/core fallback 或静态 cell 写回。Rust demo 仍由直接
  `vnext-worker-runtime?worker` 与现有 neutral worker backend 组成。
- 执行报告内容精确为 `ready for user acceptance`，符合报告合同。任务新增/
  大改普通文件均 `<=300` 行（viewport 为 299 行）；新增 editor、edit hook、
  CSS 与测试均可用单一职责描述，未见假拆分。

## 结论

Rust mutation → ACK → bounded projection refresh → refresh-only retry 主链静态成立，但
Enter/Escape/reject 的焦点闭环未完成，且 Enter 未使用真实 active cell。这两项会直接
影响用户可测的单格键盘编辑，当前结论：CHANGES_REQUIRED。
