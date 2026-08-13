# Einfach Excel

[![CI](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml/badge.svg)](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![在线演示](https://img.shields.io/badge/demo-live-0a7f5a.svg)](https://allroad88888888.github.io/einfach-excel/)

**为 Web 构建始终流畅的电子表格体验。** Einfach Excel 将框架无关的表格 UI 核心、Rust/WASM 工作簿与公式引擎，以及可直接使用的 Solid.js 界面组合在一起。

[体验在线 Demo](https://allroad88888888.github.io/einfach-excel/) · [English](./README.md) · [架构说明](./docs/ARCHITECTURE.md) · [参与贡献](./CONTRIBUTING.md)

## 为什么选择 Einfach Excel？

电子表格界面远比看起来复杂：随着工作簿变大，渲染、交互、计算与数据访问仍须保持流畅。Einfach Excel 将这些职责分开：宿主可以独立使用 UI，并按需接入工作簿实现；生产级集成则把计算移出主线程。

- **规模增大仍然流畅。** UI 只请求有界的可视窗口投影，不会渲染整个工作簿。在线 Demo 包含一个 100,000 行工作表。
- **计算不阻塞主线程。** Rust/WASM 引擎运行在 Web Worker 中，浏览器可以持续滚动和编辑。
- **运行时由你选择。** `spreadsheet-ui-core` 不依赖 DOM、Solid、React、worker 或 WASM；可连接符合产品需求的任意后端。
- **具备真实的表格行为。** 栈内覆盖选区、编辑、键盘交互、剪贴板、公式、历史记录、查找替换、验证、筛选、排序、评论等能力。

## 在线体验

[交互式 Demo](https://allroad88888888.github.io/einfach-excel/) 与库使用同一套组件与 worker 边界，包含下列针对性示例：

- 公式计算、动态数组、命名区域和自定义公式（包括异步公式）；
- 一个以 Rust/WASM worker 驱动的虚拟化大工作表；
- 数据验证、条件格式、筛选、排序、查找替换和剪贴板工具；
- 撤销/重做、评论、工作表保护、打印，以及完整的表格工作台。

## 架构概览

```text
你的应用
   │
   ▼
表格 UI 核心 ── 可视窗口投影 ──► 后端端口
   │                                  │
   ▼                                  ▼
Solid.js 组件                    Web Worker + Rust/WASM 工作簿
```

UI 核心负责交互状态和投影契约，后端负责工作簿数据和写操作。内置 Solid 适配器把两端连入虚拟化网格；需要时，它再通过类型化 RPC 连接 Rust 公式引擎所在的 worker。

## 包与 crate

| 位置                         | 名称                           | 职责                                                      |
| ---------------------------- | ------------------------------ | --------------------------------------------------------- |
| `excel/spreadsheet-ui-core/` | `@einfach/spreadsheet-ui-core` | 框架无关的 atoms、类型、交互状态与可视窗口投影契约。      |
| `excel/solid-excel/`         | `@einfach/solid-excel`         | Solid.js 表格组件，以及 static / worker 后端适配器。      |
| `excel/excel-core-ts/`       | `@einfach/excel-core-ts`       | TypeScript 公式引擎，用于一致性验证及另一种 worker 后端。 |
| `excel/rust/core/`           | `einfach-core`                 | atom store 的 Rust 实现。                                 |
| `excel/rust/excel-core/`     | `einfach-excel-core`           | Rust 工作簿与公式引擎。                                   |
| `excel/rust/wasm/`           | `einfach-wasm`                 | 供 Solid worker 集成使用的 WASM 绑定。                    |
| `excel/excel-site/`          | `@einfach/excel-site`          | 静态文档和交互式演示站。                                  |

### 框架集成

`@einfach/solid-excel` 是当前唯一已提供的 UI 框架绑定。`@einfach/spreadsheet-ui-core` 保持框架无关，但这不表示已经提供 React 或 Vue 集成：目前没有 React/Vue 适配器包或可用的集成路径。

## 适合的场景

- 在 SaaS 产品或内部工具中嵌入电子表格 UI；
- 构建类工作簿流程，同时不让 UI 与某种特定的数据后端绑定；
- 需要公式计算保持流畅、而不阻塞浏览器界面；
- 需要 Solid.js 表格与 Rust/WASM worker 的参考实现。

## 本地开始

### 前置条件

- Node.js 18 或更高版本（CI 覆盖 Node.js 18 和 20）
- pnpm 10
- 已安装 `wasm32-unknown-unknown` target 与 [wasm-pack](https://rustwasm.github.io/wasm-pack/) 的 Rust 工具链

### 安装与构建

```bash
git clone https://github.com/allroad88888888/einfach-excel.git
cd einfach-excel
pnpm install

npm run build
npm test
npm run lint:check
```

`npm run build` 会在需要时生成 WASM 包，随后构建 TypeScript 包和 bundle。

### 运行演示站

```bash
npm run dev -w @einfach/excel-site
```

运行库本身的开发界面：

```bash
npm run dev -w @einfach/solid-excel
```

### 测试指定范围

```bash
npx jest excel/spreadsheet-ui-core --no-coverage
npx jest excel/solid-excel --no-coverage

npm run e2e:install -w @einfach/solid-excel
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel
```

每个端到端功能目录中的 `CASES.md` 都是该功能测试范围的权威说明。

## 文档

- [架构](./docs/ARCHITECTURE.md)：分层、数据流和 backend-port 契约。
- [架构决策](./docs/decisions/)：worker 边界与引擎行为背后的取舍。
- 包级 README：[UI 核心](./excel/spreadsheet-ui-core/README.md)、[Solid 集成](./excel/solid-excel/README.md)、[演示站](./excel/excel-site/README.md)。

## 参与贡献

欢迎贡献。代码风格、changesets 和文档规范请见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

[MIT](./LICENSE)
