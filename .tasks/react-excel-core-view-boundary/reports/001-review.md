APPROVED

# 001 独立 Review：三条现有链统一使用 React atom hooks 与 command atoms

复核日期：2026-09-02

复核基准：`6f07cae2568596331a2be333791203694d59bc17` 到当前 worktree；包含已提交的
`5aeb6723` projection transport、其后的未提交产品改动及 untracked command/test 文件。

复核输入：完整阅读任务树 `index.md`、001 leaf、`reports/001-report.md` 与
`excel/react-excel/SKILL.md`；核对 `@einfach/react@0.4.0` 本地 Provider、
`useAtomValue`、`useSetAtom` 实现与类型；未修改产品源码、任务文件或项目 SKILL。

## 阻塞项

### 1. Pointer 组合 command 没有维护 selection / pointer 的共同不变量

`startPointerSelectionAtom` 先让 selection 自行按 bounds clamp，却把原始 `coord` 写入 pointer
（`excel/spreadsheet-ui-core/src/selection/pointer-selection-commands.ts:17-27`）。
`updatePointerSelectionAtom` 不读取当前 pointer session；在没有 active drag、或传入另一个
`sheetId` 时仍先扩展 selection，随后 `updatePointerAtom` 只更新旧 pointer 的 focus
（同文件 `:34-42`）。因此 command 可以产生：selection 在 sheet B、pointer interaction 仍在
sheet A；也可以在没有 pointer session 时单独改变 selection；越界坐标还会令 selection 的
clamped focus 与 pointer 的原始 focus 不同。这不符合“一次语义动作保持两份 core 状态一致”的
产出合同，也使新增 command 不能安全供其它框架复用。

最小修复：command 内先验证/归一化一次输入，并用同一个 sheet/coord 更新两份状态；update 必须
确认当前是同 sheet 的 active drag-selection（或直接从该 session 派生 sheet），否则返回明确
no-op outcome，不能先改 selection。补 core tests：inactive update、cross-sheet update、越界 start/update，
均断言 selection 与 pointer 不分叉。

### 2. 未绑定 backend 的 projection 失败没有 settle active lane

`drainVisibleProjectionQueue` 的 null-binding 分支只调用 `reportProjectionErrorAtom` 后返回
（`excel/spreadsheet-ui-core/src/projection/run-visible-projection.ts:34-39`），没有用当前 request
settle/reject projection lane。首次 command 会 resolve `{status:'failed'}`，但 active ticket 仍残留；
随后即使通过 `createSpreadsheetUi({ backend, store })` 给同一 store 绑定 backend，新请求也只会进入
queued 分支并在 `:104-115` 得到 `Visible projection transport is unavailable`，snapshot 停在
`loading`。异步 command 虽未 reject Promise，却把 store 留在不可恢复状态。

最小修复：null-binding 也必须通过 active request 的 reject/settle 路径释放 lane（并一致处理可能的
queued successor），再返回显式 failed outcome。补测试：裸 store 首次调用 resolves failed，之后给
同一 store 正常绑定 backend，下一次调用能 ready；全程无 rejected Promise、无残留 loading lane。

### 3. Editing refresh 冻结的是 mutation 前窗口，会覆盖 mutation 期间的新窗口

`commitCellEditingAtom` 在启动异步 mutation 前读取并冻结当前 projection request
（`excel/spreadsheet-ui-core/src/editing/bound-cell-editing-commands.ts:43-59`）。若 Rust mutation
pending 期间用户从窗口 A 滚到 B，ACK 后 callback 仍启动 A 的 retain-result refresh；实测请求序列
为 `[A, B, A]`，最终 snapshot 回到 A。React effect 只依赖受控窗口参数
（`excel/react-excel/src/workbook/projection/use-workbook-viewport.ts:167-178`），而返回值又在
`:214-220` 丢弃与 B 不匹配的 snapshot，所以不会重新请求 B，界面会停在 loading/空 cells。
这与本叶“绑定当前 visible window”不符，并构成慢 mutation + 滚动的用户可见回归风险。

最小修复：refresh callback 执行时再从 core 读取当前 visible request，并刷新当时的窗口；retry
同样使用 retry 执行时的当前窗口。补 deferred-mutation test：A 开始编辑/提交，pending 时投影 B，
释放 ACK 后只刷新 B，最终 snapshot 仍为 B 且 mutation 始终一次；React 层断言 B cells 保持可见。

### 4. 两个 `useCallback` 仍只是 setter 包装，违反验收 2

`useCellEdit` 的 `start` 与 `setDraft` 回调只做参数整形后调用 `useSetAtom` 返回的 setter
（`excel/react-excel/src/workbook/editing/use-cell-edit.ts:35-44`）。它们不处理 DOM/ref、测量、focus、
滚动或 React event，也没有 memoized child/effect 的稳定身份需求；这正是
`excel/react-excel/SKILL.md` 要求移除的“callback only calls setter”，并与执行报告“剩余
`useCallback` 仅用于 pointer/事件形状、scroll/window、focus/ref 适配”的结论不一致。

最小修复：删除这两层 `useCallback` memoization；可直接暴露匹配的 atom setter，或保留普通的窄
参数适配函数，把真正的 DOM event 整形留在组件事件处理器。重新执行 `rg -n "useCallback"` 人工
归类，并修正执行报告证据。

## 验收逐项核对

1. ✅ `react-excel` 直接依赖 `@einfach/react@^0.4.0`；Provider 显式传 `core.store`；双 Provider
   隔离测试通过。本地 0.4.0 的 hooks 确实从最近 Provider 取 store，setter identity 由
   atom/store 稳定。
2. ❌ 自制 `useSyncExternalStore` bridge 已删除，三条链也已改用标准 hooks；但阻塞项 4 未满足
   明文 `useCallback` 限制。
3. ❌ happy-path、latest-window、terminal failure、mutation reject 与 refresh-only retry 测试通过，
   且现有测试证明一次 commit 只发一次 mutation；但阻塞项 1-3 暴露的 command 不变量和并发窗口
   语义没有测试，当前实现实际失败。
4. ✅ React 15 tests 覆盖点击/拖选/取消、首屏/滚动、双击、Enter、blur、Escape、reject draft、
   refresh retry 与连续两格编辑，全部通过。
5. ✅ 三条要求的静态扫描均零命中：workbook 无手写 store getter/setter/observer、无 backend/history/
   refresh transport 注入，React src 无 `atom(` 声明。
6. ✅ build/typecheck/React build、范围 ESLint、cycle check、diff check 与文件行数均通过；新增/大改
   普通文件最大 225 行，职责拆分合理。存量 `editing/index.ts`、`selection/index.ts`、
   `pointer/index.ts`、`projection/index.ts` 仍超限，但本叶未修改，不要求顺手重构。

## Review 复跑证据

- UI-core 全量：97 suites / 2085 tests passed。
- React：6 suites / 15 tests passed。
- `@einfach/spreadsheet-ui-core` build、React typecheck 与 Vite build（391 modules）通过。
- 范围 ESLint 无 warning/error；`pnpm check:cycles` 为 1055 modules / 2519 dependencies、零 violation。
- 要求的三条 `rg` 扫描与 `git diff --check` 通过；所有本叶新增/大改普通文件 `<=300` 行。

## 结论

Provider/hooks 迁移与主要用户路径已经成立，普通 backend reject 也都以显式 outcome 收敛；但 pointer
跨 atom 不变量、projection lane 释放、editing 当前窗口并发语义以及明文 hook 规则仍未满足。
修复上述四项并补定向测试后再复审，001 当前不能进入用户验收或 003。

## 返修复审

复审日期：2026-09-02

本节保留上面的初审发现作为历史记录，并以当前 worktree 的返修实现与新增测试覆盖重新裁决；本节结论
取代初审时的 `REJECTED`。

### 四项阻塞逐项关闭

1. ✅ **Pointer 共同不变量已关闭。** Start 通过 selection authority receipt 取得 bounds 归一化后的
   同一 sheet/coord，再写 pointer（`excel/spreadsheet-ui-core/src/selection/pointer-selection-commands.ts:28-48`）。
   Update 在任何 selection write 前检查 active drag 与同 sheet，在 bounds 缩小时还会用 receipt 的新
   anchor 重建 pointer session（同文件 `:55-95`）。新增 core tests 真实构造 inactive、cross-sheet、
   越界 start/update 与 active 期间 bounds shrink，分别断言 selection/pointer 都不变或保持相同
   anchor/focus/range（`excel/spreadsheet-ui-core/test/pointer-selection-commands.test.ts:54-135`）。
2. ✅ **Unbound projection lane 已关闭。** Null binding 现在对 active request 调用
   `rejectProjectionAtom`，并循环 settle 被提升的 queued successor
   （`excel/spreadsheet-ui-core/src/projection/run-visible-projection.ts:28-42`）。回归测试在裸 store 上
   先断言 Promise resolves failed/error snapshot，再给同一 store 绑定 backend，下一次 command 确实
   ready 且 snapshot/result 都落到新窗口
   （`excel/spreadsheet-ui-core/test/run-visible-projection.test.ts:99-129`）。旧实现会在第二次调用得到
   transport unavailable 并残留 loading，因此该测试有效命中初审反例。
3. ✅ **Editing pending-mutation 窗口切换已关闭。** Commit/retry 只做启动时可用性 guard；真正执行
   refresh callback 时重新读取当时的 `projectionSnapshotAtom.request`
   （`excel/spreadsheet-ui-core/src/editing/bound-cell-editing-commands.ts:14-40,43-73`）。Core deferred
   mutation test 断言 A→B→B、最终 snapshot 为 B、mutation 一次；refresh-failed 后再切 B 的 retry
   test 断言 A→A→B→B 且不重发 mutation
   （`excel/spreadsheet-ui-core/test/cell-editing-commands.test.ts:121-207`）。新增 React 测试也通过真实
   scroll 让 B cells 先可见，再释放 ACK，最终严格断言请求 `[0,20,20]`、B cell 仍显示且 mutation
   一次（`excel/react-excel/test/workbook/editing/pending-edit-scroll.test.tsx:32-110`）。
4. ✅ **Setter-only `useCallback` 已关闭。** `useCellEdit` 已移除 React `useCallback` import；start 与
   setDraft 只保留普通窄参数适配，commit/retry 直接使用 `useSetAtom` setter
   （`excel/react-excel/src/workbook/editing/use-cell-edit.ts:27-49`）。`workbook/editing` 当前
   `useCallback` 零命中；workbook 剩余命中仅是 pointer DOM/capture/event、scroll/window 与 focus/ref。

### 复审验证

- UI-core 全量：97 suites / 2090 tests passed；上述 pointer、projection、editing 定向 suites 均实际运行。
- React 全量：7 suites / 16 tests passed，包含新增 pending edit + scroll 回归。
- UI-core build、React typecheck、React Vite build（391 modules）通过。
- 返修范围 ESLint 无 warning/error；`pnpm check:cycles` 为 1055 modules / 2519 dependencies、零 violation。
- 三条边界 `rg` 仍零命中；返修新增/大改普通文件最大 225 行，测试最大 208 行，职责与行数合规。
- 初审已通过的 Provider/store 隔离、标准 `@einfach/react` hooks、普通 mutation/projection failure
  显式 outcome、用户交互回归与一次 mutation 语义未被返修削弱。

### 最终结论

四个初审 blocking defects 均有对应实现修正与能命中原反例的定向测试，复跑全量验证通过，未发现新的
blocking regression。001 复审结论：`APPROVED`，可以进入用户验收；是否启动 003 仍遵循任务树的用户
checkpoint。

## B-007 用户验收返修复审

复审日期：2026-09-02

本节在保留初审及第一次返修复审历史的前提下，按用户新增的 B-007 重新审查当前 worktree。复审输入包含
更新后的任务树 index、001 leaf、执行报告和 `excel/react-excel/SKILL.md`；裁决范围仍从
`6f07cae2568596331a2be333791203694d59bc17` 起，并包含已提交的 `5aeb6723`。本节结论取代上一次用户
验收前的裁决。

### B-007 逐项核对

1. ✅ **React 产品源码已清零本地状态 hooks，且没有把 atom 定义搬进 React。**
   `rg -n "\\buse(State|Reducer)\\b" excel/react-excel/src` 和任务要求的 React `atom(` 扫描均零命中。
   产品通过显式 `@einfach/react` Provider 及 `useAtomValue/useSetAtom` 消费 core 状态；没有新增 React
   window/runtime atom。
2. ✅ **App 启动渲染态与 backend binding 已形成同一 core lifecycle。**
   `workbook-lifecycle.ts` 的 begin 同时清 binding 并发布 loading，resolve 先绑定同一 backend 再发布
   ready，reject 清 binding 并发布 error（`excel/spreadsheet-ui-core/src/runtime/workbook-lifecycle.ts:34-60`）。
   `App.tsx` 的 effect closure 是 Worker 句柄的唯一所有者；create 同步失败进入 reject，ready 异步失败先
   幂等 dispose 再 reject，正常卸载也只 dispose 一次并清 core lifecycle
   （`excel/react-excel/src/app/App.tsx:33-70`）。Workbook 只会在 ready 状态渲染，届时 backend binding
   已经建立。
3. ✅ **StrictMode、晚到 Promise 与普通重复 render 在当前实现中不会串写。**
   每次 effect attempt 都有独立的 `active/backend/disposed` closure；cleanup 先令 attempt inactive，再幂等
   dispose 并 begin。旧 attempt 随后 resolve/reject 时不会再写 lifecycle，reject 路径的重复 dispose 也被
   guard 拦截。三个 `useSetAtom` 返回值由固定 atom、固定 Provider store memoize，因此 ready/error
   导致的普通 rerender 不会重启 effect。产品入口确实以 StrictMode 渲染
   （`excel/react-excel/src/main.tsx:12-15`）。
4. ✅ **Grid 复用既有 viewport 状态机，没有第二份窗口状态。**
   `useGridWindow` 只用 `setViewportMetricsAtom` 初始化固定产品 metrics，并直接订阅
   `visibleWindowAtom`（`excel/react-excel/src/workbook/projection/use-grid-window.ts:17-39`）；
   `useWorkbookViewport` 的 scroll adapter 只派发 `scrollToCellAtom`
   （`excel/react-excel/src/workbook/projection/use-workbook-viewport.ts:196-202`）。其中的 `useMemo`
   只是对输入范围作同步 clamp，不保存状态，也不构成重复 window atom。`Workbook` 将同一 derived window
   直接传入 projection hook（`excel/react-excel/src/workbook/shell/Workbook.tsx:32-40`）。
5. ✅ **现有 `useRef` 均属于明文允许边界。** CellEditor 的 input ref 是 DOM identity，commit/blur refs
   是单次事件流的 in-flight guard；WorkbookGrid 的 ref 只用于 DOM focus；pointer adapter 的 ref 只记录
   pointer identity/capture。没有 ref 保存业务状态或决定独立的可渲染状态。

### 测试强度与回归

- Core runtime test 直接断言 loading/ready/error 与 backend binding 同步切换
  （`excel/spreadsheet-ui-core/test/runtime-lifecycle.test.ts:12-34`）。React App tests 覆盖 loading→ready、
  成功卸载只 dispose 一次、异步 ready failure 的错误展示和立即 dispose 一次，以及同步 create failure
  （`excel/react-excel/test/app/startup-lifecycle.test.tsx:47-83`）；因此失败与清理断言不是只检查渲染文案。
- Core viewport test 从固定 32×8 首屏出发，派发真实 `scrollToCellAtom` 到末端，断言 clamp 后窗口及
  `scrollTop`（`excel/spreadsheet-ui-core/test/visible-window-scroll.test.ts:10-46`）。React projection test
  通过真实 scroll handler，断言同一 store 的 `visibleWindowAtom`、`viewportMetricsAtom.scrollTop` 与第二次
  Rust projection request 完全一致，并继续命中末行渲染和绝对 selection 坐标
  （`excel/react-excel/test/workbook/projection/projection.test.tsx:116-165`）。旧的 React 本地 window 实现
  无法通过这些 atom 断言。
- 新增 App suite 没有显式包一层 StrictMode，也没有单独释放已卸载 attempt 的 deferred Promise；这是可补强
  的非阻塞测试缺口。当前源码的 attempt-local `active` 与幂等 dispose 已逐语句核对，实际生产入口又使用
  StrictMode，未发现可构造的旧 attempt 覆盖新 binding/state 路径；001 验收只要求 core atom 单测和 React
  启动行为测试，现有测试已满足。
- 第一次返修已关闭的 pointer 共同不变量、unbound projection lane、editing pending-mutation 窗口切换和
  setter-only callback 保持不变。UI-core 99 suites / 2092 tests、React 8 suites / 19 tests 全量通过，包含
  pointer、projection failure/latest-window、editing reject/retry/连续编辑/pending-scroll 与 Provider 隔离。

### 工程验证与最终结论

- UI-core build、React typecheck、React Vite build（391 modules）、范围 ESLint、`git diff --check` 全通过；
  `pnpm check:cycles` 为 1056 modules / 2521 dependencies，零 violation。三条既有边界扫描以及新增的
  `useState/useReducer`、React atom 声明扫描全部零命中。
- 本叶新增或大改普通文件最大 215 行，测试最大 208 行，均低于 300 行；runtime lifecycle、grid window
  adapter、projection adapter 和各回归 suite 的职责可分别用单一业务点描述。存量超限 core 文件未在
  B-007 中扩写。

B-007 的 atom 所有权、资源生命周期、窗口单一来源、ref 边界和回归证据均满足 001 验收，未发现新的
blocking defect。001 当前最终结论：`APPROVED`，可再次进入用户验收；003 仍应等待该 checkpoint。
