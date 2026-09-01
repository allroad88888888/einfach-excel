APPROVED

复核日期：2026-09-01

复核基准：`97110f118bfcc792fda0b4a1fe5e9bc3c3fb69d4`

复核范围：完整阅读 `index.md`、`003-rust-cell-edit.md`、执行报告与既有 review；核对
task files 从 base 到当前工作树的完整 diff，并重点复核 R2 的 `DemoGrid` 坐标落点与
`rust-demo-cell-edit` 完整 pointer 序列。按 frontend 交互审查要求执行定向自动化、demo
typecheck/build 与真实 Chromium pointer/double-click/Rust 写回冒烟。未修改产品、任务、
index 或状态，未提交。

## Findings

### Critical

无。

### Important

无。

### Minor

无。

## R2 缺陷闭环

- `DemoGrid.tsx:24-41` 的 `coordinateAt` 现在同时接收 pointer 与 mouse event：先从真实
  event target 查 `td[data-cell]`，target 因 pointer capture 变成 grid 时，再用事件的
  `clientX/clientY` 调 `document.elementFromPoint` 查当前物理单元格。
- `DemoGrid.tsx:133-139` 的 `onDoubleClick` 复用同一 resolver，不再只从 dblclick target
  读取 dataset；因此真实浏览器把 dblclick retarget 到 grid 时仍能启动正确 cell editor。
- 新测试 `rust-demo-cell-edit.test.tsx:119-133,176-205` 不再以孤立
  `fireEvent.doubleClick(cell)` 作为唯一证据。它显式执行两轮
  `pointerdown(cell) → pointerup(grid) → click(grid)`，再发送 `dblclick(grid)`；
  `elementFromPoint` 指向 `1:1`，最终断言 editor 初值为 `R1C1`。若删除坐标回退，该测试
  无法从 grid target 推出 `1:1`，不是自证式假阳性。

## 真实浏览器证据

- Chromium 1440×900 的真实 `locator.dblclick()` 事件记录为：每轮 `pointerdown` target
  是 `1:1`，`pointerup` 与 `click` target 是 grid，最终 `dblclick` target 也是 grid；
  editor 仍打开并读取 `Acme Co.`，直接复现并关闭用户报告的 retarget 场景。
- 在同一真实 Rust/WASM demo 中把 editor 改为 `R2 browser write` 并按 Enter，projection
  回读后 `1:1` 显示新值；焦点回到 grid，随后 Enter 可再次打开、Escape 可取消。
- 真实单击 `1:1` 后 `data-selected=true`；真实 mouse drag 从 `2:2` 到 `4:4` 得到地址
  `C3:E5`、起止格均 selected、共 9 格。pointer resolver 的类型扩展没有破坏单击选择或
  capture 下的拖选。

## 回归与测试真实性

- 定向 Jest：cell edit、pointer selection、Rust projection、viewport 共 4 suites、16/16
  通过；完整序列测试与独立 pointer-selection drag 测试共同覆盖 selection 行为。
- demo typecheck 通过；demo production build 通过，产物仍包含
  `worker-runtime-EQIlkyqm.js` 与 `einfach_wasm_bg-F_LgCihr.wasm`，Rust worker/WASM 链可定位。
- task source 扫描对 `defaultExcelCoreTsWorkerFactory`、TS runtime/entry/core、静态
  `DEMO_CELLS`/formula map 零命中；R2 未改 backend、viewport refresh、ACK retry 或编辑
  commit source，Rust-only mutation 与 refresh-only retry 没有回归。
- R1 的 activeCell、grid/editor 焦点、blur 外部目标、mutation reject、Enter+blur 单发与
  range focus 测试保持；R2 只统一坐标 resolver 并增加真实 pointer 链测试。
- 所有新增/大改普通文件仍 `≤300`：viewport 299、viewport test 246、DemoGrid 162、editor
  82、edit hook 101、Ribbon 63、CSS 42、cell-edit test 289、README 115。DemoGrid 仍负责
  投影网格交互，cell-edit test 仍只负责 Rust demo 编辑交互，未见 SRP 回归。
- `git diff --check` 通过；执行报告仍精确为 `ready for user acceptance`。

## 结论

R2 已覆盖 pointer capture 导致 click/dblclick retarget 到 grid 的真实路径，完整序列测试具备
反证能力，真实 Chromium 也验证双击编辑与 Rust 写回。单击、拖选、Enter、焦点链、refresh
retry、Rust-only 和文件上限均未回归。结论：APPROVED。
