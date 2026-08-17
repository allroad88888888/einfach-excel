# 五分钟上手：安装到第一个公式

> 事实来源：`docs/AD138_VITE_SMOKE_OBSERVATION.md`（仓外 Vite 冒烟）、
> 本页代码经逐行实测（build + 浏览器探针 + `=1+2` 求值,见 AD-138 观察记录）、
> 仓根 `README.md` §「Release status and stability」。

## 前提

- Node.js **>= 22.12.0**（[ADR 0018](decisions/0018-node-baseline-22-12.md)）。
- 一个 Vite + Solid 工程。没有的话：

```bash
npm create vite@latest my-sheet -- --template solid-ts
cd my-sheet
```

其它打包器（webpack/Next/Nuxt/Astro）见[配方入口页](recipes/README.md)。

## 1. 安装

```bash
npm install @einfach/solid-excel @einfach/core @einfach/solid solid-js
```

`@einfach/solid-excel@0.1.0` 会带上其余 `@einfach` 表格包（fixed group，五包同步升级；
`0.x` 阶段 minor 可能破坏兼容，需要稳定面就钉 `~0.1.0`）。`solid-js`、`@einfach/core`、
`@einfach/solid` 是 peer —— 应用里**只能各有一份**（ADR 0001 单实例不变式）。

## 2. 最小可运行示例（20 行）

替换 `src/main.tsx`（`index.html` 里有 `<div id="root">` 即可）：

```tsx
import { render } from 'solid-js/web'
import {
  createWorkerWorkbookSpreadsheetBackend,
  SpreadsheetGrid,
  SpreadsheetUiProvider,
} from '@einfach/solid-excel/vnext'
import { defaultVNextWorkbookWorkerFactory } from '@einfach/solid-excel/vnext-worker-factory'
import '@einfach/solid-excel/vnext-styles.css'

const backend = createWorkerWorkbookSpreadsheetBackend({
  workerFactory: defaultVNextWorkbookWorkerFactory,
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
})
const viewport = { scrollTop: 0, scrollLeft: 0, viewportHeight: 480, viewportWidth: 960,
  rowHeight: 24, colWidth: 96, rowCount: 50, colCount: 12, overscanRows: 2, overscanCols: 1 }
render(() => (
  <SpreadsheetUiProvider backend={backend}>
    <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
  </SpreadsheetUiProvider>
), document.getElementById('root')!)
```

三件套：

1. **worker 后端** —— `createWorkerWorkbookSpreadsheetBackend` 起一个 Web Worker，
   里面跑 Rust/WASM 公式引擎；`defaultVNextWorkbookWorkerFactory` 必须从
   `@einfach/solid-excel/vnext-worker-factory` **子路径** import
   （它依赖 `import.meta.url`，刻意不在 `/vnext` barrel 里，
   [ADR 0004](decisions/0004-worker-factory-out-of-barrel.md)）。
2. **`SpreadsheetUiProvider`** —— 建 UI store，把 backend 接进 atom 体系。
3. **`SpreadsheetGrid`** —— 虚拟化网格。`sheetId` 对应 backend `sheets` 里的 id；
   `viewport` 的 10 个字段目前全部必填。

**build + preview 路径**不需要任何 vite 配置改动：`vite-plugin-solid` 走包的 `solid` 导出条件从源码编译，
worker 与 `.wasm` 二进制由 Vite 对 `new Worker(new URL(...))` 的静态分析自动切出
（实测产物含两个 worker chunk + 1.86 MB wasm）。

## 3. 第一个公式

```bash
npm run dev
```

双击任意单元格（如 A1），输入：

```
=1+2
```

回车后 A1 显示 `3` —— 输入经 backend 端口进入 worker 里的 Rust/WASM 引擎求值，
结果投影回网格。跨表引用、函数（`=SUM(...)` 等）同理。

## 下一步

- 完整表格外壳（菜单栏、工具栏、公式栏、sheet 页签、对话框）：见
  `@einfach/solid-excel/demos` 的 `VNextWorkerDemo` 源码
  （`excel/solid-excel/src-vnext/demos/VNextWorkerDemo.tsx`），所有 chrome 组件都从
  `@einfach/solid-excel/vnext` 导出，按需挂。
- 预置数据：`createWorkerWorkbookSpreadsheetBackend` 的 `afterInit(client, sheets)`
  回调里 `client.setCell` / `client.setFormulaDetailed`。
- 不用 Solid、只要 headless UI core：[UI-core-only 路径](UI_CORE_ONLY.md)。
- 其它打包器 / 框架：[配方入口页](recipes/README.md)。


## 一键起步(模板)

- `npx degit allroad88888888/einfach-excel/templates/vite-starter my-sheet && cd my-sheet && npm i && npm run dev`
- 在线打开:[StackBlitz](https://stackblitz.com/github/allroad88888888/einfach-excel/tree/main/templates/vite-starter) · [CodeSandbox](https://codesandbox.io/s/github/allroad88888888/einfach-excel/tree/main/templates/vite-starter)
- 模板即本页 20 行示例,已在 Node 22.12.0 + 官方 registry 上离体验证构建。


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
