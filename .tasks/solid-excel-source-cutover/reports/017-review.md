# 017 独立审查

## 结论

**APPROVED**。指定范围内未发现阻断或重要语义回归；C-013/C-018 均通过。执行报告中的测试结果按要求未重跑，作为残余验证风险保留。

## 逐条验收

1. **文件行数：通过。** `viewport-sizes.ts` 为 201 行，低于普通文件 300 行上限；文件可用一句话表述为“维护 RuntimeState 中的 viewport 尺寸元数据”，归一化、查询、持久化及 lifecycle 迁移均围绕同一份尺寸映射，未形成互不依赖的职责簇。
2. **指定 Jest：按报告记为通过，审查未重跑。** `vnext-worker-runtime-resources.test.ts` 记录为 2/2 通过。
3. **TypeScript：按报告记为通过，审查未重跑。** 报告记录 `tsc --noEmit` 零错误。
4. **原壳定位扫描：通过。** `snapshotViewportSizes`、`setRowHeight`、`setColumnWidth`、`restorePersistenceSizes` 的实现均已从 `worker-runtime-ts.ts` 移除，壳只保留导入、服务装配与 dispatch 调用。

## C-013：viewport metadata parity

- structural index 仍以 `Number(value)` 转换后要求非负整数；非法 sheet/row/column index 的错误路径与基线一致。像素值仍要求有限且严格大于零，再以 `Math.round` 取整并保底为 1，错误码保持 `INVALID_DIMENSION_SIZE`。
- range snapshot 先校验 sheet，再对首尾 row/column 分别归一化；row heights 与 column widths 均按 index 升序输出，且只包含闭区间内条目。dispatch 仍先经既有 `normalizeSparseRange`，抽取后没有改变 wire 输入边界。
- persistence snapshot 仍按 `state.sheets` 顺序产生非空 sheet 项，full-sheet 上界保持 `0xffffffff`，每个 sheet 内 row/column 条目分别按 index 升序。空尺寸 sheet 继续省略。
- persistence restore 仍先清空两份 map，逐 snapshot 校验 sheet/range、非负整数 index、范围包含关系及正数 px，再写回按 sheet name 索引的同一份 RuntimeState map；与抽取前实现逐项等价。报告中的专项测试记录覆盖 snapshot/restore，但本审查未重跑。
- `initWorkbook` 与 runtime `reset()` 调用 `resetViewportSizes`；persistence rebuild 也在新 workbook/state 建立后清空尺寸，再由 restore 服务写回。rename 在 rebuild 后把旧 sheet name 下两份 map 原样迁至新 name；remove 在 rebuild 后删除被移除 sheet name 的两份 map；move 不改 name，尺寸自然随 sheet name 保留。调用顺序与基线语义一致。

因此，本叶静态范围内 C-013 通过。

## C-018：职责、依赖与状态所有权

- row/column 尺寸 map 只定义在 `RuntimeState`，只由 `createInitialState` 初始化；新模块消费并变更传入 state，没有建立模块级副本、缓存或第二个 state owner。
- `viewport-sizes.ts` 只导入 wire 类型、既有 wire guard、RPC error 与 `RuntimeState`/`SheetEntry`，没有反向导入 `worker-runtime-ts.ts` 装配壳，也不触碰 DOM 或 Grid store。
- 模块导出的 rename/remove/reset 是尺寸元数据对 sheet lifecycle 的窄 hooks；它不创建、重建、重排或注册 sheet，不拥有 workbook/sheet registry lifecycle。完整 lifecycle 仍在当前装配壳，且明确留给 018 抽取。
- 装配壳当前 774 行仍超过最终职责上限，但这是迁移链中的存量超限文件；本叶已从报告所述 946 行单调下降，018/019 明确承接 lifecycle/dispatch 的后续拆分，因此不构成本叶新增违规。

因此 C-018 在 017 范围内通过。

## 质量发现与验证边界

未发现 Critical、Major 或 Minor 质量问题。未重跑 Jest、TypeScript、全量测试、E2E 或打包；测试结论仅引用执行报告。静态审查覆盖了任务、执行报告、当前装配壳接线、新模块全文、RuntimeState/persistence 邻接接口及抽取前基线语义。

一句话回执：**APPROVED — 017 的 viewport 尺寸抽取保持 structural/px 校验、范围与持久化排序、full-sheet bound、restore 及 rename/remove/reset 语义，并满足状态唯一性与 C-018 边界要求。**
