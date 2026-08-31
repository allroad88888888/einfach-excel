# 015 执行报告：抽出 TS worker 数据传输边界

## 改动摘要

- 新建 `worker-runtime-ts/import-session.ts`，唯一管理导入会话的 begin/chunk/commit/cancel 转换、typed bulk import 与 sparse cell 逆向转换。
- 新建 `worker-runtime-ts/export-session.ts`，唯一管理单次 TSV 导出与 chunked sparse snapshot 会话游标；保留 rows-per-chunk 的 1–10000 clamp、空范围 chunk 与完成/取消语义。
- 新建 `worker-runtime-ts/persistence.ts`，唯一编排 persistence v1 wire snapshot/restore；通过 `PersistenceServices` 显式请求尺寸传输与 workbook rebuild，不反向导入装配壳，也不持有第二份 state。
- `worker-runtime-ts.ts` 的对应 command case 改为调用上述模块；尚待 018 迁出的 workbook replacement/custom-formula rebind 留在装配壳并实现为显式 `rebuildForRestore` callback。
- 未修改任务列出的测试文件；未 commit。

## 文件职责

| 文件 | 单一职责 | 行数 |
| --- | --- | ---: |
| `worker-runtime-ts/import-session.ts` | 管理导入会话状态转换。 | 153 |
| `worker-runtime-ts/export-session.ts` | 管理 TSV 导出与 sparse snapshot 游标。 | 79 |
| `worker-runtime-ts/persistence.ts` | 编排 persistence v1 wire 的快照与恢复。 | 62 |
| `worker-runtime-ts.ts` | 作为 013–019 连续迁移中的临时命令装配壳。 | 1241 |

三个新增文件均经 Prettier 正常格式化且不超过 300 行；没有 `partN`、`utils` 或按 command case 机械碎片化。

## 逐条验收

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/{import-session,export-session,persistence}.ts`
   - 通过：分别 153、79、62 行，均 ≤300。
2. `npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand`
   - 通过：2 suites、18 tests 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`
   - 通过：零错误。
4. `rg -n '^function (importCells|exportRangeTsv|snapshotSparse)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`
   - 通过：零结果。
5. 补充数据传输回归：
   - `npx jest excel/solid-excel/test/excel-core-ts-runtime.test.ts excel/solid-excel/test/audit-adapter-scaling.test.ts excel/solid-excel/test/vnext-conditional-format-revision.test.ts excel/solid-excel/test/vnext-print-config-runtime.test.ts --runInBand`
   - 通过：4 suites、26 tests 全绿，覆盖 import、snapshot session invalidation、persistence cell/size/print/conditional-format round-trip。
6. `git diff --check`（本任务产品文件）
   - 通过：无空白错误。

## C-013：TS backend 数据迁移 parity

- import 继续按 sheet 聚合为一次 typed `bulkApply`，formula 只由 `kind: 'formula'` 进入 parser；atomic 返回累计 stats，direct 保留空 stats envelope。
- import/snapshot session 继续直接使用 013 的 `RuntimeState` map 与计数器；sheet rebuild 清空旧 session 且保留递增 id，persistence restore 则沿用既有语义重置 snapshot counter。
- TSV 继续消费 014 的 `snapshotRangeSparse`，按原 range bounds 生成文本。
- persistence snapshot 继续包含 v1 sheets、cells、sizes、printConfigs、conditionalFormats；带 formats block 的 restore 仍在任何 state 变更前 fail-closed。
- restore callback 完成 workbook replacement 后，传输模块再导入 cells 与 sizes；custom formula registry 的重绑仍由装配层负责，便于 018 原样迁走。
- 指定 18 项与补充 26 项测试、TypeScript 检查均通过。

## C-018：职责与行数

- import/export/persistence 三种生命周期分别形成命名明确的业务边界，常见会话或 wire 变更可只落在对应文件。
- 新模块只消费 `RuntimeState`、range projection 与既有 print/conditional-format 服务，没有反向导入 `worker-runtime-ts.ts`，也没有复制 state/workbook store。
- persistence 通过 `PersistenceServices.rebuildForRestore` 消费未来 018 的 lifecycle 实现；当前 callback 位于装配壳，不让传输模块拥有 workbook lifecycle。
- 三个新文件均正常格式化且 ≤300 行。

## 原文件行数变化

`excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`：1501 → 1241 行，减少 260 行。

符合 013–019 连续迁移链的单调下降要求。该文件仍是索引记账的临时超限装配壳，后续 016–019 必须继续迁出并由 019 收到 300 行内。

## 未验证

- 未运行完整 Solid Excel Jest suite、浏览器 E2E、WASM backend 或打包流程；本叶已运行指定验收及四组直接覆盖数据传输的补充 Jest。

## 发现

- 共享工作树存在其他任务的既有未提交改动；本叶未修改或回退范围外产品文件。
- `worker-runtime-ts.ts` 的 persistence restore callback 仍包含 workbook replacement 与 custom-formula rebind，这是明确留给 018 的 lifecycle 实现，不属于传输模块。

## 疑虑

- 当前 direct import 仍与迁移前一致：chunk 先缓冲、commit 时批量写入并返回空 stats；若未来要提供真正逐 chunk 可见的 direct 模式，需要单独变更协议与 dirty-event 契约，不能在本次结构迁移中暗改。
- 原装配壳仍为 1241 行；这是连续迁移链的临时状态，不能在 019 后保留。

## 最终四态

- 实现：完成——import/export/snapshot/persistence 数据传输实现已实际迁出并由壳消费。
- 验收：通过——任务四项验收、补充四组 Jest 与 diff 检查均通过。
- 范围：完成——产品改动限任务 files，未修改测试，报告仅写本路径，未 commit。
- 未验证：保留——全仓 Jest、E2E、WASM 与打包未运行。

一句话回执：015 数据传输边界已完成，装配壳从 1501 行单调降至 1241 行。
