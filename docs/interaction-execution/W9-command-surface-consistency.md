# W9：命令入口一致性

> 本波收口已经具备领域 Atom 会话、但仍有个别入口绕过它的交互断层。每个节点先复核真实
> 命令路径；不能因入口不同复制业务状态或后端调用。

| 来源 Issue | 唯一模型 | 状态 | 独占范围 | 前置 | 交付 |
| --- | --- | --- | --- | --- | --- |
| UI-527 菜单栏排序确认会话 | `model-527-menu-sort-confirmation` | 已完成（`a9f0196`） | `src-vnext/menu-bar/**`，必要时 `src-vnext/sort/useSortConfirmation.ts`，聚焦测试 | UI-403、UI-303 | 菜单栏升序/降序复用既有排序确认会话；不在确认前提交 mutation。 |

## UI-527 执行树

```text
菜单栏排序与工具栏排序一致
├── A. 现状契约（完成）
│   └── 菜单栏直接调用 physical-sort；工具栏已有 Atom 确认会话
├── B. 入口接线（完成）
│   └── 菜单命令请求已有确认会话，保留 menu-bar entrypoint
├── C. 对话框装配（完成）
│   └── 复用已有 range/direction/retry/focus 契约，不复制状态
├── D. 验证（完成）
│   ├── 菜单触发不在确认前 mutation
│   ├── 确认、取消、Escape、准备失败重试
│   └── Solid TypeScript、范围 lint/format/diff
└── E. 交付（完成）
    └── `a9f0196 fix(menu-bar): confirm sort before execution`
```

## 边界

- 排序范围、方向、会话、加载和错误继续由既有 `@einfach` Atom 持有。
- DOM ref 只用于对话框锚定与焦点归还；不得引入 Solid 产品状态或后台句柄 Atom。
- 不改 physical-sort Core、工具栏入口、公开导出或文档以外的功能面。
- 完成前需要由根节点独立复核 diff、文件行数、焦点路径和失败路径，再按 Issue 单独提交。

## 交付证据

- 聚焦 Jest：`vnext-menu-bar-sort-confirmation`、`vnext-sort-confirmation`、
  `vnext-filter-sort-entrypoints`，共 3 suites / 9 tests 通过。
- `npx tsc --noEmit -p excel/solid-excel/tsconfig.json`、范围 ESLint（0 errors）、范围
  Prettier 与 `git diff --check` 均通过；测试依赖路径仍有仓库配置造成的 2 条 warnings。
- 全量 `vnext-menu-bar.test.tsx` 的 9 条非排序 historyStack 断言失败，已在 `5e5339d`
  的独立 worktree 原样复现；本项未扩大范围处理该既有测试夹具问题。
