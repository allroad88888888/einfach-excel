# 005 独立审查

结论：**REJECTED**。canonical 公共名称、兼容别名、App 导航和既有 backend 选择均保持正确，但任务明确要求的 seed / probe / workbook host 拆分没有落实为真实的单一职责边界。

## 审查范围

- 任务：`.tasks/solid-excel-source-cutover/005-consolidate-current-demos.md`
- 执行报告：`.tasks/solid-excel-source-cutover/reports/005-report.md`
- 基于 `723082739d66140ac697a5a9c203a6fd99649d4a` 的指定范围 diff
- `git status --short`，并直接阅读 `src-vnext/demos` 下全部未跟踪文件
- 按要求未重跑执行报告声称已通过的 Jest / Playwright

## 验收标准逐条判定

1. ✅ **Demo 文件均不超过 300 行。** 当前目录物理行数最大为 `VNextWave5Demo.tsx` 237 行，其次为 `VNextWorkerTsDemo.tsx` 218 行；新增 `WorkerWorkbookHost.tsx` 131 行、`worker-workbook-seed.ts` 92 行、`workbench-seed.ts` 33 行、`index.ts` 9 行，均在硬上限内。这里仅判定行数通过，不代表职责拆分通过。
2. ✅ **指定 Jest 验收有报告证据通过。** 执行报告记录 2 suites、84 tests 全绿；按审查要求未重跑。限定 diff 中菜单源码断言由已被抽空的 `VNextWorkerDemo.tsx` 改查实际 UI host `WorkerWorkbookHost.tsx`，属于必要小改；2958 行测试为存量超限，本次无需越界重构。`package-entry.test.ts` 只多出一个空行，不影响结果。
3. ✅ **指定 wasm smoke 有报告证据通过。** 执行报告记录 19/19；按审查要求未重跑。静态检查同时确认 App 默认仍为 `vnext-wave5`，`?backend=remote` 仍只切换到 `vnext-remote`，worker Demo 内 `?backend=ts` 仍选择 TS factory，其他值仍选 WASM factory。

## 覆盖矩阵

- ✅ **C-003 默认 Demo 组件集合。** `App.tsx:71-75` 保留原五个 vnext nav id、labelKey、顺序与 remote Demo，只将前四个组件引用替换为 canonical 名称；`initialTabId()` 的默认 `vnext-wave5` 及 remote 分支未改。
- ✅ **C-009 `./demos` 导出面（本叶子边界）。** `src-vnext/demos/index.ts:1-4` 导出四个 canonical 名称，`:6-9` 用 re-export alias 将四个旧 `VNext*Demo` 名称绑定到同一个导出对象；不是包装组件或重复实现。`src-vnext/index.tsx` 改为唯一地转出该 barrel，因此旧 vnext 入口仍保留。当前 package `./demos` 尚未切换属于报告已声明的后续 009 范围，不据此否决本任务。
- ✅ **C-018 Demo 文件行数。** 全部文件 ≤300 行，证据同验收标准 1。

## 质量发现

### Critical

无。

### Important

1. **seed / probe / host 并未按目标拆为真实单一职责。** 任务目标明确是“把两个超限 Demo 的 seed、probe、workbook host 拆开”，接口也要求 seed/probe 模块只提供数据或调试生命周期。实际 `worker-workbook-seed.ts` 同时承担 viewport/sheets 配置（7-24）、probe 类型与可变状态（30-55）、debug window 暴露/清理（38-55）、workbook 数据写入（58-83）以及 probe 初始化（85-91），一句话职责必须包含多个并列事项，违反单一职责规则。与此同时，`WorkerWorkbookHost.tsx:39-66` 又内嵌完整 probe logger（轮询、日志、重试与状态变更），而 `:68-131` 才是 workbook host；host 与 probe 生命周期仍混在同一文件。执行报告所称“seed/debug 生命周期 (`worker-workbook-seed.ts`)、workbook UI host”把 seed 与 probe 合并，和任务要求的三者拆开不一致。应将 probe 状态/debug window/Logger 生命周期移到独立 probe 模块或组件，使 seed 只负责稳定数据初始化，host 只负责 workbook UI 挂载。

### Minor

1. `package-entry.test.ts:57` 新增了一个无语义空行，属于范围内无必要噪音，但不单独阻断。

## 其他核对

- canonical 名称与旧名称确为同对象绑定：barrel 使用 `export { SpreadsheetX as VNextX } from ...`。
- 四个原文件不再直接导出旧名称，但 `src-vnext/index.tsx -> demos/index.ts` 保留了原公共 vnext 导出面。
- App 的 nav id、默认 tab、remote URL 分支均未漂移；worker 的 TS/WASM URL factory 分支语义也未漂移。
- `workbench-seed.ts` 只承载 workbench 静态 backend seed/config，职责可接受；主要职责缺陷集中在 worker seed/probe/host 三者。

---

## R1 修复复审

结论：**REJECTED**。原问题已大部分修复，但 workbook host 仍未收敛为只负责 UI 挂载的单一职责。

### 原发现复核

- ✅ **config 已独立。** `worker-workbook-config.ts:1-19` 只定义 worker Demo 的 viewport 与 sheets 稳定配置，不含 seed、probe 状态或 DOM。
- ✅ **seed 已独立。** `worker-workbook-seed.ts:10-34` 只向三个已初始化 sheet 写入固定数据/公式，不再管理 debug window、probe 可变状态或 logger。
- ✅ **probe 生命周期已独立。** `worker-lazy-probe.ts:1-39` 集中定义 probe 类型、初始化、读取、debug client 暴露及清理，不渲染 DOM；与 seed 已形成真实边界。
- ✅ **probe logger 已独立。** `WorkerLazyProbeLogger.tsx:1-29` 只响应 active sheet、轮询 probe 并输出日志；原先内嵌在 host 的实现已移出。
- ❌ **host 尚未只做 workbook UI 挂载。** `WorkerWorkbookHost.tsx:45-64` 仍内嵌两类运行时初始化：默认 active sheet/selection 写入（45-52），以及五个 custom formula 的定义、注册和注销（53-63）；此外 `:71` 还挂载返回 `null` 的 probe logger。该文件因此同时承担 UI surface 组装、workbook store/runtime 初始化和 debug probe 启动，无法用一句不含并列职责的话说明。任务粒度明确要求把稳定 `seed/probe/runtime` 从组件渲染中抽出，而本轮只拆出了 seed/probe，formula registry/runtime 仍留在渲染 host。应将默认 workbook 初始化及 custom formula 注册生命周期抽为专责 runtime hook/模块，并在 Demo 外壳统一组合 probe logger，使 `WorkerWorkbookHost` 只渲染 workbook UI surface。
- ✅ **`package-entry.test.ts` 无语义空行已清除。** 当前相对 base 无 diff。

### 回归核对

- ✅ **canonical / VNext 为同对象。** `demos/index.ts:1-9` 仍以直接 re-export alias 绑定四组名称，没有包装或重复组件。
- ✅ **App/nav 未漂移。** `App.tsx:71-75` 的 nav id、labelKey、顺序和 remote 项保持不变，默认仍为 `vnext-wave5`，仅组件名切换为 canonical。
- ✅ **backend 未漂移。** `App.tsx:84-87` 仍只让 `backend=remote` 改默认 tab；`VNextWorkerDemo.tsx:12-22` 仍让 `backend=ts` 选择 TS factory，其余值选择 WASM factory，并保持对应 capability 分支。
- ✅ **测试报告保持通过。** 更新报告记录 84 个 Jest 与 19/19 wasm smoke 复验通过；按要求未重跑。

### R1 质量分级

- Critical：无。
- Important：`WorkerWorkbookHost.tsx` 仍混合 UI host、store/runtime 初始化与 probe logger 挂载，未满足本轮明确的“host 只做 workbook UI 挂载”。
- Minor：无；原 `package-entry.test.ts` 空行噪音已清除。

---

## R2 复审

结论：**APPROVED**。R1 剩余的 host 职责问题已修复，未发现新的阻断问题。

### R1 Important 复核

- ✅ **`WorkerWorkbookHost` 只渲染 workbook UI surface。** 当前 `WorkerWorkbookHost.tsx:30-86` 仅从 props 读取 active sheet、取得 UI store 供 autocomplete 接受回调使用，并组装 MenuBar、Toolbar、Grid、Tabs、dialogs/overlays 等可见 workbook surface；不再包含 `onMount`/`onCleanup`、active sheet/selection 初始化、custom formula 注册或 probe logger。
- ✅ **active sheet/selection 与 custom formula 生命周期已移入专责 bootstrap。** `WorkerWorkbookRuntimeBootstrap.tsx:34-53` 在 Provider 内集中完成默认 active sheet/selection 初始化和 Demo custom formula 注册/注销；该初始化属于同一个“建立并清理 worker workbook UI runtime”职责，文件不实现具体 UI surface。
- ✅ **probe logger 不再由 host 启动。** `WorkerWorkbookHost.tsx` 不再 import 或渲染 `WorkerLazyProbeLogger`；由 `WorkerWorkbookRuntimeBootstrap.tsx:55-59` 在组合边界并列挂载 logger 与 host。
- ✅ **bootstrap 的职责与组合可接受。** bootstrap 作为 Provider-bound composition root，负责建立 runtime 生命周期并把同一 `activeSheetId` 投影传给 debug observer 与 UI host；logger 的轮询/日志实现仍封装在 `WorkerLazyProbeLogger.tsx`，probe 状态仍封装在 `worker-lazy-probe.ts`，host 的 UI 实现仍封装在 `WorkerWorkbookHost.tsx`。三者没有重新混回同一实现文件，常见的 UI、probe 或 runtime 改动可分别落在各自文件。

### 回归确认

- ✅ **canonical / VNext 同对象未漂移。** `demos/index.ts:1-9` 仍通过直接 re-export alias 绑定四组名称。
- ✅ **App/nav 未漂移。** 四个 canonical 组件仍对应原 nav id/labelKey；默认仍为 `vnext-wave5`，remote 分支不变。
- ✅ **backend 未漂移。** worker Demo 仍仅在 `backend=ts` 时选 TS factory，其余选择 WASM factory，对应 capability 分支保持一致。
- ✅ **测试证据。** 更新报告记录 84 个 Jest 与 19/19 wasm smoke 通过；按要求未重跑。

### R2 质量分级

- Critical：无。
- Important：无；R1 Important 已关闭。
- Minor：无。
