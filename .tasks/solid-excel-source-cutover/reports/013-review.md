# 013 独立审查

## 结论

**REJECTED**

本次抽取保持了可观察的运行时契约，但 `runtime-errors.ts` 不满足 C-018 的单一职责硬规则，因此不能批准。

## 质量发现

### Major — `runtime-errors.ts` 是两个互不依赖的职责集合，C-018 未通过

- `runtime-errors.ts:3-25` 负责 RPC request/error：`RequestMessage`、`rpcError`、`unsupported`、`toRpcError`。
- `runtime-errors.ts:27-40` 负责地址与稀疏范围输入归一化：`normalizeAddr`、`normalizeSparseRange`。
- 两组导出互不调用，分别服务错误封装和命令参数转换；文件职责只能表述为“RPC 错误**与**通用输入归一化”，未通过 one-file-one-thing 的一句话测试和引用聚类测试。文件名 `runtime-errors` 也无法覆盖后半组职责。
- 更具体地，仓库已有 `worker-wire-guards.ts` 导出同名 `normalizeAddr`、`normalizeSparseRange`，本次抽取继续保留第二套实现，使该模块更像局部 utils 集合，而不是内聚的 RPC error 基础设施。

这是覆盖矩阵 C-018 的直接违规，属于阻断项。应让 `runtime-errors.ts` 只保留 RPC request/error 契约，并让输入归一化使用已有 wire guards，或迁入按输入边界命名、职责单一的模块。

## 逐条验收

1. **新增文件行数：通过。** `runtime-state.ts` 77 行、`runtime-errors.ts` 40 行、`runtime-capabilities.ts` 20 行，均不超过 300 行。
2. **指定 Jest：按报告记为通过，审查未重跑。** 报告记录 `vnext-worker-runtime-resources.test.ts` 为 2/2 通过；本次独立审查只核对静态证据。
3. **TypeScript：按报告记为通过，审查未重跑。** 报告记录 `tsc --noEmit` 零错误。
4. **原壳定位扫描：通过。** 指定正则在 `worker-runtime-ts.ts` 中零结果；`RuntimeState`、`SheetEntry`、`SnapshotSession` 的目标定义只存在于 `runtime-state.ts`。
5. **C-018：不通过。** 三个新文件均符合物理行数上限，但 `runtime-errors.ts` 违反单一职责，详见 Major。

## 契约与改动核对

- `TS_WORKER_RUNTIME_CAPABILITIES` 的 11 个字段和值与基线一致，常量由 `runtime-capabilities.ts` 唯一拥有，并由原 `worker-runtime-ts.ts` 公共路径重导出。
- `__createInitialStateForTest` 仍从原公共路径导出，别名指向抽出的 `createInitialState`；初始 sheet、ID、registry/map 和 session counter 的构造值与基线一致。
- `unsupported(feature)` 仍抛出带 `code: 'UNSUPPORTED'` 的 `Error`，message 模板未变；`handle()` 通过 `toRpcError` 生成的 `{ code, message }` wire 形状与基线 catch 分支一致。
- `RuntimeState` 已从装配壳删除，没有发现第二份目标定义。
- `worker-runtime-ts.ts` 为正常格式；指定 diff 的空白检查无错误。物理行数从基线 2243 降至 2094，净减 149 行，满足本叶单调下降要求。
- 未发现公共导出、capabilities 或 unsupported error shape 的回归。

## 验证边界

未重跑 Jest、tsc、全仓测试、E2E 或打包；测试结论仅引用执行报告。静态核对覆盖了指定基线 diff、三个未跟踪新文件、导出位置、定义唯一性、行数和格式。

---

## R1 复审

### 结论

**APPROVED**

原 Major 已完整修复，C-018 的阻断项关闭。

### 原 Major 定向核对

- `runtime-errors.ts` 已从 40 行降至 25 行，只保留 `RequestMessage`、`rpcError`、`unsupported`、`toRpcError`，可内聚表述为“定义 worker RPC 的 request/error 契约”。地址与范围归一化实现均已移除，没有加入其他杂项职责。
- `worker-runtime-ts.ts` 现在直接从既有 `worker-wire-guards.ts` 导入 `normalizeAddr`、`normalizeSparseRange`。
- 在 `src-vnext/adapter` 范围检索后，这两个 normalize 函数的实现均只剩 `worker-wire-guards.ts` 中的一份；没有重复实现。
- 当前任务范围仍只有原装配壳和三个既定新模块，没有为修复新增杂物模块。

### 验证边界

R1 按要求未重跑测试或 TypeScript 检查；测试状态沿用更新后的执行报告。本轮只核对更新报告、原审查、当前范围 diff、未跟踪新文件及 normalize 定义位置。
