# 同 Store 数据与交互控制

从 `@einfach/core` 创建 Store，将同一个实例传入 `<Spreadsheet store={store} />`。
React 产品组件使用 `@einfach/react` hooks；以下是宿主服务代码，不是 React 工作簿状态副本。
UI Core 的所有公开 atom/类型从 `@einfach-excel/spreadsheet-ui-core` 根导入。

```ts
import { createStore } from '@einfach/core'
import { readWorkbookRangesAtom, writeWorkbookCellsAtom, workbookChangeAtom,
  configureHostControlsAtom } from '@einfach-excel/spreadsheet-ui-core'

export const store = createStore()
const stop = store.sub(workbookChangeAtom, () => {
  const change = store.getter(workbookChangeAtom)
  if (change) enqueueForSaving(change) // 同步取走事件，自行管理异步保存队列
})
const written = await store.setter(writeWorkbookCellsAtom, { cells: [
  { sheetId: 'orders', row: 0, col: 0,
    input: { kind: 'literal', value: { kind: 'string', value: '00123' } } },
  { sheetId: 'orders', row: 0, col: 1, input: { kind: 'formula', formula: '=1+2' } },
] })
if (written.status === 'error') console.error(written.error)
const read = await store.setter(readWorkbookRangesAtom, { targets: [
  { sheetId: 'orders', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 } },
] })
if (read.status === 'ok') console.log(read.ranges)
await store.setter(configureHostControlsAtom, { busy: true, allowSheetStructure: false })
// 宿主释放订阅时调用 stop()；Worker 释放仍由组件/Core 所有。
```

坐标零基，范围包含两端。读接口一次 native 调用，返回各区域同一 revision 的稀疏 cells。
每格提供原始 input、可选 formula 和 typed 当前 value；value 为 number/string/boolean/blank/error
判别联合。公式源独立于计算值，`12.5%` 的 number 仍为 `0.125`。字面量不经过输入解析，
`00123`、`=1+2`、空格及空字符串可精确写回。空格单元和 spill 子格省略，空字符串保留。

每次读最多 64 区域、4096 个返回格与约 4 MiB 文本；写最多 4096 格与约 4 MiB 输入及前像。
一批写入只产生一次 Rust 原子事务和一次 undo。非法公式、越界、保护或任一非法目标使整批拒绝。
首版 patch 拒绝 Table 内容、已有 spill/blocked anchor、合并非锚点；复杂对象用已有专用命令
或原生文件换簿。业务格式的转换由宿主完成，RustWorkbookDefinition 与 `.einfach.json` 是本轮输入。

`workbookChangeAtom` 只保存最近成功事件，不是可靠事件日志。订阅者应同步取走事件，自行排队。
事件包含 connectionId、operationId、revision、source、kind 和各 sheetId 的真实修改 ranges。
source 是 user/api/history/import/refresh：宿主通常只把 user/api/history 记为需要保存的用户修改。
失败、noop、投影、纯重算及异步计算缓存不会生成用户输入事件。跨表剪切包括源、目标和被改写
公式所在的各自坐标；undo/redo 同样给出真实范围。换簿成功发一次 import，失败保留旧簿。
导入会分配新 sheetId；从同 Store 的 `workbookDocumentAtom` 读取当前表目录，不沿用旧连接的 ID。

值输入变更可按事件范围读 typed 增量；元数据请用既有原生 export 保存。空 ranges 表示表元数据，
非空 ranges 也可能是格式/尺寸的全轴范围，超过逻辑画布或读预算，不能无条件原样传给 typed read。
格式、规则、保护、表目录等不由 typed cell read 完整表达。
`${kind}.committed-unmapped` 且 changes 为空表示已提交后的整簿失效，必须 export/重同步。

read/write/configure 都返回 `status: 'ok' | 'error'`。写成功给 changed/revision，可附 displayError：
原生已提交而展示失败不能当作回滚。连接断线导致 error.commitStatus 为 unknown 时先读回确认，
不可盲重试。旧连接结果不进入新簿。事件通道本身失效时不能保证送达，宿主需恢复和读回。

hostControls 默认 `{ readOnly: false, busy: false, allowSheetStructure: true }`。
readOnly 拒绝所有持久修改；busy 拒绝用户/历史、允许明确 api/refresh 更新；结构策略拒绝 sheet
增删改名移动与行列插删及相关历史回放。它们不是工作簿保存内容，不生成 dirty 事件。
原生保护始终生效；宿主锁解除不会解除原生保护，允许区也不能越过宿主 readOnly。
导出、typed 读取和查询在 readOnly 下仍可使用。
