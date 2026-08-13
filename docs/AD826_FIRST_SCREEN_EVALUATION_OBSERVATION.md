# AD-826 首屏实际公式求值 E2 观察

## 范围

本记录是仓库修订 `3910c6152d92dfb6519284ff5b9af0ebaf723957` 在 2026-08-13 的一次实际 E2 观察。测试与完整原始载荷分别在：

- `excel/solid-excel/e2e/perf-virtual/ad826-first-screen-evaluation.spec.ts`
- [原始观察记录](observations/ad826/first-screen-formula-evaluation-2026-08-13.json)

运行环境是 macOS 26.5.2（25F84）、Node v24.14.0、Playwright 1.59.1；浏览器 user agent 见原始记录。观察对象是 worker 工作簿的 `readSparseRange` 首屏投影读取，不包括 DOM 绘制完成。

## 场景与 settled 条件

专属夹具含 1 个 `AD826` 工作表、24 行 x 4 个已填充单元格（`N=96`）：每行依次为数值、`=A(row)+1`、文本和 `=A(row)+2`。共有 48 个浅层、同一行直接引用的公式，非纯值种子。

首屏范围为 `sheet=0, rows=0..11, cols=0..3`，即 12 行 x 4 列、48 个已填充单元格，其中 24 个为公式。settled 的定义严格为：`commitImport` 已 resolve，读取一次 `debugCounters`；该范围的 `readSparseRange` promise 已 resolve；立即再读取一次 `debugCounters`。

两次运行的导入结果都是 `accepted=N=96`、`errors=0`、`formulas=48`、`rejectedFormulas=0`。

## 实际观察

| 后端项目 | 读取前 `formulaCount` | 读取前 `formulaEvalCountTotal` | 读取后 `formulaCount` | 读取后 `formulaEvalCountTotal` |
| -------- | --------------------: | -----------------------------: | --------------------: | -----------------------------: |
| `wasm`   |                    48 |                              0 |                    48 |                             24 |
| `ts`     |                    48 |                              0 |                    48 |                             24 |

在这一次 revision、该夹具与上述 settled 定义下，两种项目的首屏读取后累计公式求值数均从 0 变为 24。原始记录保留了两个项目的完整 commit 结果、首屏范围、显示样本、前后全部 `debugCounters` 快照和执行命令。

## 解释边界

此记录仅描述这一次 revision、浏览器环境、浅层公式夹具和指定首屏范围的观察。它不构成性能、容量、传输、远程执行或普遍公式计算上限的结论，也不代表未被该范围访问的单元格会如何求值。
