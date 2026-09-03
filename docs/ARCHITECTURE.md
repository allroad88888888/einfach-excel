# 架构

这份文档是**代码地图**，故意保持粗粒度：只写不易变的层次、边界与数据流。具体到某个 feature 的
atom 清单、端口形状、用例覆盖，都在贴着代码的文档里（见文末「细节去哪查」）。

## 宿主适配器与无头 UI core

```
        ┌─────────────────────────────────────────────┐
        │  excel/excel-site        演示 / 门面站       │
        └───────────────────┬─────────────────────────┘
                            │ 组装
        ┌───────────────────▼─────────────────────────────────────┐
        │ 产品与宿主包                                             │
        │ ├── excel/solid-excel/src         Solid 组件 / Provider       │
        │ ├── excel/react-excel             React Vite 产品       │
        │ └── excel/vue-excel               Vue 私有部分适配器    │
        └───────────────────┬─────────────────────────────────────┘
                            │ 都依赖 atoms / 类型
        ┌───────────────────▼─────────────────────────┐
        │  excel/spreadsheet-ui-core                  │
        │  atoms、类型、投影契约                       │
        │  rust-worker/：Rust/WASM Worker backend     │
        │  不依赖任何视图框架                          │
        └───────────────────┬─────────────────────────┘
                            │ SpreadsheetBackend port（异步）
        ┌───────────────────▼─────────────────────────┐
        │  Web Worker                                  │
        │  ├── excel/rust/wasm → excel/rust/excel-core │ ← 现役主引擎
        │  └── excel/excel-core-ts                     │ ← 第二后端 / parity 参照
        └─────────────────────────────────────────────┘
```

上游 atom 引擎 `@einfach/core` / `@einfach/solid` 从 **npm** 安装，源码在
[einfach 主仓](https://github.com/allroad88888888/einfach)，不在本仓。见
[ADR 0002](decisions/0002-upstream-core-via-npm.md)。

### 产品与宿主包边界

三个包都以 workspace 依赖指向 `@einfach/spreadsheet-ui-core`；这个包是框架无关的 atom、
类型与投影契约层。真实包名与源码路径如下：

| 宿主  | 包名                   | 源码路径                      | 边界事实                                                      |
| ----- | ---------------------- | ----------------------------- | ------------------------------------------------------------- |
| Solid | `@einfach/solid-excel` | `excel/solid-excel/src` | Solid 组件、Provider 与 TS/static adapter 在这里消费 UI core。 |
| React | `@einfach/react-excel` | `excel/react-excel`           | 仓内私有 Vite 产品，直接接 Rust/WASM worker，不提供公开入口。 |
| Vue   | `@einfach/vue-excel`   | `excel/vue-excel`             | 仓内私有 workspace，只实现了部分适配面。                      |

React 行记录完整产品的位置；Vue 行只记录仓内依赖和代码位置。两者都不构成对外安装、发布就绪或
支持状态的声明。

### 层的硬约束

- `spreadsheet-ui-core` **不得**导入 Solid、React 或其它视图框架。Atom 根入口不导出带副作用的
  Worker runtime；Rust/WASM 胶水只允许存在于显式子入口 `rust-worker/`。这两层边界分别由
  `test/package-boundary.test.ts` 与 `test/rust-worker-boundary.test.ts` 拦住。
- **工作簿事实**（单元格值、公式、依赖图、隐藏行、筛选规则）活在后端端口后面，不在 UI atom 里。
  UI 侧的对应 atom 只是「backend ACK 后才写」的投影缓存。归属判据见
  [ADR 0003](decisions/0003-engine-owns-filter-sort.md)。
- 大表**不允许** per-cell / per-row / per-column 的 atom 家族 —— 只能走可见窗口投影或有上限的缓存，
  每个缓存要在自己的 feature README 里声明上限。

## 后端端口

契约在 `excel/spreadsheet-ui-core/src/backend/types.ts` 的 `SpreadsheetBackend`。

**三个必需方法**：`readVisibleProjection`、`readRangeProjection`、`setCellInput`。
其余全部可选 —— 这是特性降级机制：宿主没实现某个可选端口时，UI core 会隐藏对应的工具栏项、
菜单入口和键盘意图。UI core **不区分**「宿主没实现」与「这个特性不存在」。

数一下当前必需/可选的数量（别把数字写进文档，它会腐坏）：

```bash
grep -cE '^\s+[a-zA-Z][a-zA-Z0-9]*\?[(:]' excel/spreadsheet-ui-core/src/backend/types.ts
```

参考实现按所有权分开：

| 实现                                                                    | 用途                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `excel/solid-excel/src/adapter/static-backend.ts`                        | 内存实现，供 smoke 测试与静态演示；同时是 parity 对照的「第二引擎」 |
| `excel/spreadsheet-ui-core/src/rust-worker/adapter/worker/backend.ts`     | RPC 到持有 WASM `Workbook` 的 Web Worker                            |

变更请求带可选的 `requestId` / `revision` / `cancelToken`，worker 用它们丢弃过期工作。

## 数据流：一次单元格编辑

```
用户输入 → editing atoms（UI core）
        → setCellInput（后端端口）
        → worker RPC → WASM → excel-core 重算依赖图
        → worker 回 ACK + 失效窗口
        → readVisibleProjection 重取可见窗口
        → 投影 atom 更新 → 对应宿主组件重渲染
```

关键点：UI 侧**不预测**计算结果。乐观更新只发生在编辑缓冲区，落库值一律等引擎回话。

## 引擎侧值得知道的两件事

**Spill（动态数组）走的是 atom 派生，不是并行索引。** 公式求值出 `Value::Array` 时，锚点单元格的
atom 持有整个数组，每个非 (0,0) 目标拿一个读锚点并索引进去的派生 atom —— 读取、依赖追踪、订阅传播
全部复用既有 atom 框架。WASM 边界在做单元格投影读取时把 `Value::Array` 折叠成左上角标量。
细节见 `excel/rust/excel-core/src/sheet.rs` § "Spill (dynamic-array) infrastructure"。

**自定义公式**是宿主注册的 JS 回调，作为单元格级函数调用（`=MYTAX(B1)`）。它是上面那条的例外：
传区间参数时（`=MYFN(A1:A10)`）回调**会**收到二维 JS 数组，因为引擎直接把数组参数转发给回调。
异步注册（`isAsync: true`）期间单元格持 `#BUSY!`，由 worker pump 把 Promise 结果回灌引擎。
引擎侧契约的唯一真相是 `excel/rust/excel-core/src/CUSTOM_FORMULAS.md`；JS 侧宿主 API 在
`excel/spreadsheet-ui-core/src/custom-formulas/README.md`。

## Worker 运行时有两个

UI Core 的 `rust-worker/runtime.ts`（Rust/WASM）与 Solid adapter 的
`worker-runtime-ts.ts`（`@einfach/excel-core-ts`）实现同一套
worker 协议，e2e 双后端跑同一批用例来钉 parity（矩阵见 `excel/solid-excel/e2e/BACKEND_PARITY.md`）。
Rust 是现役主引擎；TS 版是 parity 参照，同时保留纯 JS 部署路径。

Solid 的兼容 worker 工厂仍**刻意不从** `src` barrel 导出（`import.meta` 会炸 jest）；新宿主可直接
组合 `@einfach/spreadsheet-ui-core/rust-worker` 与
`@einfach/spreadsheet-ui-core/rust-worker/runtime?worker`。旧宿主继续走
`@einfach/solid-excel/worker-factory` 子路径 —— 见 [ADR 0004](decisions/0004-worker-factory-out-of-barrel.md)。

Rust/WASM 那侧的 dispatcher 与"用哪份 wasm 产物"是解耦的：消息循环在
`spreadsheet-ui-core/src/rust-worker/adapter/worker-runtime-core.ts`
（`installWorkerRuntime(wasm)`，命令族分在 `worker-commands-*.ts`），
`rust-worker/runtime.ts` / `rust-worker/runtime-full.ts` 只是各自静态 import `@einfach/excel-wasm` 与
`@einfach/excel-wasm/full` 的**叶子**入口。库的 barrel 与 factory 不引用任何一个 WASM 入口，所以
默认不构建的 full 产物不会变成构建期必需项 —— 选型见 `excel/rust/wasm/README.md`
§「怎么选 full」。

## 构建管线

- TypeScript composite project，`tsc -build` 出声明
- Rollup 打到 `cjs/`（.cjs）、`esm/`（.mjs）、`dist/`
- `@einfach/solid-excel` 是双形态（[ADR 0019](decisions/0019-solid-excel-dual-form-artifacts.md)，
  `rollup.solid-excel.mjs`）：`solid` 条件交源码给消费者的 vite-plugin-solid 编译，
  `import`/`default` 交 babel 预编译的仅-ESM 产物
- SWC 转 React/Vanilla；Babel 转 Solid（为了 JSX）
- UI Core 仅把 Rust Worker runtime 叶子入口标为有副作用；其余无头入口保持可摇树。
- `npm run build` 链条：`clearTypes` → `ensureWasm` → `tsc -build` → `rollup`。
  `ensureWasm` 在缺 `excel/excel-wasm/lite/` 时调 `wasm-pack`（产物归 `@einfach/excel-wasm`），所以构建环境需要 Rust 工具链。
  `wasm-pack` 的 `--out-dir` 相对 **crate 目录**而非 cwd。

## 细节去哪查

| 想知道                          | 去读                                                |
| ------------------------------- | --------------------------------------------------- |
| 某个 feature 的 atom 清单与归属 | `excel/spreadsheet-ui-core/src/<feature>/README.md` |
| 某个功能点的 e2e 用例覆盖       | `excel/solid-excel/e2e/<feature>/CASES.md`          |
| feature 归引擎还是归 UI core    | `excel/solid-excel/docs/CANONICAL_OWNERSHIP.md`     |
| 自定义公式引擎契约              | `excel/rust/excel-core/src/CUSTOM_FORMULAS.md`      |
| 双后端 parity 矩阵              | `excel/solid-excel/e2e/BACKEND_PARITY.md`           |
| 重大技术裁决及其理由            | `docs/decisions/`                                   |
| 历史战役记录（考古用）          | 各包的 `docs/archive/INDEX.md`                      |
