# 交互重整执行树：以 Einfach Atom 为主线

> 这是 [交互 Issue 树](INTERACTION_ISSUE_TREE.md) 的实施账本。它记录模型分工和技术判定，
> 不把“已存在代码”当作“体验已经完成”。

## 已确认的边界

- 当前产品是 Solid：依赖 `@einfach/core` 与 `@einfach/solid`，并未安装 `@einfach/react`。
- 因此以 `@einfach/react` 的 Atom 建模原则为基准；Solid 界面使用等价的 `@einfach/solid` 读写
  相同 Atom。除非另行授权，本轮不做 Solid → React 迁移。
- `spreadsheet-ui-core` 是业务事实、会话、草稿、命令、加载和错误的唯一状态层；vnext 只保留 DOM
  测量、元素焦点和浏览器 API 等短生命周期宿主状态。
- 一个执行 Issue 只能有一个代码模型所有者。模型 ID 是独立执行任务，不代表所有模型同时运行；
  共享文件只能由前置 Issue 独占，后续 Issue 只读其契约。

## 判定口径

- **修复**：Atom/命令边界已经成立，补齐体验链路或把呈现文件按职责拆开。
- **重构**：产品状态绕过 Atom、运行时所有权不清，或一个共享壳阻止独立交付；先固定契约再接界面。
- 每个模型先复核自己范围的现状；若审计推翻此判定，更新本树后再动代码。

## 执行总树

```text
IX-000 Atom 主线下的交互重整
├── W0 共享状态与宿主边界（第一批已完成）
│   ├── IX-001 Provider / Store 所有权重构
│   ├── IX-002 Grid 原子订阅与类型边界重构
│   ├── IX-003 Worker runtime 句柄所有权重构
│   ├── IX-004 命令壳拆分契约
│   ├── IX-005 Overlay 焦点与关闭契约
│   └── IX-006 用户反馈与恢复状态面
├── W1 网格与输入链路（已完成）
│   └── UI-101…UI-107、UI-201…UI-210、UI-520、UI-522…UI-525 已完成；交付和保留边界见下表
├── W2 命令、结构与数据工作流（已完成）
│   └── UI-301…UI-309、UI-401…UI-409 已完成；交付和保留边界见下表
├── W3 运行时、可访问性与适配（已完成）
│   └── UI-501…UI-514 已完成；独立功能回归通过，仓库级 lint 存量已由独立治理清零（299db4d）
├── W4 反馈入口装配
│   └── UI-515 全局诊断与恢复反馈入口（已完成；见下表）
├── W5 打印设置入口（已完成）
│   └── UI-516 页面设置编辑与打印预览衔接（已完成；见下表）
├── W6 PrintConfig 后端权威存储（已完成）
│   └── UI-517 PrintConfig 后端持久化与 Worker RPC（已完成；见下表）
├── W7 远端协作定位（已完成）
│   └── UI-518 Presence 网格几何与身份呈现（已完成；见下表）
├── W8 历史记录能力收敛（已完成）
    ├── UI-519a Grid 直接 mutation 的 History capability guard（已完成；见下表）
    ├── UI-519b Core producer recorder port（已完成；见下表）
    ├── UI-519c editing 与 auto-fill 的 reserved history 迁移（已完成；见下表）
    ├── UI-519d Paste Special 与 Text-to-Columns 的 history 迁移（已完成；见下表）
    ├── UI-519e operations 与 toolbar 的 history 迁移（已完成；见下表）
    ├── UI-519f tables、filter-sort 与 remove-duplicates 迁移（已完成；见下表）
    ├── UI-519g Grid legacy recorder 三态收敛（已完成；见下表）
    ├── UI-519h tables recorder rejected 恢复顺序（已完成；见下表）
    ├── UI-519i Remove Duplicates history-capability 测试夹具（已完成；见下表）
    └── UI-521 Context menu structural-history 测试夹具（已完成；见下表）
├── W9 命令入口一致性（已完成）
    ├── UI-527 菜单栏排序确认会话（已完成；见下表）
    ├── UI-529 菜单栏排序浏览器闭环（已完成；见下表）
    └── UI-530 筛选下拉排序确认会话（已完成；见下表）
├── W10 剪贴板快捷键契约（已完成）
│   └── UI-542 Paste Special 快捷键浏览器闭环（已完成；见下表）
├── W11 剪贴板投影可见性（已完成）
│   └── UI-543 大范围粘贴浏览器闭环（已完成；2712522；见下表）
├── W12 打印预览菜单闭环（已完成）
│   └── UI-544 菜单栏打印预览浏览器回归（已完成；见下表）
└── W13 近期交互交付账本续接（已核对至 dddae60）
    ├── UI-555 多区域剪贴板拒绝与诊断反馈（已完成；0638d17）
    ├── UI-556A 条件格式规则按当前 Sheet 水合（已完成；a5a893f）
    ├── UI-556B 条件格式规则草稿参数编辑（已完成；cb18c4e + 浏览器 E2E dddae60）
    ├── UI-556C 条件格式引擎配置与 revision（已完成；e6d8895）
    ├── UI-558 条件格式 Color Scale 渐变投影（已完成；ae2ea68）
    └── UI-557 Data Bar 可视化投影（已完成；73bc137）
```

| 波次 | 进入条件                        | 允许的并行度                         | 解锁条件                                             |
| ---- | ------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| W0   | 已完成只读审计                  | 仅文件范围不重叠的基础节点           | Atom 边界、公开契约和针对性测试成立                  |
| W1   | IX-001、IX-002 完成             | 一个 grid 宿主改动者；其余按领域并行 | 体验入口不再依赖临时状态或无类型 runtime             |
| W2   | IX-004、IX-005 完成             | 菜单、工具栏、对话框按独占模块并行   | 共享命令壳和焦点约定不再被叶子重复实现               |
| W3   | IX-001、IX-005、IX-006 完成     | 按独占运行时领域并行                 | 反馈、恢复、键盘和响应式路径有可复核证据             |
| W4   | W3 完成                         | 一个 host 入口改动者                 | 已有诊断/恢复 Atom 在正式工作簿入口可见              |
| W5   | UI-504 完成                     | 一个 print 表面改动者                | 页面设置以严格 ACK/read-back 安全提交                |
| W6   | UI-516 完成                     | 一个 runtime/adapter 所有者          | PrintConfig 权威层与持久化语义已明确                 |
| W7   | W3 Presence 订阅完成            | 一个 Presence/Grid 改动者            | 远端光标在当前 Sheet 的真实单元格几何中可辨识        |
| W8   | UI-209 的已知残余               | 一次一个 producer 域                 | 每个后端 mutation 入口经过同一能力保护               |
| W9   | W2 排序确认会话                 | 一个排序宿主改动者                   | 菜单栏、工具栏与筛选下拉的排序均先确认、再执行       |
| W10  | W3 键盘意图与 Wave5 对话框      | 一个剪贴板快捷键改动者               | Ctrl/⌘+Alt+V 在真实后端打开 Paste Special 对话框     |
| W11  | W10 与 Worker 名称框导航        | 一个剪贴板投影改动者                 | B2:E8 粘贴到 G2 后，经名称框可见地验证 G2:J8         |
| W12  | W5/W6 的打印设置与 Wave5 菜单栏 | 一个打印预览 E2E 改动者              | TS/WASM 均验证真实菜单入口、关闭路径与 File 焦点返回 |
| W13  | 已提交的 UI-555 与条件格式交付  | 仅文档账本串行续接                   | 每项交付都有提交证据；Color Scale 已按序补号 UI-558  |

## 详细执行页

- [W0：共享状态和宿主边界](interaction-execution/W0-foundations.md)
- [W1：网格、编辑和内容复用](interaction-execution/W1-grid-and-editing.md)
- [W2：命令、结构和数据工作流](interaction-execution/W2-commands-and-data.md)
- [W3：运行时、可访问性和环境适配](interaction-execution/W3-runtime-and-accessibility.md)
- [W4：反馈入口装配](interaction-execution/W4-feedback-host-integration.md)
- [W5：打印设置入口](interaction-execution/W5-page-setup.md)
- [W6：PrintConfig 后端权威存储](interaction-execution/W6-print-config-backend.md)
- [W7：远端协作定位](interaction-execution/W7-presence-grid-placement.md)
- [W8：历史记录能力收敛](interaction-execution/W8-history-producer-guard.md)
- [W9：命令入口一致性](interaction-execution/W9-command-surface-consistency.md)
- [W10：剪贴板快捷键契约](interaction-execution/W10-clipboard-shortcuts.md)
- [W11：剪贴板投影可见性](interaction-execution/W11-clipboard-projection.md)
- [W12：打印预览菜单闭环](interaction-execution/W12-print-preview-menu.md)
- W13：近期交付账本续接见下方映射（不单建执行页）。

## W13：近期交互交付账本续接

本节核对至 `dddae60`（含）的已提交证据；它不把尚未编号的工作借用既有 issue ID，也不把组件测试表述为浏览器 E2E。

| 叶子                                  | 状态   | 提交证据              | 账本说明                                                                          |
| ------------------------------------- | ------ | --------------------- | --------------------------------------------------------------------------------- |
| UI-555 多区域剪贴板拒绝与诊断反馈     | 已完成 | `0638d17`             | 非连续多区域复制会被拒绝并保留可诊断结果。                                        |
| UI-556A 条件格式规则按当前 Sheet 水合 | 已完成 | `a5a893f`             | 规则缓存、请求票据与活动 Sheet 的边界已落在条件格式 Atom。                        |
| UI-556B 条件格式规则草稿参数编辑      | 已完成 | `cb18c4e` + `dddae60` | 组件覆盖之外，浏览器 E2E（rule-param-edit.spec.ts，TS/WASM）收口原地更新与投影。  |
| UI-556C 条件格式引擎配置与 revision   | 已完成 | `e6d8895`             | 引擎规则配置与 revision 已持久化。                                                |
| UI-558 条件格式 Color Scale 渐变投影  | 已完成 | `ae2ea68`             | 渐变渲染已实现；本轮按序补号 UI-558（顺延 UI-557，不占用 `UI-556D`）。            |
| UI-557 Data Bar 可视化投影            | 已完成 | `73bc137`             | Data Bar grid decoration 与对应执行页已交付。                                     |

## 通用交付证据

每个模型都必须交付：现状复核、只改自己文件范围的 diff、Atom 边界说明、对应单元/组件测试，
以及适用时的 Playwright 用户路径。不得暂存、提交或修改未分配文件；根节点负责审阅和集成。
