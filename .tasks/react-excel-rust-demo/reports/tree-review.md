# NEEDS_CHANGES

复核日期：2026-09-01

复核范围：完整阅读 `index.md` 与 001–003；逐项核对现有
`worker-factory.ts`、`worker-runtime.ts`、`worker-protocol/client.ts`、
`worker/backend.ts`、`use-spreadsheet-viewport.ts` 以及当前 React demo。
本次只新增本报告，不改产品或任务文件。

## 阻断项

### 1. Rust-only / no-Solid 边界还不是可执行合同

方向正确：任务明确复用
`createWorkerWorkbookSpreadsheetBackend`、`defaultVNextWorkbookWorkerFactory` 与现有
client，且禁止新建 worker/RPC/dispatcher/WASM surface/backend（`index.md:17-33`）。
现有 backend 的 `afterInit(client, sheets)` 也确实能直接提供导入 client，001 不需要
复制协议或 backend。

但 001 只写“依赖 `@einfach/solid-excel`”，没有冻结两个符号各自的 import subpath。
现状中 factory 有专用 `./vnext-worker-factory` export（
`excel/solid-excel/package.json:21-31`），backend 却只经 package root / `vnext` 的
public barrel 暴露；该 barrel 同时导出 provider、grid、toolbar 等 Solid UI
（`excel/solid-excel/src/public.ts:1-41`）。此外，同一个 factory 模块也包含 TS factory
及 `worker-entry-ts.ts` URL（`worker-factory.ts:28-39`）。源码只扫描 demo 本身
（`001:41-44`）不能证明依赖图/构建产物没有 Solid UI 或 TS worker；index 虽在
`63-65` 行要求 bundle import 检查，任何叶的验收都没有明确的 Solid runtime
零命中断言，003 也只扫描 TS token（`003:45`）。

最小修正：在 001 写死 backend 与 factory 的合法 import specifier；把构建产物审计
移到 001 验收并给出可运行命令/判据，至少证明：只有一个 Rust worker asset，能定位
WASM，零 `worker-entry-ts` / `worker-runtime-ts` / `excel-core-ts`，且主线程 chunks
零 `solid-js` / `@einfach/solid` / Solid provider UI。003 保留同一审计作终门。

### 2. 002 的写集无法完成自己的 `DEMO_CELLS` 验收

002 要求“demo 中 `DEMO_CELLS` 零引用”（`002:40`），但它的 `files` 不含
`demo/demo-data.ts` 或 `demo/App.tsx`（`002:11-17`）。当前 `demo-data.ts:82-93`
仍定义、读取 `DEMO_CELLS`，App 又通过 `getDemoFormulaBarValue` 消费这份静态映射
（`App.tsx:11-16,64-67`）。执行 agent 只能越界改文件，或让验收必然失败；编辑后
公式栏还可能继续显示 Rust 投影以外的旧静态值。

最小修正（二选一并写清裁决）：

- 若要求整个 demo 零静态投影，把 `demo-data.ts`、`App.tsx` 加入 002 的 `files`，并
  明确公式栏在首批如何避免读取静态 cell map；或
- 若只禁止网格读取静态投影，把验收精确缩为 `DemoGrid.tsx` 零
  `DEMO_CELLS` import/reference，同时明确 seed-only 数据不算网格投影，并处理公式栏
  的可见陈旧值。

### 3. 003 没有冻结 refresh 失败必须 reject 的关键语义

`runEditingCommitAtom` 只有在 `refreshProjection` reject 时才会进入
`refresh-failed` 并保留提交现场。现有 React transport 在 backend 读取失败后调用
`rejectProjectionAtom`，但随后 resolve `Promise<void>`（
`use-spreadsheet-viewport.ts:136-160`）。如果新 `refresh()` 直接复用它，UI-core 会把
失败刷新当成成功，违反 003 的“错误可见且保留草稿”（`003:35-37`）。当前验收的
“拒绝保留草稿”（`003:42`）也没有区分 mutation reject 与“Rust ACK 后 refresh
reject”。

最小修正：明确 `refresh()` 对当前 window 发起新 request；成功 resolve；读取失败时
先更新 projection error，再 reject 原错误。新增定向测试：mutation ACK 成功 +
projection refresh reject => commit outcome 为 `refresh-failed`、错误可见、编辑草稿/
重试权仍保留。自动 effect 的初始读取仍可吞掉 Promise rejection，不能因此改变为
未处理 rejection。

### 4. 叶子提交与最终状态的责任合同互相矛盾

index 要求每叶独立 review 并单独提交（`index.md:39`），001–003 末尾却全部写
“不提交”（`001:47`、`002:43`、`003:49`）。003 又要求“报告只给用户”并把状态改成
`awaiting_user`（`003:46`），但任务树规则下执行 agent 只写自己的执行报告，index /
任务状态及用户回报属于编排者；003 的 `files` 也不含 index。

最小修正：统一为一种流程。建议保留叶子“不提交”，由编排者在独立 review 通过后
回写 index/report/review；003 只在执行报告记录“ready for user acceptance”，编排者
完成 review 后把树改为 `awaiting_user` 并向用户只给三条人工步骤。若确需每叶提交，
则删掉三个“不提交”并明确谁提交、何时写 base/review。

## 已通过的方面

- 用户范围严格只有打开 1000 行、滚动选择、单格编辑三项；003 还显式排除了公式栏
  编辑、剪贴板、撤销、Sheet 与格式功能，没有第四项功能蔓延。
- 001→002→003 的依赖顺序合理；002 与 003 顺序共享 `DemoGrid.tsx`，不存在并行写冲突。
- 现有 worker backend 已完整装配 projection、cell-input 与 lifecycle ports；任务没有
  重建 worker、RPC、dispatcher 或 backend 的必要，也没有要求修改 Rust/WASM/Solid
  实现目录。
- 新文件按 seed、backend bootstrap、窗口换算、cell editor、editing hook、样式与
  场景测试拆分，职责边界总体合理，没有 `utils`/`partN` 假拆分。现有
  `use-spreadsheet-viewport.ts` 为 255 行、`worksheet.css` 为 252 行，任务已意识到
  300 行上限；修正后仍应逐文件 `wc -l`，若 viewport 增量会越过 300 行，需按投影
  transport/React hook 的真实职责拆分，不能机械拆成 helper 大杂烩。

以上四项修正后再派发；当前树不能保证零 Solid/TS runtime，也不能按现有 files 独立
完成全部验收。
