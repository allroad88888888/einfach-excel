# W8：历史记录能力收敛

> 状态：UI-519a、UI-519b 已完成；下一步为 UI-519c 的 editing 与 auto-fill 迁移

## 目标

让每一条会生成撤销记录的 mutation 路径，先经过同一份后端 undo/redo capability guard，再写入
history Atom。继续保留既有 history Atom 作为历史事实的唯一权威，不在 Solid 或 adapter 中建立影子账本。

## 已知起点

- UI-209 已把 Timeline 的错误/恢复呈现和 refresh-only retry 收拢到 Provider 契约；提交为
  `5d5ca8b`。
- 该 issue 的交付记录明确保留了一项风险：若 mutation producer 直接写 `pushHistoryAtom`，就绕开了
  `recordHistoryEntry` 的 undo/redo capability guard。
- 初步检索显示该模式同时存在于 vnext Grid mutation、Core toolbar/viewport/outline/text-to-columns
  等域。范围与迁移顺序必须先由独占审计确认，不能按文本替换或跨域混改。

## B：现状和边界审计（已完成）

- 唯一模型：`model-519-history-producer-audit`。
- 审计每个 `pushHistoryAtom` 写入点：它是否是生产 mutation、是否已经位于能力已验证的上游、以及
  保留 history 的 transaction / revision / range 语义。
- 明确 `recordHistoryEntry` 的正确注入位置：backend runtime handle 可以留在 Provider/adapter 边界，
  不能进入 Atom，也不能回退为 module 单例。
- 列出可迁移路径、测试 owner、文件独占冲突和需要拆分的超长文件；审计阶段不改代码、不暂存、不提交。

审计基线覆盖 670 个相关断言且全部通过。结论是：`recordHistoryEntry` 目前只有自测调用；每个真实
后端 mutation producer 都绕过它。不能全局替换，因为 `viewport/freeze.ts`、`viewport/hidden.ts` 与
`outline/index.ts` 使用的是 Core `localReplay`，没有 backend，直写 `pushHistoryAtom` 是正确的本地回放
路径，必须保留。

## C：实施分片

| 子 Issue | 范围 | 前置 | 判定 |
| --- | --- | --- | --- |
| UI-519a | Grid editing、clipboard、format 的直接后端 mutation | 无 | 已完成：三个 host controller 在 ACK 后经同一 Provider guard 记录 history。 |
| UI-519b | Core command 的 `recordHistory(entry, append)` callback port | UI-519a | 已完成：recorded / unavailable / rejected 三态 ABI；不把 backend 放进 Atom 或单例。 |
| UI-519c | editing 与 auto-fill | UI-519b | 保留已有 reservation、transaction、revision、refresh。 |
| UI-519d | paste-special 与 text-to-columns | UI-519b | 保留 reserved/direct 的原有差异；无能力时只跳过 history。 |
| UI-519e | operations 与 toolbar | UI-519b | 高风险结构事务，单独处理 cross-sheet/localSidePayload。 |
| UI-519f | tables、filter-sort、remove-duplicates | UI-519b | 最后处理多入口表格与筛选命令。 |

### UI-519a 交付（已完成）

`grid-editing-controller.ts`、`grid-clipboard.ts` 与 `grid-format-controller.ts` 的所有直接后端 mutation
均在 ACK 后改调同一处 Provider `recordHistoryEntry(store, backend, entry)`：完整 undo/redo capability
时写入；仅 undo、仅 redo或都缺失时 mutation 继续成功、刷新照常、history 为空。原有 transactionId、
revision、affectedRange 与错误分支没有变化，guard 的 `false` 不会被当作 mutation 失败。

新增聚焦回归覆盖编辑、粘贴和格式三条路径的 full / undo-only / redo-only / none 能力组合。两条既有
`history=1` Grid 回归的 backend mock 现明确提供成对 undo/redo port；其中
`vnext-grid.test.tsx` 为 4,665 行存量测试，本次只增 10 行 mock，不在本 issue 顺手重构。定向 Jest
95 tests、Solid TypeScript 与 diff check 均通过；受影响的两个生产 controller 原有 6 条 max-len lint
错误未随本次窄改格式化，新增差异没有 lint error。

### UI-519b recorder ABI（已完成）

不能让 Core reserved producer 直接调用 `recordHistoryEntry`：它们已持有 `HistoryProducerReservation`，
再次 `pushHistoryAtom` 会二次 acquire。UI-519b 将只定义同步 `HistoryEntryRecorder(entry, append)`：Host
先以同一个 capability guard 决定 `recorded`、`unavailable` 或 `rejected`，Core 再通过传入的 `append`
保持 `pushReservedHistoryAtom` 或 `pushHistoryAtom` 的原有账本语义。后续 production producer 按 UI-519c
至 UI-519f 串行接入，避免与此 ABI 设计混改。

Core 现在导出同步的 `HistoryEntryRecorder(entry, append)`、`HistoryEntryAppender` 与
`HistoryRecordResult`。Provider 的 `createHistoryEntryRecorder` 在调用时才通过既有
`backendSupportsHistory` 检查稳定转发 backend 的完整 undo/redo 能力：完整能力时调用 Core append；
不完整时返回 `unavailable` 而不调用 append；append 返回 false 或抛异常时返回 `rejected`。它不写 Atom、
不缓存 backend method，也不调用会再次申请 reservation 的 `recordHistoryEntry`。

聚焦回归覆盖 full、undo-only、redo-only、none、append false/throw，以及同一 workbook 中 mutation ACK
之后 runtime backend capability 替换。Core 和 Solid TypeScript、Prettier、diff check 均通过；范围 ESLint
为 0 error（仅项目既有 Jest dependency 规则 warning）。

## D：实施门槛

- 不改 `pushHistoryAtom` 的底层账本状态机，除非审计证明 guard 必须向 Core 下沉。
- 每个后端 producer 使用同一个已审计的 guard，不生成第二个 `backendSupportsHistory` 判断。
- 无能力时 mutation 本身仍按原有语义执行；仅 history 记录拒绝，并确保不伪造可 undo 的 UI 状态。
- 每个 producer 域覆盖成功、只支持 undo、只支持 redo；UI-519b 额外覆盖同一 workbook 的 runtime
  capability 替换与 recorder `rejected` 语义，cross-sheet transaction 留给对应域。
- 新增或大改源文件、测试均遵守单一职责和 300 行上限。

## E：交付门禁

- 相关 Core、Solid 和 adapter 定向 Jest 通过。
- 对受影响 package 运行 TypeScript；范围内 ESLint 0 error、Prettier 和 diff 检查通过。
- 每个独立实现 issue 只暂存自己的精确文件，由根节点单独提交。

## 保留边界

- `pushHistoryAtom` 继续是 Core history stack 的账本权威；它不会被做成全局 backend guard。
- 后续 Core command 只接受当前 dispatch 捕获的 recorder callback，并在 mutation ACK 后调用，以支持同一
  workbook 的 runtime capability replacement；它不得透传或缓存 `SpreadsheetBackend`。
