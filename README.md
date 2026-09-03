# einfach-excel

一个以 Rust/WASM 为工作簿引擎、以 Einfach atoms 为展现状态核心的在线表格项目。

当前唯一产品主线是：

```text
excel/react-excel
  → @einfach/spreadsheet-ui-core
  → Rust Worker / @einfach/excel-wasm
  → einfach-excel-core
```

`solid-excel` 及依赖它的旧 `excel-site` 已暂停。源码仍在仓库中供考古，但它们不参与默认
构建、测试、提交门禁、CI、发布，也不是 React 改动的兼容目标。

## 分层

- Rust：工作簿值、公式、依赖图、计算、事务和变更结果的唯一事实源。
- `spreadsheet-ui-core`：框架无关的选区、编辑、视口、投影和语义 command atoms。
- `react-excel`：React 渲染、DOM 事件、焦点、滚动、测量和产品启动。
- `rust-worker`：只做 Worker 请求/响应关联、错误传播和释放。

一次用户操作应尽量只有一条链：

```text
DOM 事件 → 一个 UI Core command atom → 一次 Rust 请求 → 发布结果 → React 重渲染
```

不要为假想的第二实现提前建立 backend、adapter、bridge、port 或生命周期框架。

## 目录

| 目录 | 状态 | 职责 |
|---|---|---|
| `excel/react-excel/` | 当前主线 | 完整 React 产品与 Vite 演示 |
| `excel/spreadsheet-ui-core/` | 当前主线 | UI atoms、Rust 命令和 Worker 传输 |
| `excel/rust/excel-core/` | 当前主线 | Rust 工作簿与公式引擎 |
| `excel/rust/wasm/` | 当前主线 | Rust 到浏览器的 WASM 绑定 |
| `excel/excel-wasm/` | 当前主线 | wasm-pack JavaScript 包装产物入口 |
| `excel/spreadsheet-ui-styles/` | 维护中 | 跨框架表格视觉样式 |
| `excel/excel-core-ts/` | 参照实现 | TypeScript parity 参照，不接入 React 运行时 |
| `excel/vue-excel/` | 独立实验 | Vue 视图，不参与 React 主线门禁 |
| `excel/solid-excel/` | 已暂停 | 仅保留源码考古 |
| `excel/excel-site/` | 已暂停 | 依赖 Solid 的旧站点 |

## 启动 React 演示

要求 Node.js >= 22.12、pnpm 10，以及 Rust、`wasm32-unknown-unknown` 和 `wasm-pack`。

```bash
pnpm install
npm run ensureWasm
pnpm --filter @einfach/react-excel dev
```

Vite 输出的本地地址就是当前 demo。

## 校验

```bash
pnpm check:presentation
pnpm typecheck:mainline
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
pnpm check:cycles
```

`check:presentation` 是机械边界门禁：React 不得自建 spreadsheet atom、不得用
`useState/useReducer` 存表格状态、不得绕过 `@einfach/react` 直调 store；UI Core 不得依赖
React/Solid/Vue。它不试图判断所有架构好坏，抽象是否必要由
[`excel/react-excel/SKILL.md`](./excel/react-excel/SKILL.md) 的短规则审查。

根命令：

```bash
pnpm build       # Rust/WASM 依赖、库产物、React 类型与 Vite 构建
pnpm test        # 当前维护测试；不发现已暂停的 Solid/旧站点
pnpm lint:check
pnpm check:docs
```

## 文档

- [架构与单元格编辑链](./docs/ARCHITECTURE.md)
- [React 产品说明](./excel/react-excel/README.md)
- [UI Core 说明](./excel/spreadsheet-ui-core/README.md)
- [Rust/WASM 构建](./excel/rust/wasm/README.md)
- [贡献指南](./CONTRIBUTING.md)
- [架构决策](./docs/decisions/README.md)

MIT
