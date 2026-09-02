# React Excel · 复用现有 Rust Worker

创建：2026-09-01

状态：awaiting_user

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
| 002 | 滚动并选择 | done | 5e6e00fa914a4e3b867123d57a7e96d0628e27f5 | reports/002-report.md | reports/002-review-v2.md |
| 003 | 单格编辑并回读 | done (R2) | 97110f118bfcc792fda0b4a1fe5e9bc3c3fb69d4 | reports/003-report.md | reports/003-review-v3.md |

## 用户验收门

只给用户以下三步：

1. 打开 demo，确认显示 Rust/WASM ready 与 1000 条记录；
2. 滚到第 1000 条记录并选择一个单元格；
3. 修改该单元格，确认失焦或 Enter 后仍显示新值。

裁决：给现有中性 backend 增加 `@einfach/solid-excel/worker-backend` 子路径，并直接加载
`vnext-worker-runtime?worker` — 避免经过 Solid public barrel 与同时含 TS factory 的模块；
错了的代价是 package export 指向错误，因此 001 必须用入口测试与 bundle 审计钉死目标。

## 遗留与发现

- 后续 core/view 职责收敛另见 `../react-excel-core-view-boundary/index.md`；本树的三个用户功能与验收状态
  保持不变。
- 001 Minor：App 的 StrictMode、卸载后 late completion 与 dispose 次数尚无定向自动化
  测试；源码独立 review 与真实 Chromium ready 验证均通过，本阶段不扩围。
- 001 已解决：根级 TypeScript 使用旧 Node 解析，测试已改为 mock-before-`requireActual`，
  不再用静态 import 把 Vite 专属 demo 模块拉入根工程；根级 `tsc -b` 已通过。
- 002 R1 已解决：到达浏览器真实最大 `scrollTop` 时直接请求合法末窗；高于 924px 的
  测试与 1415px 真实 Chromium 滚动容器均能到达 row 1000，且仍只挂载 256 格。
- 003 范围补正：基线 Ribbon 已显示未接线的 Undo/Redo；按“首批不展示”合同把
  `WorkbookRibbon.tsx` 纳入本叶，只移除这两个外观入口，不启用 history。
- 003 R1 已解决：Enter 使用 active cell；Enter 成功/Escape 回 grid，blur 不抢外部焦点，
  mutation 拒绝回保留草稿的 editor；真实 activeElement 测试证明 mutation 仍为单发。
- 003 R2 验收失败：真实浏览器双击只能选中单元格，未出现 editor；此前孤立合成
  `dblclick` 绕过了 pointer selection 的完整事件链，不能作为该交互通过的证据。
- 003 R2 已解决：pointer capture 会把 `dblclick` target 改为 grid；双击处理现按
  `clientX/clientY` 从物理落点回查单元格。完整 pointer 序列、真实 Chromium 双击写回、
  单击选择与拖选回归均通过，独立 review APPROVED。
