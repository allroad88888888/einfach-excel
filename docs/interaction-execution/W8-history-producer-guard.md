# W8：历史记录能力收敛

> 状态：已完成；UI-519a 至 UI-519i 已独立提交，最终只读验收通过

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
| UI-519c | editing 与 auto-fill | UI-519b | 已完成：在 ACK 后经 required recorder 执行 reserved append；保留 reservation、transaction、revision、refresh。 |
| UI-519d | paste-special 与 text-to-columns | UI-519b | 已完成：保留 reserved/direct 的原有差异；无能力时只跳过 history。 |
| UI-519e | operations 与 toolbar | UI-519b | 已完成：结构事务保留 reservation/localSidePayload，工具栏在完整 ACK 后记录。 |
| UI-519f | tables、filter-sort、remove-duplicates | UI-519b | 已完成：多入口表格、筛选、物理排序与去重都在 ACK 后经 required recorder 写入原有账本。 |
| UI-519g | Grid editing、clipboard、format | UI-519a、UI-519b | 已完成：五条 ACK 后路径统一到 recorder 三态；rejected 不刷新并呈现 outcome-unknown。 |
| UI-519h | tables recorder rejected 恢复顺序 | UI-519f | 已完成：六类表格命令的 rejected/throw 在 catalog 或 projection 刷新前停止。 |
| UI-519i | Remove Duplicates history-capability 测试夹具 | UI-519f | 已完成：成功历史场景明确提供配对 undo/redo port；无能力场景仍验证无 history 降级。 |

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

### UI-519c editing 与 auto-fill（已完成）

`runEditingCommitAtom` 与 `runAutoFillAtom` 的 production input/ticket 现在都要求
`HistoryEntryRecorder`；三个 Solid dispatch 入口在启动命令时注入 Provider 稳定 backend handle 创建的
recorder。Core 不保存 backend，也不存在 optional direct-history fallback。

每条 mutation 在精确 ACK 后才调用 recorder，并把既有 reservation 的 `pushReservedHistoryAtom` 包装为
append callback：`recorded` 保留历史；`unavailable` 让 mutation 和 projection refresh 成功，但 history
entries 为零；`rejected` 则保留原有 outcome-unknown、reservation 和不 refresh 的恢复语义，绝不重发写入。
auto-fill 的 compact series、fill range、import 与逐格 fallback 都走同一条 callback 路径。

聚焦回归覆盖 editing ACK 后 runtime capability 替换、auto-fill 的完整/无能力/rejected append，以及既有
editing、auto-fill、mutation gateway 与 host feedback。7 个 Jest 套件、183 个断言，Core build/TypeScript、
Solid TypeScript、Prettier 和 diff check 全部通过；范围 ESLint 为 0 error（7 条既有测试依赖声明 warning）。
`editing/index.ts`（1,300 行）、`auto-fill/command.ts`（1,699 行）及三份历史 Core 测试均是存量超限文件；
本次只在已有状态机和测试公共输入 seam 做窄改，未借此跨职责重构。

### UI-519d Paste Special 与 Text-to-Columns（已完成）

Paste Special 保留其在 dispatch 前取得的 `HistoryProducerReservation`。严格 ACK 后，ticket 中必填的
`HistoryEntryRecorder` 只接收现有 `pushReservedHistoryAtom` append callback：`unavailable` 仍刷新 projection
并释放 reservation；`rejected` 保持 outcome-unknown、不可重发且不刷新。Text-to-Columns 同样在 ACK 后
通过必填 recorder 调用其原有 `pushHistoryAtom` append callback；无能力时正常刷新，append 被拒绝时进入
outcome-unknown，绝不重发写入。

两个实际 Solid dialog launch 都在启动命令时用 Provider 的稳定 backend forwarding handle 创建 recorder；
Core ticket 只保存 callback，不保存 backend。聚焦回归覆盖两域的完整能力、无能力、append rejected，以及
Paste Special ACK 后 runtime capability 替换。5 个 Jest 套件、136 个断言、Core/Solid TypeScript 和 diff
check 均通过。

`paste-special.test.ts`（1,045→1,068 行）与 `text-to-columns.test.ts`（1,807→1,831 行）原本已是超限的
单体测试；本次仅在共同输入 seam 注入默认 recorder 以保持既有 fixture，未扩大为测试重构。完整 touched lint
仍显示 `text-to-columns/state.ts` 的 19 条存量 max-len 和测试依赖 warning；完整 touched Prettier 仅显示四份
存量未格式化文件，新增文件和原本合规的改动文件均通过检查。

### UI-519e operations 与 toolbar（已完成）

结构操作的 ticket 在 transport 之前捕获必填 `HistoryEntryRecorder`，严格 ACK 后仅将既有
`pushReservedHistoryAtom` 封装为 append callback。因此 cross-sheet target、transaction、revision、冻结/
隐藏/outline 的 `localSidePayload` 与 reservation 生命周期全部保持原状。`unavailable` 只跳过 history 并继续
refresh；`rejected` 保持 outcome-unknown，不重发结构 mutation。`structural-commands` 只为会发起 transport 的
路径转发 recorder；`viewport/freeze.ts`、`viewport/hidden.ts` 与 `outline/index.ts` 的 localReplay 没有改动。

toolbar 的 format、merge 与 unmerge ticket 同样在每个精确 ACK 后，经 recorder 调用原有
`pushHistoryAtom` append callback。菜单、右键与 toolbar 三个真实宿主入口均从 Provider 稳定 backend forwarding
handle 创建 recorder；Core ticket 不持有 backend。定向 8 个 Jest 套件、134 个断言，Core/Solid TypeScript、
范围 ESLint（0 error，1 条项目既有 Jest dependency warning）、Prettier 和 diff check 均通过。

`operations/index.ts`（1,456→1,501 行）、`toolbar/index.ts`（980→1,010 行）与 operations/toolbar 的既有
测试已在本 issue 前超过普通文件上限；本次只在既有 mutation ticket 和共享 fixture seam 窄改。后续若再次修改
这些域，应独立按 mutation-history 职责拆分，而不是继续扩张这些单体文件。

### UI-519f tables、filter-sort 与 remove-duplicates（已完成）

表格的 create、totals、total-function、rename、rename-column 与 delete，filter-sort mutation、physical sort
与 Remove Duplicates 都在 transport 前捕获必填 `HistoryEntryRecorder`。Core ticket 只保存该 callback，绝不保存
backend；严格 ACK 后才把既有 `pushHistoryAtom` 或 `pushReservedHistoryAtom` 包装为 append callback。完整 undo/redo
能力会记录历史；`unavailable` 只跳过历史并继续既有 refresh；`rejected` 保持 outcome-unknown、预约和不重发语义。

Filter dropdown、数据菜单、名称管理器表格、去重对话框、排序确认与 toolbar 的真实启动入口均从 Provider 的稳定
forwarding backend handle 创建 recorder。filter-sort 与 Remove Duplicates 保留原有 reservation、transaction、
revision、authority witness 和 refresh-only retry；没有改动 `viewport/freeze.ts`、`viewport/hidden.ts` 或
`outline/index.ts` 的 localReplay。

根节点复跑四个 Core 和三个 Solid 定向套件共 420 个断言，加上 Core 声明构建、Solid TypeScript 与 diff check
均通过；agent 的范围 ESLint/Prettier 亦为 0 error。`tables/commands.ts`（1,304 行）、四份既有 Core 测试
（719–3,204 行）和 `vnext-adapter.test.ts`（5,853 行）均是本次前已超限的单体文件；只在公共 fixture 或既有
命令 seam 作必要窄改，未在 history issue 中做无关的大拆分。

### UI-519g、UI-519h、UI-519i 验收收口（已完成）

独立验收发现两处需要收口的契约偏差：Grid 的 editing、clipboard 与 format 五条 ACK 后路径仍调用旧
`recordHistoryEntry`，没有表达 recorder 的 `recorded` / `unavailable` / `rejected` 三态；tables 六类命令在
recorder 返回 `rejected` 后会先刷新 catalog 或 projection。UI-519g 只改三个 Grid controller 和专属回归：
所有五条路径均改经 `createHistoryEntryRecorder`，`unavailable` 正常刷新但不写 history，`rejected` 报
outcome-unknown 且停止刷新。UI-519h 只改 tables Core 状态机及参数化回归：六条命令的 rejected 或 recorder
抛错均在 catalog/projection 刷新前返回，无能力则维持 history-free 的正常刷新。

第二轮只读验收又发现 Remove Duplicates 的三条“应记录历史”测试 fixture 没有完整 undo/redo port，因而按新
guard 正确降级成 `unavailable`，但旧断言仍期待 history。UI-519i 仅为这三条成功路径提供配对 port；不支持
history 的场景没有改变。最终只读验收通过：Core W8 回归 16 个 suites / 690 tests，Solid W8/宿主回归 11 个
suites / 257 tests，Core 与 Solid TypeScript、`git diff --check` 均通过；未运行也不主张全局 lint 通过。

`tables/commands.ts`（1,307 行）及 `vnext-remove-duplicates.test.tsx`（399 行）均为存量超限文件，本轮仅作
必要窄改。三个 Grid controller 的 HEAD 基线不符合 Prettier；完整格式化会把 `grid-clipboard.ts` 扩至 352 行，
所以保留其紧凑且不超过 300 行的既有格式，作为独立格式债处理。

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
