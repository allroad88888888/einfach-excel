# React Excel

一个独立运行的 Vite 工作簿演示站。站点外壳负责选择 demo；当前第一个 demo 是由 Einfach
Rust/WASM 引擎驱动的销售订单工作簿。

## 当前能力

工作簿启动后会向 Rust 引擎导入 1,000 条销售订单记录。界面只渲染当前可见的 32 行窗口，
不会一次挂载整张工作表。目前支持：

- 单元格单选和拖拽框选；
- 从首行滚动到最后一条记录；
- 双击单元格或按 Enter 进入编辑；
- 在名称框输入单元格地址，跳转选区和可见窗口；
- 在公式栏直接修改活动单元格；
- 按 Enter 或失焦后，通过一次 Rust command 同时写入并取得当前可见投影；
- 按 Escape 取消编辑，不产生写入。

Ribbon、工作表标签和缩放区域目前主要负责界面展示。剪贴板、历史记录、格式设置、
工作表命令等完整 Excel 功能尚未接入本产品。

## Rust-only 运行边界

```text
React 视图
  → @einfach/react（useAtomValue / useSetAtom）
  → @einfach/spreadsheet-ui-core（状态 atom / command atom）
  → rustWorkbookConnectionAtom
  → @einfach/spreadsheet-ui-core/rust-worker（纯传输）
  → Rust/WASM workbook
```

类型化工作簿命令与轻量 Rust/WASM runtime 均由 UI-core 所有。React 不依赖
`@einfach/solid-excel`；生产路径没有 `SpreadsheetBackend`、TypeScript engine 或运行时 fallback。

- Rust/WASM 负责工作簿权威数据、计算和 mutation 结果。
- `spreadsheet-ui-core` 负责创建连接、初始化工作簿、导入数据、运行状态、销毁连接、工作簿状态、
  跨 atom 状态转换、可见窗口与 Rust 命令。
- React 负责共享视图、挂载 effect、DOM 事件、焦点、pointer capture 和滚动事件适配。
- React 源码不使用 `useState/useReducer`，也不在本包内声明工作簿 atom。
- Vite 的 `?worker` 语法只存在于共享 `WorkbookRuntimeProvider`；所有 demo 共用它。

普通单元格提交只走一次 `cell.setInput` Worker RPC，结果包含严格 ACK 和同一修订版投影。提交期间
如果用户滚动，独立的滚动投影优先，旧窗口的编辑投影不会覆盖新窗口。

## 目录结构

```text
src/
├── main.tsx
├── app/                              # 演示站入口和全局样式
├── page/
│   ├── DemoPage.tsx                  # 左侧导航与当前 demo 内容
│   ├── PageSidebar.tsx               # 根据注册表渲染 demo 菜单
│   ├── WorkbookRuntimeProvider.tsx   # 共享 Rust runtime 的挂载边界
│   ├── WorkbookStoreProvider.tsx     # 测试与受控消费者的 Store 注入边界
│   └── demo/
│       ├── demo-registry.ts          # demo 注册与 URL 解析
│       └── sales-orders/
│           ├── PageSalesOrders.tsx   # Sales Orders 页面组件
│           ├── sales-orders-workbook.ts # 纯工作簿定义
│           └── data/                 # 唯一 schema 与 Rust 导入数据
└── workbook/
    ├── shell/                        # 所有 demo 共用的工作簿视图组合
    ├── chrome/
    │   ├── header/                   # 通用工作簿身份区
    │   ├── ribbon/                   # 通用命令入口展示
    │   ├── formula-bar/              # 通用名称框与公式编辑
    │   └── footer/                   # 通用工作表标签与状态栏
    ├── grid/
    │   ├── cells/                    # 投影单元格表格
    │   ├── editor/                   # 单元格内编辑器
    │   └── viewport/                 # 通用网格窗口与 DOM 事件适配
    ├── projection/                   # 可见窗口与投影的 React 接入
    └── selection/                    # pointer 手势的 React 事件适配

test/
├── app/                              # demo 选择与页面外壳测试
├── page/                             # 共享 runtime、demo 数据和 Store 隔离测试
└── workbook/
    ├── editing/                      # 编辑交互与并发滚动测试
    ├── projection/                   # 可见窗口和滚动测试
    └── selection/                    # 点击、拖选和取消测试
```

产品模块使用精确的相对路径导入。本应用没有公共包入口，也不建立内部 barrel。

## 新增 demo

新增第二个 demo 时，新增一个显式 `PageXxx.tsx` 页面组件、一个 `RustWorkbookDefinition` 和对应
数据文件。页面只组合共享的 `WorkbookRuntimeProvider` 与 `WorkbookView`，然后在
`demo-registry.ts` 注册页面组件。不要为 demo 新增 runtime、Worker 或专属 Workbook 视图；
`App.tsx`、`DemoPage.tsx`、`WorkbookRuntimeProvider.tsx` 与 `workbook/**` 都不需要修改。

## 启动与验证

```bash
pnpm --filter @einfach/react-excel dev
pnpm --filter @einfach/react-excel typecheck
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
```

开发服务器地址为 `http://127.0.0.1:5183`。

React 测试覆盖 demo 数据、共享启动生命周期、Store 隔离、选区交互、可见窗口投影、连续单元格编辑，
以及 mutation 等待期间滚动后仍保持最新窗口等场景。UI-core 的 command atom 测试位于
`excel/spreadsheet-ui-core/test/`。
