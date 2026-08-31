# AD-218 · 接自己的后端：从三个方法到渐进增强

一句话：`SpreadsheetBackend` 的必需面只有三个方法，实现它们你就有了一张
能看能编辑的表；其余 70 多个可选端口是能力开关，装一个亮一个入口，
不装就按各特性的降级契约收场。

配套材料（同目录）：

- `minimal-backend.ts` + `minimal-backend.md`（AD-216）——可通过
  `tsc --noEmit` 的最小实现与验证记录。
- `degradation-demo.md`（AD-217）——三个可选端口的降级源码引证。

## 1. 你的后端站在哪一层

```
excel/spreadsheet-ui-core        ← atoms、类型、投影契约（无 DOM/worker/WASM）
        ↑  SpreadsheetBackend 端口（backend/types.ts）      ← 你要实现的就是这条边
excel/solid-excel/src      ← Solid 组件、Provider、参考适配器
        ↑
excel/rust/excel-core + wasm     ← 官方公式引擎（经 worker）
```

UI core 对数据源的全部认知就是 `SpreadsheetBackend` 这一个接口
（`excel/spreadsheet-ui-core/src/backend/types.ts`）。工作簿事实（格值、
公式、依赖图）住在端口后面，不进 UI atoms。仓库自带两个参考实现
（`excel/solid-excel/src/adapter/`）：`static-backend.ts`（内存，
本教程最小示例的蓝本）与 `worker-workbook-backend.ts`（RPC 到持有 WASM
Workbook 的 worker）。挂载只需一个 prop：
`<SpreadsheetUiProvider backend={yourBackend}>`
（`provider/types.ts:15-16`）。

## 2. 为什么必需的只有三个

三个必需方法正好是表格 UI 的最小闭环：

| 方法 | 谁在用 | 干什么 |
| --- | --- | --- |
| `readVisibleProjection` | 视口 | 滚到哪读哪，驱动可见显示 |
| `readRangeProjection` | 命令 | 复制、Go To、对话框等显式读一块（独立 busy 车道，不碰可见显示） |
| `setCellInput` | 编辑 | 提交一格原始输入 |

读是"投影"不是"取数据库"：返回的 `DisplayCell` 是显示事实（displayValue、
valueKind、格式……），不是存储模型。两条读路径分开是刻意的——
`docs/PROJECTION_BOUNDARY_CONTRACT.md` §"Visible-window lifecycle"：可见窗
口有自己的生命周期（一个在飞、一个排队、旧的作废），range 请求"is not a
mechanism for replacing the visible display snapshot"。

其余一切——多 sheet、行列结构、格式、查找替换、undo、冻结、合并、
条件格式、表格、协作 presence——全是可选端口。数字口径（2026-08-17 逐行
数过）：3 个必需方法、73 个可选方法、1 个可选只读属性
（`readonly pasteRangeSupportedKinds?`），合计 77 个成员。

## 3. 投影契约的有界性：矩形外的数据会被拒收

UI core 不信任后端返回的任何东西，请求前、结果后各查一轮
（`excel/spreadsheet-ui-core/src/projection/index.ts`；契约文档
`docs/PROJECTION_BOUNDARY_CONTRACT.md`；契约测试
`excel/spreadsheet-ui-core/test/projection-contract.test.ts`）：

**请求侧**（`validateProjectionRange`，151-202 行）——不合格的请求根本
不会到达你的后端：

- `INVALID_SHEET`：sheetId 空串；
- `INVALID_REQUEST_ID`：requestId 必须非零安全整数；
- `INVALID_RANGE`：边界必须非负整数；
- `EMPTY_RANGE`：空矩形不发；
- `RANGE_TOO_LARGE`：格数超上限（`DEFAULT_MAX_PROJECTION_CELLS = 50_000`，
  同文件 36 行）。

**结果侧**（`validateProjectionResult`，241-287 行）——你的返回被逐格核验：

- `STALE_RESULT`：kind / sheetId / requestId / 矩形任何一项与请求不符，
  整个结果丢弃（`isProjectionResultForRequest`，216-227 行）；
- `RESULT_TOO_LARGE`：cells 数量超过矩形容量；
- `CELL_OUT_OF_RANGE`：**任何一个格落在请求矩形外，整个结果拒收**——
  想"顺便多给点周边数据当缓存"是行不通的，边界闭区间
  （`isCellInRange`，138-145 行）。

revision 语义（234-239 行注释）："Revision is an optional content version,
not a request identity witness."——请求没带就报你当前的版本，带了就必须
原样回显。参考写法 `request.revision ?? state.revision`
（静态后端 `adapter/static/ports/cell-input.ts`）。

为什么这么狠：投影边界"must not become the workbook fact store / a formula
cache / a dependency graph / an offscreen snapshot"
（PROJECTION_BOUNDARY_CONTRACT.md §"Deliberate non-ownership"）。有界矩形
就是这条红线的机械执行——UI core 只保留当前显示结果，历史访问过的格子
没有留存资格。

## 4. 第 0 级：三方法最小后端

见 `minimal-backend.ts`（约 180 行，内存 Map，`strict` 下零错误，验证记录
在 `minimal-backend.md`）。要点：

- 每格只存原始输入串，显示值投影时派生——不落第二份状态；
- 回显纪律 + `request.revision ?? revision`；
- `setCellInput` 的铁律（backend/types.ts:1110-1117 注释）：resolve 成功
  ACK = 值真的落地，写不进去必须 reject——否则用户键入静默丢失而 UI core
  已经记账、已经 bump revision；
- 没有公式引擎就诚实地没有：`=SUM(...)` 按文本存显。**不要装假引擎**，
  参见静态后端对 `readSpillRegion` 的注释
  （`adapter/static/ports/projection.ts:16-19`）："装一个恒回 null 的实现
  等于谎称"。

这一级你能得到什么：网格渲染、滚动、选区、键盘导航、单元格编辑、复制。
你得不到什么：undo（条目根本不入栈）、查找替换（控件禁用）、选择性粘贴
（菜单条目消失）、多 sheet 标签页……——全部按降级契约静默收场，无一报错。

## 5. 能力探测：方法在不在，就是能力有没有

Provider 挂载时把 backend 交给九个 capture 命令 atom
（`provider/SpreadsheetUiProvider.tsx:154,174` →
`provider/capability-capture.ts:16-26`），每个 capture 都是一句
`typeof source?.xxx === 'function'`。没有握手协议、没有能力清单 RPC——
**对象上有没有这个方法就是全部真相**。所以：

- 不支持的功能，连方法都不要放上去（哪怕放个 `throw` 的空壳也会被当成
  "支持"，入口亮了、点了才炸——最糟的形态）；
- 部分支持有专门的声明位：如 `pasteRange` 配
  `readonly pasteRangeSupportedKinds?` fail-closed 子集
  （backend/types.ts:1229-1233）。

降级不是一种形态而是三种（源码引证详见 `degradation-demo.md`）：

1. **隐藏**——menu-bar capability 条目整条不渲染（`pasteRange`、
   `removeRows`、`importCellChunks`、`sortRange`…）；
2. **禁用**——find/replace 三态（'unsupported' | 'find-only' |
   'find-and-replace'），按钮在、灰着，命令层还有前置拦截兜底；
3. **饿死**——undo/redo：宿主 `recordHistoryEntry` 见
   `backendSupportsHistory === false` 直接不记条目，undo 按钮因栈空恒禁用
   ——"recording an entry would leave Ctrl+Z lying about its outcome"
   （`provider/history-dispatch.ts:139-144`）。

## 6. 渐进增强路径（推荐顺序）

每一级都独立可用，装到哪级 UI 亮到哪级：

1. **三方法**（第 0 级，上文）。
2. **视口几何**：`readViewportSizeProjection` + `setRowHeight` /
   `setColumnWidth`——行高列宽持久化。
3. **多 sheet**：`listSheets` + `addSheet` / `renameSheet` / `deleteSheet` /
   `reorderSheet`——标签页栏。
4. **历史（必须成对）**：`undoTransaction` + `redoTransaction`。只装一半
   等于没装（`backendSupportsHistory` 要求两者齐备，
   history-dispatch.ts:154-156）。装上之后每个可撤销端口的 ACK 语义都要
   照契约来（如 `AutoFillMutationResult` 区分 proven no-op 与
   exactly-one-transaction，backend/types.ts:864-891）。
5. **批量与结构**：`clearRange`、`importCells` / `importCellChunks`（后者
   同时点亮 Text to Columns）、`insertRows` / `deleteRows` /
   `insertColumns` / `deleteColumns`（注意结果里的 `structuralShift` 位移
   契约，backend/types.ts:844-862）。
6. **查找替换**：先 `searchRange`（find-only 就能用），再 `replaceMatches`
   升到 find-and-replace。span 契约：UTF-16 code unit、半开区间、非空
   （backend/types.ts:1186-1196 注释）。
7. **格式与选择性粘贴**：`setFormatRange`；`pasteRange`
   （可配 `pasteRangeSupportedKinds` 声明只支持值腿）。
8. **推送**：`subscribeContentChanges`——引擎会在 UI 发起的变更之外改内容
   （协作、异步公式）才需要；"hosts must tolerate spurious invocations"
   （backend/types.ts:1296-1303）。
9. 更远处：named ranges、filter/sort（注意 `SetFilterSortResult.
   hiddenRowIndices` 的缺席语义——缺席 = "算不出可见性"，UI 清掉过滤集
   而不是瞎猜，backend/types.ts:902-921）、protection（UI-core canonical，
   端口只是持久化钩子——**不装也拥有完整保护功能**，types.ts:1217-1221）、
   tables、spill、presence、custom formulas。

通用注意事项：

- 读契约注释再动手——这份 types.ts 的注释密度就是文档本体，很多端口的
  "缺席语义"（absent ≠ empty）都写在成员注释里；
- 有的端口缺席时 UI core **自己接管**（protection、filter-sort 可见性），
  有的端口缺席时功能**整体消失**（tables、spill）——两类不要混；
- 结果必须回显请求身份字段；mutation 请求带的 `requestId` / `revision` /
  `cancelToken` 是给你忽略陈旧工作用的（CLAUDE.md §Atom conventions）。

## 7. 验证你的实现

最低成本的一步：类型检查即契约检查。

```
# 仓库根目录（pnpm 仓库里换到别的 cwd 会命中 tsc 拦截脚本）
npx tsc --noEmit -p path/to/your/tsconfig.json
```

tsconfig 参照本目录 `tsconfig.json`：`strict`、`moduleResolution:
"bundler"`、`lib: ["ES2022", "DOM"]`（ui-core 类型面引用 `Blob`、
`@einfach/core` 引用 `AbortController`）、`paths` 指到
`excel/spreadsheet-ui-core/@types/index.d.ts`。本目录的示例在
TypeScript 5.8.3 下零错误；阴性对照（改掉一个必需方法名）如期报 TS2353。

再往上是行为验证：跑 ui-core 的契约测试拿现成的裁判
（`excel/spreadsheet-ui-core/test/projection-contract.test.ts` 钉了
矩形拒收、STALE_RESULT、RESULT_TOO_LARGE 全套），以及 e2e 双后端 parity
矩阵的思路（`excel/solid-excel/e2e/BACKEND_PARITY.md`）。本教程只做了
类型级验证，没有把最小后端挂进 e2e 跑过——这是诚实边界，不是"已验证"。

## 8. 写作过程中发现的契约文档不一致

1. **CLAUDE.md 的成员统计命令口径错**。项目 CLAUDE.md 说"count them with
   `grep -cE '^\s+[a-zA-Z][a-zA-Z0-9]*\?[(:]' .../backend/types.ts`"，该命令
   实际回 **267**——它数的是整个文件所有接口的可选字段（`requestId?:` 之类
   全算），且漏掉 `readonly` 前缀成员、误收多行签名里的参数行
   （`options?: {...}`）。限定到 `SpreadsheetBackend` 接口体内的正确口径是
   73 个可选方法 + 1 个可选只读属性。
2. **"不实现就隐藏入口"以偏概全**。降级实际有隐藏/禁用/饿死三种形态
   （见 `degradation-demo.md`）；find-replace 的工具栏按钮与 Edit 菜单条目
   在端口缺席时依然渲染（禁用/开门后全禁），真正"隐藏"的是 menu-bar 的
   capability 条目与 `<Show>` 包裹的工具栏排序组。
3. **小误差**：`ToolbarEntrypointGroup.tsx` 的 Name Manager 按钮只按
   `sheetId` 有无禁用，不探测 named-ranges 端口——named ranges 的降级发生
   在注册表状态层（`projection-unknown`），入口本身不降级。
