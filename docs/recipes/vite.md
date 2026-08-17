# 配方：Vite + vite-plugin-solid

> 事实来源：`docs/AD138_VITE_SMOKE_OBSERVATION.md`（2026-08-17 仓外冒烟，通过）、
> `ad200/verification.md`（最小示例在同一工程复验）。
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

入口代码见 `quickstart.md` 的 20 行示例（或渲染 `@einfach/solid-excel/demos` 的
`VNextWorkerDemo` 看全功能外壳）。

## 关键注意点

- **零特殊配置**：不需要 wasm 插件、不需要 worker 配置。`vite-plugin-solid` 命中包
  `exports` 的 `solid` 条件 → 从包内源码（`.tsx`）编译；worker factory 的
  `new Worker(new URL('./worker-runtime.ts', import.meta.url), { type: 'module' })`
  被 Vite 静态分析，自动切出 worker chunk 并发射 `einfach_wasm_bg-*.wasm` 资产。
  实测产物：`worker-runtime`、`worker-entry-ts` 等 worker chunk + wasm 二进制。
- worker factory 从 `@einfach/solid-excel/vnext-worker-factory` **子路径** import
  （ADR 0004，不在 `/vnext` barrel）。
- 样式：`import '@einfach/solid-excel/vnext-styles.css'`。
- full WASM 变体（`--features regex-formulas`）：宿主用
  `import FullWorker from '@einfach/solid-excel/vnext-worker-runtime-full?worker'` 自行
  拉入（见 `worker-factory.ts` 头注释）；**未在仓外冒烟验证**。

## 未验证

- 仅 Playwright Chromium 单浏览器探针；非浏览器兼容矩阵结论。
- dev-server / HMR 长期行为（冒烟走 `vite build` + `preview`；AD-202 复验同口径。
  仓内 solid-excel 自身的 `vite dev` 日常在用，但那是 workspace 源码路径，不是 npm 包路径）。
- Vite 6/7（冒烟钉 ^5.4；Nuxt 冒烟里 vite 7.3.6 处理过同一份 wasm 资产，但那不含 Solid 编译链）。
