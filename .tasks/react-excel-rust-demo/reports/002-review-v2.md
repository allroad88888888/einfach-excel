# APPROVED

复核日期：2026-09-01

复核基准：`5e6e00fa914a4e3b867123d57a7e96d0628e27f5`

复核范围：完整阅读任务、index、更新后的 `002-report.md` 与原 `002-review.md`；只审查
修复后任务 `files` 的完整工作树 diff，静态核对滚动边界、R1 测试、CSS 职责与行数。
未重跑报告中的 Jest、typecheck、build、ESLint、扫描、Chromium 或 `git diff --check`；
未修改产品、任务状态或 index。

## Findings

### Critical

无。

### Important

无。原审 Important 已关闭。

### Minor

无。原审 CSS SRP Minor 已关闭。

## R1 复核

### 原 Important：真实高视口末行不可达 — 已关闭

- `DemoGrid.tsx:69-76` 现在从真实 scroll element 同时读取 `scrollTop`、
  `scrollHeight`、`clientHeight`，计算合法 `maxScrollTop = max(0,
  scrollHeight - clientHeight)`。当滚动抵达合法底部时，不再依赖
  `floor(scrollTop / 28)`，而是直接请求
  `DEMO_SHEET_ROW_COUNT - currentWindowRowCount`；当前为 `1001 - 32 = 969`，交给现有
  viewport clamp 后得到 row 969–1000。
- 底部分支使用 `scrollTop >= maxScrollTop - 1`，能容纳浏览器 fractional scrollTop/
  layout rounding；`scrollHeight` 与 `clientHeight` 本身是整数，正 overflow 最少为 1px，
  不存在 `0 < maxScrollTop < 1` 导致 top 被误判到底部的问题。
- `maxScrollTop > 0` guard 正确处理无滚动/未建立 JSDOM geometry：当
  `scrollHeight <= clientHeight` 且 `scrollTop = 0` 时仍走普通 row 0，不会在初始顶部
  跳到末窗。demo 的真实 sheet height 为 28,056px；正常支持的浏览器视口存在正 overflow。
  超过整个 28,056px sheet 的极端 viewport 不属于本任务可见窗口模型的实际验收表面，
  不构成 R1 阻断。
- 到底前 1px 以内直接切换到末窗会让 origin 从普通换算值跳到 969，但两个 32 行窗口
  的覆盖相交；不会跳过不可访问的 sheet 行。到达真实 bottom 时最后一行实际挂载，可继续
  pointer selection。

### R1 测试没有重复原假阳性 — 通过

- `rust-demo-projection.test.tsx:119-132` 定义 `scrollHeight = 28,056`、
  `clientHeight = 1,200`，合法最大位置严格为
  `scrollTop = scrollHeight - clientHeight = 26,856`，没有使用超出浏览器 clamp 的伪值。
- 测试先断言 `clientHeight > 924`，再断言旧公式
  `floor(maxScrollTop / 28) < 969`；因此该场景确实会复现原实现的失败，不是把输入改名后
  继续自证。
- 随后断言 DOM 上的 `scrollTop` 就是该合法 max、第二次 backend request 精确为
  row 969–1000、`data-cell="1000:6"` 实际挂载、绝对 selection 为 row/col 1000/6、
  地址为 `G1001`、公式来自 projection 且 td 仍为 256。测试同时关闭几何、请求、DOM、
  选择与公式栏链路。
- 报告另给真实 Chromium 1440×1600 证据：scroller `clientHeight=1415`、
  `scrollHeight=28056`、浏览器 clamp 后 `scrollTop=maxScrollTop=26641`，该高度远超原
  924px 阈值；末窗、256 格、row 1000、`G1001` 与 Rust formula 均成功。这与代码的
  bottom 分支数学一致，补足了 JSDOM 不做 layout 的限制。

### 原 Minor：CSS SRP — 已关闭

- `grid-viewport.css` 当前 19 行，只包含 virtual frame height、window transform 与
  projection loading/error state，均服务“当前投影窗口布局”这一职责。
- `.rust-runtime-status` 已移到 `worksheet.css:7-13`；该文件负责整个 worksheet/workbook
  表面样式，状态条与该职责匹配。文件由 252 行增至报告所记 259 行，仍低于 300，未用
  压行或假拆分规避上限。

## 完整任务范围回归

- Rust projection 仍是唯一 cell 数据源：`DEMO_CELLS`、静态 coordinate map 与
  `getDemoFormulaBarValue` 已删除；GridView 只消费 `viewport.cells/window`，公式栏只查
  当前 projection。
- 32×8 bounded window 与 256 td 上限未扩大；row headers、`data-cell`、selection 与
  formula address 仍使用 sheet 绝对坐标。
- loading/error 仍在 grid 区域可见，error 不挂载旧 cells；窗口切换期间旧 request/result
  不会被当作当前 projection。
- demo 仍无 worker factory、TS worker runtime、TS entry 或 TS core fallback；没有修改
  Solid/Rust/WASM 实现。
- 当前产品 diff 全部落在任务 `files`。报告记录 App 78、DemoGrid 129、RustWorksheet 67、
  demo-data 18、window hook 26、grid CSS 19、test 170、worksheet 259，全部 `<=300`；各
  文件职责边界成立。

## 结论

R1 以真实滚动边界关闭了高视口末行不可达问题，测试能证明旧公式失败且新链路在合法
max scroll 下到达 row 1000，真实 1415px 高 scroller 证据一致；CSS SRP 与行数也已收口。
无 Critical、Important 或 Minor finding，结论：APPROVED。
