# 001 独立审查

## 结论

APPROVED。指定范围内未发现协议形状、RPC 错误语义或 client 生命周期回归；C-007、C-018 均有充分证据。全量 TypeScript 验收因范围外并行改动无法在本审查范围内确认，记为警告而非失败。

## 审查范围

- 基准：`723082739d66140ac697a5a9c203a6fd99649d4a`
- 已阅读任务文件与执行报告。
- 已检查指定 `git diff`、`git status --short`，并直接阅读未跟踪目录 `src-vnext/adapter/worker-protocol/` 的全部 10 个文件。
- 按要求未重跑执行报告声称已运行的 Jest 与 TypeScript 命令。

## 验收标准

1. ✅ 文件行数满足要求。
   - 直接以 `wc -l` 核对：兼容 barrel `worker-protocol.ts` 为 6 行；目录内 10 个文件依次为 264、286、88、1、28、48、126、32、207、228 行，均不超过 300 行，barrel 不超过 120 行。
   - 最大普通文件是 `client-contract.ts`，286 行。

2. ✅ 三个定向 Jest 文件全绿。
   - 执行报告记录原命令结果为 3/3 suites、9/9 tests、0 snapshots；按审查要求不重复执行。
   - 范围 diff 中三个测试文件无变更，`git status --short` 也只显示旧 barrel 被修改、协议目录为未跟踪，因此该测试证据未被本任务通过改测试稀释。

3. ⚠️无法核实 `tsc` 全量零错误。
   - 执行报告明确记录命令整体非零，唯一报错位于范围外 `excel/solid-excel/test/vnext-grid-overlay.test.tsx:135`，属于并行任务 004。
   - 本审查被限定为只基于任务、报告与指定范围 diff，不能检查该范围外错误是否确实唯一或当前是否已消失；依指示不将范围外无法核实事项判为 ❌。编排者仍需在任务 004 收口后补跑全量 `tsc`。

## 覆盖矩阵

- ✅ C-007（worker 公共协议形状）。
  - 对基准单文件与新目录逐项提取 `export interface/type/function/...` 名称：基准的 77 个导出在新模块中零缺失；兼容 barrel 重新导出五个领域类型模块，并显式导出 `createWorkerWorkbook`。
  - `adapter/index.ts` 保持 `export * from './worker-protocol'`，原公共路径未改变。
  - Wire 类型按原定义迁移到 `cell-range.ts`、`format.ts`、`table-filter.ts`、`persistence-capability.ts`、`client-contract.ts`；指定 diff 中没有调用方签名迁移。
  - RPC 方法逐项核对后，command 字符串及 payload 键保持一致，包括地址大写化、readonly rows/rules 的数组复制、可选 table name、条件格式 payload 键 `conditionalFormat`、AutoFill payload 键 `request`、错误 `code/detail` 转换、`UNKNOWN_COMMAND` 到 `null` 的能力兼容语义。

- ✅ C-018（现役文件行数）。
  - 全部新增协议实现文件 ≤300 行，兼容 barrel 6 行；不存在 301–500 行需论证复杂文件资格的文件。
  - 职责拆分按 wire 领域、client contract、命令族及生命周期 client 聚类。`client.ts` 独占 worker、pending、failure、subscriber/listener、dispose 状态；命令模块是无状态映射（仅 data commands 持有该 client 实例自己的 import id 与 chunk 流程状态）。这不是把同一状态机机械切成互相操纵内部状态的假拆分。

## 重点核查

- 旧导出保留：✅ 基准 77 个显式导出名无缺失。新增的 5 个实现辅助导出只存在于内部子模块，未被兼容 barrel 重导出，不改变旧入口表面。
- 单 client 生命周期所有权：✅ `pending`、`workerFailure`、`subscribers`、dirty/hydrated listeners、worker event listener 与 `dispose` 全部只在 `client.ts` 的一次 `createWorkerWorkbook` 调用闭包内；三个命令工厂共享该闭包的同一个 `request`。
- 命令映射与 `this`：✅ 工厂返回箭头函数或不读取 `this` 的方法；对象 spread 不会丢失接收者绑定。`consumeExportRangeTsvChunks` 通过闭包调用，不依赖方法接收者。
- 错误语义：✅ response error 仍构造 `Error(message)` 并附加 `code` 及存在时的 `detail`；worker failure 仍拒绝全部 pending、清空 map 并使后续请求快速失败；dispose 仍移除三类监听、拒绝 pending、清理订阅/listener 并 terminate。
- 订阅语义：✅ subscribe 先登记本地订阅，RPC 失败时删除；unsubscribe 先删除本地订阅再发请求；dirty cell 地址仍标准化为大写后再匹配和通知。

## 质量发现

### Critical

无。

### Important

无。

### Minor

无阻断性发现。`client-request.ts` 仅 1 行，但该命名类型同时被三个独立命令模块消费，职责明确，且避免命令模块反向依赖生命周期实现；不判为假拆分。

## 后续条件

- ⚠️ 编排者应在范围外任务 004 稳定后补跑任务规定的全量 `tsc`，以补齐验收标准 3 的进程级零退出码证据。
