# AD-216 · 三方法最小后端（minimal-backend.ts）

一句话：`SpreadsheetBackend` 只有三个必需方法，本目录的 `minimal-backend.ts`
用一个内存 Map 把它们实现完整，并用仓库自带的 TypeScript 做了编译期验证。

## 契约出处

`excel/spreadsheet-ui-core/src/backend/types.ts` 的 `SpreadsheetBackend` 接口
（`export interface SpreadsheetBackend`，约 1091 行起）。逐行数过：

- **必需方法 3 个**（成员名后无 `?`）：
  - `readVisibleProjection(request: VisibleProjectionRequest): Promise<VisibleProjectionResult>`
  - `readRangeProjection(request: RangeProjectionRequest): Promise<RangeProjectionResult>`
  - `setCellInput(request: SetCellInputRequest): Promise<BackendMutationResult>`
- **可选方法 73 个 + 可选只读属性 1 个**（`readonly pasteRangeSupportedKinds?`），
  合计 77 个成员。
  （注意：项目 CLAUDE.md 建议的统计命令
  `grep -cE '^\s+[a-zA-Z][a-zA-Z0-9]*\?[(:]' .../backend/types.ts` 回 **267**——
  它数的是整个文件所有接口的可选字段，不是 `SpreadsheetBackend` 一个接口的
  成员数，见教程正文"发现的不一致"一节。）

所有类型都从包的公开出口拿：`excel/spreadsheet-ui-core/src/index.ts` 有
`export * from './backend'` 与 `export * from './shared'`，示例里
`import type { SpreadsheetBackend, ... } from '@einfach/spreadsheet-ui-core'`
即可，不需要 deep import。

## 示例满足的三条硬约束（逐条对应源码）

1. **回显纪律**。结果必须与请求的 kind / sheetId / requestId / 矩形逐项一致，
   否则 UI core 按 STALE_RESULT 整体丢弃 ——
   `excel/spreadsheet-ui-core/src/projection/index.ts` 的
   `isProjectionResultForRequest`（216-227 行）。示例的两个读方法全部字段
   从请求原样抄回。
2. **revision 关联**。请求未带 `revision` 时由后端报出当前版本；显式带了就
   必须原样回显（`projectionRevisionsCorrelate`，同文件 234-239 行）。示例
   照抄静态参考实现的写法 `request.revision ?? revision`
   （`excel/solid-excel/src-vnext/adapter/static/ports/cell-input.ts` 同款）。
3. **结果有界**。结果格必须都在请求矩形内（CELL_OUT_OF_RANGE）、数量不超过
   矩形容量（RESULT_TOO_LARGE）——`validateProjectionResult`（241-287 行）。
   示例用闭区间 `isInside` 过滤后才输出；矩形不要求填满，空白格不投影。

写方法的语义约束来自 `backend/types.ts` 里 `setCellInput` 的契约注释
（1110-1117 行）：**resolve 成功 ACK = 值真的落地；写不进去必须 reject**，
绝不能 resolve 一个成功形状的结果。内存 Map 写入不会失败，所以示例永远
如实 resolve；换成远端存储时这条是最容易踩的坑。

## 刻意不做的事（诚实边界）

- **没有公式引擎**：`=A1+1` 按普通文本存与显。静态参考后端对
  `readSpillRegion` 的注释给出了原则（`adapter/static/ports/projection.ts`
  16-19 行）：装一个恒回假值的实现"等于谎称"，省掉端口才是契约内的正确答案。
- **没有 undo/redo**：宿主的 `recordHistoryEntry` 会因此拒绝记 history 条目
  （见 AD-217 第三节），Ctrl+Z 恒为"无可撤销"——降级而非报错。
- **没有 `listSheets`**：sheet 按请求里的 `sheetId` 惰性创建。

## 挂载方式

```tsx
import { SpreadsheetUiProvider } from '@einfach/solid-excel/vnext' // 以实际导出为准
import { createMinimalSpreadsheetBackend } from './minimal-backend'

const backend = createMinimalSpreadsheetBackend({
  sheetId: 'sheet-1',
  cells: [{ row: 0, col: 0, input: 'hello' }, { row: 0, col: 1, input: '42' }],
})

<SpreadsheetUiProvider backend={backend}>...</SpreadsheetUiProvider>
```

`SpreadsheetUiProviderProps.backend: SpreadsheetBackend`
（`excel/solid-excel/src-vnext/provider/types.ts` 15-16 行）——类型上就是
这个三方法接口，Provider 挂载时对全部可选端口做一次能力捕获
（`provider/SpreadsheetUiProvider.tsx` 154 行 → `capability-capture.ts`），
缺席端口按各特性的降级契约处理，不会因为"方法不存在"而崩。

## 验证记录（2026-08-17，实际跑过）

在仓库根目录（`/Volumes/work/self/excel`，用仓库自带 typescript 5.8.3）：

```
$ npx tsc --noEmit -p <scratchpad>/ad216/tsconfig.json
$ echo $?          # → 0，零错误
$ npx tsc --version # → Version 5.8.3
```

tsconfig 要点（见同目录 `tsconfig.json`）：`strict: true`、
`moduleResolution: "bundler"`、`paths` 把 `@einfach/spreadsheet-ui-core`
指到仓库已构建的声明 `excel/spreadsheet-ui-core/@types/index.d.ts`；
`lib` 需要 `["ES2022", "DOM"]`——ui-core 的公开类型面引用了 `Blob`
（`@types/copy-as/*.d.ts`），`@einfach/core` 的声明引用了
`AbortController`，纯 ES lib 下这两处会先报环境错（TS2304）。
**注意必须从仓库根目录跑**：在 scratchpad 目录里 `npx tsc` 会命中 pnpm
的 tsc 拦截脚本（"This is not the tsc command you are looking for"）。

**阴性对照**（证明类型标注真的在管事）：把 `setCellInput` 改名为
`setCellInputRenamed` 后重跑，tsc 退出码 2，报
`TS2353 ... 'setCellInputRenamed' does not exist in type 'SpreadsheetBackend'`。
即：三方法一个不能少，多余成员名也进不去。
