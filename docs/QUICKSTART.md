# 五分钟上手：安装到第一个公式

> 事实来源：[`excel/react-excel/docs/package/README.md`](../excel/react-excel/docs/package/README.md)、
> [`excel/react-excel/README.md`](../excel/react-excel/README.md)，以及 `excel/react-excel/e2e/package-consumers/`
> 中的 Vite 与 Next.js 真实打包消费验收用例。

## 前提

- 已发布包消费者基线：Node.js **>= 22.12.0**（[ADR 0018](decisions/0018-node-baseline-22-12.md)）；仓库本地开发要求 Node.js **>= 22.19.0**。
- 一个 React 18/19 + Vite（或 Next.js Client Component）工程。

## 1. 安装

```bash
pnpm add @einfach-excel/react-excel @einfach/core @einfach/react react react-dom
```

`react`、`react-dom`、`@einfach/core`、`@einfach/react` 为 peer dependencies，宿主应用里每个包应保持单实例。
`@einfach-excel/react-excel` 会自动解析其依赖的 `@einfach-excel/spreadsheet-ui-core` 与 `@einfach-excel/excel-wasm`（默认使用 `lite` WASM 引擎）。

## 2. 最小可运行示例

在宿主组件中引入样式并挂载 `<Spreadsheet />`：

```tsx
import {
  Spreadsheet,
  type ProductWorkbookDefinition,
} from '@einfach-excel/react-excel'
import '@einfach-excel/react-excel/styles.css'

const definition: ProductWorkbookDefinition = {
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
  cells: [
    { sheet: 0, row: 0, col: 0, kind: 'number', value: 1 },
    { sheet: 0, row: 0, col: 1, kind: 'number', value: 2 },
    { sheet: 0, row: 0, col: 2, kind: 'formula', value: '=A1+B1' },
  ],
}

export function App() {
  return (
    <div style={{ height: 640 }}>
      <Spreadsheet definition={definition} renderer="dom" locale="zh-CN" />
    </div>
  )
}
```

核心说明：

1. **宿主容器尺寸** —— `<Spreadsheet />` 默认填满父容器（`width: 100%; height: 100%`），建议给外层容器设置明确高度（或传入 `style={{ height: 640 }}`）。
2. **独立实例隔离** —— 每个 `<Spreadsheet />` 实例在内部创建独立的 `@einfach/core` Store 与 Rust/WASM Web Worker，并在组件卸载时自动调用 `dispose()` 终止 Worker。
3. **双渲染表面** —— `renderer` 支持 `"dom"`（默认）或 `"canvas"`（基于 `@einfach-excel/canvas` 的 Canvas 2D 网格表面）。
4. **Next.js 接入** —— `<Spreadsheet />` 依赖浏览器 DOM 与 Web Worker，在 Next.js App Router 中请放在标记了 `'use client'` 的客户端组件内渲染。

## 3. 第一个公式

启动开发服务器后，你会看到 `C1` 已由 Worker 中的 Rust/WASM 引擎计算出 `3`。
双击任意空白单元格（如 `A2`），输入：

```text
=SUM(A1:C1)*10
```

回车后，输入经由 `commitCellEditingAtom` → `connection.request('cell.setInput')` 进入 Worker 内的 Rust 引擎求值，并以同修订版有界投影刷新回视图，显示 `60`。

## 4. 按需启用 `.xlsx` 导入导出（可选）

默认主包不包含 `.xlsx` 解析器体积。若产品菜单需要 `.xlsx` 文件打开与下载，在宿主工程中按需引入 `@einfach-excel/xlsx` 并传给 `xlsx` prop：

```tsx
import { Spreadsheet } from '@einfach-excel/react-excel'
import * as xlsx from '@einfach-excel/xlsx'

export function WorkbookWithXlsx({ definition }) {
  return <Spreadsheet definition={definition} xlsx={xlsx} />
}
```

## 5. 从仓库本地 checkout 直接体验

如果你想直接在仓库内启动完整的 React 电子表格工作台：

```bash
pnpm install
npm run ensureWasm
pnpm --filter @einfach-excel/react-excel dev
```

## 下一步

- 宿主 Props、多实例嵌入、主题与插件扩展：见 [React 组件包消费指南](../excel/react-excel/docs/package/README.md) 与 [React 产品说明](../excel/react-excel/README.md)。
- 自己组合无头 UI Core 与自定义视图层：见 [直接使用 `@einfach-excel/spreadsheet-ui-core`](UI_CORE_ONLY.md)。
- 架构分层与命令链路：见 [架构说明](ARCHITECTURE.md)。
