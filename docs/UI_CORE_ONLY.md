# 直接使用 @einfach/spreadsheet-ui-core

UI Core 现在直接围绕 Rust Worker connection 工作，不再提供“自己实现任意 backend”的聚合接口。
框架层可以换成 React、Solid 或 Vue，但工作簿引擎固定走 Rust/WASM。

## Vite 接入

```ts
import { createSpreadsheetUi, createRustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import RustWorkbookWorker from '@einfach/spreadsheet-ui-core/rust-runtime?worker'

const connection = createRustWorkbookConnection(() => new RustWorkbookWorker())

await connection.request('workbook.initialize', {
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
})
await connection.request('workbook.importCells', {
  cells: [
    { sheet: 0, row: 0, col: 0, kind: 'number', value: 1 },
    { sheet: 0, row: 0, col: 1, kind: 'number', value: 2 },
    { sheet: 0, row: 0, col: 2, kind: 'formula', value: '=A1+B1' },
  ],
})

const ui = createSpreadsheetUi({ connection })
// ui.store: @einfach/core Store
// ui.connection: 当前 Rust Worker connection

// 应用销毁时释放 Worker。
connection.dispose()
```

实际产品通常把 `connection.dispose()` 放在框架 effect 的 cleanup 中，并在初始化完成后才渲染网格。
React 的完整接法见 `excel/react-excel/src/app/App.tsx`。

## Atom 使用方式

投影和编辑视图不要直接调用 `connection.request`。它们使用 UI Core 的 command atom：

- `runVisibleProjectionAtom` 读取可见区；
- `commitCellEditingAtom` 提交当前编辑；
- `retryCellEditingRefreshAtom` 只重试已确认写入后的投影刷新；
- `spreadsheetRuntimeAtom` 提供 loading / ready / error 状态。

框架通过自己的 Einfach binding 读取和写入 atom：

- React：`@einfach/react`
- Solid：`@einfach/solid`
- Vue：使用对应的 Einfach Vue binding

框架包只负责 DOM、事件、焦点和测量，不复制工作簿数据。

## 当前命令范围

当前 Rust connection 只定义初始化、分块导入、可见区投影和单元格写入。剪贴板、格式、历史、
工作表结构等功能会在 Rust 命令确定后逐条接入；不会通过恢复一个包含大量可选方法的 backend
对象来做兼容。

请求、结果和显示类型仍从包根导出，源码按职责位于
`excel/spreadsheet-ui-core/src/backend/`。目录名表示引擎边界的数据合同，不代表存在
`SpreadsheetBackend` 接口。
