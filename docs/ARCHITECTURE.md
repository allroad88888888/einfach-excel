# 架构

这份文档是**代码地图**，故意保持粗粒度：只写不易变的层次、边界与数据流。具体到某个 feature 的
atom 清单、端口形状、用例覆盖，都在贴着代码的文档里（见文末「细节去哪查」）。

## 三层

```
        ┌─────────────────────────────────────────────┐
        │  excel/excel-site        演示 / 门面站       │
        └───────────────────┬─────────────────────────┘
                            │ 组装
        ┌───────────────────▼─────────────────────────┐
        │  excel/solid-excel/src-vnext                │
        │  Solid 组件、Provider、adapter（worker 胶水）│
        └───────────────────┬─────────────────────────┘
                            │ 依赖 atoms / 类型
        ┌───────────────────▼─────────────────────────┐
        │  excel/spreadsheet-ui-core                  │
        │  atoms、类型、投影契约                       │
        │  无 DOM、无 worker、无 WASM、不依赖任何框架  │
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

### 层的硬约束

- `spreadsheet-ui-core` **不得**导入 Solid、React、DOM API、worker 胶水或 WASM 胶水。
  违反会被 `test/package-boundary.test.ts` 拦住。
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

两个参考实现都在 `excel/solid-excel/src-vnext/adapter/`：

| 实现 | 用途 |
|---|---|
| `static-backend.ts` | 内存实现，供 smoke 测试与静态演示；同时是 parity 对照的「第二引擎」 |
| `worker-workbook-backend.ts` | RPC 到持有 WASM `Workbook` 的 Web Worker |

变更请求带可选的 `requestId` / `revision` / `cancelToken`，worker 用它们丢弃过期工作。

## 数据流：一次单元格编辑

```
用户输入 → editing atoms（UI core）
        → setCellInput（后端端口）
        → worker RPC → WASM → excel-core 重算依赖图
        → worker 回 ACK + 失效窗口
        → readVisibleProjection 重取可见窗口
        → 投影 atom 更新 → Solid 组件重渲染
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

`worker-runtime.ts`（Rust/WASM）与 `worker-runtime-ts.ts`（`@einfach/excel-core-ts`）实现同一套
worker 协议，e2e 双后端跑同一批用例来钉 parity（矩阵见 `excel/solid-excel/e2e/BACKEND_PARITY.md`）。
Rust 是现役主引擎；TS 版是 parity 参照，同时保留纯 JS 部署路径。

worker 工厂**刻意不从** `src-vnext` barrel 导出（`import.meta` 会炸 jest），宿主必须走
`@einfach/solid-excel/vnext-worker-factory` 子路径 —— 见
[ADR 0004](decisions/0004-worker-factory-out-of-barrel.md)。

## 构建管线

- TypeScript composite project，`tsc -build` 出声明
- Rollup 打到 `cjs/`（.cjs）、`esm/`（.mjs）、`dist/`
- SWC 转 React/Vanilla；Babel 转 Solid（为了 JSX）
- 所有包 `sideEffects: false`
- `npm run build` 链条：`clearTypes` → `ensureWasm` → `tsc -build` → `rollup`。
  `ensureWasm` 在缺 `excel/solid-excel/wasm-pkg/` 时调 `wasm-pack`，所以构建环境需要 Rust 工具链。
  `wasm-pack` 的 `--out-dir` 相对 **crate 目录**而非 cwd。

## 细节去哪查

| 想知道 | 去读 |
|---|---|
| 某个 feature 的 atom 清单与归属 | `excel/spreadsheet-ui-core/src/<feature>/README.md` |
| 某个功能点的 e2e 用例覆盖 | `excel/solid-excel/e2e/<feature>/CASES.md` |
| feature 归引擎还是归 UI core | `excel/solid-excel/docs/CANONICAL_OWNERSHIP.md` |
| 自定义公式引擎契约 | `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` |
| 双后端 parity 矩阵 | `excel/solid-excel/e2e/BACKEND_PARITY.md` |
| 重大技术裁决及其理由 | `docs/decisions/` |
| 历史战役记录（考古用） | 各包的 `docs/archive/INDEX.md` |
