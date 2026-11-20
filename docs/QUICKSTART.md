# 五分钟上手：安装到第一个公式

> 事实来源：[`excel/react-excel/docs/package/README.md`](../excel/react-excel/docs/package/README.md)、
> [`excel/react-excel/docs/package/workbook-api.md`](../excel/react-excel/docs/package/workbook-api.md)，以及
> [`excel/react-excel/package-consumers/host/app.tsx`](../excel/react-excel/package-consumers/host/app.tsx)
> 中的 Vite 与 Rspack 真实打包消费验收用例。

## 前提

- 已发布包消费者基线：Node.js **>= 22.12.0**（[ADR 0018](decisions/0018-node-baseline-22-12.md)）；仓库本地开发要求 Node.js **>= 22.19.0**。
- 一个 **React 18.3 或 React 19** + Vite / Next.js / Rspack / Webpack 工程。

## 1. 安装

```bash
pnpm add @einfach-excel/react-excel @einfach-excel/spreadsheet-ui-core @einfach/core @einfach/react react react-dom
```

`react`、`react-dom`、`@einfach/core`、`@einfach/react`、`@einfach-excel/spreadsheet-ui-core` 为 peer dependencies，宿主应用里每个包须保持单实例。默认内置 Worker 会自动加载预编译的 `@einfach-excel/excel-wasm`（`lite` 变体），宿主无需安装 Rust 工具链或配置专属 WASM loader。

## 2. 最小可运行示例

在宿主组件中引入样式并挂载 `<Spreadsheet />`：

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import '@einfach-excel/react-excel/style.css'

const definition: RustWorkbookDefinition = {
  title: 'My workbook',
  sheets: [{ id: 'sheet-1', name: 'Sheet1', rowCount: 1000, colCount: 26 }],
  createImportChunks: () => [[
    { sheet: 0, row: 0, col: 0, kind: 'number', value: 1 },
    { sheet: 0, row: 0, col: 1, kind: 'number', value: 2 },
    { sheet: 0, row: 0, col: 2, kind: 'formula', value: '=A1+B1' },
  ]],
}

export function App() {
  return (
    <div style={{ height: 640 }}>
      <Spreadsheet definition={definition} renderer="dom" locale="zh" />
    </div>
  )
}
```

核心说明：

1. **宿主容器尺寸** —— `<Spreadsheet />` 默认填满父容器（`width: 100%; height: 100%`），建议给外层容器设置明确高度，或直接传入 `style={{ width: '100%', height: 640 }}`。
2. **`definition` 引用稳定** —— 请将 `definition` 定义在组件外部或通过 `useMemo` 固定引用；更换 `definition` 引用会销毁旧实例并启动新的工作簿运行时。
3. **独立实例隔离与 SSR 安全** —— 每个 `<Spreadsheet />` 在浏览器端创建独立的 `@einfach/core` Store 与 Web Worker，卸载时自动终止 Worker；在无 `window` / `Worker` 的 SSR 首屏渲染时会自动降级输出加载占位，客户端水合后再启动引擎。
4. **双渲染表面与语言** —— `renderer` 支持 `"dom"`（默认）或 `"canvas"`；`locale` 支持 `"en"` 或 `"zh"`（不传时用户可在界面右上角自由切换）。

## 3. 第一个公式

启动开发服务器后，你会看到 `C1` 已由 Worker 中的 Rust/WASM 引擎计算出 `3`。
双击任意空白单元格（如 `A2`），输入：

```text
=SUM(A1:C1)*10
```

回车后，输入经由 `commitCellEditingAtom` → `connection.request('cell.setInput')` 进入 Worker 内的 Rust 引擎求值，并以同修订版有界投影刷新回视图，显示 `60`。

## 4. 按需启用 `.xlsx` 导入导出与可选业务插件

主包体积不包含 `.xlsx` 转换器与进阶业务插件。需要时按需安装并通过 `xlsx` / `plugins` 注入：

```bash
pnpm add @einfach-excel/xlsx @einfach-excel/plugin-date-picker @einfach-excel/plugin-data-filter
```

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'
import { datePickerPlugin } from '@einfach-excel/plugin-date-picker'
import { dataFilterPlugin } from '@einfach-excel/plugin-data-filter'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import '@einfach-excel/react-excel/style.css'
import '@einfach-excel/plugin-date-picker/style.css'

const loadXlsx = async () => {
  const xlsx = await import('@einfach-excel/xlsx')
  await xlsx.default()
  return xlsx
}

const plugins = [datePickerPlugin, dataFilterPlugin] as const

export function WorkbookWithExtras({ definition }: { definition: RustWorkbookDefinition }) {
  return <Spreadsheet definition={definition} xlsx={loadXlsx} plugins={plugins} style={{ height: 640 }} />
}
```

## 5. 从仓库本地 checkout 直接体验

如果你想直接在仓库内启动完整的 React 电子表格工作台（加 `?plugins=all&locale=zh` 可一次挂载全部 11 个业务插件）：

```bash
pnpm install
npm run ensureWasm
pnpm --filter @einfach-excel/react-excel dev
```

## 下一步

- Next.js App Router、Rspack/Webpack、CSP 自定义 Worker 与全部 11 个插件接入表：见 [宿主框架集成配方](INTEGRATION_RECIPES.md)。
- 编程式读写、拦截钩子、暂停重绘/计算与宿主控制：见 [Workbook API](../excel/react-excel/docs/package/workbook-api.md) 与 [React 组件包消费指南](../excel/react-excel/docs/package/README.md)。
- 自己组合无头 UI Core 与自定义视图层：见 [直接使用 `@einfach-excel/spreadsheet-ui-core`](UI_CORE_ONLY.md)。
- 架构分层与命令链路：见 [架构说明](ARCHITECTURE.md)。
