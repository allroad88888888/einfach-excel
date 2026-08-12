# W7：远端协作定位

> 状态：已完成
>
> 依赖：W3/UI-502 已完成的 Presence Atom 投影与 W4/UI-507 Provider 订阅桥接。

## UI-518：Presence 网格几何与身份呈现

### 目标

让当前工作表上的远端光标和选区以网格真实单元格几何呈现，并提供可辨识的参与者标签。

### 非目标

- 不重写 Provider 已有的订阅、会话失效防护或清理逻辑。
- 不新建本地/框架状态，不把 DOM 节点或运行时句柄写入 Atom。
- 不臆造本地 presence 发布协议，也不引入评论、聊天或线程读取。
- 不在审计完成前触碰 Grid、Chrome、Core 或公开出口。

### 执行树

```text
UI-518 Presence 网格几何与身份呈现（已完成）
├── A. 现状审计：Presence 投影、当前挂载点与 Grid 几何输入（完成）
├── B. 定义 Atom 事实到当前 Sheet 网格几何的单向 presenter 契约（完成）
├── C. 在唯一正式挂载路径接入光标/选区/身份呈现（完成）
└── D. 聚焦单元、跨 Sheet、滚动/投影与无障碍回归（完成）
```

### A 的独占范围与验收

**模型所有权（只读）**：

- `excel/spreadsheet-ui-core/src/presence/**`
- `excel/solid-excel/src-vnext/presence/**`
- `excel/solid-excel/src-vnext/grid/grid-overlay-controller.ts`
- `excel/solid-excel/src-vnext/grid/grid-atom-accessors.ts`
- `excel/solid-excel/src-vnext/provider/presence-subscription-bridge.ts`
- 当前各 Demo/Chrome 中 `SpreadsheetPresenceOverlay` 的挂载点与相关聚焦测试。

**验收**：报告现有 Atom 权威边界、唯一正式挂载点、可复用的真实 cell/selection 几何端口、缺失的身份数据，以及 B--D 的最小精确文件清单。审计不写代码、不改测试、不暂存、不提交。

### A 的审计结论

- Core 的 `presenceStateBackingAtom` 私有；`presenceStateAtom` 与 `remoteCursorsAtom` 是只读派生，`applyPresenceUpdateAtom` / `clearPresenceAtom` 是唯一写入口。
- Provider 的订阅桥已经具备 session 失效防护、异常隔离和解绑清理；不重写它，也不触碰本地发布协议。
- 站点正式 Chrome 的全局 overlay 没有 Grid 几何输入，当前把行列索引当像素；Grid 内又有独立的累加行列宽高边框路径。二者必须收敛。
- `grid-overlay-controller.ts#getOverlayCellRect` 已用真实 DOM rect、滚动根坐标和合并锚点，能作为唯一几何入口；单元格位置回调不能表示 row/column/all 范围。

### B--D 的独占范围

**模型所有权（生产与测试）**：

- 修改 `excel/solid-excel/src-vnext/presence/SpreadsheetPresenceOverlay.tsx`
- 修改 `excel/solid-excel/src-vnext/grid/grid-overlay-controller.ts`
- 修改 `excel/solid-excel/src-vnext/grid/SpreadsheetGridView.tsx`
- 修改 `excel/solid-excel/src-vnext/grid/grid-atom-accessors.ts`
- 修改 `excel/excel-site/src/spreadsheet/ChromeDialogs.tsx`
- 新增 `excel/solid-excel/src-vnext/styles/presence-overlay.css`
- 修改 `excel/solid-excel/src-vnext/styles/index.css`
- 新增 `excel/solid-excel/test/vnext-presence-overlay-geometry.test.tsx`
- 新增 `excel/solid-excel/test/vnext-grid-presence.test.tsx`

**严禁改动**：Core presence、Provider/订阅桥、backend transport/types、`SpreadsheetGrid.tsx`、selection/projection controller、Grid Canvas/SVG overlay、Demo、既有 4,655 行的 `vnext-grid.test.tsx`。

### 交付契约

`SpreadsheetPresenceOverlay` 是唯一读取 Presence Atom 的 presenter。它只接收如下单向 DOM 几何回调，且不缓存 DOM/几何、不写 Atom：

```ts
resolveSelectionRect?: (
  sheetId: string,
  selection: SelectionState,
) => { left: number; top: number; width: number; height: number } | null
```

Grid 按实际渲染范围裁剪 cell/range/row/column/all 选择，以两个 `getOverlayCellRect` 真实矩形合成最终范围；未投影范围不显示。Presenter 保留 `aria-hidden="true"`、不抢占焦点，显示 `displayName` 与 `colorHint`。

### 验收

- 当前 Sheet 过滤正确，其他 Sheet 的远端光标/选区不出现。
- Geometry 来自真实 DOM rect，滚动、投影、冻结和合并锚点不会退回为行列累加计算。
- cell、range、row、column、all 均按当前可见区域裁剪；身份标签和颜色可见。
- 旧 Grid Presence 读取路径和无几何的 Chrome 全局挂载均删除。
- 新聚焦测试覆盖上述契约；相关 Core/host 基线通过，类型检查、范围 lint、Prettier、diff check 通过；每个新增/大改文件符合行数职责限制。

### 交付结果

- Grid 内的 `SpreadsheetPresenceOverlay` 是唯一生产 Presence Atom reader；它以
  `resolveSelectionRect` 消费真实 `td` 到滚动根坐标系的矩形。
- 旧的 Grid 累加行列宽高定位和 Chrome 的无几何全局挂载已删除；正式路径只显示当前 Sheet 中、
  当前投影可裁剪到的远端选区。
- Presenter 显示参与者 `displayName` 与 `colorHint`，维持 `aria-hidden` 与不抢焦点约束。
- 聚焦回归覆盖当前 Sheet 过滤、真实滚动 DOM 几何、选择范围裁剪、身份和颜色；相关 Jest 5 suites /
  98 tests、Solid Excel/Site 类型检查、范围 lint、Prettier 与 diff check 均通过。

### 保留边界

为保持非正式旧调用方的兼容性，Presenter 暂保留弃用的 `resolveCellPosition` fallback；正式 Grid
路径始终传入 `resolveSelectionRect`。当其余直接调用方完成迁移后，可在独立 issue 中删除该 fallback。
