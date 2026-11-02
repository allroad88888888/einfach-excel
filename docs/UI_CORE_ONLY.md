# 直接使用 @einfach-excel/spreadsheet-ui-core

UI Core 直接围绕 Rust Worker connection 工作，不再提供“自己实现任意 backend”的聚合接口。
框架层可以换成 React、Vue 等 Einfach 绑定，但工作簿引擎固定走 Rust/WASM。

## Vite 接入

```ts
import { createSpreadsheetUi, createRustWorkbookConnection } from '@einfach-excel/spreadsheet-ui-core'
import RustWorkbookWorker from '@einfach-excel/spreadsheet-ui-core/rust-runtime?worker'

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

实际产品通常把 `connection.dispose()` 放在框架生命周期 cleanup 中，并在初始化完成后渲染网格。
React 主线的完整宿主封装见 [`excel/react-excel/src/Spreadsheet.tsx`](../excel/react-excel/src/Spreadsheet.tsx) 与 [`excel/react-excel/src/page/WorkbookRuntimeProvider.tsx`](../excel/react-excel/src/page/WorkbookRuntimeProvider.tsx)。

## Atom 使用方式

投影和编辑视图不要直接调用 `connection.request`。它们使用 UI Core 的 command atom：

- `runVisibleProjectionAtom` 读取可见区；
- `commitCellEditingAtom` 提交当前编辑；
- `retryCellEditingRefreshAtom` 只重试已确认写入后的投影刷新；
- `spreadsheetRuntimeAtom` 提供 loading / ready / error 状态。

框架通过自己的 Einfach binding 读取和写入 atom：

- React：`@einfach/react`（主线）
- Vue：对应的 Einfach Vue binding（`excel/vue-excel` 实验线）
- Solid：`@einfach/solid`（`excel/solid-excel` 已暂停）

框架包只负责 DOM/Canvas、事件、焦点和测量，不复制工作簿数据。

## 当前命令范围

所有跨 Worker 的业务动作都在 `excel/spreadsheet-ui-core/src/rust-workbook/protocol.ts` 的
`RustWorkbookCommandMap` 中定义为强类型命令（涵盖工作簿初始化与分块导入、可见区投影、单元格与区域编辑、
剪贴板与选择性粘贴、序列填充、格式化、撤销重做、行列尺寸与冻结拆分、排序筛选、查找替换、数据验证、
条件格式、结构化表、定义名称、批注、大纲分组、保护及文件导入导出），并在
`excel/spreadsheet-ui-core/src/rust-workbook/` 中提供对应的 UI Core command atoms。不会通过恢复一个包含
大量可选方法的 `SpreadsheetBackend` 对象来做多后端兼容。

请求、结果和显示类型仍从包根导出，源码按职责位于
`excel/spreadsheet-ui-core/src/contracts/`。目录名表示引擎边界的数据合同，不代表存在
`SpreadsheetBackend` 接口。
