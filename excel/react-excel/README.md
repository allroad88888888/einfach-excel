# React Excel

一个由 Einfach Rust/WASM 引擎驱动的销售订单工作簿，也是独立运行的 Vite 产品应用。

## 当前能力

工作簿启动后会向 Rust 引擎导入 1,000 条销售订单记录。界面只渲染当前可见的 32 行窗口，
不会一次挂载整张工作表。目前支持：

- 单元格单选和拖拽框选；
- 从首行滚动到最后一条记录；
- 双击单元格或按 Enter 进入编辑；
- 按 Enter 或失焦后，通过 Rust backend 写入并刷新当前可见投影；
- 按 Escape 取消编辑，不产生写入。

公式栏、Ribbon、工作表标签和缩放区域目前主要负责界面展示。剪贴板、历史记录、格式设置、
工作表命令等完整 Excel 功能尚未接入本产品。

## Rust-only 运行边界

```text
React 视图
  → @einfach/react（useAtomValue / useSetAtom）
  → @einfach/spreadsheet-ui-core（状态 atom / command atom）
  → @einfach/spreadsheet-ui-core/rust-worker
  → Rust/WASM workbook
```

Worker protocol、backend adapter 与轻量 Rust/WASM runtime 均由 UI-core 所有。React 不依赖
`@einfach/solid-excel`；生产路径没有 TypeScript engine、静态 backend 或运行时 fallback。

- Rust/WASM 负责工作簿权威数据、计算和 mutation 结果。
- `spreadsheet-ui-core` 负责工作簿状态、跨 atom 状态转换、可见窗口、backend 调用和刷新编排。
- React 负责渲染、effect、DOM 事件、焦点、pointer capture 和滚动事件适配。
- React 源码不使用 `useState/useReducer`，也不在本包内声明工作簿 atom。
- 产品启动 effect 负责创建、等待和销毁 Rust Worker；其 loading/ready/error 状态由 UI-core atom 保存。

## 目录结构

```text
src/
├── main.tsx
├── app/                              # 产品启动和全局样式
├── product/
│   └── sales-orders/
│       ├── data/                     # 工作表定义和 Rust 导入数据
│       └── runtime/                  # Rust 工作簿创建与初始化
└── workbook/
    ├── shell/                        # 工作簿页面组合
    ├── chrome/
    │   ├── formula-bar/              # 当前选区值展示
    │   ├── footer/                   # 工作表导航和状态区域
    │   ├── header/                   # 工作簿标题区域
    │   └── ribbon/                   # 命令入口展示
    ├── grid/
    │   ├── cells/                    # 投影单元格表格
    │   ├── editor/                   # 单元格内编辑器
    │   └── viewport/                 # 有界滚动网格
    ├── projection/                   # 可见窗口与投影的 React 接入
    ├── runtime/                      # 显式 Store Provider
    └── selection/                    # pointer 手势的 React 事件适配

test/
├── app/                              # Rust 启动生命周期测试
├── product/sales-orders/             # 产品数据和 Rust 导入测试
└── workbook/
    ├── editing/                      # 编辑交互与并发滚动测试
    ├── projection/                   # 可见窗口和滚动测试
    ├── runtime/                      # Provider Store 隔离测试
    └── selection/                    # 点击、拖选和取消测试
```

产品模块使用精确的相对路径导入。本应用没有公共包入口，也不建立内部 barrel。

## 启动与验证

```bash
pnpm --filter @einfach/react-excel dev
pnpm --filter @einfach/react-excel typecheck
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
```

开发服务器地址为 `http://127.0.0.1:5183`。

React 测试覆盖 Rust 数据导入、启动生命周期、Store 隔离、选区交互、可见窗口投影、连续单元格编辑，
以及 mutation 等待期间滚动后仍保持最新窗口等场景。UI-core 的 command atom 测试位于
`excel/spreadsheet-ui-core/test/`。
