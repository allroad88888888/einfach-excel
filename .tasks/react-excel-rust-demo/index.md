# React Excel · 复用现有 Rust Worker

创建：2026-09-01

## 目标

让现有 React Vite demo 直接消费仓库已经完成的 Rust/WASM Worker 链，只交付三个用户可测功能：

1. 打开含 1000 行数据的 Rust 工作簿；
2. 滚动到任意行并选择单元格；
3. 编辑一个单元格并从 Rust 投影中看到写回结果。

三个叶子全部完成后进入 `awaiting_user` 并停止，不追加第四项功能。

## 已有能力证据

- Rust Worker 入口：`excel/solid-excel/src/adapter/worker-runtime.ts`，由 Vite 通过
  `@einfach/solid-excel/vnext-worker-runtime?worker` 直接实例化。
- RPC client：`excel/solid-excel/src/adapter/worker-protocol/client.ts`。
- backend：`excel/solid-excel/src/adapter/worker/backend.ts` 的
  `createWorkerWorkbookSpreadsheetBackend`。
- React 投影 hook：`excel/react-excel/src/use-spreadsheet-viewport.ts`。
- React 编辑状态：`excel/react-excel/src/use-spreadsheet-editing.ts` 与 UI-core
  `runEditingCommitAtom`。

## 全局硬约束

- 直接 import `@einfach/solid-excel/vnext-worker-runtime?worker`；不经过同时声明 TS
  factory 的 `worker-factory.ts`。
- 禁止导入、调用或提供开关选择 `defaultExcelCoreTsWorkerFactory`。
- 禁止 `worker-runtime-ts`、`worker-entry-ts`、`@einfach/excel-core-ts` 与任何 TS fallback。
- 不创建新的 worker package、RPC contract、dispatcher、WASM surface 或 backend。
- 不修改 `excel/solid-excel/src/**`、`excel/rust/**`、`excel/excel-wasm/**`；001 只可在
  `solid-excel/package.json` 给现有 `worker-workbook-backend` 增加公开子路径。
- Rust/WASM 初始化或导入失败时展示错误；禁止退回静态数据。
- 1000 行指 1000 条数据行，另有 1 行表头；数据写入 Rust 后，网格不得继续读取
  `DEMO_CELLS` 静态投影。
- 网格只挂载可见窗口，禁止把 1001×8 个单元格全部常驻 DOM。
- 普通文件物理行数 ≤300，每个文件只负责一个业务点或抽象。
- 执行 agent 不提交、不改任务状态；编排者在每叶独立 review 通过后回写状态并单独提交。
- 003 review 通过后由编排者把整树设为 `awaiting_user`，只给三步人工测试并停止。

## 任务树

```text
001 打开 Rust 工作簿
 └─ 002 Rust 投影滚动与选择
     └─ 003 Rust 单格编辑与首轮验收
```

| id | 用户功能 | status | base | report | review |
|---|---|---|---|---|---|
| 001 | 打开 1000 行 Rust 工作簿 | done | c63249171a177cb39c0755cc14db66f9caa4f2b7 | reports/001-report.md | reports/001-review-v3.md |
| 002 | 滚动并选择 | pending | null | | |
| 003 | 单格编辑并回读 | pending | null | | |

## 用户验收门

只给用户以下三步：

1. 打开 demo，确认显示 Rust/WASM ready 与 1000 条记录；
2. 滚到第 1000 条记录并选择一个单元格；
3. 修改该单元格，确认失焦或 Enter 后仍显示新值。

裁决：给现有中性 backend 增加 `@einfach/solid-excel/worker-backend` 子路径，并直接加载
`vnext-worker-runtime?worker` — 避免经过 Solid public barrel 与同时含 TS factory 的模块；
错了的代价是 package export 指向错误，因此 001 必须用入口测试与 bundle 审计钉死目标。

## 遗留与发现

- 001 Minor：App 的 StrictMode、卸载后 late completion 与 dispose 次数尚无定向自动化
  测试；源码独立 review 与真实 Chromium ready 验证均通过，本阶段不扩围。
- 001 已解决：根级 TypeScript 使用旧 Node 解析，测试已改为 mock-before-`requireActual`，
  不再用静态 import 把 Vite 专属 demo 模块拉入根工程；根级 `tsc -b` 已通过。
