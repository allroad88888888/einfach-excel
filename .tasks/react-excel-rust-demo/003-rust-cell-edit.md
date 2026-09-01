---
id: "003"
title: 单格编辑写回 Rust 并完成首轮验收
kind: leaf
depends_on: ["002"]
model: gpt-5.6-sol
status: done
created: 2026-09-01
done: 2026-09-01
base: 97110f118bfcc792fda0b4a1fe5e9bc3c3fb69d4
repair_round: 2
files:
  - excel/react-excel/src/use-spreadsheet-viewport.ts
  - excel/react-excel/test/use-spreadsheet-viewport.test.tsx
  - excel/react-excel/demo/DemoGrid.tsx
  - excel/react-excel/demo/DemoCellEditor.tsx
  - excel/react-excel/demo/use-demo-cell-edit.ts
  - excel/react-excel/demo/WorkbookRibbon.tsx
  - excel/react-excel/demo/cell-editor.css
  - excel/react-excel/test/rust-demo-cell-edit.test.tsx
  - excel/react-excel/README.md
  - .tasks/react-excel-rust-demo/reports/003-report.md
---

# 单格编辑写回 Rust 并完成首轮验收

## 目标

让选中单元格的编辑经现有 backend 写入 Rust 后刷新当前投影。

## 实现合同

- 双击单元格或按 Enter 进入编辑；Enter/失焦提交，Escape 取消。
- 双击必须在浏览器真实 `pointerdown` / `pointerup` / `click` 事件链下可靠触发；只派发孤立的
  合成 `dblclick` 不算验收。指针选择实现可以继续捕获拖选，但不得吞掉进入编辑的意图。
- Enter 必须编辑 `selection.activeCell`，不得用 normalized range 左上角替代 focus cell。
- Enter 成功与 Escape 后恢复 grid 焦点；失焦提交不得抢回用户的新焦点；mutation 拒绝后
  恢复仍保留草稿的 editor 焦点。测试必须从真实 `document.activeElement` 驱动连续键盘链，
  并证明 Enter 导致的 blur 不会二次发送 mutation。
- 编辑状态使用现有 `useSpreadsheetEditing`；提交走 UI-core `runEditingCommitAtom`，其
  `source` 是当前 Rust backend，禁止本地伪 ACK。
- 首批不展示 undo/redo；history recorder 明确返回 `unavailable`。
- 为现有 `useSpreadsheetViewport` 增加最小 `refresh(): Promise<void>`，只重跑当前
  bounded window，不复制 Solid provider 的投影实现。
- `refresh()` 成功读回并 resolve projection 后才 resolve；读取失败时先写入 projection
  error，再以原错误 reject。初始 effect 显式 catch，不能产生未处理 rejection。
- Rust ACK 后调用 `refresh()`；刷新失败必须令 commit outcome 为 `refresh-failed`，保留
  acknowledged revision 与刷新重试权，且绝不二次发送 mutation。
- mutation 本身拒绝时 outcome 为 `rejected`，编辑 session 与草稿仍可修改后重试。
- 不增加公式栏编辑、剪贴板、撤销、Sheet 操作或格式功能。

## 验收

- 单测覆盖 start、draft、Rust ACK、projection refresh、Escape 与 mutation 拒绝保留草稿。
- 定向覆盖真实双击所包含的指针事件序列，证明第二次点击进入 editor；不得仅用
  `fireEvent.doubleClick` 作为该交互的唯一证据。
- 定向覆盖“mutation ACK + projection reject”：outcome 为 `refresh-failed`、错误可见、
  retry authority 保留，且 mutation 只调用一次。
- `pnpm exec jest excel/react-excel/test/use-spreadsheet-viewport.test.tsx excel/react-excel/test/rust-demo-cell-edit.test.tsx --runInBand --no-coverage` 通过。
- `pnpm --filter @einfach/react-excel typecheck:demo` 与 `build:demo` 通过。
- bundle/source 扫描零命中 TS factory/runtime/core，且能定位 Rust worker chunk/WASM 引用。
- 执行报告只记录 `ready for user acceptance`；不得改 index/任务状态或直接向用户汇报。
- 所有新增/大改普通文件 `wc -l` ≤300；存量超限只报告，不顺手重构。

写 `reports/003-report.md`；执行 agent 不提交。

## R2 验收返修

- 真实浏览器在 pointer capture 后把 `click` / `dblclick` target 重定向为 grid；双击坐标
  现在按事件落点回查单元格，不再仅依赖 target。
- 完整 pointer/click 序列定向测试、真实 Chromium 双击编辑与 Rust 回读均通过；独立复核见
  `reports/003-review-v3.md`。
