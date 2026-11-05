# 工作簿插件

`plugins/*` 是可选功能包，宿主按需安装，通过 `<Spreadsheet plugins={[...]} />` 挂载。
工作簿核心（`excel/*`、`packages/*`）在没有任何插件时行为不变，也不 import 任何插件。

## 包结构

| 入口 | 内容 | 适用规则 |
|---|---|---|
| `@einfach-excel/plugin-<name>/core`（`src/core/`） | 插件自有 atom 与命令，框架无关 | 同 UI Core：不依赖视图框架；debugLabel 用 `plugin.<name>.<atom>` |
| `@einfach-excel/plugin-<name>`（`src/` 其余） | React 组件与 `SpreadsheetPlugin` 描述对象 | 同 react-excel：不声明 atom、不用 `useState`/`useReducer` 存表格状态、不直接调 `store.getter/setter/sub` |

插件只能经核心包的**根入口**接入（`@einfach-excel/react-excel`、`@einfach-excel/spreadsheet-ui-core`），
不得深引内部路径，插件之间不得互相依赖。`npm run check:presentation` 与 `npm run check:cycles` 机械守卫这些边界。

## 贡献点（`SpreadsheetPlugin`，类型见 `excel/react-excel/src/plugin/types.ts`）

- `ribbon`：功能区分组，排在内置分组之后，沿用内置的分类显隐。
- `contextMenu`：单元格右键菜单项，排在内置项（`cells.insert`、`cells.delete`）之后；一个菜单项派发一个零参数命令 atom。
- `editorAdornments`：与单元格编辑器同层渲染，跟随网格滚动与缩放。
- `panels`：对话框与面板，挂在工作簿视图根部。
- `messages`：已编译的 Lingui 目录，并入工作簿自己的 i18n 实例。

需要新的工作簿数据或 Rust 命令时，先在核心补一条通用、明确的命令，再由插件 Core 调用；
不要让插件改 `excel/*` 的内部文件。

## 新建插件

1. 复制 `plugin-sample` 的 `package.json`、`tsconfig.json`（继承 `plugins/tsconfig.plugin.json`）与 `vitest.config.ts`。
2. 根 Vitest、lint、typecheck、依赖检查已按 `plugins/*` 自动覆盖，无需逐个登记。
3. 用户可见入口在 `excel/react-excel/e2e/FEATURES.md` 登记并写真实 DOM 主用例；演示站经
   `excel/react-excel/src/page/demo/demo-presentation.ts` 的 `?plugins=<id>` 挂载。

`plugin-sample` 是仓内样例，覆盖全部贡献点，不发布。
