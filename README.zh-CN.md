# Einfach Excel

[![CI](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml/badge.svg)](https://github.com/allroad88888888/einfach-excel/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![在线演示](https://img.shields.io/badge/demo-live-0a7f5a.svg)](https://allroad88888888.github.io/einfach-excel/)

**只计算可视结果真正需要的公式；屏外与跨表依赖自动追踪，无关公式保持未求值。**

[查看按需公式演示](https://allroad88888888.github.io/einfach-excel/zh/demos/lazy-formulas/) · [体验在线工作台](https://allroad88888888.github.io/einfach-excel/zh/demos/workbench/) · [五分钟安装](./docs/QUICKSTART.md) · [English](./README.md) · [架构说明](./docs/ARCHITECTURE.md) · [参与贡献](./CONTRIBUTING.md)

## 为什么选择 Einfach Excel？

Einfach Excel 是面向产品团队的开源电子表格基础设施。公式引擎按需计算可视结果，自动追踪视口之外的必要依赖，让无关公式值保持未求值；UI 状态、工作簿权威、投影传输与计算仍是清晰边界。

- **只计算当前结果的依赖链，而不是所有公式。** 可视结果会自动拉取屏外单元格及其它工作表中的必要普通公式；依赖链之外的公式值保持未求值。
- **渲染窗口，而不是整个工作簿。** UI 只请求有界的可视投影；你可以在[10 万行在线演示](https://allroad88888888.github.io/einfach-excel/zh/demos/viewport-projection/)中检查真实边界。
- **让公式离开主线程。** 已发布的 Solid 路径可在 Web Worker 中运行 Rust/WASM 工作簿，UI 专注编辑与交互。
- **让网格适配你的后端。** 框架无关 UI 核心通过类型化端口读写，让工作簿数据与写操作继续留在你的系统里。
- **先看证据，再做选择。** 聚焦演示直链源码，契约紧邻实现，限制也会明确写出。

## 先验证难点，再决定接入

| 你要验证什么             | 从这里开始                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| 完整、可编辑的业务界面   | [体验在线工作台](https://allroad88888888.github.io/einfach-excel/zh/demos/workbench/)                 |
| 大表格渲染保持有界       | [滚动 10 万行视口演示](https://allroad88888888.github.io/einfach-excel/zh/demos/viewport-projection/) |
| 公式计算保持需求驱动     | [跟随按需公式演示](https://allroad88888888.github.io/einfach-excel/zh/demos/lazy-formulas/)           |
| 现有数据模型继续保持权威 | [阅读后端端口契约](https://allroad88888888.github.io/einfach-excel/zh/docs/backend-port/)             |

## 安装 Solid 绑定

```bash
npm install @einfach/solid-excel @einfach/core @einfach/solid solid-js
```

跟着[五分钟上手](./docs/QUICKSTART.md)挂载 Worker 后端，并在真实单元格中验证 `=1+2`。当前版本为 `0.1.0`；项目仍处于 pre-1.0，需要稳定 API 面时请锁定 `~0.1.0`。

## 证据边界

规模相关行为以当前代码契约表达，而不是用宣传数字代替：

- **公式值在读取时求值。** 批量导入的普通公式在请求结果读取前保持未求值，屏外与跨表依赖会被自动跟随；直接写入数组或溢出公式时，仍可能为维护溢出状态而求值。
- **存储记录，而不是几何网格。** 工作簿按行列键保存已有记录，区间遍历只处理请求边界内的存量条目。
- **显示数据必须留在明确矩形内。** UI 核心校验可视窗口与显式区间请求，并拒绝形状不符或越界结果。
- **按几何范围选择依赖根。** 公式区间依照源码中的几何规则选择单元格、行带、列或工作表失效根。
- **过大命令仍保持矩形。** 清除和格式化超过地址展开上限时会尝试后端区间能力；不支持则拒绝，而不是展开成逐格操作。

代码引用见[规模事实](./docs/SCALE_FACTS.md)，分层边界见[规模架构](./docs/SCALE_ARCHITECTURE.md)，特定修订上的 E2 记录见[带日期规模观察](./docs/SCALE_OBSERVATIONS.md)。这些机制与在线演示不构成性能、内存、容量、传输或生产 SLA 承诺。

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

`@einfach/solid-excel` 是当前唯一已发布的 UI 框架绑定。仓库还包含私有的 React / Vue 受控投影参考包与在线演示，可用于检查宿主边界，但它们不是已发布适配器，也不能替代完整的 Solid 表面。

### 发布状态与稳定性

五个包已于 **2026-08-17** 以 `0.1.0` 首发 npm：`@einfach/spreadsheet-ui-core`、
`@einfach/spreadsheet-ui-styles`、`@einfach/excel-core-ts`、`@einfach/excel-wasm`、
`@einfach/solid-excel`。五包按 fixed 组管理版本 —— 永远一起升。

`0.x` 阶段的兼容性预期（[ADR 0017](./docs/decisions/0017-initial-release-version-0-1-0.md)）：

- **次版本（`0.1` → `0.2`）可能包含破坏性变更。** 需要稳定 API 面就锁定次版本
  （`~0.1.0`）；每个包的 `CHANGELOG.md` 会显式列出移除项。
- 补丁版本只含修复。
- Node.js 支持基线：**`>=22.12.0`**（[ADR 0018](./docs/decisions/0018-node-baseline-22-12.md)）。
- `@einfach/solid-excel` 是双形态交付
  （[ADR 0019](./docs/decisions/0019-solid-excel-dual-form-artifacts.md)）：
  Vite + `vite-plugin-solid` 用户经 `solid` 导出条件走源码编译，其它打包器拿预编译
  ESM；它面向打包器环境，不支持裸 Node import。`solid-js`、`@einfach/core`、
  `@einfach/solid` 是 peer 依赖：应用里每个只能有一份物理副本
  （见 [ADR 0001](./docs/decisions/0001-solid-js-single-instance.md)）。
- `@einfach/excel-wasm` 的 TS 消费者需要 `lib` ≥ ES2023 加 DOM（或 `skipLibCheck`）；
  已验证的组合是 `moduleResolution: "bundler"`。

## 已核实的产品事实

下表仅记录指定范围内、带日期的来源事实；它不是评分表、推荐、可用性检查、兼容性声明或性能对比。`unknown` 表示已审查记录不足以支持该字段。所有条目核实于 2026-08-13，并受已记录的复核与撤回流程约束。

| 维度           | Univer                                                                                                                                                                                                                                                                                       | Handsontable                                                                                                                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 许可证         | 所引仓库的 `LICENSE` 将其文本标识为 Apache License, Version 2.0。([来源](https://github.com/dream-num/univer/blob/ee85ccbef9693e81e99b0534f07c287c56ce9fce/LICENSE))                                                                                                                         | 所引仓库的 `LICENSE.txt` 将软件描述为双许可证，并引用单独的非商业与商业许可文档。([来源](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/LICENSE.txt))                                                                                                            |
| 交付形态       | 所引 CDN 指南记录了通过 HTML `<script>` 标签使用的 UMD 全局构建，并列出 jsDelivr 与 unpkg。([来源](https://github.com/dream-num/documentation/blob/c61eab834d1a22621ee89711be65f92252e6e51b/content/guides/sheets/getting-started/installation/cdn.mdx))                                     | 所引 `@handsontable/react-wrapper` manifest 声明了 CommonJS、ES module 入口、类型声明路径以及 unpkg 与 jsDelivr 路径。([来源](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json))                                               |
| 数据或后端解耦 | 所引 Web Worker 指南描述了 worker 中独立的 Univer 实例，以及将数据与变更和主线程实例同步的 RPC 通信。([来源](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx))                                   | `unknown`：已审查记录未识别数据、存储、传输或后端边界。                                                                                                                                                                                                                                                      |
| 计算位置       | 在所引 Web Worker 配置中，指南说明公式计算发生在 Web Worker 线程。([来源](https://github.com/dream-num/documentation/blob/4910c62a96b2ccfd2086309b3d167cfd8f454b0b/content/guides/recipes/architecture/web-worker.mdx))                                                                      | `unknown`：已审查记录未识别计算路径、运行时、设备、worker 或服务边界。                                                                                                                                                                                                                                       |
| 框架集成       | 所引 React 18 与 19 指南在 `useEffect` 中初始化 Univer，将 React ref 作为 preset 容器，并在清理时调用 `univerAPI.dispose()`。([来源](https://github.com/dream-num/documentation/blob/00789a9db73c03685f68dc85f83df6023c3ca326/content/guides/sheets/getting-started/integrations/react.mdx)) | 所引 React wrapper manifest 命名 `@handsontable/react-wrapper`，声明根导出入口，将 `handsontable` 列为 peer dependency，并在 development dependencies 中列出 React。([来源](https://github.com/handsontable/handsontable/blob/95657194616688831eb689a531e4d6c7580ab7be/wrappers/react-wrapper/package.json)) |
| 包体积口径     | `unknown`：没有已审查的产物记录同时提供体积值所需的版本或修订、包含文件、测量形态与命令、测量日期。                                                                                                                                                                                          | `unknown`：没有已审查的产物记录同时提供体积值所需的版本或修订、包含文件、测量形态与命令、测量日期。                                                                                                                                                                                                          |

[Univer 证据账本](./docs/UNIVER_PRODUCT_EVIDENCE.md)与 [Handsontable 证据账本](./docs/HANDSONTABLE_PRODUCT_EVIDENCE.md)记录了每项事实的范围、限制、核实者、责任人和下次复核日期。不得从本表推断任何产品优势。

## 已记录的入口路径

上面的带日期记录列出两个 Univer 文档示例：通过 HTML `<script>` 标签使用的 UMD 全局
构建，以及 React 18/19 示例中的 effect 初始化、ref 容器与清理时 disposal。Univer
证据账本记录了这两个示例的来源范围与限制。

Einfach Excel 的发布状态章节另行记录自身的发布状态；它不属于两个产品之间的比较。

本节只索引所引文档记录，不确立产品可用性、包安装、框架支持、兼容性、适用性、功能
对等性、性能或排名。

## 适合的场景

- 在 SaaS 产品或内部工具中嵌入电子表格 UI；
- 只计算可视结果，同时不求值无关公式的工作簿；
- 构建类工作簿流程，同时不让 UI 与某种特定的数据后端绑定；
- 需要公式计算保持流畅、而不阻塞浏览器界面；
- 需要 Solid.js 表格与 Rust/WASM worker 的参考实现。

## 从本地 checkout 参与贡献

### 前置条件

- Node.js **>=22.12.0**(消费包的基线,ADR 0018;仓库 CI 矩阵对齐中)
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

### 最小内存后端示例

已发布的 Solid 绑定与仓库共用 `@einfach/solid-excel` 接口。下面用内存后端展示
UI 边界；若要使用 Worker 中的 Rust/WASM 公式路径，请直接跟随[五分钟上手](./docs/QUICKSTART.md)：

```tsx
import {
  createStaticSpreadsheetBackend,
  SpreadsheetUiProvider,
  SpreadsheetGrid,
  SpreadsheetToolbar,
} from '@einfach/solid-excel'

const backend = createStaticSpreadsheetBackend({
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
  matrix: [
    ['Item', 'Qty', 'Price'],
    ['Widget', 4, 9.5],
  ],
})

const viewport = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 320,
  viewportWidth: 640,
  rowHeight: 24,
  colWidth: 96,
  rowCount: 50,
  colCount: 16,
  overscanRows: 1,
  overscanCols: 1,
}

function Sheet() {
  return (
    <SpreadsheetUiProvider backend={backend}>
      <SpreadsheetToolbar />
      <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
    </SpreadsheetUiProvider>
  )
}
```

## 可复跑验证

在仓库 checkout 中先执行 `pnpm install`，再运行以下命令。这些命令提供可复跑的执行路径，并不表示当前结果；结果取决于所 checkout 的修订版本与本机环境。

```bash
npm test

# 运行聚焦的包测试。
npx jest excel/spreadsheet-ui-core --no-coverage
npx jest excel/solid-excel --no-coverage

# 运行浏览器端到端测试前安装 Chromium。
npm run e2e:install -w @einfach/solid-excel
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- --project=wasm
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- --project=ts
```

验证证据的范围、测量方法、非保证事项与环境记录分别见[决策 0008](./docs/decisions/0008-public-performance-evidence-scope.md)、[决策 0009](./docs/decisions/0009-public-performance-measurement-methodology.md)、[决策 0010](./docs/decisions/0010-public-performance-non-guarantees.md)与[决策 0011](./docs/decisions/0011-public-performance-environment-record.md)。两种后端的 E2E 覆盖范围与已记录例外见[后端一致性矩阵](./excel/solid-excel/e2e/BACKEND_PARITY.md)。

## 在线体验

[交互式 Demo](https://allroad88888888.github.io/einfach-excel/) 与库使用同一套组件与 worker 边界，包含下列针对性示例：

- 公式计算、动态数组、命名区域和自定义公式（包括异步公式）；
- 一个以 Rust/WASM worker 驱动的虚拟化大工作表；
- 数据验证、条件格式、筛选、排序、查找替换和剪贴板工具；
- 撤销/重做、评论、工作表保护、打印，以及完整的表格工作台。

## 文档

- [架构](./docs/ARCHITECTURE.md)：分层、数据流和 backend-port 契约。
- [架构决策](./docs/decisions/)：worker 边界与引擎行为背后的取舍。
- 包级 README：[UI 核心](./excel/spreadsheet-ui-core/README.md)、[Solid 集成](./excel/solid-excel/README.md)、[演示站](./excel/excel-site/README.md)。

## 维护者与响应预期

单维护者项目（[@allroad88888888](https://github.com/allroad88888888)），无付费支持 SLA。现实预期：

- Bug 与提问（[issues](https://github.com/allroad88888888/einfach-excel/issues) / [discussions](https://github.com/allroad88888888/einfach-excel/discussions)）：尽力 **7 天**内首次响应；可复现的引擎正确性 bug 优先。
- Pull Request：尽力 **14 天**内首次 review；小而聚焦的 PR 远快于大 PR。
- 安全报告：见 [SECURITY.md](./.github/SECURITY.md)——走私密漏洞上报，不要开公开 issue。
- 不支持混用不同版本的 `@einfach/*` 包——五包按 fixed 组同升，升级请五包一起（见[发布状态与稳定性](#发布状态与稳定性)）。

## 参与贡献

欢迎贡献。代码风格、changesets 和文档规范请见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

[MIT](./LICENSE)
