# 配方：webpack 5（预编译 ESM 路径）

> 事实来源：`docs/AD139_WEBPACK_SMOKE_OBSERVATION.md`（2026-08-17 仓外冒烟，通过）
> 及该冒烟工程的实际配置文件。webpack 没有 `solid` 导出条件，`exports` 解析落到
> `import`/`default` → 消费包内**预编译 ESM**（`esm/` 目录 `.mjs`）—— ADR 0019
> 双形态的另一半，正是为这类打包器准备的。

## 依赖清单（冒烟实测版本）

```jsonc
// package.json
{
  "dependencies": {
    "@einfach/solid-excel": "0.1.0",
    "@einfach/core": "^0.4.0",
    "@einfach/solid": "^0.4.0",
    "solid-js": "1.9.12"
  },
  "devDependencies": {
    "webpack": "^5.94.0",          // 实测解析到 5.109.2
    "webpack-cli": "^5.1.4",
    "html-webpack-plugin": "^5.6.0",
    "css-loader": "^7.1.2",
    "style-loader": "^4.0.0"
  }
}
```

Node >= 22.12.0（冒烟在 22.12.0 下界执行）。

## 完整配置

```js
// webpack.config.cjs —— 冒烟工程的全部配置，没有省略
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/main.js',
  output: { clean: true },
  module: {
    rules: [{ test: /\.css$/, use: ['style-loader', 'css-loader'] }],
  },
  plugins: [new HtmlWebpackPlugin({ template: './src/index.html' })],
}
```

```js
// src/main.js —— 纯 JS 入口，无 JSX、无 Solid 编译插件
import { createComponent, render } from 'solid-js/web'
import { VNextWorkerDemo } from '@einfach/solid-excel/demos'
import '@einfach/solid-excel/vnext-styles.css'

render(() => createComponent(VNextWorkerDemo, {}), document.getElementById('root'))
```

`webpack --mode production` 一次构建通过。

## 关键注意点

- **不要加 `solid` resolve condition**：冒烟刻意没加，也不需要 —— 加了反而会把
  未编译的 `.tsx` 源码拉进没有 Solid 编译链的 webpack。
- worker / wasm **零配置**：包内 `new Worker(new URL('./worker-runtime.mjs',
  import.meta.url), { type: 'module' })` 被 webpack 5 静态识别自动切 worker chunk；
  `einfach_wasm_bg.wasm` 经 asset module 自动发射（1.78 MiB）。无需 asset/resource 规则。
- CSS 必须有 loader 链（css-loader + style-loader）；包的
  `sideEffects: ["**/*.css"]` 保住样式不被 tree-shaking 摇掉。
- 无 JSX 的组合方式：用 `createComponent(Comp, props)`。要写自己的 Solid JSX 就得接
  `babel-preset-solid`（**未验证**）。
- 244 KiB 体积上限 warning 属预期（wasm 1.78 MiB），非错误。

## 未验证

- webpack + babel-preset-solid 自写 JSX 的组合。
- dev-server / HMR（冒烟为 production 单次构建 + http-server 静态服务）。
- full WASM 变体、TS worker 后端的浏览器实跑（TS worker chunk 已确认能正常切出）。
- 浏览器仅 Chromium headless。
