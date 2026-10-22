# 同 Store 宿主数据接口

`@einfach/spreadsheet-ui-core` 根入口导出本页所有 atom/类型。宿主使用组件的同一个
`@einfach/core` Store。一个 Store 同时只属于一个工作簿；多个组件实例必须各用一个
Store。React 产品代码继续只使用 `@einfach/react` hooks。

## 原始值与批量事务

```ts
const result = await store.setter(writeWorkbookCellsAtom, {
  source: 'api', // 也可为 refresh；缺省为 api
  cells: [
    { sheetId: 'orders', row: 0, col: 0,
      input: { kind: 'literal', value: { kind: 'string', value: '00123' } } },
    { sheetId: 'orders', row: 0, col: 1,
      input: { kind: 'formula', formula: '=A1&"!"' } },
  ],
})
if (result.status === 'error') console.error(result.error)
else console.log(result.changed, result.revision, result.displayError)

const read = await store.setter(readWorkbookRangesAtom, {
  targets: [{ sheetId: 'orders', range: {
    rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 4,
  } }],
})
if (read.status === 'ok') console.log(read.ranges)
```

坐标零基、范围包含两端。`RawCellValue` 是 number/string/boolean/blank/error 判别联合，
error 使用原生代码（例如 `#DIV/0!`、`#TYPE!`）；数字必须有限。字面量字符串不经过输入
解析，因此 `00123`、`=1+2`、空白字符与空字符串可精确保存。公式必须以 `=` 开头，公式
源与 `value` 当前求值结果分开；`input` 是原生未格式化输入文本，不是 display。

每次写入最多 4096 格，原始输入加原前像预算 4 MiB，重复坐标整批拒绝。所有表/坐标/
值/公式/原生保护先校验，然后由一个 Rust Store 事务写入；失败完整回滚，不清旧历史，
成功是一条撤销步骤。原生数据验证仍执行，`source` 不提供越权能力。首版明确拒绝写入
Table 内容、已有 spill 区域、合并覆盖格；这些目标需要其既有专用原生命令。

一次读取最多 64 个范围、合计 4096 个返回格与约 4 MiB 原始文本/记录预算；超预算明确
返回错误，宿主应拆分范围。所有范围在一次原生调用中读取，返回同一修订号，不依赖 UI
选区。空格被省略，空字符串被保留；无独立源输入的 spill 子格被省略。对事件范围增量
保存时，应先移除本地该范围旧条目，再填入返回的稀疏条目，才能保存清空操作。
上述值增量保存只适用于实际单元格输入变化。非空事件 ranges 也可能表示全轴格式/尺寸，
超出当前逻辑画布或读取预算，不能保证直接交给 typed read。按需与画布相交并按预算切分；
格式、规则、尺寸、保护等元数据应使用现有原生 export 保存，typed cell read 不包含它们。

读取公式会触发原生惰性求值，可能启动已配置的异步公式；当前返回值可能为 `#BUSY!`。
稍后的计算结算不是持久输入修改，不产生 `user` 修改事件。宿主若需要结算结果，可再次
显式读取。计算依赖的求值成本不由返回格数预算限制。
数组锚点返回左上角当前值；独立 LAMBDA 格按原生规则返回 `#CALC!`。
若原生返回协议未包含的内部类型，读取明确报 `HOST_VALUE_UNSUPPORTED`，不伪装成 blank。

API 返回 `status: 'ok' | 'error'`，正常拒绝不会变成未处理 Promise 拒绝。读取成功结果
为 `{status:'ok', ranges}`；写入成功结果为 `{status:'ok', changed, revision}`；错误为
`{status:'error', error:{code,message}}`。没有变化返回 `ok/changed:false`。如果原生已提交
但展示刷新失败，仍返回 `ok/changed:true`，另带 `displayError`，提交事件仍会发布。
连接中断/销毁/换簿导致写入结果不可确定时，错误带 `commitStatus:'unknown'`；不可据此
假定回滚或盲目重试，宿主应恢复连接并读回确认。

## 成功修改订阅

```ts
const unsubscribe = store.sub(workbookChangeAtom, () => {
  const event = store.getter(workbookChangeAtom)
  if (!event) return
  // event.connectionId + operationId 标识一次真实提交；插件自行决定 dirty 策略。
  for (const change of event.changes) console.log(change.sheetId, change.ranges)
})
// 宿主卸载时执行 unsubscribe()
```

事件来自 Rust 提交事实，覆盖 UI 输入、粘贴、清除、填充、格式、历史回放、结构及元数据；
跨表剪切同时报告源表、目的表及实际重写的引用位置。稀疏位置可被压缩为有限包围矩形，
行列样式/尺寸使用真实全轴范围。空 `ranges` 表示该表目录元数据变化；它不代表 A1 修改。
元数据保存可使用既有原生工作簿导出，不能只靠原始单元格值保存格式/规则/保护。
Custom formula 定义属于全簿目录，事件 `changes:[]`，不虚构任何工作表或 A1 修改。

`operationId/revision/source/kind/changes/connectionId` 是事件字段。`source` 为
user/api/import/refresh/history。失败与 noop 无成功事件；滚动、投影与计算结算无修改事件。
初始化或成功换簿发布一个 `import` / `workbook.open` 事件，`changes:[]`，表示整份文档
身份更换。宿主自行决定是否将导入或刷新标脏。原生已经提交但 UI 投影失败属于提交成功，
UI RPC 错误码 `WORKBOOK_COMMITTED_PRESENTATION_FAILED` 明确携带 `committed:true`。
若提交事实无法组装稳定 sheetId，明确发布 `kind: '<原命令>.committed-unmapped'`、
`changes:[]` 的整簿失效事件：这不是无修改或普通元数据通知，宿主必须 export/重新同步整簿，
不能仅做范围增量。当前 RPC 的 committed 诊断保留原生 fact、notificationError 与
notificationPublished。若消息发布通道本身失效，无法保证通知/响应送达，但故障消息不会
阻塞后续队列；恢复后需读回或 export 确认，不得假定回滚。

atom 仅保存最近事件，不保存无限日志。每个连接身份独立，即使 revision 都从零开始，旧
连接的迟到事件/读写结果也不能写入新 Store 工作簿。释放连接会取消订阅并拒绝在途 RPC。

## 宿主控制与换簿

```ts
await store.setter(configureHostControlsAtom, {
  readOnly: true, busy: false, allowSheetStructure: false,
})
```

默认 false/false/true；配置可只传需修改字段。`readOnly` 阻止用户/API 的所有持久写入；
`busy` 阻止 user/history，允许显式 api/refresh 批量写入；`allowSheetStructure:false`
阻止工作表增删改名移动、行列插删及相关撤销/重做。这些是宿主交互策略，不是服务端授权。
Core 与 Worker 在执行前统一检查，Rust 自身保护仍是最终写入门禁。只读查询与初始化不被
误挡；连接发布后初始化导入接口关闭，不能被运行期调用绕过只读控制。

`replaceRustWorkbookRuntimeAtom(text: string | null)` 接受宿主内存中的原生文件文本；
null 新建空工作簿。候选 Worker 完成文件验证与当前宿主控制同步后才交换。失败返回 false，
旧工作簿保留；`workbookReplacementErrorAtom` 提供诊断。成功返回 true 并发布 import
事件。同 Store 重启/换簿保留宿主控制，旧连接被释放。
