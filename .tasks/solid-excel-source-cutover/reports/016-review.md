# 016 独立审查

**APPROVED**。指定范围内未发现阻断或重要语义回归；C-013/C-018 均通过。执行报告中的测试结果本次按要求未重跑，作为残余验证风险保留。

## 质量发现

未发现 Critical、Major 或 Minor 级问题。

## 逐条验收

1. **新增文件行数：通过。** `custom-formulas.ts` 168 行，`defined-names.ts` 86 行，均不超过 300 行。
2. **指定 Jest：报告通过，本审查未重跑。** 执行报告记录 2 suites、16 tests 全绿。
3. **TypeScript：报告通过，本审查未重跑。** 执行报告记录 `tsc --noEmit` 零错误。
4. **装配壳不再定义四个目标函数：通过。** `worker-runtime-ts.ts` 只导入并调用 `registerCustomFormulaInWorker`、`unregisterCustomFormulaInWorker`、`defineNameInWorker`、`undefineNameInWorker`，没有第二份函数实现。

## C-013：custom formula 与 defined name parity

- **sync/async source 编译保持。** sync 仍用 `new Function('args', source)`，参数仍先从引擎 `Value` 递归解包；执行异常仍转为带消息的 `#VALUE!`。async 仍用 `AsyncFunction` 构造器，engine 只注册 pending symbol，可执行 callable 仍仅存于 `RuntimeState.customFormulas`。
- **值转换、error token 与 array gate 保持。** blank、primitive、error、二维 array 的解包语义未变；返回值继续识别既有 error token，保留 `#BUSY!` 到 `#VALUE!` 的降级及 `{ error }` escape hatch。数组仍唯一经过 `gateCustomArrayReturn`，放行元素递归复用同一转换函数。
- **async pump 语义保持。** 抽取仍消费共享 `createAsyncCustomPump`，因此 engine identity guard、重入 latch、级联 drain/settle 均未复制或改写。settle 成功后仍按 touched `sheetId/key` 映射当前 sheet，并仅在存在有效 cell 时发送 dirty 通知。
- **registry replace/unregister/rebind 保持。** registry 继续以大写名称为键；replace 后 pump lookup 每次读取当前 entry，unregister 同时删除本地 callable 并调用 workbook unregister。persistence restore 与 sheet rebuild 均对同一个 registry 在新 workbook 上 best-effort rebind；`initWorkbook`/reset 仍清空 registry，符合迁移前语义。
- **defined name 保持。** range 仍验证 `start/end` 字符串并保留可选 `sheetName`；value 仍按 blank、number、boolean、string 顺序转换；lambda 仍校验/清理 params、补齐 `=`、解析 AST 并拒绝 error AST。define 后必定 recalc，undefine 仅在成功删除后 recalc。

因此，静态范围内 C-013 通过；执行报告另记录 custom formula/array/lambda 的 35 项专项测试通过，但本审查没有独立重跑。

## C-018：职责、依赖与状态所有权

- `custom-formulas.ts` 可用一句话描述为“管理 TS worker 自定义公式执行边界”；编译、值转换、registry 与 pump hooks 构成同一强内聚闭环。
- `defined-names.ts` 可用一句话描述为“管理 TS worker defined-name 绑定边界”；range/value/lambda 的解析与注册失效均服务同一业务点。
- 两文件按独立变化原因分离，均低于 300 行；不存在机械 `partN`、大杂烩 `utils` 或压行规避。
- 两模块只依赖共享 runtime state/协议及既有 formula primitives，没有反向导入 `worker-runtime-ts.ts`。唯一 `customFormulas` Map 仍由 `RuntimeState` 持有；抽取没有新建第二份 workbook、sheet、registry 或 async pump state。
- `worker-runtime-ts.ts` 当前仍为 946 行，但本叶从迁移前 1241 行单调下降 295 行；按任务树它是 013–019 连续迁移中的临时装配壳，最终关闭由 019 验收。本叶没有新增或扩大该存量超限。

因此 C-018 在 016 范围内通过。

## 残余风险

本审查只做源码与 diff 静态核验，并按明确要求不重跑报告测试；完整 Jest、真实浏览器 Worker 时序、WASM、E2E 与打包也不在本叶已验证范围内。这些是验证覆盖限制，不构成本次拒绝理由。

一句话回执：**APPROVED — 016 的 custom formula/defined-name 抽取保持编译、转换、async pump、registry/rebind 与 recalc 语义，并满足 C-013/C-018。**
