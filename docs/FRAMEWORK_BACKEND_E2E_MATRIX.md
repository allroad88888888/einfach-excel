# AD-392：框架 × 后端 E2E 证据矩阵

本文记录当前可复跑的浏览器端证据及其边界，并保留已移除 React adapter E2E 的历史结果。
每一格只说明对应框架、后端和场景；相同的选择交互不能据此推出完整的框架功能等价。

相关适配器议题见[AD-300](adoption-issues/AD-300-framework-adapters.md)。

## 矩阵

| 框架  | 实际后端类型                                                                                                                        | 证据 spec                                                                                                                                                                                                         | 执行命令                       | 覆盖行为                                                                                                        | 排除项                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| React（历史） | 调用方持有的受控 fixture：确定性 `SpreadsheetBackend`（该对象冻结）和调用方持有的 store；不是 engine、worker 或 WASM 后端。 | 2026-08-14 的 `react-adapter.spec.ts` 与 `CASES.md`；文件已随 React 完整产品扶正移除，不是当前证据。 | [历史记录](#react-历史记录) | 当时的 Chromium 用例从首个单元格拖到右下单元格；公共选择 hook、受控网格选区及范围读数随之更新。 | 历史结果不可复跑；不代表当前 Rust/WASM 产品，也不涵盖其他浏览器或框架×后端组合。 |
| Vue   | 调用方持有的受控 fixture：确定性 `SpreadsheetBackend` 和 store，经 `SpreadsheetUiProvider` 注入；不是 engine、worker 或 WASM 后端。 | [vue-adapter.spec.ts](../excel/vue-excel/e2e/adapter-selection/vue-adapter.spec.ts)；[CASES.md](../excel/vue-excel/e2e/adapter-selection/CASES.md)                                                                | [V-TC](#v-tc)、[V-E2E](#v-e2e) | Chromium 中从左上单元格拖到右下单元格；受控 `SpreadsheetGridView` 呈现准确的选区。                              | 不涵盖 worker/WASM、完整应用流程、其他浏览器或框架×后端组合。      |
| Solid | 既有 Playwright `wasm` project（`?backend=wasm`）使用 WASM worker 后端。                                                            | [vnext-real-backend-smoke.spec.ts](../excel/solid-excel/e2e/smoke/vnext-real-backend-smoke.spec.ts)；[Playwright 配置](../excel/solid-excel/playwright.config.ts)；[E2E 说明](../excel/solid-excel/e2e/README.md) | [S-WASM](#s-wasm)              | 在该 project 中，工作表增改删、重排、名称框选择、Copy As、状态栏汇总、编辑提交/取消、Go To 与 Text to Columns。 | 只记录此 spec 的七个场景；不延伸到未列场景、其他浏览器或其他框架。 |
| Solid | 既有 Playwright `ts` project（`?backend=ts`）使用 TypeScript worker 后端。                                                          | [vnext-real-backend-smoke.spec.ts](../excel/solid-excel/e2e/smoke/vnext-real-backend-smoke.spec.ts)；[Playwright 配置](../excel/solid-excel/playwright.config.ts)；[E2E 说明](../excel/solid-excel/e2e/README.md) | [S-TS](#s-ts)                  | 在该 project 中，工作表增改删、重排、名称框选择、Copy As、状态栏汇总、编辑提交/取消、Go To 与 Text to Columns。 | 只记录此 spec 的七个场景；不延伸到未列场景、其他浏览器或其他框架。 |

## React 历史记录

2026-08-14，旧 React adapter 的 1 个 Chromium 选择用例曾通过。该 adapter E2E、fixture、
Playwright 配置与 package scripts 已于 2026-09-01 随完整产品扶正移除；本矩阵不提供虚假的
archive 路径，也不再把已不存在的 typecheck/e2e 命令列为可执行证据。

## 当前仍可执行的精确命令

以下 Vue/Solid 命令于 2026-08-14 执行；每条命令均以退出码 0 结束。

### V-TC

```sh
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 pnpm --filter @einfach/vue-excel typecheck:e2e
```

### V-E2E

```sh
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 EINFACH_E2E_PORT=5193 pnpm --filter @einfach/vue-excel e2e
```

结果：`vue-adapter.spec.ts` 的 1 个 Chromium 用例通过。

### S-WASM

```sh
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 EINFACH_E2E_PORT=5195 pnpm --filter @einfach/solid-excel exec playwright test e2e/smoke/vnext-real-backend-smoke.spec.ts --project=wasm --reporter=line
```

结果：该 spec 在 `wasm` project 的 7 个 Chromium 用例通过。

### S-TS

```sh
NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 EINFACH_E2E_PORT=5196 pnpm --filter @einfach/solid-excel exec playwright test e2e/smoke/vnext-real-backend-smoke.spec.ts --project=ts --reporter=line
```

结果：该 spec 在 `ts` project 的 7 个 Chromium 用例通过。

## 读取方式

- React 格只保留已删除 adapter fixture 的历史结果，不能复跑或改写为当前 Rust/WASM 产品证据。
- Vue 格是调用方受控后端 fixture 的交互证据，不能改写为 worker 后端证据。
- Solid 的两个格子分别对应既有 `wasm`、`ts` worker project，不能由任一格
  推出另一格之外的行为。
- 本矩阵不从共享的拖选行为导出完整框架等价，也不补充未由上述 spec 执行的
  场景。
