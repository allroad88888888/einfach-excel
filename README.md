# einfach-excel

在线表格栈：一个框架无关的表格 UI 核心，一个 Rust/WASM 公式引擎，以及基于两者的 Solid.js 表格界面。

状态管理由 [einfach](https://github.com/allroad88888888/einfach)（受 Jotai 启发的 atom 引擎）提供 —— 本仓通过
npm 消费 `@einfach/core` / `@einfach/solid`，**不是** workspace 依赖。这是刻意的：表格栈必须能跑在**已发布**
的 core 上，而不是某个只存在于工作区的版本。

> 本仓 2026-07-29 从 einfach 主仓拆出。原仓仍留有一份 `excel/` 的历史副本，它冻结在拆分时点，
> **不是**本仓的镜像 —— 不要在那边改表格栈代码。

## 包与 crate

| 位置 | 名称 | 说明 |
|---|---|---|
| `excel/spreadsheet-ui-core/` | `@einfach/spreadsheet-ui-core` | 框架无关的表格 UI 核心：atoms、类型、投影契约。无 DOM / worker / WASM |
| `excel/solid-excel/` | `@einfach/solid-excel` | Solid.js 表格界面（`src-vnext/` 为现役，`src/` 仅留作 parity 对照） |
| `excel/excel-site/` | `@einfach/excel-site` | 演示 / 门面站（private，vite） |
| `excel/excel-core-ts/` | `@einfach/excel-core-ts` | TS 公式引擎（private）：parity 参照，同时充当第二个 worker 后端 |
| `excel/rust/core/` | `einfach-core` (crate) | Rust atom store —— TS 版 core 的孪生实现 |
| `excel/rust/excel-core/` | `einfach-excel-core` (crate) | Rust 公式 / 工作簿引擎 |
| `excel/rust/wasm/` | `einfach-wasm` (crate) | 暴露给 `solid-excel` 的 WASM 绑定 |

pnpm workspace 的 glob 是 `excel/*`；`excel/rust/` 不是 npm 包，靠 `build:wasm` 接入。

架构分层、数据流与后端 port 契约见 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**；
重大技术裁决见 **[docs/decisions/](./docs/decisions/)**。

## 环境要求

- Node.js >= 18（CI 覆盖 18 与 20）
- [pnpm](https://pnpm.io/) 10
- Rust 工具链 + `wasm32-unknown-unknown` target + [wasm-pack](https://rustwasm.github.io/wasm-pack/)
  —— `build` 链条里的 `ensureWasm` 会在缺 `wasm-pkg/` 时调 `wasm-pack`，缺工具链会直接 exit 127

## 快速上手

```bash
git clone git@github.com:allroad88888888/einfach-excel.git
cd einfach-excel
pnpm install

npm run build            # clearTypes → ensureWasm → tsc -build → rollup
npm test                 # 全量 jest（含覆盖率）
npm run lint:check       # eslint（不自动修）
```

跑演示站：

```bash
npm run dev -w @einfach/excel-site     # 门面 / 演示站
npm run dev -w @einfach/solid-excel    # 表格界面自身的 vite dev
```

跑单个测试文件与分区套件：

```bash
npx jest path/to/file.test.ts
npx jest excel/spreadsheet-ui-core --no-coverage
npx jest excel/solid-excel --no-coverage
```

浏览器端 e2e（Playwright，按功能点分目录）：

```bash
npm run e2e:install -w @einfach/solid-excel                 # 首次装浏览器
NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel
npm run e2e -w @einfach/solid-excel -- e2e/smoke/            # 只跑一个功能目录
```

每个 e2e 功能目录下的 `CASES.md` 是该功能点用例清单的权威说明。

刷新 WASM 产物（改了 `excel/rust/` 之后）：

```bash
npm run build:wasm -w @einfach/solid-excel
```

`wasm-pack` 的 `--out-dir` 相对 **crate 目录**而非 cwd，产物落在 `excel/solid-excel/wasm-pkg/`
—— 改那条 script 时注意这点。

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)，其中包含代码风格、changesets 流程，以及本仓的**文档分类学**
（契约 / 决策 / 提案 / 记录四类各自的生命周期规则）。

## 许可证

[MIT](./LICENSE)
