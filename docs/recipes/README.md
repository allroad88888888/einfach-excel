# 框架配方入口与选型

> 事实来源：`docs/AD138~AD141_*_SMOKE_OBSERVATION.md` 四份仓外冒烟记录、
> [ADR 0019](../decisions/0019-solid-excel-dual-form-artifacts.md)（双形态交付）、
> 仓根 `README.md` §「Release status and stability」。
> 所有配方只写验证过的东西；每份文末都有自己的「未验证」清单。

## 先回答：你要什么？

| 你要的 | 走哪条 | 配方 |
| --- | --- | --- |
| 完整表格 UI（网格、公式栏、对话框） | Solid 组件 + worker 引擎 | `recipe-vite.md`（首选）或 `recipe-webpack.md` |
| 静态文档站里嵌交互表格 | Astro + Solid island | `recipe-astro.md` |
| React（Next）项目里要公式引擎 / headless 状态层 | 引擎包 + UI core，**不挂 Solid 组件** | `recipe-next.md` |
| Vue（Nuxt）项目里要公式引擎 / headless 状态层 | 同上 | `recipe-nuxt.md` |
| 只要框架无关状态层，数据源自己接 | 单包 `@einfach/spreadsheet-ui-core` | [UI-core-only](../UI_CORE_ONLY.md) |
| 五分钟先跑起来 | Vite + 20 行示例 | [Quickstart](../QUICKSTART.md) |

一条硬边界，四份配方各自重复过，这里再说一次：**`@einfach/solid-excel` 的组件只能
挂在 Solid 运行时里**。React/Vue 框架下它仅「可安装解析」（peer 可消解），组件不渲染；
那两条配方给的是引擎与 UI core 的用法。

## 双形态（ADR 0019）怎么在各配方里起作用

`@einfach/solid-excel` 每个入口在 `exports` 里成对给出两种形态：

- **`solid` 条件 → 源码（`.tsx`/`.ts`）**：装了 `vite-plugin-solid` 的消费者命中，
  由你的构建编译，Solid 生态标准做法（编译最优）。→ `recipe-vite.md`（AD-138 验证）。
- **`import`/`default` → 预编译 ESM（`esm/*.mjs`）**：没有 `solid` 条件的一切打包器
  落到这里，开箱即用、无需 Solid 编译链。→ `recipe-webpack.md`（AD-139 验证，
  含纯 JS 无 JSX 消费方式）。

Next/Nuxt 配方不受双形态影响（不消费 Solid 组件）；Astro 配方理论上两条都可达，
npm 消费路径未冒烟（见该配方「未验证」）。

## 所有路径共同的事实

- 五个包 `0.1.0`（2026-08-17 发布）是 **fixed group**：混版本不受支持，五包一起升。
  `0.x` 阶段 minor 可能破坏兼容，要稳定面钉 `~0.1.0`。
- Node **>= 22.12.0**（ADR 0018）；四份冒烟全部在基线下界 22.12.0 上执行。
- `solid-js` / `@einfach/core` / `@einfach/solid` 是 peer，应用内**各只能一份**
  （ADR 0001）；打包器给 `dedupe: ['solid-js']` 一类保险不亏。
- worker factory 一律从 `@einfach/solid-excel/vnext-worker-factory` 子路径 import
  （ADR 0004，不在 barrel）。
- 面向打包器环境交付；bare-Node 直接 `import` 不支持（仓根 README）。
- WASM 二进制（lite 约 1.8~2.2 MB，随打包器口径浮动）由 Vite/webpack 对
  `new URL(..., import.meta.url)` 的静态处理自动发射 —— 四份冒烟均零 wasm 特殊配置。
- 四份冒烟的浏览器探针均为 Playwright Chromium 单环境；不构成浏览器兼容矩阵结论。
