# 配方：Vite + vite-plugin-solid

> 事实来源：`docs/AD138_VITE_SMOKE_OBSERVATION.md`（2026-08-17 仓外冒烟，通过）、
> 最小示例在同一工程复验（见 AD-138 观察记录与 Quickstart）。
> 这是**唯一能挂 Solid 组件且走 `solid` 源码编译条件**的一条路（ADR 0019 双形态）。

## 依赖清单（冒烟实测版本）

```jsonc
// package.json
{
  "dependencies": {
    "@einfach/solid-excel": "0.1.0",
    "@einfach/core": "^0.4.0",     // peer
    "@einfach/solid": "^0.4.0",    // peer
    "solid-js": "1.9.12"           // peer；应用内只能有一份（ADR 0001）
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vite-plugin-solid": "^2.8.0"
  }
}
```

Node 基线 **>= 22.12.0**（ADR 0018；冒烟在基线下界 22.12.0 上执行）。

## 完整配置

```ts
// vite.config.ts —— 冒烟工程的全部配置，没有省略
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidPlugin()],
})
```

入口代码见 [Quickstart](../QUICKSTART.md) 的 20 行示例（或渲染 `@einfach/solid-excel/demos` 的
`VNextWorkerDemo` 看全功能外壳）。

## 关键注意点

- **build/preview 零特殊配置**：不需要 wasm 插件、不需要 worker 配置。`vite-plugin-solid` 命中包
  `exports` 的 `solid` 条件 → 从包内源码（`.tsx`）编译；worker factory 的
  `new Worker(new URL('./worker-runtime.ts', import.meta.url), { type: 'module' })`
  被 Vite 静态分析，自动切出 worker chunk 并发射 `einfach_wasm_bg-*.wasm` 资产。
  实测产物：`worker-runtime`、`worker-entry-ts` 等 worker chunk + wasm 二进制。
- worker factory 从 `@einfach/solid-excel/worker-factory` **子路径** import
  （ADR 0004，不在根入口 barrel）。
- 样式：`import '@einfach/solid-excel/styles.css'`。
- full WASM 变体（`--features regex-formulas`）：宿主用
  `import FullWorker from '@einfach/solid-excel/worker-runtime-full?worker'` 自行
  拉入（见 `worker-factory.ts` 头注释）；**未在仓外冒烟验证**。

## 未验证

- 仅 Playwright Chromium 单浏览器探针；非浏览器兼容矩阵结论。
- dev-server / HMR 长期行为（冒烟走 `vite build` + `preview`；AD-202 复验同口径。
  仓内 solid-excel 自身的 `vite dev` 日常在用，但那是 workspace 源码路径，不是 npm 包路径）。
- Vite 6/7（冒烟钉 ^5.4；Nuxt 冒烟里 vite 7.3.6 处理过同一份 wasm 资产，但那不含 Solid 编译链）。


## 已知边界:`vite dev` 需要一行配置(0.1.0)

`@einfach/solid-excel@0.1.0` 经 `@lingui/core` 传递依赖了含 CJS 的
`@messageformat/parser`,**dev 模式**的 ESM interop 会白屏(build + preview 不受影响,
零上下文走查实测)。修法(Vite 8 实测有效):

```ts
// vite.config.ts
export default defineConfig({
  plugins: [solidPlugin()],
  optimizeDeps: {
    include: [
      '@einfach/solid-excel > @lingui/core',
      '@einfach/solid-excel > @lingui/core > @messageformat/parser',
    ],
  },
})
```

（嵌套 `a > b` 写法是 pnpm 布局下的必需形态——顶层 `include: ['@lingui/core']`
解析不到非直接依赖,实测无效;本写法在 Vite 8 + pnpm 下 600 格网格实测通过。）

Vite `^5.4` 上该修法会诱发双实例症状(`SpreadsheetUiProvider is required`),暂无简单解
——dev 请用 Vite 8;或先走 `build && preview`。根治(消除运行时 CJS 传递依赖)
跟踪于仓库 issue。solid-js 版本口径:peer 为 `^1.9.12`,1.9.14 实测可用;
多副本会破坏 Provider(ADR 0001),保持单副本即可。
