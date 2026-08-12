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
│   └── UI-101…UI-107、UI-201…UI-210 已完成；交付和保留边界见下表
├── W2 命令、结构与数据工作流（已完成）
│   └── UI-301…UI-309、UI-401…UI-409 已完成；交付和保留边界见下表
├── W3 运行时、可访问性与适配（已完成）
│   └── UI-501…UI-514 已完成；独立功能回归通过，仓库级 lint 存量待单列治理（见下表）
├── W4 反馈入口装配
│   └── UI-515 全局诊断与恢复反馈入口（已完成；见下表）
├── W5 打印设置入口（已完成）
│   └── UI-516 页面设置编辑与打印预览衔接（已完成；见下表）
├── W6 PrintConfig 后端权威存储（已完成）
│   └── UI-517 PrintConfig 后端持久化与 Worker RPC（已完成；见下表）
└── W7 远端协作定位（已完成）
    └── UI-518 Presence 网格几何与身份呈现（已完成；见下表）
```

| 波次 | 进入条件                    | 允许的并行度                         | 解锁条件                                      |
| ---- | --------------------------- | ------------------------------------ | --------------------------------------------- |
| W0   | 已完成只读审计              | 仅文件范围不重叠的基础节点           | Atom 边界、公开契约和针对性测试成立           |
| W1   | IX-001、IX-002 完成         | 一个 grid 宿主改动者；其余按领域并行 | 体验入口不再依赖临时状态或无类型 runtime      |
| W2   | IX-004、IX-005 完成         | 菜单、工具栏、对话框按独占模块并行   | 共享命令壳和焦点约定不再被叶子重复实现        |
| W3   | IX-001、IX-005、IX-006 完成 | 按独占运行时领域并行                 | 反馈、恢复、键盘和响应式路径有可复核证据      |
| W4   | W3 完成                     | 一个 host 入口改动者                 | 已有诊断/恢复 Atom 在正式工作簿入口可见       |
| W5   | UI-504 完成                 | 一个 print 表面改动者                | 页面设置以严格 ACK/read-back 安全提交         |
| W6   | UI-516 完成                 | 一个 runtime/adapter 所有者          | PrintConfig 权威层与持久化语义已明确          |
| W7   | W3 Presence 订阅完成        | 一个 Presence/Grid 改动者            | 远端光标在当前 Sheet 的真实单元格几何中可辨识 |

## 详细执行页

- [W0：共享状态和宿主边界](interaction-execution/W0-foundations.md)
- [W1：网格、编辑和内容复用](interaction-execution/W1-grid-and-editing.md)
- [W2：命令、结构和数据工作流](interaction-execution/W2-commands-and-data.md)
- [W3：运行时、可访问性和环境适配](interaction-execution/W3-runtime-and-accessibility.md)
- [W4：反馈入口装配](interaction-execution/W4-feedback-host-integration.md)
- [W5：打印设置入口](interaction-execution/W5-page-setup.md)
- [W6：PrintConfig 后端权威存储](interaction-execution/W6-print-config-backend.md)
- [W7：远端协作定位](interaction-execution/W7-presence-grid-placement.md)

## 通用交付证据

每个模型都必须交付：现状复核、只改自己文件范围的 diff、Atom 边界说明、对应单元/组件测试，
以及适用时的 Playwright 用户路径。不得暂存、提交或修改未分配文件；根节点负责审阅和集成。
