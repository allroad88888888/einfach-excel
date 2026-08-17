# 只要 UI 核心：@einfach/spreadsheet-ui-core + 自己的 backend

> 事实来源：`excel/spreadsheet-ui-core/src/backend/types.ts`（端口契约）、
> `excel/spreadsheet-ui-core/src/createSpreadsheetUi.ts`、
> `docs/AD140_NEXT_SMOKE_OBSERVATION.md` 与 `docs/AD141_NUXT_SMOKE_OBSERVATION.md`
> （三方法 stub + `createSpreadsheetUi` 在 Next client bundle 与 Nuxt SSR/客户端实跑通过）。

## 适用场景

你不想要 Solid 组件、也不想要 WASM 引擎 —— 只要框架无关的表格状态层
（atoms、选区、投影协议），数据源自己接（REST、自研引擎、内存表）。
这条路径只装一个包：

```bash
npm install @einfach/spreadsheet-ui-core
```

它不依赖 Solid / React / DOM / worker / WASM（分层规则见仓根 CLAUDE.md
「Three-tier layering」），唯一依赖是 `@einfach/core`（atom 引擎，自动带上）。
已在 Next 15（React 19）与 Nuxt 3（Vue 3）的 SSR + 客户端环境实跑验证。

## 契约：SpreadsheetBackend 三个必选方法

`excel/spreadsheet-ui-core/src/backend/types.ts` 的 `SpreadsheetBackend` 接口里，
**必选的只有三个方法**，其余全部可选：

| 方法 | 职责 |
| --- | --- |
| `readVisibleProjection(request)` | 可见窗口投影：按 `request.window`（CellRange）返回 `DisplayCell[]` |
| `readRangeProjection(request)` | 任意范围投影（剪贴板、公式栏等按需读取） |
| `setCellInput(request)` | 提交一格原始输入；**写不进去必须 reject**，不许 resolve 成功形 ACK |

可选方法（插行删列、合并、冻结、批注、条件格式……几十个）是能力声明：
**省略 = 功能不存在**，UI core 会隐藏对应的菜单/工具栏/快捷键入口，
而不是报错 —— 你的 backend 从三个方法起步，之后按需增量补。

## 可运行片段

以下与 AD-140 / AD-141 冒烟实跑的代码同构（纯 TS，无框架依赖，可直接跑在
node / 任何前端 bundle 里）：

```ts
import { createSpreadsheetUi } from '@einfach/spreadsheet-ui-core'
import type {
  RangeProjectionRequest,
  RangeProjectionResult,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'

// 最小内存 backend：一个 Map 存值，投影按窗口切片
const cells = new Map<string, string>() // key: `${row}:${col}`

const backend: SpreadsheetBackend = {
  async readVisibleProjection(req: VisibleProjectionRequest): Promise<VisibleProjectionResult> {
    const out = []
    for (let r = req.window.rowStart; r <= req.window.rowEnd; r++)
      for (let c = req.window.colStart; c <= req.window.colEnd; c++) {
        const v = cells.get(`${r}:${c}`)
        if (v !== undefined) out.push({ row: r, col: c, displayValue: v })
      }
    return { kind: 'visible-window', sheetId: req.sheetId, window: req.window,
      requestId: req.requestId, cells: out }
  },
  async readRangeProjection(req: RangeProjectionRequest): Promise<RangeProjectionResult> {
    const { cells: out } = await this.readVisibleProjection({
      ...req, kind: 'visible-window', window: req.range })
    return { kind: 'range', sheetId: req.sheetId, range: req.range,
      requestId: req.requestId, cells: out }
  },
  async setCellInput(req: SetCellInputRequest) {
    cells.set(`${req.row}:${req.col}`, req.input)
    return { sheetId: req.sheetId, requestId: req.requestId }
  },
}

const ui = createSpreadsheetUi({ backend })
// ui.store: @einfach/core 的 atom store（getter/setter/sub）
// ui.backend: 传入的 backend 原样返回
```

之后用 `ui.store` 读写 `@einfach/spreadsheet-ui-core` 导出的各 feature atom
（约定：每个 atom 带 `debugLabel = 'spreadsheet.<feature>.<name>'`，各 feature 目录的
README 标注 source / derived / command 分类）。渲染层自己写：订阅投影相关 atom，
把 `DisplayCell[]` 画成你自己的 DOM/canvas。

## 诚实边界

- 上面的内存 backend 片段本身**不做公式求值**：`=1+2` 会被原样存储原样显示。
  公式能力来自引擎侧 backend（worker + `@einfach/excel-wasm` 或
  `@einfach/excel-core-ts`），不是 UI core 的职责。
- 冒烟验证覆盖的是「包可加载 + `createSpreadsheetUi` + 三方法 stub 类型/运行时成立」
  （Next、Nuxt 双环境）；上面这个带切片逻辑的内存 backend 是按契约写的直译，
  未经独立浏览器冒烟。
- 自绘渲染层没有官方参考实现文档；最接近的真实样例是仓内
  `excel/solid-excel/src-vnext/adapter/static-backend.ts`（内存 backend 的完整版）。
