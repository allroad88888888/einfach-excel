# 架构

当前维护主线是一套 Rust 绑定的表格 UI Core，React 负责把 atom 接到产品视图；工作簿值、
公式和计算状态只存在于 Rust/WASM。

## 分层

```text
React 视图
        ↓ framework atom hooks
spreadsheet-ui-core
  ├─ feature atoms            选区、编辑、视口、投影生命周期
  ├─ rustWorkbookConnectionAtom
  └─ rust-workbook            类型化业务命令
        ↓
rust-worker                   纯 Worker RPC 传输
        ↓
rust-runtime.ts               Worker 入口
        ↓
@einfach/excel-wasm → Rust excel-core
```

当前完整产品是 `excel/react-excel`。它通过 `@einfach/react` 的
`useAtomValue` / `useSetAtom` 渲染 UI Core；不会在 React 包内建立第二套工作簿 atom。

`solid-excel` 及依赖它的 `excel-site` 已暂停：源码保留考古，但退出默认构建、测试、CI、
发布和兼容范围。`vue-excel` 是独立视图实验，不参与 React 主线门禁。未来若恢复某个框架，
应直接使用该框架的 Einfach atom binding，不得恢复一套 `SpreadsheetBackend`。

## 各目录职责

| 目录 | 唯一职责 |
|---|---|
| `excel/spreadsheet-ui-core/src/backend/` | 表格请求、结果和显示类型；这里只是类型，不是 backend 对象 |
| `excel/spreadsheet-ui-core/src/runtime/` | store 内的连接引用和 loading/ready/error 生命周期 |
| `excel/spreadsheet-ui-core/src/projection/` | 投影排队、关联和发布 |
| `excel/spreadsheet-ui-core/src/editing/` | 编辑草稿与一次 Rust 提交事务 |
| `excel/spreadsheet-ui-core/src/rust-workbook/` | UI 形状的 Rust 工作簿命令与 Worker 端执行 |
| `excel/spreadsheet-ui-core/src/rust-worker/` | 与表格业务无关的 Worker RPC |
| `excel/spreadsheet-ui-core/src/rust-runtime.ts` | 装载 WASM 并安装 Worker 消息处理器 |
| `excel/react-excel/src/product/` | 产品工作簿定义和演示数据初始化 |
| `excel/react-excel/src/workbook/` | React 渲染与 DOM 事件适配 |

`@einfach/core` 和 `@einfach/react` 来自
[einfach 主仓](https://github.com/allroad88888888/einfach)。本仓只消费它们。

## 命令边界

UI Core 不再导出 `SpreadsheetBackend` 能力大对象。一个 store 只绑定
`RustWorkbookConnection`，连接只有两个传输操作：`request` 和 `dispose`。

当前协议只有四条业务命令：

| 命令 | 发起方 | 结果 |
|---|---|---|
| `workbook.initialize` | 产品启动流程 | 工作表元数据 |
| `workbook.importCells` | 产品启动流程 | 一批 Rust 导入统计 |
| `projection.readVisible` | 投影 command atom | 有界 `VisibleProjectionResult` |
| `cell.setInput` | 编辑 command atom | 精确 mutation ACK + 同修订版可见区投影 |

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
- 框架包：DOM、事件、焦点、滚动、测量和组件组合。
- Worker transport：请求编号、Promise 关联、错误传播和资源释放。

大表禁止建立 per-cell / per-row / per-column atom 家族。数据必须通过有界可见区投影或有上限的
feature 缓存进入 UI。

## 构建入口

- 包根 `@einfach/spreadsheet-ui-core`：atom、类型和无副作用的 connection factory。
- `@einfach/spreadsheet-ui-core/rust-worker`：纯传输。
- `@einfach/spreadsheet-ui-core/rust-runtime`：给 Vite `?worker` 使用的副作用入口。
- `@einfach/excel-wasm`：wasm-pack 生成的 Rust/WASM 包。

`package-boundary.test.ts` 约束普通 UI Core 不引入视图框架和内联 WASM；
`rust-worker-boundary.test.ts` 约束传输目录不认识表格业务。

## 细节入口

- UI Core：[包说明](../excel/spreadsheet-ui-core/README.md)
- React 产品：[包说明](../excel/react-excel/README.md)
- Rust/WASM：[构建说明](../excel/rust/wasm/README.md)
- 重大裁决：[ADR 目录](decisions/)
- 历史方案：[归档索引](archive/INDEX.md)
