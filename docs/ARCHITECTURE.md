# 架构

当前维护主线是一套 Rust 绑定的表格 UI Core，React 负责把 atom 接到产品视图；工作簿值、
公式和计算状态只存在于 Rust/WASM。

## 分层

```text
React 视图 (@einfach-excel/react-excel)
  ├─ DOM 网格表面 / @einfach-excel/react-cells
  └─ Canvas 2D 网格表面 (@einfach-excel/canvas + @einfach-excel/canvas-cells)
        ↓ @einfach/react atom hooks (useAtomValue / useSetAtom)
spreadsheet-ui-core
  ├─ feature atoms            选区、编辑、视口、投影生命周期与功能面板状态
  ├─ rustWorkbookConnectionAtom
  └─ rust-workbook            类型化业务命令与 command atoms
        ↓
rust-worker                   纯 Worker RPC 传输
        ↓
rust-runtime.ts               Worker 入口
        ↓
@einfach-excel/excel-wasm → Rust einfach-excel-core (及 einfach-core)
```

当前完整产品是 `excel/react-excel`。它对外导出 `<Spreadsheet />` 组件与定义工厂，内部通过
`@einfach/react` 的 `useAtomValue` / `useSetAtom` 渲染 UI Core；不会在 React 包内建立第二套
工作簿 atom。

`solid-excel` 及依赖它的 `excel-site` 已暂停：源码保留考古，但退出默认构建、测试、CI、
发布和兼容范围。`vue-excel` 是独立视图实验，不参与 React 主线门禁。未来若恢复某个框架，
应直接使用该框架的 Einfach atom binding，不得恢复一套 `SpreadsheetBackend`。

## 各目录职责

| 目录 | 唯一职责 |
|---|---|
| `excel/spreadsheet-ui-core/src/backend/` | 表格请求、结果和显示类型；这里只是数据契约类型，不是 backend 对象 |
| `excel/spreadsheet-ui-core/src/runtime/` | store 内的连接引用和 loading/ready/error 生命周期 |
| `excel/spreadsheet-ui-core/src/projection/` | 投影排队、关联和发布 |
| `excel/spreadsheet-ui-core/src/editing/` | 编辑草稿与一次 Rust 提交事务 |
| `excel/spreadsheet-ui-core/src/rust-workbook/` | UI 形状的 Rust 工作簿命令协议（`RustWorkbookCommandMap`）、command atoms 与 Worker 端分发执行 |
| `excel/spreadsheet-ui-core/src/rust-worker/` | 与表格业务无关的 Worker RPC |
| `excel/spreadsheet-ui-core/src/rust-runtime.ts` | 装载 WASM 并安装 Worker 消息处理器 |
| `excel/react-excel/src/Spreadsheet.tsx`、`excel/react-excel/src/page/` | 对外 `<Spreadsheet />` 组件入口、每个实例独立的 Store + Worker 组装与卸载清理 |
| `excel/react-excel/src/product/` | 产品工作簿定义和演示数据初始化 |
| `excel/react-excel/src/workbook/` | React 渲染与 DOM/Canvas 事件适配 |
| `packages/react-cells/`、`packages/canvas/`、`packages/canvas-cells/` | DOM 单元格表面插件、Canvas 2D 网格内核与 Canvas 单元格表面插件 |
| `excel/rust/xlsx/`、`excel/xlsx-wasm/` | Rust `.xlsx` 读写引擎与按需注入宿主组件的 `@einfach-excel/xlsx` WASM 包 |

`@einfach/core` 和 `@einfach/react` 来自
[einfach 主仓](https://github.com/allroad88888888/einfach)。本仓只消费它们。

## 命令边界

UI Core 不再导出 `SpreadsheetBackend` 能力大对象。一个 store 只绑定
`RustWorkbookConnection`，连接只有两个传输操作：`request` 和 `dispose`。

所有跨 Worker 的业务动作都在 `excel/spreadsheet-ui-core/src/rust-workbook/protocol.ts` 的
`RustWorkbookCommandMap` 中声明为强类型命令。核心生命周期与编辑主干命令为：

| 命令 | 发起方 | 结果 |
|---|---|---|
| `workbook.initialize` | 宿主/产品启动流程 | 工作表元数据 |
| `workbook.importCells` | 宿主/产品启动流程 | 一批 Rust 导入统计 |
| `projection.readVisible` | 投影 command atom | 有界 `VisibleProjectionResult` |
| `cell.setInput` | 编辑 command atom | 精确 mutation ACK + 同修订版可见区投影 |

在此之上，工作表管理（`sheet.*`）、单元格与区域格式（`cell.*`、`range.*`）、剪贴板与填充
（`clipboard.*`、`fill.*`）、历史撤销重做（`history.*`）、行列尺寸与冻结拆分（`view.*`）、
排序筛选与查找替换（`sort.*`、`filter.*`、`find.*`）、数据验证（`validation.*`）、条件格式
（`conditionalFormat.*`）、结构化表（`table.*`）、定义名称（`definedName.*`）、批注（`comment.*`）、
分组大纲（`outline.*`）、保护（`protection.*`）、公式辅助（`formula.*`）以及文件导入导出
（`file.*`）均作为具名类型化命令与对应的 UI Core command atoms 运行在同一条 Worker 通道上。

新增功能应增加明确命令及对应 command atom。不要向连接堆可选方法，也不要在主线程维护 Rust
能力或工作簿状态的镜像。

## 一次单元格编辑

```text
键盘 / 双击
  → start/editing atoms
  → commitCellEditingAtom
  → setRustCellInputAtom
  → connection.request('cell.setInput')
  → Worker transport → WASM → Rust
  ← mutation ACK + 写入后的可见区投影
  → applyVisibleProjectionAtom 直接发布 → 视图重渲染
```

UI 只对编辑草稿做本地更新，不预测 Rust 计算结果。写入 ACK 不匹配当前请求时，编辑状态机按
`outcome-unknown` 处理，不能伪装成功。普通编辑只发送一次 Worker RPC；若用户在请求期间滚动，
滚动产生的 `projection.readVisible` 独立执行并拥有更新的窗口，编辑响应携带的旧窗口投影会被丢弃。

## 状态归属

- Rust/WASM：单元格值、公式、依赖关系和计算结果。
- UI Core atom：选区、编辑草稿、视口、投影快照、命令生命周期和 UI feature 状态。
- 框架包：DOM/Canvas 表面、事件、焦点、滚动、测量和组件组合。
- Worker transport：请求编号、Promise 关联、错误传播和资源释放。

大表禁止建立 per-cell / per-row / per-column atom 家族。数据必须通过有界可见区投影或有上限的
feature 缓存进入 UI。

## 构建入口

- `@einfach-excel/react-excel`：React `<Spreadsheet />` 组件、类型与工作簿定义 helper（样式通过 `@einfach-excel/react-excel/styles.css` 引入）。
- 包根 `@einfach-excel/spreadsheet-ui-core`：atom、类型和无副作用的 connection factory。
- `@einfach-excel/spreadsheet-ui-core/rust-worker`：纯传输。
- `@einfach-excel/spreadsheet-ui-core/rust-runtime`：给 Vite `?worker` 或打包器 Worker 使用的副作用入口。
- `@einfach-excel/excel-wasm`：wasm-pack 生成的 Rust/WASM 包（`/lite` 与 `/full`）。

`package-boundary.test.ts` 约束普通 UI Core 不引入视图框架和内联 WASM；
`rust-worker-boundary.test.ts` 约束传输目录不认识表格业务；
`npm run check:presentation` 约束 React 视图层不自建表格状态。
