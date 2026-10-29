# React Excel

可嵌入浏览器宿主的 React 工作簿组件包，同时保留独立 Vite 演示站。主线为
React DOM → UI Core command atom → Rust Worker/WASM → atom 结果 → React。

外部接入请读[安装、尺寸、语言与 Worker](docs/package/README.md)、
[同 Store 原始值与修改事件](docs/package/host-data.md)和[兼容范围及发行清单](docs/package/release.md)。
当前改动尚未发布到 npm；本地可通过 `pnpm prepare:package-consumers` 安装模拟发行 tarball。

默认 Sales Orders 保留原有 66 组合并与 128 列演示画布，不为测试删改样例。
需要完整 1,000 条订单的 E2E 使用 `e2e/fixtures/plain-sales-orders/`，
仅隔离导入数据，仍复用产品视图、UI Core 和真实 Rust/WASM Worker。

## 当前能力

已接入编辑、选区与导航、常用格式、剪贴板、工作表管理、行列尺寸、冻结、查找及状态栏统计。
填充支持定向复制、序列面板与四方向拖拽；详细操作、原始样例与已知限制统一放在
[当前能力与操作说明](docs/current-capabilities.md)，完整计划见[功能进度](FEATURE_PROGRESS.md)。

## 本版六项进阶能力（完整回归通过）

Ctrl/⌘ 点击或拖拽可[手动追加非连续选区](docs/multi-range-selection/manual-selection.md)，
普通点击替换、Escape 保留主区；复用原多区格式、清除与统计。
[跨表剪切](docs/cross-sheet-cut/contract.md)沿原剪贴板移动数据、格式与可安全重定位的引用，
一次撤销恢复两端；部分范围、命名范围重叠、合并、Table 等不安全边界明确原子拒绝。
函数选择器新增[参数填写表单](docs/formula-arguments/README.md)，按原生签名生成原公式栏草稿，Enter 才写入。
[高级筛选](docs/advanced-filter/README.md)支持组内 AND、组间 OR 及完整搜索结果全选；
[高级格式](docs/advanced-formatting/README.md)支持 Unicode 通配符和按基础显示文本比较重复／唯一值。
独立 Async formulas demo 使用项目扩展 [FETCHJSON](docs/async-formulas/FETCHJSON.md)，
经真实同源 HTTP 与原生异步队列更新依赖，不是 Office 内置函数，也不执行文件脚本。
FETCHJSON 需手填公式，不伪装为原生内置目录或参数表单的元数据条目。
2026-10-21 最终单次真实 Worker/WASM 完整回归 2617/2617 通过，同一 JSON 核验 998/998 登记操作，
原955个绑定保留，零失败、跳过、重试或 flaky；完整 Vitest 6425/6425 通过。
原生双配置、WASM/Chrome、类型、构建、静态门禁及中英1280px/390px截图独立审阅均通过。
运行全程4236个输入冻结，结束后逐文件核对一致；未提交或推送。下方2474/955仅为前版历史证据。

## 前版七项扩展（完整回归通过）

Insert 中的 Note 保存独立纯文本备注，Comments 保存含显示名、本机时间及解决/重开事件的本地线程；
二者可在同格共存，不会替代值或公式。显示名不是认证身份，也不提供远程协作或通知。
Data 中的 Worksheet protection 在保护前配置允许编辑范围；允许区保留内容/格式编辑，工作表设置仍锁定。
条件格式可覆盖自动端点，支持数值、百分比、百分位和公式阈值，以及三箭头/交通灯/旗帜图标。
数据验证可用相对公式、选格提示及 Stop/Warning/Information 错误级别；后两者必须明确 Continue 才提交。
函数选择器、格内编辑与公式栏展示当前原生构件的参数、重复组、示例及实现限制，不宣称 Office 全兼容。
Formulas 中的 Custom formulas 将参数表达式保存为工作簿数据，沿原生 LAMBDA 求值；单元格引用经实参传入，
不执行文件内 JavaScript 或外部脚本。

Sales Orders B2 是备注示例；Summary 原生示例：A71:A73 允许区（初始不保护）、H75:H79 图标阈值、H83 的 ORDER_NET 调用、H84 线程。
这些种子不产生启动历史。2026-10-21 最终单次真实 Worker/WASM 完整回归 2474/2474 通过，
同一报告核验 955/955 已登记操作，零失败、跳过或重试；1280px/390px 中英文截图已独立审阅。
原生双配置、WASM、JavaScript、类型、构建及静态门禁证据均已收齐；本轮未提交或推送，
不据此宣称整个功能计划或 Office 兼容范围完成。

## Rust-only 运行边界

```text
React 视图
  → @einfach/react（useAtomValue / useSetAtom）
  → @einfach-excel/spreadsheet-ui-core（状态 atom / command atom）
  → rustWorkbookConnectionAtom
  → @einfach-excel/spreadsheet-ui-core/rust-worker（纯传输）
  → Rust/WASM workbook
```

类型化工作簿命令与轻量 Rust/WASM runtime 均由 UI-core 所有。React 不依赖
`@einfach-excel/solid-excel`；生产路径没有 `SpreadsheetBackend`、TypeScript engine 或运行时 fallback。

- Rust/WASM 负责工作簿权威数据、计算和 mutation 结果。
- `spreadsheet-ui-core` 负责创建连接、初始化工作簿、导入数据、运行状态、销毁连接、工作簿状态、
  跨 atom 状态转换、可见窗口与 Rust 命令。
- React 负责共享视图、挂载 effect、DOM 事件、焦点、pointer capture 和滚动事件适配。
- React 源码不使用 `useState/useReducer`，也不在本包内声明工作簿 atom。
- 共享 Provider 通过标准模块 URL 启动随包 Worker；所有 demo 复用同一装配，不要求宿主 Vite loader。

普通单元格提交只走一次 `cell.setInput` Worker RPC，结果包含严格 ACK 和同一修订版投影。提交期间
如果用户滚动，独立的滚动投影优先，旧窗口的编辑投影不会覆盖新窗口。
UI Core 不再用 JavaScript 判断输入是数字还是公式，只把原字符串交给 Rust `set_cell_input`。
Rust 输入解析也供外部剪贴板复用；百分比输入的数值与格式在同一条命令内完成，不再追加格式 RPC。

## 撤销、重做与最近操作

- 工具栏 `Undo` / `Redo`；网格中支持 `⌘/Ctrl+Z`、`⌘/Ctrl+Shift+Z`、`Ctrl+Y`。
- `Recent operations` 显示操作名称、工作表、范围及已撤销状态；Escape 关闭并还原按钮焦点。
- 当前覆盖单格输入、格式、清除内容/格式/全部、行列尺寸、行列隐藏/恢复、粘贴、同表／跨表剪切及工作表管理。
- 历史由 Rust 保存，最多 50 步及约 32 MiB 估算预算；不跨刷新持久化。初始化数据不计入历史。
- 修改 E2 后切换 Summary，再撤销，可看到公式回到原值，当前工作表不会跳回 Sales Orders。
- 复制、切表保留历史；粘贴、创建/改名/删除/移动工作表均记入同一 Rust 历史栈。
  新修改会丢弃重做分支，无变化的提交和失败操作不会。
- 结构撤销尽量保留当前表；撤销新增导致当前表消失时，切到相邻表 A1。恢复表保留原数据、格式和画布尺寸。
  结构撤销/重做会使旧剪贴板失效，粘贴时提示重新复制；不会悄悄改成往其他表粘贴。
- 普通粘贴、选择性模式、列宽、转置、跳过空白、平铺、加减乘除均可撤销；剪切的一步撤销会恢复源格、
  目标原值和被改写的引用公式。重做不读取系统剪贴板，旧剪切仍不能再次粘贴。
- 编辑框里的撤销交给浏览器处理，不应触发工作簿撤销；先提交或取消草稿再使用工具栏历史。

## 计算列演示

Summary 的 `A46:C49` 是 `CalculatedOrders`：数量 × 单价，`C47:C49` 初始为 10、40、90，
`B6` 显示合计 140。修改 C48 的公式会更新整列；在 B50 输入单价、A50 输入数量，可验证新行继承。
手工改写某格后形成例外，后续公式输入不会覆盖其它行。每次操作沿用 Rust 的一次撤销／重做。
种子在建表后调用原生输入建立计算列，不在 React 生成逐行公式；初始化不计入历史。

## 目录结构

```text
src/
├── main.tsx
├── app/                              # 演示站入口和全局样式
├── i18n/                             # Lingui 界面语言与中英文 PO 词典
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

产品内部使用精确的相对路径；包根只公开 Spreadsheet、三个装配组件及其 Props 类型。

## 新增 demo

新增第二个 demo 时，新增一个显式 `PageXxx.tsx` 页面组件、一个 `RustWorkbookDefinition` 和对应
数据文件。页面只组合共享的 `WorkbookRuntimeProvider` 与 `WorkbookView`，然后在
`demo-registry.ts` 注册页面组件。不要为 demo 新增 runtime、Worker 或专属 Workbook 视图；
`App.tsx`、`DemoPage.tsx`、`WorkbookRuntimeProvider.tsx` 与 `workbook/**` 都不需要修改。

## 启动与验证

开发环境要求 Node.js **22.19+**、pnpm 10。当前主线使用 Vite 8、React 插件 6、Vitest 5；
暂停中的 Solid／Vue 应用不随本轮迁移。仓库根 `vitest.config.ts` 通过 `test.projects` 统一运行主线测试。

### 界面语言

右上角选择 English／中文，或打开 `/?locale=zh-CN`、`/?locale=en-US`。
初始化优先级是 URL、已保存的语言偏好、浏览器语言，最后回退英文；不支持的语言会跳过。
切换时保存偏好，已有 `locale` 参数也会同步，刷新后不反跳。存储被禁用时仍能切换。

覆盖工具栏、现有功能弹窗、统计详情、工作表操作、加载状态及可访问标签。
编辑拒绝、复制粘贴、定位、排序筛选、文件恢复等已知提示在显示时翻译；
Core／Rust 返回值不变，未知诊断保留原文，不能据词典“缺失为零”宣称所有底层异常已翻译。
原始数据、表名、公式函数名和工作簿数字格式语义不翻译。

库组件默认各用独立 Lingui 实例；只有宿主显式注入同一个 I18n 才共享语言。
各工作簿必须使用不同 Store 与 Rust runtime，demo 的 URL/存储语言策略只属于演示站。
使用官方 `I18nProvider`、`useLingui`／`Trans`／`msg`，不新增语言 atom 或自定义翻译 Hook。
Vite 与 Vitest 共用官方 Lingui 插件的原生宏转换，直接编译 `.po`，修改词典走 Vite 热更新，
不提交另一份编译后的 JS 词典，也不依赖 Babel 宏插件。

```bash
pnpm --filter @einfach-excel/react-excel i18n:extract # 从源码提取并清理词条
# 编辑 src/i18n/locales/zh/messages.po，再检查缺失／非法翻译
pnpm --filter @einfach-excel/react-excel i18n:check
```

生产构建也会拒绝词典缺失和编译错误。新增文案必须用可静态提取的宏，
模块级菜单用 `msg` 保存描述符、渲染时 `i18n._()`，不能提前翻译或用动态字符串充当消息 ID。
Core 的已知提示收在 `i18n/feedback-messages.ts`，带参数结果由 `translate-feedback.ts` 精确匹配。
这两个文件只处理展现文案，不能用于翻译用户数据。新增提示应补提取词条及对应回归。
`test/i18n/source-copy.test.ts` 阻止产品 JSX 和可访问标签重新出现未标记的英文常量。

```bash
pnpm --filter @einfach-excel/excel-wasm build:wasm # Rust 源码变化后重建本地 WASM
pnpm --filter @einfach-excel/react-excel dev
pnpm --filter @einfach-excel/react-excel typecheck
pnpm --filter @einfach-excel/react-excel test
pnpm check:e2e-features # 功能点逐项对应可执行 E2E，不代表已运行通过
pnpm --filter @einfach-excel/react-excel e2e:install # 首次运行或 Playwright 升级后安装配套浏览器
pnpm --filter @einfach-excel/react-excel e2e
pnpm --filter @einfach-excel/react-excel e2e:serial # 长时间卡顿排查才使用单 worker 全量
pnpm --filter @einfach-excel/react-excel e2e:input-stall # 原两处卡顿场景专项，固定单 worker
pnpm --filter @einfach-excel/react-excel build
```

开发服务器地址为 `http://127.0.0.1:5183`。

React 测试覆盖 demo 数据、共享启动生命周期、Store 隔离、选区交互、可见窗口投影、连续单元格编辑，
以及 mutation 等待期间滚动后仍保持最新窗口等场景。UI-core 的 command atom 测试位于
`excel/spreadsheet-ui-core/test/`。

功能点与独立主用例登记在 [E2E 对照表](e2e/FEATURES.md)。鼠标 Shift 点击、键盘 Shift 扩选、
Shift 行列头扩选分别验收，不能互相替代。`e2e` 命令会先检查缺失／改名／重复绑定／跳过用例；
CI 也运行此元数据门禁。历史细项仍在逐项回填，不凭 E2E 总数宣称所有交互已覆盖。
真实执行后用 `pnpm check:e2e-features --results /path/to/playwright.json` 核对报告中的逐项结果。

日常 E2E 本地默认 2 个 worker，CI 每个 runner 默认 1 个，通过 4 个 runner 并发；文件内保持顺序，
可用 `--workers=4` 覆盖，但应按机器内存实测，避免同时加载多份 WASM 后反而变慢。
每个用例使用独立浏览器上下文，截图／下载写入各自的测试目录；
同一运行的 worker 共用只读页面服务，不为每个 worker 重建消费者。
不要同时启动两个使用默认端口和输出目录的本地 E2E 命令。

CI 将全量按文件拆为 4 个独立 runner，分别准备真实包消费者，保留各分片的 blob 和失败证据。
全部分片结束后合并为一份 JSON，再运行上述功能结果门禁；缺少分片报告、任一分片失败，或已登记
主用例失败／跳过／重试，都不能通过汇总门禁。串行专项保持独立，不把日常并发通过当作历史偶发卡顿已修复。
