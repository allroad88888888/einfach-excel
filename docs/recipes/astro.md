# 配方：Astro 静态站 + Solid island

> 事实来源：`excel/excel-site/astro.config.mjs`（本仓文档站的真实配置）、
> `excel/excel-site/src/spreadsheet/backends.ts`、`excel/excel-site/src/pages/index.astro`、
> [ADR 0007](../decisions/0007-astro-static-site-with-solid-wasm-islands.md)。
> **口径注意**：excel-site 是**仓内**消费方（vite alias 指到 workspace 源码），
> 不是从 npm 装的包。「Astro + 已发布 npm 包」这条组合**未做过仓外冒烟** ——
> 本配方给出的是仓内验证过的结构与配置，外部套用时的差异点在文末列明。

## 结构（ADR 0007）

- Astro 输出静态页面承载正文/导航（SEO 可索引），Solid 只用于交互 islands。
- 表格 island 用 `client:only="solid-js"` 装载 —— worker + WASM 链路只在浏览器起，
  天然规避 SSR（Astro 不会尝试在 node 里跑它）：

```astro
---
import DemoIsland from '../spreadsheet/DemoIsland'
---
<DemoIsland client:only="solid-js" demoId="viewport-projection" />
```

- island 内部照常用三件套（backend + Provider + Grid）。worker factory 依旧走子路径
  （ADR 0004），站内真实写法：

```ts
// src/spreadsheet/backends.ts（节选，仓内实文件）
import { createWorkerWorkbookSpreadsheetBackend } from '@einfach/solid-excel'
import { defaultVNextWorkbookWorkerFactory } from '@einfach/solid-excel/worker-factory'

export function makeWasmWorkerBackend(options?: WorkerWorkbookSpreadsheetBackendOptions) {
  return createWorkerWorkbookSpreadsheetBackend({
    workerFactory: defaultVNextWorkbookWorkerFactory,
    ...options,
  })
}
```

## 完整配置（仓内实文件，标注哪些是仓内特有）

```js
// astro.config.mjs（excel-site 实际配置；★ = 仓内 workspace 消费特有，外部不需要）
import { defineConfig } from 'astro/config'
import solid from '@astrojs/solid-js'
import vue from '@astrojs/vue'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/einfach-excel' : '', // 子路径部署才需要
  integrations: [solid(), vue()],
  vite: {
    plugins: [wasm(), topLevelAwait()],
    resolve: {
      // ★ 仓内把 @einfach/* 指到 workspace 源码目录的 alias 全部省略
      dedupe: ['solid-js'], // 单实例不变式（ADR 0001），保留
    },
    optimizeDeps: {
      exclude: ['@einfach/solid-excel', '@einfach/solid-excel/worker-factory'],
    },
    build: {
      target: 'esnext',
      cssCodeSplit: false, // ADR 0007：必要约束，避免预加载已被 Astro 内联的对话框样式
    },
  },
})
```

（实文件还有 Vue integration 与 `server.fs.allow`：前者保留站内 Vue adapter demo，后者允许读取
workspace 源码。React 是独立私有 Rust-only Vite 产品；本站不注册 `@astrojs/react`，也不提供
React demo。）

## 已验证 / 未验证

仓内已验证（ADR 0007 + 站点日常构建）：

- `astro build` 静态产物 + 真实浏览器加载：worker/WASM 初始化、网格渲染无控制台错误。
- `client:only="solid-js"` island 是经受验证的挂载方式。
- `cssCodeSplit: false` 与 `dedupe: ['solid-js']` 是两条实际踩过的必要约束。

未验证（如实告知）：

- **从 npm 安装五个 0.1.0 包 + Astro** 的组合没有仓外冒烟。特别地：
  `vite-plugin-wasm` / `vite-plugin-top-level-await` 在 npm 包消费路径下是否仍必要
  未知 —— AD-138 证明纯 Vite5 + vite-plugin-solid 消费 npm 包时**不需要**它们，
  但 Astro 的 vite 版本与依赖处理不同，不能外推。
- Astro dev server 行为（ADR 0007 记录过它在自动化环境过早退出；验收一律走
  `astro build` + 静态服务器）。
- `@astrojs/solid-js` 是否命中包 `exports` 的 `solid` 条件（源码编译 vs 预编译 ESM
  哪条路生效）未在 npm 消费路径上确认 —— 双形态（ADR 0019）保证两条都应能用，
  但「应能」不是「验过」。
