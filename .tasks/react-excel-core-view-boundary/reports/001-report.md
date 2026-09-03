# 001 执行报告

日期：2026-09-02

结论：独立 review 的四项 blocking defects 与用户新增 B-007 验收均已实现并完成全量验证；未提交 Git，等待复审与用户验收。

## 独立 Review 返修

1. Pointer 共同不变量
   - start/update command 先通过 selection authority receipt 完成一次输入校验与 bounds 归一化，再用
     receipt 的同一 sheet/coord 更新 pointer state。
   - update 在 inactive、非 drag-selection 或 cross-sheet 时返回明确 ignored outcome，且不写 selection。
   - Core tests 新增 inactive、cross-sheet、越界 start/update 与 active 期间 bounds 缩小，逐项断言
     selection 与 pointer 不分叉。
2. Projection 无 backend lane 释放
   - null backend 分支改走 `rejectProjectionAtom` settle 路径，并循环处理可能提升的 queued successor；
     不再只发布 error 而残留 active lane。
   - Core test 验证裸 store 首次 command 显式 failed，之后同 store 绑定 backend 可再次 ready，Promise
     全程不 reject 且 snapshot 不残留 loading。
3. Editing 当前窗口 refresh
   - commit 的 refresh callback 在实际执行时重新读取 current visible request；retry callback 同样在执行时
     读取，不再冻结 mutation 前窗口。
   - Core deferred-mutation test 证明请求序列为 A、B、B，最终 snapshot 保持 B 且 mutation 仅一次；
     retry test 证明从 A refresh failure 切到 B 后只 retry B。
   - React 新增 pending edit + scroll 回归，ACK refresh 后 B cells 继续可见。
4. React setter wrapper
   - 删除 `use-cell-edit.ts` 中 start/setDraft 的两个纯 setter `useCallback`，只保留普通窄参数适配。
   - 剩余 `useCallback` 人工归类为 pointer DOM/ref/event、scroll/window 或 focus/ref 适配。

## 变更

- React 产品直接依赖 `@einfach/react@^0.4.0`；`WorkbookRuntimeProvider` 用显式
  `Provider store={core.store}` 隔离 workbook store。
- 删除 React 自制 `useSyncExternalStore` bridge 与不再需要的 workbook core context。
- Selection 新增 pointer start/update 组合 command atoms；React pointer adapter 每个开始/移动意图只
  dispatch 一个组合 setter，pointer capture/release 仍留在 React。
- Projection 读取和写入改为 `useAtomValue` / `useSetAtom`，保留 React 所有的窗口计算与滚动适配。
- Editing 新增从当前 visible projection 启动 Cell 编辑的 command atom；新增绑定 store-local backend、
  history unavailable 策略与当前 visible window 的 commit/retry command atoms。
- React editing 不再读取 projection cells 组装 draft，不再注入 backend、history recorder 或 refresh
  callback；现有 Enter、blur、Escape、mutation reject 和 refresh retry 行为保持不变。
- 新增 UI-core pointer/editing command tests，以及 React Provider 隔离、pointer 点击/拖选/取消和连续
  两个 Cell 编辑回归测试。

## 验收证据

1. 依赖与 Provider
   - `excel/react-excel/package.json` 含 `"@einfach/react": "^0.4.0"`。
   - `WorkbookRuntimeProvider` 显式传入 `core.store`。
   - `provider-isolation.test.tsx` 验证两个显式 Provider 的 selection state 不串联。
2. React atom hooks
   - selection、projection、editing reads 使用 `useAtomValue`，writes 使用 `useSetAtom`。
   - `use-store-value.ts` 和 `use-workbook-runtime.ts` 已删除。
   - 剩余 `useCallback` 仅用于 pointer DOM/ref/event、scroll/window、focus/ref 适配；editing 目录零命中。
3. Core 命令语义
   - `pointer-selection-commands.test.ts` 覆盖 start/update、inactive、cross-sheet 与越界归一化，并断言
     selection/pointer 共同不变量。
   - `cell-editing-commands.test.ts` 覆盖 projection source draft、mutation reject、refresh failure/retry、
     deferred mutation 期间窗口切换，并断言 Rust mutation 始终只有一次。
   - 既有 `run-visible-projection.test.ts` 覆盖 latest-window 并发队列与 terminal backend failure。
   - 新增同 store 无 backend failure 后绑定 backend 恢复 ready 的 lane settle 回归。
4. React 行为
   - 既有 projection/editing tests 与新增 pointer、连续双 Cell tests 全通过。
   - 覆盖点击、拖选、pointer cancel、首屏/滚动投影、双击、Enter、blur、Escape、拒绝保留草稿、
     refresh retry、连续编辑两个不同 Cell，以及 pending mutation 期间滚动后保持新窗口。
5. 边界扫描
   - `rg -n "useSyncExternalStore|store\\.setter|store\\.getter" excel/react-excel/src/workbook`：零命中。
   - `rg -n "core\\.backend|readVisibleProjection|setCellInput|historyEntryRecorder|refreshProjection" excel/react-excel/src/workbook`：零命中。
   - `rg -n "(^|[^[:alnum:]_])atom(<[^>]+>)?\\(" excel/react-excel/src`：零命中。
6. 文件约束
   - 所有新增或大改普通文件均 `wc -l <= 225`；新增 command/test 文件最大 208 行。
   - 未改动存量超限的 `selection/index.ts`、`projection/index.ts`、`editing/index.ts`。

## 命令结果

- `pnpm exec jest excel/spreadsheet-ui-core/test --runInBand --no-coverage`：通过，97 suites / 2090 tests。
- `pnpm --filter @einfach/spreadsheet-ui-core build`：通过。
- `pnpm --filter @einfach/react-excel typecheck`：通过。
- `pnpm --filter @einfach/react-excel test`：通过，7 suites / 16 tests。
- `pnpm --filter @einfach/react-excel build`：通过，391 modules transformed。
- 范围 ESLint：通过，无 warning/error。
- `pnpm check:cycles`：通过，1055 modules / 2519 dependencies，无 violation。
- `git diff --check`：通过。
- 要求的三条 `rg` 静态扫描：全部零命中。

本地 `spreadsheet-ui-core` 的 package `build` 仅生成声明文件；React Vite build 会读取忽略式 ESM
产物，因此验证前按仓库既有流程执行了 `pnpm exec rollup -c rollup.config.mjs` 刷新生成物。该命令成功，
未产生 tracked source 差异。

## 剩余风险

- package 级 UI-core build 与本地 ESM 产物刷新是存量工具链分工；只运行 package `build` 后若不运行
  Rollup，消费端可能读到旧的忽略式 ESM。此次已刷新并验证 React production build。
- 工作区开始时任务 index、001/002/003/004 文件已有编排者差异，review 与
  `react-excel/SKILL.md` 为 untracked；此前返修未修改这些文件，也未修改 001 范围外产品源码。

## 用户验收 B-007 返修

### 实现

1. App Rust 启动生命周期
   - 新增 `spreadsheetRuntimeAtom` 以及 begin/resolve/reject command atoms，统一表达
     loading/ready/error，并在同一命令内建立或清除 store-local backend binding。
   - `App.tsx` 改用显式 `AtomProvider store={workbookStore}` 与 `useAtomValue/useSetAtom`；移除本地
     `useState`。产品 effect 仍唯一负责 Worker backend 的 create、await ready 和幂等 dispose，backend
     句柄只存在 effect closure 内。
   - 新增 core lifecycle test 和 React App 行为测试，覆盖 loading→ready、异步 ready failure、同步
     create failure 与 backend 释放。
2. Grid visible window
   - `use-grid-window.ts` 不再持有本地 window；它只用 `setViewportMetricsAtom` 初始化产品 viewport
     metrics，并直接订阅现有 `visibleWindowAtom`。
   - `use-workbook-viewport.ts` 的滚动改为派发既有 `scrollToCellAtom`；没有新增 window atom。空的默认
     visible window 会保持为空，避免 metrics effect 执行前发出伪造的 1×1 projection。
   - 新增 core visible-window/scroll test；React projection test 直接断言首屏和滚动后的
     `visibleWindowAtom` 与 `viewportMetricsAtom`，并继续验证末行渲染和绝对 selection 坐标。
3. 项目约定
   - 按用户本轮明确授权更新 `excel/react-excel/SKILL.md`：React 产品源码禁止 `useState/useReducer`；
     可渲染状态进入 UI-core atoms；`useRef` 仅限 DOM、pointer identity/capture 和不触发渲染的事件守卫；
     外部 backend 资源保留在 effect closure。
   - React 源码现有 `useRef` 已逐个归类：CellEditor 的 input DOM ref、commit/blur 事件守卫，
     WorkbookGrid 的 DOM ref，以及 pointer adapter 的 active pointer identity；没有业务或可渲染状态。

### B-007 逐条验收证据

1. `rg -n "\\buse(State|Reducer)\\b" excel/react-excel/src`：零命中。
2. App startup 状态由 UI-core runtime lifecycle atom/commands 驱动；core test 断言 loading、ready、error
   与 backend binding 同步，React test 断言三种启动表现和 dispose。
3. Grid 直接读 `visibleWindowAtom`，只通过 `setViewportMetricsAtom` 与 `scrollToCellAtom` 改变窗口；core
   test 断言固定 32×8 首屏及末端 clamp，React test 断言同一 store 中的窗口/scrollTop 与实际 Rust
   projection request 一致。
4. `rg -n "(^|[^[:alnum:]_])atom(<[^>]+>)?\\(" excel/react-excel/src`：零命中；未在 React 声明重复
   runtime/window atom。
5. 既有三条边界扫描仍全部零命中；selection、projection、editing 与 Provider 全量 React 回归均通过。
6. 本轮新增/大改普通文件最大 215 行，全部低于 300 行；runtime、grid adapter 与测试按单一职责拆分。

### 本轮完整命令结果

- `pnpm exec jest excel/spreadsheet-ui-core/test --runInBand --no-coverage`：通过，99 suites / 2092 tests。
- `pnpm --filter @einfach/react-excel test`：通过，8 suites / 19 tests；追加 projection atom 断言后该套件
  再次定向通过，3 tests。
- `pnpm --filter @einfach/spreadsheet-ui-core build`：通过。
- `pnpm --filter @einfach/react-excel typecheck`：通过。首次在刷新 core 声明前运行时因四个新导出尚未进入
  package declarations 而失败；按依赖顺序构建 core 后复跑通过。
- 范围 ESLint（React src/test 与本叶改动的 UI-core source/tests）：通过，无 warning/error。
- `pnpm exec rollup -c rollup.config.mjs`：通过，刷新本地忽略式 ESM/CJS 消费产物。
- `pnpm --filter @einfach/react-excel build`：通过，391 modules transformed。
- `pnpm check:cycles`：通过，1056 modules / 2521 dependencies，无 violation。
- `git diff --check`：通过。
- `useState/useReducer`、三条既有边界与 React atom 声明扫描：全部零命中。

### 本轮剩余风险

- App 使用模块级 product store 是 003 的既定后续范围；本轮只把启动渲染态和 backend binding 下沉，
  没有提前迁移 Store 创建职责。
- UI-core package build 与 Rollup 产物刷新仍是存量工具链的两步分工；本轮两步均已执行并验证最终 React
  production build。
- 任务 index/leaf/review 的现有差异由编排者维护，本轮未改；仅按用户明确新增范围更新了
  `react-excel/SKILL.md` 与本报告。

## 三审后的连续返修

三审通过后，用户继续在 001 的 editing / projection 范围内验收并提出问题，因此此前 review 已不能代表
当前工作区。以下仍归入 001，不提前启动 Store 初始化（003）。

### Editing 边界与拆分

- 将 `spreadsheet-ui-core/src/editing/index.ts` 按 session、commit、history projection、outcome 等单一职责
  拆成独立模块，并补充关键流程注释与定向测试。
- 删除框架侧 `commitEditingAtom` 适配和注入式 `historyEntryRecorder`；React/Solid/Vue 不再组装编辑提交
  事务。Rust worker 负责真实 before/write/after undo 记录，UI-core 只投影 undo/redo 可用性与时间线元数据。
- 保留 mutation reject 草稿、outcome-unknown、refresh-only retry 与连续编辑不同 Cell 的既有语义。

### 滚动投影

- `use-workbook-viewport.ts` 在新窗口请求期间保留同 sheet 的最近成功 projection；请求状态仍可单独为
  loading，但网格不再用全屏 `Loading` 覆盖已经可见的数据。
- `WorkbookGrid.tsx` 只在从未得到 projection 时显示首次 Loading；React projection 测试新增滚动期间
  保留旧结果、完成后切换新窗口的回归。

### 最新验证

- UI-core：106 suites / 2091 tests，通过。
- Solid：220 suites / 2061 passed + 1 todo，通过。
- React：8 suites / 20 tests，通过；typecheck、build、范围 ESLint 通过。
- Vue、cycles、docs、边界扫描与 `git diff --check` 通过。
- 本轮新增或大改普通文件均不超过 300 行；React 滚动修复涉及文件最大 222 行。

### 待复审

- reviewer 必须从叶子原 base 复核当前完整工作区，重点检查 Rust/UI-core/framework 的编辑职责边界、
  history timeline 一致性，以及 retained projection 是否会跨 sheet 或遮蔽 terminal failure。

## 增量复审返修输入

独立 review 结论为 `REJECTED`。其中 retained projection 的 frame 不一致是有效阻塞：旧 result 的 cells
被当前新 window 渲染，小滚动会让新边缘为空，大跨度滚动会短暂整屏空白。返修必须让展示中的 window 与
cells 始终来自同一个 projection frame，并新增这两个反例测试。

另外两项按用户后续明确指令裁决：

- 删除 `commitEditingAtom` 及仓库内 Solid/Vue 对应适配是用户要求的一次性 breaking migration，不恢复
  已废弃接口；跨框架既有测试仍须通过。
- `editing/session-atoms.ts` 的 `debugger` 是用户亲自加入的现场诊断点，executor 不得擅自删除。最终是否
  清理由用户验收时决定。

## Retained projection 增量复审返修

### 裁决范围

按 index 与 001 叶子的最新裁决，本轮只处理 review Important 1。`commitEditingAtom` 的删除属于用户明确
授权的一次性仓库内迁移；`editing/session-atoms.ts` 的 `debugger` 属于用户保留的现场诊断点。本轮没有
恢复或删除这两项，也没有修改 editing、Solid、Vue 或任务账本状态。

### 实现与反例

- `useWorkbookViewport` 区分受控的 requested window 与实际展示的 projection frame。等待新窗口结果时，
  返回 retained result 自带的 window 和 cells；结果到达后再将两者作为完整 frame 一起切换。
- 当前请求的 loading/error 状态仍按 requested window 判定；跨 sheet 结果仍不保留，terminal failure 仍
  优先由 `WorkbookGrid` 展示，不改变最新 review 已确认通过的两条 guard。
- React 小滚动反例断言 pending 期间完整保留 row 0..31，row 32 不会以空 cell 提前出现；resolve 后才整帧
  切到 row 1..32。
- React 无交集反例从 row 0..31 跳到 row 400..431，断言 pending 期间仍渲染旧 frame，不会把旧 cells 套进
  row 400 的 DOM；resolve 后才切到 row 400。

### 增量验证

- 定向 projection test：通过，1 suite / 5 tests。
- React 全量 test：通过，8 suites / 21 tests。
- React typecheck、production build、两个改动文件的范围 ESLint：通过。
- `pnpm check:cycles`：通过，1067 modules / 2551 dependencies，无 violation。
- `useState/useReducer`、手写 store bridge、workbook backend 编排、React atom 声明四项扫描：零命中。
- `git diff --check`：通过。
- 改动源文件与测试文件分别 208、254 行，均低于 300 行；未新增文件。

结论：latest review 唯一有效阻塞已修复并由两个命中反例闭环；未提交 Git，等待独立复审。

## Retained frame 几何二次返修输入

独立复审继续 `REJECTED`：第一次返修只保证旧 frame 的 `window/cells` 同源；当浏览器已经滚到 row 400，
旧 frame 仍按 row 0 的 sheet offset 布局，因而虽在 DOM 中却完全落在 viewport 外。下一返修必须同时满足：

- pending retained frame 的实际纵向区间与滚动 viewport 相交，不能用“DOM 仍存在”代替可见性。
- retained frame 保持自己的逻辑 cell 坐标，不把旧 cells 伪装成新 window 数据。
- 若为可见性临时移动旧 frame，pending 期间必须禁止或正确重映射 pointer、双击编辑和键盘编辑，避免在
  row 400 的视觉位置修改旧 row 0。
- 新 projection resolve 后恢复真实 sheet offset 与正常交互，并补充几何或真实浏览器级反例。

## Retained frame 几何二次返修

### 实现

- `useWorkbookViewport` 继续让 `window/cells` 表示同一个逻辑 projection frame，并新增独立的
  `placementWindow` 与 `retained`。旧 frame pending 时只把完整 frame 临时放到 requested window 的 sheet
  offset；没有改写旧 cell 的逻辑坐标。新 result resolve 后，逻辑 window 与 placement 重新一致。
- `WorkbookGrid` 用 `placementWindow.rowStart` 计算 CSS offset。大跨度滚到 row 400 时，旧 row 0..31 frame
  临时位于 `11200px`，与真实滚动 viewport `[11200px, 12400px]` 相交，不再只是留在 viewport 外的 DOM。
- retained 期间 grid 标记为 `aria-busy`、移出 tab 顺序，pointer adapter disabled；pointer adapter 会取消既有
  pointer capture，并拒绝新的 down/move/up。grid 同时拒绝双击和 Enter 启动编辑，CSS 关闭旧 cell 的浏览器
  hit testing。resolve 后这些限制全部解除。

### 命中反例

- 大跨度 pending 测试按实际 `scrollTop/clientHeight` 与 CSS frame offset 计算区间并断言相交，不再以 DOM
  存在代替可见性。
- 同一测试证明旧 row 1 cell 虽保持逻辑坐标，但 pointer、双击和 Enter 都不能改变 selection 或启动
  editing；resolve 后 row 400 cell 恢复 selection 与双击 editing，offset 为其真实 sheet 位置。
- 既有单行滚动测试继续证明 retained frame 的 `window/cells` 同源，resolve 后才整帧切换。

### 验证

- 定向 projection test：通过，1 suite / 5 tests。
- React 全量 test：通过，8 suites / 21 tests；typecheck、production build、范围 ESLint 通过。
- `pnpm check:cycles`：通过，1067 modules / 2551 dependencies，无 violation。
- 四项 React 边界扫描与 `git diff --check`：通过。
- 本轮涉及源文件最大 216 行，测试文件 289 行，全部低于 300 行。

结论：retained frame 的大跨度可见几何和临时交互风险均已闭环；未提交 Git，等待独立复审。
