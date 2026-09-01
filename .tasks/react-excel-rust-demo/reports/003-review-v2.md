# APPROVED

复核日期：2026-09-01

复核基准：`97110f118bfcc792fda0b4a1fe5e9bc3c3fb69d4`

复核范围：完整阅读 `003-rust-cell-edit.md`、`index.md`、原
`reports/003-review.md` 与修后 task files 全量 diff（含 untracked 新文件）。按任务树审查
约束未重跑执行报告中的 Jest、typecheck、build、扫描或真实 Rust 验收；未修改产品、任务、
index 或状态。

## Findings

### Critical

无。

### Important

无。

### Minor

无。

## R1 逐条复核

- ✅ **Enter 使用 active cell。** `DemoGrid.tsx:87-91` 现在从
  `selection.activeCell.row/col` 启动编辑，不再读取 normalized range start。
- ✅ **grid 拥有稳定焦点出口。** `DemoGrid.tsx:64-65,135-159` 持有 `gridRef`，把稳定的
  `focusGrid` callback 交给 editor；grid 仍是 `tabIndex=0` 的键盘入口。
- ✅ **Enter completed 与 Escape 回 grid。** `DemoCellEditor.tsx:26-47` 仅在键盘提交结果为
  `completed` 时恢复 grid；Escape 先设置 blur 抑制标记，再 cancel 并恢复 grid，因此不会把
  cancel 误转成 blur commit。
- ✅ **blur 不抢外部目标。** `DemoCellEditor.tsx:26-35,49-55` 为 blur 调用
  `commitOnce(false)`，成功后不执行 `focusGrid`。测试 `rust-demo-cell-edit.test.tsx:186-199`
  用真实外部 Paste button 接收焦点，提交完成后仍断言该 button 是 activeElement。
- ✅ **mutation reject 回保留草稿 input。** 键盘提交的 `rejected` outcome 在
  `DemoCellEditor.tsx:30-32` 重新聚焦仍挂载的 input；测试 `:201-216` 同时断言原 draft、
  textbox activeElement 与后续 draft 修改能力。
- ✅ **Enter + blur 只发送一次 mutation。** `committingRef` 在 commit promise 全程串行化；
  主链测试 `:140-157` 紧接 Enter 人工触发 blur，最终仍断言一次 `setCellInput`，且随后从
  实际聚焦的 grid 再次按 Enter、Escape，mutation 次数保持一次。
- ✅ **range focus 测试具备反证能力。** `:160-184` 设置 anchor `0:0`、focus `1:1`，两者
  与 normalized start 不同；测试先真实 `grid.focus()`，再向 `document.activeElement` 发送
  Enter，断言初始值 `R1C1` 与 mutation 坐标 `1:1`。不存在向未聚焦 grid 直接造键盘事件。

## 其余合同回归

- viewport refresh 实现未被 R1 改动：visible-window transport 仍串行 drain queued request，
  `refresh()` 仍在 transport 后按 ready/request id/current bounded window 验收结果；终端读取
  失败先写 projection error 再 reject，初始 effect 有显式 catch。
- `use-demo-cell-edit.ts:66-82` 仍以 provider 的 `core.backend` 执行 mutation；ACK 后 refresh
  与 `refresh-failed` retry 都只调用 `viewport.refresh()`。定向 ACK/refresh-failed 测试仍断言
  acknowledged revision、retry authority 和 mutation 始终一次，未见二次发送路径。
- unavailable history recorder 与隐藏 Undo/Redo 保持；未引入 TS factory/runtime/core、
  静态 cell fallback 或本地伪 ACK。执行报告仍精确为 `ready for user acceptance`。
- task 新增/大改普通文件均不超过 300 行：viewport 299、viewport test 246、DemoGrid 166、
  editor 82、edit hook 101、Ribbon 63、CSS 42、cell-edit test 242、README 115。职责边界未回归。

## 结论

R1 已关闭原审查的两个 Important：Enter 目标是实际 active/focus cell，键盘编辑的
grid → editor → grid 焦点闭环成立；blur、reject 与 Enter/blur 防重均有可达性测试钉住。
viewport refresh、Rust ACK/retry、Rust-only 与行数合同未见回归。结论：APPROVED。
