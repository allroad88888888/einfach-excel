# 016 执行报告：抽出 TS worker 自定义公式边界

## 改动摘要

- 新建 `worker-runtime-ts/custom-formulas.ts`，独占自定义公式编译、注册/注销、值双向转换、array return gate、error token、async callable lookup/pump 与 workbook rebind。
- 新建 `worker-runtime-ts/defined-names.ts`，独占 range/value/lambda name binding 的校验、转换、注册/注销与 recalc。
- `worker-runtime-ts.ts` 仅导入并装配两个边界；persistence restore 与 sheet rebuild 统一调用 `rebindCustomFormulas`，未复制 state，也没有新模块反向导入装配壳。
- 未修改任务列出的测试文件；未 commit。

## 文件职责

| 文件 | 单一职责 | 行数 |
| --- | --- | ---: |
| `worker-runtime-ts/custom-formulas.ts` | 管理 TS worker 自定义公式执行边界。 | 168 |
| `worker-runtime-ts/defined-names.ts` | 管理 TS worker defined-name 绑定边界。 | 86 |
| `worker-runtime-ts.ts` | 作为 013–019 连续迁移中的临时命令装配壳。 | 946 |

两个新增文件均经 Prettier 正常格式化且不超过 300 行。

## 逐条验收

1. `wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/{custom-formulas,defined-names}.ts`
   - 通过：分别 168、86 行，均 ≤300。
2. `npx jest excel/solid-excel/test/vnext-worker-runtime-resources.test.ts excel/solid-excel/test/vnext-worker-undo-ts.test.ts --runInBand`
   - 通过：2 suites、16 tests 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`
   - 通过：零错误。
4. `rg -n '^function (registerCustomFormulaInWorker|unregisterCustomFormulaInWorker|defineNameInWorker|undefineNameInWorker)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`
   - 通过：零结果。
5. 补充专项回归：`npx jest excel/solid-excel/test/excel-core-ts-custom-formula-arrays.test.ts excel/solid-excel/test/excel-core-ts-custom-formulas.test.ts excel/solid-excel/test/excel-core-ts-lambda-ui.test.ts --runInBand`
   - 通过：3 suites、35 tests 全绿。
6. Prettier 与 `git diff --check`
   - 通过：三个产品文件格式正常，无空白错误。

## C-013：TS backend custom formula parity

- sync source 仍由 `new Function('args', source)` 编译；throw 仍映射为带消息的 `#VALUE!`。
- async source 仍由 AsyncFunction 构造器编译，callable 只保存在 013 的 `RuntimeState.customFormulas` registry；engine 注册 pending symbol，pump 负责 drain/invoke/settle。
- pump 保留 engine identity guard、重入 latch、级联 drain；settle 后按 touched cell 发 `cellsDirty`，registry replace/unregister 后 lookup 仍按大写名称读取当前 callable。
- `unwrapCustomValue` 与 `wrapCustomResult` 是显式、唯一的值转换契约；二维数组继续消费既有 `gateCustomArrayReturn`，标量/数组元素共用递归转换。
- 已知 error token、`#BUSY!` 降级、`{ error }` escape hatch 均保持；专项数组与公式测试全绿。
- persistence restore 和 sheet lifecycle rebuild 都在新 workbook 上重绑同一 registry，没有复制一份状态或从模块反向依赖装配壳。
- defined-name 的 range/value/lambda 校验与转换原样迁移；define/成功 undefine 后仍触发 recalc。

## C-018：职责与行数

- custom formula 与 defined name 按独立变化原因分别落文件；前者包含其强内聚的执行/registry/pump/value-conversion 闭环，后者只处理 name binding。
- 新模块直接消费 013 的 `RuntimeState` 和既有 async pump/array gate，不建立第二份 workbook、sheet 或 registry 状态。
- 两个新文件分别 168、86 行，均正常格式化且 ≤300；不存在 `partN`、`utils` 或反向导入装配壳。

## 原文件行数变化

`excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts`：1241 → 946 行，减少 295 行。

符合 013–019 连续迁移链单调下降要求。该文件仍是索引明确记账的临时超限装配壳，后续 017–019 必须继续迁出 viewport、sheet lifecycle 与 dispatch，并由 019 收到 300 行内。

## 未验证

- 未运行完整 Solid Excel Jest suite、浏览器 E2E、WASM backend 或打包流程；已运行任务指定门禁及直接覆盖 custom formula/array/lambda 的 35 项专项测试。

## 发现

- 共享工作树存在其他任务的既有未提交改动；本叶只修改三个任务产品文件并新增本报告，未回退范围外内容。
- 行数 hook 对连续迁移中的 `worker-runtime-ts.ts` 临时超限持续报警；本叶已实际减少 295 行，最终关闭点按任务树属于 019。

## 疑虑

- 装配壳当前仍为 946 行；这是连续迁移链的临时状态，不能在 019 后保留。
- 专项测试名称位于 TS core/runtime 层，指定 resources/undo 门禁覆盖 worker 重建路径；未做真实浏览器 Worker 的异步事件时序验证。

## 最终四态

- 实现：完成——custom formula 与 defined-name 实现已实际迁出并由装配壳消费。
- 验收：通过——任务四项验收、35 项专项回归、格式与 diff 检查均通过。
- 范围：完成——产品改动限任务 files，测试未修改，报告仅写本路径，未 commit。
- 未验证：保留——全仓 Jest、浏览器 E2E、WASM 与打包未运行。

一句话回执：016 自定义公式边界已完成，装配壳从 1241 行单调降至 946 行。
