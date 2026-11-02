# Einfach Excel

[![CI](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml/badge.svg)](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**以 Rust/WASM 为工作簿事实源、以 Einfach atoms 为无头 UI 核心的 React 电子表格基础设施。**

[五分钟安装](./docs/QUICKSTART.md) · [架构说明](./docs/ARCHITECTURE.md) · [React 产品说明](./excel/react-excel/README.md) · [功能进度](./excel/react-excel/FEATURE_PROGRESS.md) · [发布流程](./docs/RELEASING.md) · [参与贡献](./CONTRIBUTING.md)

## 为什么选择 Einfach Excel？

Einfach Excel 是面向产品团队的开源电子表格栈。工作簿值、公式、依赖图与事务只存在于 Web Worker 中的 Rust/WASM 引擎；`@einfach-excel/spreadsheet-ui-core` 维护无 DOM 的选区、编辑、视口与投影 atoms；`@einfach-excel/react-excel` 提供可独立嵌入宿主应用的 `<Spreadsheet />` 组件（支持 DOM 与 Canvas 2D 双网格表面）。

- **只计算当前结果的依赖链，而不是所有公式。** 可视结果会自动拉取屏外单元格及其它工作表中的必要普通公式；依赖链之外的公式值保持未求值。
- **渲染有界窗口，而不是整个工作簿。** UI 只请求有界的可视投影，不建立逐格、逐行或逐列的 atom 家族。
- **让公式计算与大文件导入离开主线程。** React 组件通过内置的 Rust Worker / WASM 通道执行工作簿命令，主线程专注渲染、焦点与事件。
- **单向命令与展现边界。** `DOM 事件 → UI Core command atom → Rust Worker RPC → 发布投影 → React 重渲染`，由 `npm run check:presentation` 与依赖门禁机械守护。

## 快速安装（React 主线）

```bash
pnpm add @einfach-excel/react-excel @einfach/core @einfach/react react react-dom
```

跟着[五分钟上手](./docs/QUICKSTART.md)挂载 `<Spreadsheet definition={definition} />`，并在真实单元格中验证 `=1+2`。需要 `.xlsx` 导入导出时，按需额外安装 `@einfach-excel/xlsx` 并注入 `xlsx` prop。

## 证据边界

规模相关行为以当前代码契约表达，而不是用宣传数字代替：

- **公式值在读取时求值。** 批量导入的普通公式在请求结果读取前保持未求值，屏外与跨表依赖会被自动跟随；直接写入数组或溢出公式时，仍可能为维护溢出状态而求值（[按需求值](./docs/ON_DEMAND_EVALUATION.md)、[跨表求值](./docs/CROSS_SHEET_EVALUATION.md)）。
- **存储记录，而不是几何网格。** 工作簿按行列键保存已有记录，区间遍历只处理请求边界内的存量条目（[稀疏存储模型](./docs/SPARSE_STORAGE_MODEL.md)）。
- **显示数据必须留在明确矩形内。** UI 核心校验可视窗口与显式区间请求，并拒绝形状不符或越界结果（[投影边界契约](./docs/PROJECTION_BOUNDARY_CONTRACT.md)）。
- **按几何范围选择依赖根。** 公式区间依照源码中的几何规则选择单元格、行带、列或工作表失效根（[区间依赖分层](./docs/RANGE_DEPENDENCY_TIERS.md)）。
- **区间命令直接传矩形坐标。** 清除、格式化、剪贴板等区间操作通过类型化 `rust-workbook` 命令直接把矩形坐标传给 Rust 引擎，不在前端展开成逐格请求。

代码引用见[规模事实](./docs/SCALE_FACTS.md)，分层边界见[规模架构](./docs/SCALE_ARCHITECTURE.md)，历史修订上的 E2 观察记录见[归档规模观察](./docs/archive/SCALE_OBSERVATIONS.md)。这些机制不构成性能、内存、容量、传输或生产 SLA 承诺。

## 架构概览

```text
React 宿主应用 (@einfach-excel/react-excel)
   │  @einfach/react hooks (useAtomValue / useSetAtom)
   ▼
@einfach-excel/spreadsheet-ui-core
   ├─ feature atoms (选区、编辑、视口、投影、面板状态)
   └─ rust-workbook 类型化命令 ──► rust-worker (Worker RPC)
                                      │
                                      ▼
                     @einfach-excel/excel-wasm ──► Rust einfach-excel-core
```

UI 核心负责交互状态、命令编排与有界投影，Rust/WASM 引擎负责工作簿数据、公式求值、筛选排序与撤销重做。不再维护多后端 `SpreadsheetBackend` 抽象层。

## 包与 crate

| 位置 | 名称 | 状态 | 职责 |
| --- | --- | --- | --- |
| `excel/react-excel/` | `@einfach-excel/react-excel` | 当前主线（公开 `0.1.0`） | React 工作簿组件包与 Vite 开发工作台 |
| `excel/spreadsheet-ui-core/` | `@einfach-excel/spreadsheet-ui-core` | 当前主线（公开 `0.2.0`） | 框架无关 atoms、交互状态、类型化 Rust 命令与 Worker 传输 |
| `excel/spreadsheet-ui-styles/` | `@einfach-excel/spreadsheet-ui-styles` | 维护中（公开 `0.2.0`） | 跨框架表格视觉样式与设计令牌 |
| `excel/excel-wasm/` | `@einfach-excel/excel-wasm` | 当前主线（公开 `0.2.0`） | 预构建 Rust/WASM 双入口包（`lite` / `full`） |
| `packages/canvas/` | `@einfach-excel/canvas` | 当前主线（公开 `0.1.0`） | 框架无关 Canvas 2D 网格渲染内核与命中测试 |
| `packages/react-cells/`、`packages/canvas-cells/` | `@einfach-excel/react-cells`、`@einfach-excel/canvas-cells` | 当前主线（仓内） | DOM 与 Canvas 单元格类型渲染插件 |
| `excel/rust/core/` | `einfach-core` | 当前主线（Rust） | Rust 端响应式 atom store 实现 |
| `excel/rust/excel-core/` | `einfach-excel-core` | 当前主线（Rust） | Rust 工作簿与公式引擎 |
| `excel/rust/wasm/` | `einfach-wasm` | 当前主线（Rust） | Rust 工作簿引擎的 `wasm-bindgen` 绑定 |
| `excel/rust/xlsx/`、`excel/xlsx-wasm/` | `einfach-xlsx`、`@einfach-excel/xlsx` | 当前主线（按需） | Rust `.xlsx` 导入导出 crate 与 WASM 包装 |
| `excel/excel-core-ts/` | `@einfach-excel/excel-core-ts` | 参照实现（公开 `0.2.0`） | TypeScript 公式引擎参照实现，不接入 React 主线运行时 |
| `excel/vue-excel/` | `@einfach-excel/vue-excel` | 独立实验（私有） | Vue 视图实验，不参与 React 主线门禁 |
| `excel/solid-excel/`、`excel/excel-site/` | `@einfach-excel/solid-excel`、`@einfach-excel/excel-site` | 已暂停（私有） | 仅保留源码考古，退出构建、测试、CI 与发布 |

### 发布状态与稳定性

当前公开发布的包分为两组（见 [`.changeset/config.json`](./.changeset/config.json) 与 [发布流程](./docs/RELEASING.md)）：

- **基础与 WASM 同步版本组（fixed 组，当前 `0.2.0`）**：`@einfach-excel/spreadsheet-ui-core`、`@einfach-excel/spreadsheet-ui-styles`、`@einfach-excel/excel-core-ts`、`@einfach-excel/excel-wasm`。
- **独立公开包（当前 `0.1.0`）**：`@einfach-excel/react-excel`、`@einfach-excel/canvas`。
- `solid-excel` 与 `excel-site` 已暂停并设为 `private: true`，不再参与发布。

`0.x` 阶段的兼容性预期（[ADR 0017](./docs/decisions/0017-initial-release-version-0-1-0.md)）：

- **次版本（`0.1` → `0.2`）可能包含破坏性变更。** 需要稳定 API 面请锁定次版本；每个包的 `CHANGELOG.md` 显式记录破坏性变更。
- 补丁版本只含修复。
- 已构建包的消费者 Node.js 支持基线为 **`>=22.12.0`**（[ADR 0018](./docs/decisions/0018-node-baseline-22-12.md)）；仓库本地开发因 Lingui 6 工具链要求 Node.js **`>=22.19.0`**。

## 已核实的外部竞品事实索引

下表仅记录指定范围内、带日期的来源事实；它不是评分表、推荐、可用性检查、兼容性声明或性能对比。`unknown` 表示已审查记录不足以支持该字段。所有条目核实于 2026-08-13，并受[比较证据维护流程](./docs/COMPARISON_EVIDENCE_MAINTENANCE.md)约束。

| 维度 | Univer | Handsontable |
| --- | --- | --- |
| 许可证 | 所引仓库的 `LICENSE` 将其文本标识为 Apache License, Version 2.0。([来源](https://github.com/dream-num/univer/blob/ee85ccbef9693e81e99b0534f07c287c56ce9fce/LICENSE)) | 所引仓库的 `LICENSE.txt` 将软件描述为双许可证，并引用单独的非商业与商业许可文档。([来源](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/LICENSE.txt)) |
| 交付形态 | 所引 CDN 指南记录了通过 HTML `<script>` 标签使用的 UMD 全局构建，并列出 jsDelivr 与 unpkg。([来源](https://github.com/dream-num/documentation/blob/c61eab834d1a22621ee89711be689a531e4d6c7580ab7be/content/guides/sheets/getting-started/installation/cdn.mdx)) | 所引 `@handsontable/react-wrapper` manifest 声明了 CommonJS、ES module 入口、类型声明路径以及 unpkg 与 jsDelivr 路径。([来源](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json)) |
| 数据或后端解耦 | 所引 Web Worker 指南描述了 worker 中独立的 Univer 实例，以及将数据与变更和主线程实例同步的 RPC 通信。([来源](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx)) | `unknown`：已审查记录未识别数据、存储、传输或后端边界。 |
| 计算位置 | 在所引 Web Worker 配置中，指南说明公式计算发生在 Web Worker 线程。([来源](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx)) | `unknown`：已审查记录未识别计算路径、运行时、设备、worker 或服务边界。 |
| 框架集成 | 所引 React 18 与 19 指南在 `useEffect` 中初始化 Univer，将 React ref 作为 preset 容器，并在清理时调用 `univerAPI.dispose()`。([来源](https://github.com/dream-num/documentation/blob/00789a9db73c03685f68dc85f83df6023c3ca326/content/guides/sheets/getting-started/integrations/react.mdx)) | 所引 React wrapper manifest 命名 `@handsontable/react-wrapper`，声明根导出入口，将 `handsontable` 列为 peer dependency，并在 development dependencies 中列出 React。([来源](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json)) |
| 包体积口径 | `unknown`：没有已审查的产物记录同时提供体积值所需的版本或修订、包含文件、测量形态与命令、测量日期。 | `unknown`：没有已审查的产物记录同时提供体积值所需的版本或修订、包含文件、测量形态与命令、测量日期。 |

[Univer 证据账本](./docs/UNIVER_PRODUCT_EVIDENCE.md)与 [Handsontable 证据账本](./docs/HANDSONTABLE_PRODUCT_EVIDENCE.md)记录了每项事实的范围、限制、核实者、责任人和下次复核日期。不得从本表推断任何产品优势。

## 从本地 checkout 参与贡献

### 前置条件

- Node.js **>= 22.19.0**（仓库开发工具链要求；消费包运行基线为 `>= 22.12.0`）
- pnpm 10
- 已安装 `wasm32-unknown-unknown` target 与 [wasm-pack](https://rustwasm.github.io/wasm-pack/) 的 Rust 工具链

### 安装、构建与验证

```bash
pnpm install
npm run ensureWasm
pnpm --filter @einfach-excel/react-excel dev
```

常用门禁命令：

```bash
npm run check:docs           # 文档断链与过期路径检查
npm run check:presentation   # React 展现层与 UI Core 边界检查
npm run check:e2e-features   # e2e/FEATURES.md 登记与用例绑定检查
npm run lint:check           # ESLint 检查
npm run typecheck:mainline   # spreadsheet-ui-core + react-excel 类型检查
npm test                     # 全仓活跃包 Vitest 单元测试
npm run build                # 全量构建（含 WASM、Rollup 产物与 React 构建）
```

### Rust 引擎测试

```bash
cargo test --manifest-path excel/rust/core/Cargo.toml
cargo test --manifest-path excel/rust/excel-core/Cargo.toml
cargo test --manifest-path excel/rust/wasm/Cargo.toml
cargo test --manifest-path excel/rust/xlsx/Cargo.toml
```

更多说明见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [CLAUDE.md](./CLAUDE.md)。

## 许可证

[MIT](./LICENSE)
