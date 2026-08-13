# AD-827 有界与显式全夹具范围读取观察

这是 2026-08-13 在 revision `bbbe23a9de4a26df96594e4d601dc24130aab40e`
加本观察的三个未提交新文件上进行的一次实际浏览器 Worker 观察。测试和完整的
原始 bucket 记录分别在：

- `excel/solid-excel/e2e/perf-virtual/ad827-bounded-vs-full-range-read.spec.ts`
- [原始观察记录](observations/ad827/bounded-vs-full-range-read-2026-08-13.json)

它只比较同一夹具中一次有界 `readSparseRange` 和一次显式全夹具范围
`readSparseRange` 的应用可见规范化消息载荷；它不是“加载整个工作簿”的观察。

## 场景与方法

夹具为一个 `AD827` 工作表，共 24 行 × 4 个已填充单元格（`N=96`）：每行依次为
数值、`=A(row)+1`、文本、`=A(row)+2`。其中有 48 个浅层同一行直接引用公式。

每个后端分别为两种范围创建新的真实 Worker workbook，导入相同夹具，再读取导入后
的 `debugCounters`。随后测试端透明包装真实 factory，立即 reset AD-825 的
`createWorkerWireTelemetry()`，只等待一次 `readSparseRange` resolve 并快照，最后在
测量窗口外读取 `debugCounters`。包装只转发 `WorkerLike` 的原始 `postMessage` 和
message event；没有发出额外 RPC，也没有改动 core、protocol 或 Worker 语义。

有界范围是 `sheet=0, rows=0..11, cols=0..3`（48 个已填充单元格），显式全夹具范围
是 `sheet=0, rows=0..23, cols=0..3`（96 个已填充单元格）。settled 条件是该单次范围
读取 promise 已 resolve；测量窗口不包括 import、capability 或 debug RPC。

## 实际观察

两次项目运行均使用实际 vNext factory：`wasm` 为
`defaultVNextWorkbookWorkerFactory`，`ts` 为 `defaultExcelCoreTsWorkerFactory`。两个项目
都得到相同的本次数值：

| 读取            | 返回单元格 | 公式累计值（前 → 后） | request bytes | response bytes | 总规范化 payload bytes |
| --------------- | ---------: | --------------------: | ------------: | -------------: | ---------------------: |
| 有界 12×4       |         48 |                0 → 24 |           101 |          4,190 |                  4,291 |
| 显式全夹具 24×4 |         96 |                0 → 48 |           101 |          8,438 |                  8,539 |

每个测量窗口都只有一个 host-to-worker `request` 与一个 worker-to-host `response`；每个
bucket 的 `unmeasurableMessageCount` 都为零。原始记录保留了两个后端、两种读取及所有
方向/类别（包含零值）的 buckets、导入结果、范围和前后计数器。

## 解释边界

方法标识为 `canonical-json-utf8-v1`：对当前 Worker 边界的 JSON-like 消息进行稳定排序
并计 UTF-8 字节。这是单日、单 revision、单浏览器、单一小夹具中的规范化 payload
观察。

它不测量或证明 structured-clone 字节、网络传输、整个工作簿加载、延迟、吞吐、内存、
容量、性能，或任一实现的一般性优势。范围读取是显式探针，不能外推为远端后端或千万级
夹具的成本结论。
