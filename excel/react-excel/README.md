# React Excel

一个独立运行的 Vite 工作簿演示站。站点外壳负责选择 demo；当前第一个 demo 是由 Einfach
Rust/WASM 引擎驱动的销售订单工作簿。

## 当前能力

工作簿启动后会向 Rust 引擎导入 1,000 条销售订单记录。界面只渲染当前可见的 32 行窗口，
不会一次挂载整张工作表。目前支持：

- 单元格单选和拖拽框选；
- 点击行号选择整行、点击列名选择整列、点击左上角选择整表；
- 清除选区内容（也支持 Delete）、清除格式、全部清除；
- 系统剪贴板复制、同表剪切、矩形粘贴（工具栏与 Ctrl/⌘+C、X、V）；
- 仅粘贴值、仅粘贴格式，以及将复制内容重复铺满矩形选区；
- 转置粘贴、跳过空白、粘贴值及格式（工具栏 `Paste options` 下拉菜单）；
- 从首行滚动到最后一条记录；
- 双击单元格或按 Enter 进入编辑；
- 在名称框输入单元格地址，跳转选区和可见窗口；
- 在公式栏直接修改活动单元格；
- 按 Enter 或失焦后，通过一次 Rust command 同时写入并取得当前可见投影；
- 按 Escape 取消编辑，不产生写入；
- 原始数值编辑（公式栏和格内编辑不使用经过货币、百分比或 General 舍入的显示文本）；
- 两种编辑入口均支持 Alt+Enter 在光标处换行，Enter 提交；输入法组合确认键不触发提交或取消；
- 通过工具栏设置字体、颜色、边框、对齐、旋转、缩进等单元格格式；
- 百分比、货币、千分位格式，以及增加小数位、减少小数位、恢复常规格式。

数字格式只影响显示，不改原始数值或公式。小数位按钮范围为 0–15 位，沿用活动单元格的
数字格式应用到选区；恢复常规格式不会清除字体、颜色或边框。可在名称框跳转到 `O4`
（初始 `10.00%`）、`P3`（初始粗体 `$125`，原值 `125.02`）和 `G9`（初始 `2,632.00`）测试。

表头支持 Shift 点击连续选择多行或多列，名称框和底部 Count 显示完整选区。整行格式写到
Rust `rowStyle`，整列格式写到 `columnStyle`；交叉位置遵循后一次操作生效的规则。
点击表头会显示活动格（整行的首列、整列的首行、整表的 A1），便于回显格式和继续键盘编辑。
编辑中点击表头会先提交当前值，失败时保留草稿。

工具栏的 `Clear contents` 保留格式，`Clear formatting` 保留数值与公式，`Clear all` 清除两者。
清除格式不会重置行高/列宽，且可覆盖选区内继承的行列样式；再次设置行列格式时仍以后一次
操作为准。编辑草稿打开时，三个清除按钮禁用，避免意外丢弃未提交输入。
持续执行范围与批次证据见[主线执行记录](./FEATURE_PROGRESS.md)。

复制时 Rust 保存值、公式及有效格式快照，之后修改源格不会修改该快照。内部粘贴保留格式，
相对公式引用随目标位置平移；不会复制行高和列宽。剪切先保留源格，成功粘贴时才移动，
同表单元格引用跟随移动；失败时不删除源格。同一次剪切只能落地一次。

外部 TSV 支持多行、多列、引号内换行、空格子、数字、布尔值和公式，不覆盖目标格式。
权限失败会在底部提示；工具栏读取权限被拒绝时，可在网格按 Ctrl/⌘+V。编辑器打开时
剪贴板按钮禁用，输入框内仍使用原生文字复制粘贴。复制 `A2` 可验证粗体，复制 `G2` 到 `G3`
可验证公式平移，剪切 `E2` 到 `E4` 可验证 `G2` 的引用跟随，无需添加另一份测试数据。

`Paste values only` 保留目标格式，公式转为复制时的计算结果，不使用经过显示格式舍入的文本。
例如复制 `P3` 到 `B3`，仅粘贴值会得到 `125.02`，而不是 `125`。
`Paste formatting only` 只写格式，不改目标数值或公式；复制 `P3` 的格式到 `G9` 可验证。
外部文本的仅值粘贴不会执行公式；仅格式粘贴要求当前工作簿的内部复制快照。

单格目标会展开为复制内容的尺寸；较大选区的行列数必须分别是源区域的整数倍，否则整次拒绝。
例如复制 `A2:C2`，选择 `A10:F11` 后粘贴，会重复填满选区，公式按各目标位置平移。
剪切不支持重复填充或选择性粘贴，拒绝时仍保留源格。
`Paste options` 提供三个一次性操作，选择后立即粘贴，不改变下一次普通粘贴的行为：

- `Paste transposed` 交换源区域的行列，数值与格式一起转置；公式按各源格到目标格的偏移调整，
  绝对引用保持不变。复制 `A2:C3` 到 `A10` 会得到 3 行、2 列，也可以按转置后的尺寸平铺。
- `Paste skipping blanks` 保留空白源格对应的目标内容与格式；`0`、`false`、空字符串和
  返回空字符串的公式不是空格。先清空 `A2` 内容，再复制 `A2:B2` 到 `A10` 可测试。
- `Paste values and formatting` 保留复制时的原始数值/计算结果及样式，不保留公式。
  复制 `P3` 到 `B3` 仍显示粗体 `$125`，清除目标格式后可看到原始值 `125.02`。

外部 TSV 支持转置和跳过空白；它没有源样式，因此“值及格式”会明确拒绝。
剪切不接受以上三个操作，拒绝后可以继续普通粘贴。跨表剪切、部分公式范围移动、多区域、
Copy As、仅公式、运算、批注及列宽粘贴等能力仍待接入。
单次操作上限为 1,048,576 格、文本 16 MiB，越过当前工作表边界会拒绝。

工作表标签和缩放区域目前主要负责界面展示。历史记录、工作表命令等完整 Excel 功能尚未接入。
编辑来源已与显示文本分开：例如 `P3` 显示 `$125`，进入编辑及公式栏显示的是 `125.02`；
`O4` 显示 `10.00%`，编辑值为 `0.1`。直接 Enter 或失焦不会把显示舍入写回原值。
`I3` 是原始种子里的两行示例 `Noah` / `East team`。格内和公式栏都能用 Alt+Enter 换行，
也可替换当前选中的文字；保存后只撑高所在行，行高仍只属于 Rust `rowStyle`，不会自动缩小。
目前行高按显式换行数估算，不代表已经完成按列宽自动折行的完整 AutoFit。
输入法已覆盖浏览器组合事件和 `229` 确认键保护，真实系统候选窗仍需手工验收。

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
    ├── clipboard/                    # 浏览器剪贴板与网格事件适配
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
pnpm --filter @einfach/excel-wasm build:wasm # Rust 源码变化后重建本地 WASM
pnpm --filter @einfach/react-excel dev
pnpm --filter @einfach/react-excel typecheck
pnpm --filter @einfach/react-excel test
pnpm --filter @einfach/react-excel build
```

开发服务器地址为 `http://127.0.0.1:5183`。

React 测试覆盖 demo 数据、共享启动生命周期、Store 隔离、选区交互、可见窗口投影、连续单元格编辑，
以及 mutation 等待期间滚动后仍保持最新窗口等场景。UI-core 的 command atom 测试位于
`excel/spreadsheet-ui-core/test/`。
