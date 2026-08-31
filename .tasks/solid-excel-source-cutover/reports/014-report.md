# 014 执行报告：抽出 TS worker cell projection 边界

## 四态

`DONE`

原因：本叶要求的 cell value/spill 与 range projection 已实际迁出装配壳，指定类型检查、测试、行数与旧实现清除验收全部通过。

## 文件职责

- `worker-runtime-ts.ts` → 仅负责组合 runtime 状态与命令分派。
- `worker-runtime-ts/cell-values.ts` → 仅负责单 cell 的 value/display/spill/snapshot/写入语义。
- `worker-runtime-ts/range-projection.ts` → 仅负责 range 归一化与稀疏投影操作。
- `vnext-worker-undo-ts.test.ts` → 验证 TS worker 撤销相关投影行为；本叶未修改。
- `vnext-top-bottom-projection.test.ts` → 验证顶部/底部边界的投影行为；本叶未修改。

## 改动

- 新建 `cell-values.ts`，迁入并集中维护：
  - Excel display/error 词汇与数组锚点标量折叠；
  - spill lookback、spill target 单格读取、spill region 查询；
  - `readCellValue`、`readCellSnapshot`、`readSparseCell`；
  - `applyCellInput`、`clearCell`、typed `CellWire` 写入、详细公式写入。
  - 单 cell spill lookback 使用私有 `spillAnchorCandidates`，不导出通用 range 枚举能力。
- 新建 `range-projection.ts`，迁入并集中维护：
  - range clamp；
  - 私有 `collectCellsInBounds` 独占通用 bounds 稀疏枚举，并维护已求值 spill target 遍历；
  - `snapshotRangeSparse`、`readSparseRange`、`snapshotSparse`、`clearRange`。
- `worker-runtime-ts.ts` 改为从上述模块组合调用，未复制 `RuntimeState`、workbook store 或其他状态。
- 依赖方向为 `range-projection.ts -> cell-values.ts -> runtime-state.ts`；两个新模块均不反向导入装配壳。
- 保持了原语义：文本 `=A1` 依据 `cell.ast` 不误判公式；snapshot 不物化 spill target；错误 display 与 SparseCell 序列化继续使用不同词汇；range clear 仍是单次引擎稀疏清除。

## 逐条验收

1. 新文件行数：通过。
   - `cell-values.ts`：284 行。
   - `range-projection.ts`：149 行。
   - 两者均经 Prettier 正常格式化，且不超过 300 行。
2. 指定 Jest：通过。
   - 命令：`npx jest excel/solid-excel/test/vnext-worker-undo-ts.test.ts excel/solid-excel/test/vnext-top-bottom-projection.test.ts --runInBand`
   - 结果：2 suites passed，17 tests passed，0 snapshots。
3. TypeScript：通过。
   - 命令：`npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`
   - 结果：零错误。
4. 装配壳旧函数搜索：通过。
   - 命令：`rg -n '^function (readCellValue|readCellSnapshot|readSparseCell|snapshotRangeSparse|readSparseRange|clearRange)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`
   - 结果：零结果。
5. 附加检查：通过。
   - 两个新模块反向导入 `worker-runtime-ts.ts`：零结果。
   - `cell-values.ts` 导出 `collectCellsInBounds`：零结果。
   - 通用 `collectCellsInBounds` 仅定义于 `range-projection.ts`，且为私有函数。
   - `git diff --check`：通过。

## 覆盖矩阵

### C-013：TS backend cell projection parity

- 单 cell scalar/array-anchor/spill 读取迁到同一读取契约。
- range projection 复用该契约，继续只补充已缓存数组公式的 spill targets。
- 撤销与顶部/底部投影两组指定测试共 17 项全绿，覆盖本叶要求的 TS backend 投影行为。

### C-018：cell/range 文件职责与行数

- `cell-values.ts`：单 cell projection/write 边界，284 行；只保留私有单格 spill anchor 候选扫描。
- `range-projection.ts`：range sparse projection 边界，149 行；唯一拥有通用 bounds 稀疏收集。
- 两文件职责可各用一句不含“和/以及”的话说明；没有 `utils`、`partN` 或机械压行拆分。
- 装配壳仍为连续迁移链中的临时超限文件，由后续 015–019 按命令族继续实际迁出。

## 原文件行数变化

- `worker-runtime-ts.ts`：2093 行 → 1501 行，减少 592 行。
- 符合 013–019 连续迁移链要求：原文件行数继续单调下降。

## 未验证

- 未运行完整 Solid Excel Jest suite、浏览器 E2E 或构建；本叶验收只要求两组定向 Jest 与包 TypeScript 检查。
- 未验证 WASM backend；本叶修改仅限 TS worker runtime projection 边界。

## 发现与疑虑

- `worker-runtime-ts.ts` 当前仍为 1501 行，超过常规/复杂文件上限；这是索引明确允许 013–019 连续迁移链中存在的临时状态，必须由 015–019 继续单调下降并在 019 收到 300 行内。
- 工作树存在其他任务的既有未提交改动；本叶未修改、回退或纳入这些范围外文件。
- 未发现本叶范围内的额外行为缺口或反向依赖。

## 修复第 1 轮

- 已读取并处理 `014-review.md` 的唯一 Major。
- 将通用 `collectCellsInBounds` 从 `cell-values.ts` 迁到 `range-projection.ts`，并改为模块私有。
- `cell-values.ts` 改用专属于单 cell spill lookback 的私有 `spillAnchorCandidates`，不再向 range 层输出稀疏遍历原语。
- 修复后重新执行全部 014 验收：TypeScript 零错误；2 个 Jest suites、17 tests 全绿；旧壳目标函数零结果；两文件正常格式且均不超过 300 行；`git diff --check` 通过。

## 提交

- 未 commit，符合执行约束。
