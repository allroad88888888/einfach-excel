# format-painter

格式刷：从源区间抓取格式，涂到一个或多个目标区间。

三态状态机 —— `'idle'` / `'armed'`（单次，涂一次后回 idle）/ `'sticky'`（双击工具栏按钮，
连续涂直到显式退出）。

## Atom classification

| Atom | Class | Notes |
|---|---|---|
| `formatPainterControllerState` 系列 backing | source | 会话内部态，私有 |
| `formatPainterStateAtom` | derived | 三态：`idle` / `armed` / `sticky` |
| `formatPainterClipboardAtom` | derived | 已抓取的格式（`CapturedFormat`） |
| `formatPainterPhaseAtom` | derived | 当次操作所处阶段 |
| `formatPainterSourceAtom` | derived | 源区间引用 |
| `formatPainterLastTargetAtom` | derived | 上一个目标区间，供 sticky 模式回显 |
| `formatPainterPendingAtom` / `pendingTicketAtom` | derived | 在途变更与它的 ticket |
| `formatPainterErrorAtom` | derived | 最近一次失败 |
| `formatPainterLedgerAtom` | derived | 变更尝试的有界证据账 |
| `formatPainterBlockedAtom` | derived | 缺必要后端端口时为真 |
| `armFormatPainterAtom` / `armStickyFormatPainterAtom` | command | 单次 / 连续两种武装方式 |
| `exitFormatPainterAtom` | command | 回 idle，清剪贴板 |
| `syncFormatPainterContextAtom` | command | 宿主推入选区与能力上下文 |
| `applyFormatPainterAtom` | command | 涂到目标；armed 模式涂完自动退出 |

全部 atom 设 `debugLabel = 'spreadsheet.formatPainter.<name>'`。无 per-cell 家族。

## Bounded caches 与防御上限

- `FORMAT_PAINTER_LEDGER_MAX = 32` —— 变更尝试证据账的条数上限。
- `MAX_TIMEOUT_MS = 60_000` —— 单次变更的等待上限，超时判为失败而不是永久 pending。
- `MAX_SHEET_ID_LENGTH = 512`、`MAX_SNAPSHOT_DEPTH = 24`、`MAX_SNAPSHOT_NODES = 2_048`
  —— 抓取格式快照时的结构上限。这三条防的是**宿主传入畸形数据**（超深嵌套、超大对象）
  导致的序列化爆栈或内存膨胀，不是业务约束。

## 端口通过 port 类型注入，不直连 backend

本模块不持有 `SpreadsheetBackend`。它声明四个 port 类型让宿主注入：

- `FormatPainterResolveTargetRangesPort` —— 把选区解析成目标区间列表
- `FormatPainterSetFormatRangePort` —— 实际写格式
- `FormatPainterRefreshProjectionPort` —— 写完后刷新投影
- `FormatPainterReadVisibleProjectionPort` —— 抓取源格式

这么做是因为格式刷要跨越「选区解析」（UI core）与「格式写入」（后端）两侧，直接依赖 backend
会把 `pointer` / `selection` 的语义拖进本模块。

## ticket 与迟到证据

`FormatPainterMutationTicket` 给每次变更编号，`FormatPainterLateEvidence` 承接**变更已经被
判定失败/超时之后才到达**的后端回执。迟到证据只写 ledger，不改状态 —— 否则一个超时后成功的
写入会让已经回到 idle 的状态机凭空跳回 armed。

## 已知超限

`index.ts` 与 `types.ts` 合计超过单文件 300 行的规则上限。自然切线是「状态机」/「port 适配」/
「快照校验」三块，属独立重构，不在文档整理范围内。

## 非目标

- 不做撤销。格式刷的写入经后端，撤销走 `src/history/` 的事务。
- 不抓取条件格式与数据验证 —— 只抓单元格自身的格式。
