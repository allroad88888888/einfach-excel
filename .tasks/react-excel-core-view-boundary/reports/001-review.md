REJECTED

# 001 增量独立 Review：三审后 editing / history / retained projection

复核日期：2026-09-02

复核基准：叶子记录的原始 base `6f07cae2568596331a2be333791203694d59bc17` 到当前完整
worktree。旧的三次 review 只作为历史，不作为本轮结论；本轮重新阅读任务树 `index.md`、001 leaf、
`reports/001-report.md` 与 `excel/react-excel/SKILL.md`，并核对 base 后的 React、UI-core、Solid、Vue、
Worker adapter 与文档差异。未修改产品代码。

## Blocking findings

### Important 1：retained result 的 cells 与渲染 window 来自两个不同投影

`useWorkbookViewport` 在新窗口请求期间会保留同 sheet 的旧 `snapshot.result`，但返回对象始终把
`window` 设为当前受控新窗口（`excel/react-excel/src/workbook/projection/use-workbook-viewport.ts:205-215`）。
`SpreadsheetGrid` 随后按这个新窗口枚举行列，再从旧 cells 按坐标查值
（`excel/react-excel/src/workbook/grid/cells/SpreadsheetGrid.tsx:217-241`）。因此 retained projection 并
没有作为一个完整的 `{window, cells}` 投影被保留：

- 从 `0..31` 滚到 `1..32` 时，旧 row 0 被丢弃，新 row 32 为空；表头与表体已经切到新窗口。
- 跳转到与旧窗口无交集的窗口时，整张表仍挂载但所有格子为空，虽然旧 result 明明存在。
- 当前回归只滚动一行，并断言交集内的 row 1 仍有值
  （`excel/react-excel/test/workbook/projection/projection.test.tsx:176-206`），因此恰好绕过边缘空格和
  大跨度跳转反例。

这会把“闪回 Loading”改成“短暂空白/局部错位”，仍是用户可见的滚动回归。最小修复是让渲染使用
result 自带的 window，保证一次展示中的 window/cells 同源；或明确设计两个完整 projection frame，不能
把旧 cells 套到新 window。补测试至少覆盖单行滚动的新边缘 row 32，以及无交集的大跨度跳转。

交叉 sheet 与终态错误两个重点反例本身没有失败：hook 在
`use-workbook-viewport.ts:206-209` 只保留同 sheet result；`WorkbookGrid.tsx:45-53` 又优先渲染当前请求的
error，因此 terminal failure 不会被旧 cells 遮蔽。但这不能关闭上述同 sheet 坐标错配。

### Important 2：editing 拆分删除既有公共 API，违反 additive 与“不迁移 Solid/Vue”硬约束

base 的 UI-core 公开 `commitEditingAtom`（base `editing/index.ts:794-811`），base 的 Vue
`SpreadsheetEditing` 也公开 `commit(input)` 并转发该 atom（base
`excel/vue-excel/src/use-spreadsheet-editing.ts:49-73`）。当前：

- `excel/spreadsheet-ui-core/src/editing/index.ts:1-26` 不再导出 `commitEditingAtom`，实现也已删除；
- `excel/vue-excel/src/use-spreadsheet-editing.ts:46-69` 从公共接口和返回对象删除 `commit`；
- 对应 Vue 测试删掉了 commit 行为断言，而不是证明旧调用方仍兼容；
- `RunEditingCommitInput.historyEntryRecorder` 也从公开类型移除，仓库内 Solid 调用点同步改写。

这些是源码兼容的 breaking changes，不是 additive API。它们还直接修改 001 leaf `files` 未声明的
`excel/solid-excel/**`、`excel/vue-excel/**` 与跨框架文档；而任务树明文要求本树不迁移 Solid/Vue、
新增 UI-core API 必须 additive。即使旧 `commitEditingAtom` 只是同步 stage intent，也不能在这片边界迁移中
静默删除。应恢复兼容导出与 Vue `commit()`（可标 deprecated 并转发到等价语义），并保留旧 input 的
源码兼容；真正的跨框架破坏性清理应另立有迁移方案的任务。

### Important 3：生产 editing atom 残留 `debugger`

`excel/spreadsheet-ui-core/src/editing/session-atoms.ts:46` 在每次写 editing draft 时执行裸 `debugger`。
浏览器 DevTools 开启时，键入单元格会逐次暂停；这也是执行报告“范围 ESLint 通过”没有覆盖到的生产质量
缺口。静态复核命令：

```text
rg -n "\\bdebugger\\b" excel/react-excel/src excel/spreadsheet-ui-core/src
excel/spreadsheet-ui-core/src/editing/session-atoms.ts:46:    debugger
```

删除该语句，并让范围 lint 明确启用 `no-debugger`，避免同类残留再次通过。

## 重点边界复核

### Editing 拆分与单一职责

除上述 API 删除外，拆分形态本身通过职责检查：session 纯状态转换、session atoms、commit input capture、
ticket、serialized runner、settlement、refresh retry、reconcile 与 history projection 各自能用一个职责描述；
`run-commit.ts` 289 行，其余新增 editing 源文件均低于 200 行。`editing/index.ts` 是 feature 对外边界的
26 行导出面，不属于禁止的内部无脑 barrel。没有 `part1`、`utils` 或按行数机械切割。

旧 456 行 `excel/solid-excel/e2e/formula/formula-flow.spec.ts` 从 base 起已经超限，本轮只改一行注释，按
`one-file-one-thing` 的存量小改规则记录但不要求 001 顺手拆分。其余新增/大改普通文件均未超过 300 行。

### Rust / UI-core / framework history 职责

当前仓库内的主方向是正确的：

- Worker backend 的 `setCellInput` 进入 `recordCellMutation`
  （`excel/solid-excel/src/adapter/worker/ports/cell-input.ts:30-65`）；后者捕获 before/after image，并把真实
  transaction record 推入 Worker log（`record-cell-mutation.ts:62-105`）。
- UI-core 的 `history-projection.ts:21-45` 只写 transaction id、kind、sheet、revision 与 affected range，
  不复制 cell before/after 数据。
- `run-commit.ts:110-125,224-239` 只在 backend 同时暴露 undo/redo replay capability 时预留并写入一条
  timeline descriptor；mutation reject 不写 descriptor，refresh retry 不重发 mutation。
- React workbook 的 backend/history/refresh 注入扫描为零；Solid dispatch 当前不再注入
  `historyEntryRecorder`，Vue 也没有建立另一份 history 账本。

因此没有发现“framework 保存第二份 undo image”或“UI-core 重做 Rust transaction log”的新问题。
但是，职责调整不能以删除既有跨框架公共 API 为代价，Important 2 仍阻塞验收。

## 001 验收核对

1. ✅ React 直接依赖 `@einfach/react`，显式 Provider/store 隔离实现与测试仍在。
2. ✅ React 三条链使用 `useAtomValue` / `useSetAtom`；自制 store bridge 已删除。
3. ✅ 以下四项静态扫描均零命中：React workbook 的手写 getter/setter/observer、backend/history/refresh
   注入、React `atom(` 声明、React `useState/useReducer`。
4. ✅ Pointer command 的共同不变量与 unbound projection lane 修复仍在，未见三审后回退。
5. ✅ Editing 的 mutation reject、ACK 后 refresh-only retry、一次 mutation 与当前窗口 refresh 的状态机
   仍由 UI-core 命令负责；Rust/UI timeline 数据职责没有倒退。
6. ❌ retained projection 的 window/cells 不同源，验收中的连续滚动可见性未闭环（Important 1）。
7. ❌ UI-core/Vue 公共 editing API 非 additive，且越过“不迁移 Solid/Vue”的范围门（Important 2）。
8. ❌ 生产源码残留 `debugger`（Important 3）。
9. ✅ `git diff --check` 通过；本轮按 task-tree reviewer 规则不重复执行执行报告已经跑过的全量测试、build、
   ESLint 与 cycles。报告所列 106 UI-core suites、Solid、React、Vue、build/cycles 结果不能证明上述静态
   API 与坐标反例正确。

## 结论

三审后的 editing 拆分和 Rust/UI-core history 数据分工大体成立，跨 sheet 保留与 terminal failure 展示也
有明确 guard；但同 sheet retained projection 会把旧 cells 套在新 window 上，公共 editing/Vue API 被
破坏性删除，且生产 atom 留有 `debugger`。三项均需修复并补命中反例的定向测试后重新独立 review。

001 当前结论：`REJECTED`。不得进入用户验收或启动 003。

## Retained projection 返修复审

复审日期：2026-09-02

本节按任务账最新裁决复审 executor 的 projection-only 返修，并取代上文对三项旧 findings 的当前处置：
`commitEditingAtom` / Solid / Vue 删除是用户明确授权的一次性仓库内迁移；
`editing/session-atoms.ts` 的 `debugger` 是用户要求保留的现场诊断点。两项均不再作为本轮阻塞，也未要求
executor 修改。当前唯一需要重新裁决的是 retained projection 的实际可见性。

### Important：完整 retained frame 在大跨度滚动后仍位于视口之外

返修已经关闭“window/cells 不同源”问题：`useWorkbookViewport` 现在同时返回 retained result 的
`result.window` 与 `result.cells`（`excel/react-excel/src/workbook/projection/use-workbook-viewport.ts:193-204`），
新结果到达后才整帧切换。单行滚动时，旧 frame 与新视口仍大部分相交，因此该用例的行为成立。

但大跨度滚动仍不可见。实际几何链如下：

1. scroll handler 已经让浏览器滚到 `scrollTop = 400 * 28 = 11200px`，并据此请求 row 400
   （`WorkbookGrid.tsx:89-96`；测试 `projection.test.tsx:221-232`）。
2. pending 期间 `viewport.window` 仍是 retained row `0..31`，所以 `.grid-window` 的 CSS 变量仍是
   `--grid-window-offset: 0px`（`WorkbookGrid.tsx:81-87`）。
3. `.grid-window` 通过 `transform: translateY(var(--grid-window-offset))` 放置在 sheet 坐标中
   （`grid.css:5-9`）。32 行 frame 高约 `32 * 28 = 896px`，占据 sheet 的约 `[0,896]`；此时滚动视口是
   `[11200,12400]`（测试把 `clientHeight` 设为 1200），两者没有交集。

因此 `projection.test.tsx:233-237` 只能证明旧 row 0 DOM 仍挂在文档树中，不能证明用户在滚动容器里看得见
它。新请求 pending 时，用户看到的仍是空白 sheet 区域，原 review 的“大跨度短暂整屏空白”反例没有被
修复。此问题不是 jsdom 布局细节，而是由明确的 scrollTop、transform offset 与 frame 高度直接推出。

最小修复需要让 pending retained frame 与当前滚动视口相交，同时保持 frame 的 window/cells 同源。
可采用 viewport overlay / sticky retained layer；若把旧 frame 临时移到新 scroll offset，则必须禁止或
重新映射 pointer/editing，不能让视觉位置 row 400 的旧 row 0 DOM 接收错误坐标交互。另一个可接受方向是
在新 frame ready 前约束实际 scroll position，但不能只更新 atom/request 而让浏览器先滚走。

测试必须验证可见几何，而不只是 DOM 存在。至少断言 pending 时 retained frame 的纵向区间与
`[scrollTop, scrollTop + clientHeight]` 相交；更稳妥的是增加真实浏览器测试，用 bounding rect / 截图确认
大跨度滚动 pending 期间旧 frame 仍在 `.sheet-scroll` viewport 内。resolve 后再断言 row 400 frame 回到
sheet 的真实绝对位置并恢复交互。

### 返修复核通过项

- ✅ `result.window` 与 `result.cells` 已作为同一 projection frame 返回；旧的边缘空格/坐标混用已关闭。
- ✅ 单行滚动测试现在断言 retained `0..31`，并在 resolve 后切到 `1..32`。
- ✅ 跨 sheet result 仍由 sheetId guard 排除，terminal error 仍优先覆盖 retained frame。
- ✅ 两个改动文件分别 208、254 行，低于 300 行；职责没有因返修扩散。
- ✅ 按 task-tree reviewer 规则未重复运行执行报告已经完成的定向/全量测试、build、ESLint、cycles 与
  diff check；这些通过结果不覆盖上述未断言的布局几何。

### 返修结论

返修修正了 retained frame 的数据一致性，却没有保证它在大跨度滚动后的实际 viewport 内可见。唯一有效
阻塞仍未关闭。001 当前结论继续为 `REJECTED`，不得进入用户验收或启动 003。

## Retained projection 二次返修第三次复审

复审日期：2026-09-02

`APPROVED`

本节是当前工作区的最新裁决，取代上一节对 retained frame 实际可见性的 `REJECTED`。任务账已经明确裁决
API 删除属于用户授权的一次性迁移、`editing/session-atoms.ts` 的 `debugger` 属于必须保留的用户诊断点；
本轮没有把二者重新列为问题，也没有修改产品代码。

### 几何与逻辑坐标

- `useWorkbookViewport` 保留了同一旧 result 的 `window` / `cells`，同时只在 `retained` 时把
  `placementWindow` 指向最新 requested window（
  `excel/react-excel/src/workbook/projection/use-workbook-viewport.ts:197-209`）。因此旧 frame 的数据与逻辑
  坐标仍同源，临时物理摆放没有伪造 projection result。
- `WorkbookGrid` 用 `placementWindow.rowStart * 28` 生成 transform offset，但 row headers 与
  `SpreadsheetGrid.window` 继续使用逻辑 `viewport.window`（
  `excel/react-excel/src/workbook/grid/viewport/WorkbookGrid.tsx:82-88,134-149,169-175`）。在 row 400 的
  pending 反例里，旧 `data-cell="0:0"` / 旧行号仍是旧坐标，不会冒充 row 400；只是整帧被临时放到当前
  scroll geometry。
- 定向反例把 scrollTop 设为 `400 * 28 = 11200`，并断言 frame 区间
  `[11200, 11200 + 32 * 28]` 与 `[scrollTop, scrollTop + clientHeight]` 相交（
  `excel/react-excel/test/workbook/projection/projection.test.tsx:222-240`）。这已命中上一轮遗漏的大跨度几何，
  不再只是断言 DOM 挂载。CSS grid 自身的 header row 只会给实际 content top 增加固定 28px，不改变该
  896px frame 与 1200px viewport 相交的结论。

### Pending 交互与 pointer capture

- retained 时 pointer adapter 接收 `enabled: false`，外层 pointerdown 也有同步 guard；double-click 与
  Enter 都在读坐标或启动 editing 前返回，grid 同时为 `tabIndex=-1`、`aria-busy=true`（
  `WorkbookGrid.tsx:77-81,99-112,151-167`）。CSS 还对 retained table 设置 `pointer-events: none`
  （`excel/react-excel/src/workbook/grid/viewport/grid.css:108-110`）。
- 反例对物理位置已移动、逻辑坐标仍为 `1:1` 的 stale cell 依次发送 pointer down/up、double-click，随后
  聚焦 grid 并发送 Enter；selection 保持 `0:0` 且 editing source 仍为 null（
  `projection.test.tsx:243-250`）。因此三条入口不是靠 CSS 偶然挡住，测试层程序化事件也被逻辑 guard
  正确拒绝。
- 已开始的 pointer stream 不会遗留 capture：adapter 记录 `{id, currentTarget}`；`enabled` 变为 false
  的 effect 会清空 active ref、调用保存 target 的 `releasePointerCapture(id)`，再调用 UI-core
  `cancelPointerAtom`；若 move/up 先于 effect 到达，disabled 分支也调用同一 cancellation（
  `excel/react-excel/src/workbook/selection/use-grid-pointer-selection.ts:44-62,84-112`）。unmount / dependency
  cleanup 同样复用该路径。由此 capture 与 core pointer session 会一起收敛，不会在 retained frame 上继续
  drag。

### Resolve 后恢复

- requested result 到达后 `result.window === requestedWindow`，`retained` 变回 false，placement 回归真实
  result window；row 400 frame 仍位于 11200px，但此时 DOM 逻辑坐标也已切换到 row 400。测试断言
  retained flag、tabIndex、offset、cell 内容均恢复，并用 pointer 选择 row 400、double-click 启动对应
  editing（`projection.test.tsx:258-277`）。Enter 走同一个仅受 `retained` 控制的 guard，false 后恢复原路径。

### 非阻塞测试缺口

当前定向测试没有显式构造“先 pointerdown 并成功 setPointerCapture，再滚动进入 retained”的序列，也没有
spy `releasePointerCapture`；capture 取消这一点目前由上述明确的单路径实现保证。建议后续给
`pointer-selection.test.tsx` 增加 enabled true→false 的断言，防止生命周期改动回归，但未发现当前实现
缺陷，因此不作为验收阻塞。

本轮遵循 task-tree reviewer 规则，没有重复执行 executor 已报告通过的 projection 5 tests、React 21 tests、
typecheck/build/ESLint/cycles/scans/diff-check。相关源码分别 216、182、125 行，新增定向测试 289 行，仍满足
单一职责与 300 行上限。

001 最新结论：`APPROVED`。retained projection 的大跨度 viewport 几何、逻辑坐标、pending 交互隔离、
resolve 恢复与 pointer capture 取消均已闭环；可以进入用户验收。
