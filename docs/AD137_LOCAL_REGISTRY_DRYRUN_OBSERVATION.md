# AD-136/137/119 本地 registry 全链路 dry-run 观察

## 范围

本记录是仓库修订 `999be7c` 在 2026-08-17 的一次实际发布演练。它验证五个待发包能经
本地 registry 发布并被仓外消费者安装、解析与类型检查；不构成对真实 npm 发布、CI
发布流程或任何打包器运行时行为的结论。环境：macOS、Node v24.14.0、pnpm 10.15.1、
npm 11.9.0、verdaccio 6.9.2。

## registry 配置要点（AD-136）

verdaccio 监听 `localhost:4873`，storage 落一次性 scratch 目录。五个本仓包的 scope
条目**不设 uplink 代理**（防真 npm 上的同名占位干扰）；其余包（含 `@einfach/core`、
`@einfach/solid` peer）代理 `registry.npmjs.org`。

## 发布（AD-137 上半场）

按 `spreadsheet-ui-styles → spreadsheet-ui-core → excel-core-ts → excel-wasm →
solid-excel` 顺序，各包目录内：

```bash
pnpm publish --registry http://localhost:4873 --no-git-checks
```

五包全部以 `0.1.0` 发布成功，无部分发布残留（scratch storage 随会话丢弃，真实 npm
未被触碰）。**必须用 `pnpm publish/pack`**：实测 `npm pack` 对 `workspace:*` 原样保留
（manifest 不可安装），`pnpm pack` 重写为 `0.1.0`。

## 消费者安装与验证（AD-137 下半场 + AD-119）

空目录 + `.npmrc` 指向本地 registry，执行一次
`npm install @einfach/solid-excel@0.1.0 solid-js@1.9.12`：

- `node_modules/@einfach/` 出现全部七个包：本仓五包来自本地 registry，
  `core`、`solid` 作为 peer 自动装自 npmjs 代理。
- **AD-119**：`@einfach/excel-core-ts` 作为 solid-excel 的依赖从 registry 解析成功，
  且 `import('@einfach/excel-core-ts')` 可执行。
- `import('@einfach/excel-wasm')` 返回的 `WasmWorkbook` 为 `function`。
- `import('@einfach/solid-excel/vnext')` 在**裸 node** 下因 CSS import 报
  `Unknown file extension ".css"` —— 设计内行为（ADR 0019 刻意保留 CSS 副作用，
  该包面向打包器环境；打包器实跑归 AD-138~141 冒烟）。
- 消费者 `tsc`（`moduleResolution: Bundler`、`lib ["ESNext","DOM"]`、`types: []`、
  `jsxImportSource: solid-js`）对 `@einfach/solid-excel/vnext`、
  `/vnext-worker-factory`、`@einfach/spreadsheet-ui-core`、`@einfach/excel-wasm`
  联合类型检查零错。附注：消费者若启用默认 `@types/node` 自动引入，会撞上
  lib.dom 与 node types 的 TextEncoder/TextDecoder 已知冲突 —— 属环境组合问题，
  与本仓包无关。

## 解释边界

- registry 是一次性演练，未验证发布 workflow（AD-132）、真实凭据（D3/ADR 0016）
  或 changeset 驱动的版本流转（AD-131）。
- 未验证任何打包器（Vite/webpack/Next/Nuxt）对预编译产物的运行时消费，那是
  AD-138~141 的判定。
