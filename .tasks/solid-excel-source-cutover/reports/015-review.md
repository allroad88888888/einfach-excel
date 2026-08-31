# 015 独立审查：TS worker 数据传输边界

**APPROVED**。指定范围内未发现阻断或重要语义回归；C-013/C-018 均通过。执行报告记录的测试结果本次按任务要求未重跑，作为残余验证风险保留。

## 质量发现

未发现 Critical、Major 或 Minor 问题。

有一项非阻断说明：`worker-runtime-ts.ts` 顶部概述仍称 `importChunk` 会应用 cells，而当前及迁移前的实际契约都是先缓冲、在 `commitImport` 批量写入。这是存量注释不精确，不影响本叶实现或验收，故不列为质量缺陷。

## 逐条验收

1. **新增文件行数：通过。** `wc -l` 实测 `import-session.ts` 153 行、`export-session.ts` 79 行、`persistence.ts` 62 行，均不超过 300 行。
2. **指定 Jest：报告通过，本审查未重跑。** 执行报告记录 2 suites / 18 tests 全绿；任务明确提示“报告声称测试不重跑”，本次仅静态复核实现与基线，不重新执行测试。
3. **TypeScript：报告通过，本审查未重跑。** 执行报告记录 `tsc --noEmit` 零错误；本次未重新执行。
4. **旧函数退出装配壳：通过。** 当前 `worker-runtime-ts.ts` 中不存在顶层 `importCells`、`exportRangeTsv`、`snapshotSparse` 定义；dispatch 通过新模块导入调用。

## C-013：数据迁移 parity

- **atomic/direct import stats：通过。** `importCells` 仍按 sheet 聚合 typed `bulkApply`，仅 `kind: 'formula'` 进入 parser；无效 sheet、clear、batch apply 的计数/错误策略与基线一致。`commitImport` 仍在写入前删除 session，atomic 返回累计 stats，direct 写入相同数据但返回全零 envelope。
- **session id、cancel、invalidation：通过。** 显式 import id 与自动递增规则未变；未知 import/snapshot session 的错误码未变；cancel 仍返回 `Map.delete` 布尔值。sheet rebuild 继续清空 import/snapshot sessions 而保留递增 counter；persistence restore 继续清空两类 session、只重置 snapshot counter，均与迁移前语义一致。
- **rows clamp：通过。** `Math.floor(Number(value))` 后按 1–10000 clamp，非有限值回退 2048；倒置 row range 的 `totalRows` 仍为 0。
- **TSV 与 snapshot cursor：通过。** 单次 TSV 仍基于 `snapshotRangeSparse` 和原始 range bounds 序列化。snapshot session 仍从 `range.startRow` 前进，按 clamp 后的行数切 chunk；空范围返回 `startRow`/`startRow - 1` 的空完成块；最后一块和空完成块均删除 session。
- **persistence fail-closed 与恢复顺序：通过。** 非空 formats block 在任何 callback/state mutation 前返回 `UNSUPPORTED`。snapshot 仍包含 v1 sheets/cells/sizes/printConfigs/conditionalFormats。restore callback 先构建并校验 print/conditional-format 数据，再替换 workbook、清 session并重绑 custom formulas；随后 persistence 模块导入 cells，最后恢复 sizes，顺序与基线一致。

因此，本叶静态范围内没有发现 C-013 的可观察行为漂移。

## C-018：职责、依赖与状态所有权

- **`import-session.ts`：通过。** 文件围绕 import 数据转换及其 session 生命周期，内部 helpers 服务同一用例，没有无关职责。
- **`export-session.ts`：通过。** 同时包含单次 TSV outbound 与 sparse snapshot cursor 仍属于内聚的 outbound session/serialization 边界：二者共享 sparse range projection，均只读 workbook 并向调用方输出范围数据；这里按任务明确的 import/export/persistence 三生命周期拆分，比按 command case 再切文件更符合本叶粒度。文件规模仅 79 行，也不存在两个独立状态所有者。
- **`persistence.ts`：通过。** persistence 只编排 wire snapshot/restore；workbook replacement、session invalidation、custom-formula rebind 仅经显式 `rebuildForRestore` callback 消费。size snapshot/restore 同样由显式 services 提供。该文件没有反向导入 `worker-runtime-ts.ts`。
- **无第二份 state：通过。** 三个模块均接收 013 的 `RuntimeState`，session map/counter 仍只存在于该共享 state；未发现模块级 workbook/session 副本。
- **文件边界与行数：通过。** 三个文件名称具体、职责可用单一业务边界描述，无 `utils`/`partN` 假拆分，且全部低于 300 行。

## 验证范围

本次完成了任务、执行报告、基线实现、当前装配壳、新增未跟踪文件、调用点、依赖方向及物理行数的静态审查。未重跑 Jest、TypeScript、完整 suite、E2E、WASM 或打包；相关运行结果仅引用执行报告，不将其冒充为 reviewer 独立复验。

一句话回执：**APPROVED — 015 的 import/export/snapshot/persistence 抽取保持基线语义，显式 lifecycle callback、状态唯一性及 C-018 职责/行数要求均满足。**
