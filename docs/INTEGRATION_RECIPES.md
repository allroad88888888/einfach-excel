# 宿主框架与打包工具集成配方

本指南汇集 `@einfach-excel/react-excel`、`@einfach-excel/spreadsheet-ui-core`、`@einfach-excel/xlsx` 与 11 个可选业务插件在主流 React 宿主环境中的标准接入配方。最小示例见 [五分钟上手](QUICKSTART.md)。

## 1. Vite（React 18.3 / React 19）

默认内置 Worker 经标准 ES Module URL（`new Worker(new URL(..., import.meta.url), { type: 'module' })`）工作，Vite 零额外插件即可开发与生产构建：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

> 若在 monorepo 或自定义预构建中开发，可将 `@einfach-excel/excel-wasm` 与 `@einfach-excel/xlsx` 列入 `optimizeDeps.exclude`，避免开发服务器预打包 `.wasm` 资源路径错位。

## 2. Next.js（App Router，SSR 安全挂载）

`<Spreadsheet />` 已内置 SSR 首屏渲染守卫（服务端无 `window` / `Worker` 时安全输出加载状态，客户端水合后再启动 Rust Worker）。在 App Router 中只需将其放入 `'use client'` 客户端组件：

```tsx
// app/workbook/WorkbookClient.tsx
'use client'

import { Spreadsheet } from '@einfach-excel/react-excel'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import '@einfach-excel/react-excel/style.css'

const definition: RustWorkbookDefinition = {
  title: 'Quarterly Forecast',
  sheets: [{ id: 'q1', name: 'Q1', rowCount: 500, colCount: 20 }],
  createImportChunks: () => [],
}

export function WorkbookClient() {
  return <Spreadsheet definition={definition} locale="zh" style={{ width: '100%', height: '80vh' }} />
}
```

## 3. Rspack / Webpack 5

Rspack 2+ 与 Webpack 5 原生支持 `new URL(..., import.meta.url)` 模块 Worker 与 `.wasm` 资产输出（本仓已在 [`excel/react-excel/package-consumers/rspack/`](../excel/react-excel/package-consumers/rspack) 中纳入每次 CI 的真实 tarball 回归）。

确保开启异步 WebAssembly 实验开关（Rspack 默认兼容，Webpack 5 显式声明）：

```js
// rspack.config.mjs / webpack.config.mjs
export default {
  experiments: {
    asyncWebAssembly: true,
  },
}
```

## 4. 自定义 Worker 工厂（严格 CSP / CDN 资产分离 / Full 正则引擎）

当宿主需要自行控制 Worker 入口打包路径、配置 CSP `worker-src 'self'`，或切换到包含 `REGEXEXTRACT` / `REGEXMATCH` / `REGEXREPLACE` 的 `full` WASM 变体时，传入引用稳定的 `workerFactory`：

```ts
// workbook.worker.ts
import '@einfach-excel/spreadsheet-ui-core/rust-runtime'
```

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'

const createWorker = () =>
  new Worker(new URL('./workbook.worker.ts', import.meta.url), { type: 'module' })

export function SecureWorkbook({ definition }) {
  return <Spreadsheet definition={definition} workerFactory={createWorker} style={{ height: 640 }} />
}
```

注意：`createWorker` 必须定义在组件外或用 `useCallback(..., [])` 固定引用，且每次调用必须返回**全新的** `Worker` 实例。

## 5. 按需接入 `.xlsx` 与 11 个公开业务插件速查表

所有可选包均独立发布，互不耦合。只有带独立面板样式的 3 个插件需要额外导入 `./style.css`：

| 包名 | 插件导出对象 | 附加样式导入 | 额外 Peer 依赖 | 提供的核心能力 |
| --- | --- | --- | --- | --- |
| `@einfach-excel/xlsx` | 传给 `xlsx` prop 的异步加载器 | — | — | `.xlsx` 高保真双向导入导出与转换报告 |
| `@einfach-excel/plugin-chart` | `chartPlugin` | `@einfach-excel/plugin-chart/style.css` | `echarts` | 16 类图表、深色外观、双击元素定位设置、PNG/SVG 导出 |
| `@einfach-excel/plugin-cell-appearance` | `cellAppearancePlugin` | `@einfach-excel/plugin-cell-appearance/style.css` | — | 四向斜线边框、17 种图案填充、线性/矩形渐变填充 |
| `@einfach-excel/plugin-date-picker` | `datePickerPlugin` | `@einfach-excel/plugin-date-picker/style.css` | — | 格内与公式栏日历选择器 |
| `@einfach-excel/plugin-image` | `imagePlugin` | — | — | 工作表浮动图片插入、缩放与管理 |
| `@einfach-excel/plugin-image-export` | `imageExportPlugin` | — | — | 选区复制/下载为高清 PNG 图片 |
| `@einfach-excel/plugin-sparkline` | `sparklinePlugin` | — | — | 折线、柱形、盈亏单元格迷你图 |
| `@einfach-excel/plugin-text-format` | `textFormatPlugin` | — | — | 整格/富文本分段上下标、缩小字体填充 |
| `@einfach-excel/plugin-data-sort` | `dataSortPlugin` | — | — | 自定义序列、单元格/字体颜色、条件图标、横向按行排序 |
| `@einfach-excel/plugin-data-filter` | `dataFilterPlugin` | — | — | Top-N/百分比、16 种相对日期期间、按颜色、高级筛选与复制输出 |
| `@einfach-excel/plugin-data-subtotal` | `dataSubtotalPlugin` | — | — | 分组分类汇总（`SUBTOTAL`）与自动分级大纲 |
| `@einfach-excel/plugin-data-consolidate` | `dataConsolidatePlugin` | — | — | 跨表按位置/二维标签合并计算与源数据链接公式 |

当宿主需要与工作簿共享同一个 `@einfach/core` Store 以编程式操作时，传入 `store` prop 并使用 [`createWorkbookApi(store)`](../excel/react-excel/docs/package/workbook-api.md)（图表另可从 `@einfach-excel/plugin-chart/core` 导入 `createChartApi`）。
