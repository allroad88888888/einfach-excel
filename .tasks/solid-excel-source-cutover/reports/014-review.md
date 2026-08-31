# 014 独立审查

## 结论

**REJECTED**。cell/range 行为迁移未见可观察语义回归，但 `cell-values.ts` 持有并导出了 range 稀疏遍历原语，未满足任务对两个模块唯一职责的明确约束，C-018 不通过。

## 质量发现

### Major — range 稀疏收集职责仍在 `cell-values.ts`，C-018 未通过

`cell-values.ts:60-93` 定义并导出 `collectCellsInBounds`。该函数计算矩形面积、选择稠密坐标探测或稀疏 map 遍历，并返回 bounds 内的 cell 集合；它是 range 遍历/稀疏收集抽象，不是单 cell value/display/spill/snapshot/write 语义。`range-projection.ts:5,36,66,81` 又直接消费该 export 来完成 range 投影。

这与任务接口“`range-projection.ts` 唯一拥有 range 归一化、稀疏收集、snapshot/read/clear 语义”冲突，也使 `cell-values.ts` 形成两个引用簇：单 cell projection/write exports，以及供 range 模块使用的矩形收集 export。295 行虽在物理上未超 300 行，但不能仅凭贴线通过职责验收。

建议按职责调整：让 range 稀疏枚举归 `range-projection.ts`，并为单格 spill lookback 使用 cell projection 内部的候选枚举；若确需共享底层 bounds 枚举，应建立名称和职责明确的下层模块，并继续保持依赖无环，不能把它作为 `cell-values.ts` 的公共职责。

## 逐条验收

1. **文件行数：通过字面检查，但不足以通过 C-018。** `wc -l` 为 `cell-values.ts` 295 行、`range-projection.ts` 115 行；正常格式下均不超过 300 行。前述 Major 表明单一职责仍不合格。
2. **指定 Jest：采信执行报告，不重跑。** 报告记录 2 suites / 17 tests 通过；本次独立审查仅做静态复核。相关测试确实覆盖 spill target undo 不物化、spill range clear 的 anchor-only round-trip、普通 range clear/undo 及公式恢复。
3. **TypeScript：采信执行报告，不重跑。** 报告记录指定 `tsc --noEmit` 零错误。
4. **旧函数清除：通过。** 对装配壳执行任务指定 `rg`，零结果。

## C-013 语义核验

- **文本 `=A1`：通过。** `readCellSnapshot` 与 `readSparseCell` 均以 `cell.ast` 判断公式；typed text 写入继续走 `setCellValue(..., { kind: 'string' })`，不会经输入解析器误判为公式。
- **错误词汇分层：通过。** UI display 经 `errorDisplayToken(value.code)`；`SparseCellWire` 持久化/剪贴板记录保留 `value.code`，其逆向写入也恢复该内部 code。
- **array anchor / spill：通过。** 自有 cell 读取继续经 `anchorScalar` 折叠锚点；空 cell 使用相同 lookback、anchor scan 与 `projectedValueAt`；range 只补充 clean array anchors 的未被自有 cell 遮挡的投影格。
- **snapshot 不物化 spill：通过。** `snapshotRangeSparse` 只枚举 sheet map 的自有 cell，不调用 spill target 收集；range read 则显式补充 spill targets，两条通道仍分离。
- **range clear：通过。** 仍以一次 `workbook.clearRange(sheet.id, clampedBounds, 'all')` 完成，保留按既有 cell 稀疏清除与返回 touched count 的语义。

因此 C-013 在本叶的静态范围内通过；未重跑测试带来的残余风险记为验证范围说明，不单独构成失败。

## 依赖与状态所有权

- 依赖方向为 `range-projection.ts -> cell-values.ts -> runtime-state.ts`，新模块没有反向导入装配壳，也未见循环依赖。
- `RuntimeState` 仅由 `runtime-state.ts` 定义；cell/range 模块只接收该状态引用，没有复制 workbook store 或建立第二份状态。
- `worker-runtime-ts.ts` 当前 1501 行仍超限；按 013–019 连续迁移链视为已知临时状态，不作为本叶新增阻断项。

## 其他检查

- 当前范围 `git diff --check` 通过。
- 未发现 Critical 或 Minor 级别的额外问题。

---

## R1 复审

### 结论

**APPROVED**。原 Major 已完整修复，C-018 阻断项关闭。

### 原 Major 闭环核验

- 通用 bounds 稀疏枚举 `collectCellsInBounds` 现仅定义于 `range-projection.ts:21-54`，为模块私有函数；range 的 spill target 收集、snapshot 与 read 均在该模块内消费它。
- `cell-values.ts` 已不再定义或导出 `collectCellsInBounds`，也不再向 range 层导出任何遍历 helper。其 `spillAnchorCandidates` 是私有函数，只服务单格 `getSpillProjectedValue` 的左上 lookback 候选扫描，符合单 cell spill projection 职责。
- 依赖保持单向：`range-projection.ts` 导入 `cell-values.ts`；`cell-values.ts` 不导入 `range-projection.ts`。两者只向下依赖 `runtime-state.ts` 等基础契约，未形成环。
- `wc -l` 实测为 `cell-values.ts` 284 行、`range-projection.ts` 149 行，均不超过 300 行。
- `npx prettier --check` 对两个文件通过，且范围 `git diff --check` 无输出；不存在压行规避上限。

本轮按要求不重跑 Jest 或 TypeScript，采信更新执行报告记录的 2 suites / 17 tests 全绿及 `tsc --noEmit` 零错误。未发现由原 Major 修复引入的新阻断问题。
