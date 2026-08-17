# 对外性能基准页（AD-505 ~ AD-510、AD-515）

任何人可在自己机器上复跑的性能基准页。证据范围按
[ADR 0008](decisions/0008-public-performance-evidence-scope.md) 只涵盖四类：大表滚动、
公式链重算、首屏到可交互、包体积。本页实现前三类的可复跑场景；包体积不需要浏览器，
口径与命令见 [AD-500](adoption-issues/AD-500-performance.md) 的 AD-511 条目。

## 复跑步骤

```bash
pnpm install
# 干净检出需要先产出 WASM 工件（需要 Rust 工具链；已有 excel/excel-wasm/lite/ 时跳过）
npm run build:wasm -w @einfach/solid-excel

npm run dev -w @einfach/solid-excel
# 浏览器打开（vite 默认端口 5173，改端口时替换）：
#   http://127.0.0.1:5173/?bench=1
```

打开页面后点某个场景的「运行」。跑完后页面展示完整结果 JSON，并提供「复制 JSON」。
无需其他服务；基准页与既有 demo 壳并存（不带 `bench=1` 时仍是原 demo）。

URL 参数：

| 参数            | 作用                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| `bench=1`       | 进入基准页（AD-505 路由契约）。                                            |
| `scenario=<id>` | 只显示指定场景；id 不存在或登记表为空时页面显式渲染「无此场景」。          |
| `rev=<commit>`  | 写入环境记录的 `implementation.sourceRevision`（浏览器观测不到 git 修订）。 |
| `embed=first-screen` | 首屏场景的被测入口页；由场景自动经 iframe 使用，不需要手动打开。      |

## 场景清单

场景登记在 `excel/solid-excel/src/bench/registry.ts`（唯一登记处，新增场景 = 加一个
条目）；结果结构钉死在 `excel/solid-excel/src/bench/types.ts`。

| 场景 id              | 类别（ADR 0008） | 数据档位（AD-509，见 [档位定义](AD509_BENCHMARK_DATA_TIERS.md)） | 样本含义                                                       |
| -------------------- | ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `scroll-large`       | 大表滚动流畅度   | `large` 网格 10,000×100（1,000,000 单元格）                    | 一次 300 帧脚本滚动（每帧 +32px）中帧间隔落在 16.67ms 预算内的比例 |
| `recalc-chain-large` | 公式链重算延迟   | `large` 公式链 10,000 行                                       | A1 写入新值起，到可见链尾 A10000 的 DOM 呈现匹配值的毫秒数     |
| `first-screen-smoke` | 首屏到可交互     | `smoke` 网格 10×10                                            | 一次全新 iframe 导航起（navigation start），含 worker 启动与 WASM 拉取/实例化，到 A1 单元格上屏的毫秒数 |

采样协议按 [ADR 0009](decisions/0009-public-performance-measurement-methodology.md)：
每场景固定 5 次预热（不进统计）+ 20 个有效样本；失败样本记录原因后重跑，不被隐去；
同时报告中位数与 p95，并在结果 JSON 里保留全部原始样本。

## 结果 JSON 含义

每次运行导出一份 `einfach.benchmark-result/v1`（完整类型见
`excel/solid-excel/src/bench/types.ts`）：

- `scenarioId` / `definition` / `methodologyRef` —— 场景标识、固定下来的场景定义全文、
  口径引用。比较两份结果前先核对这三项与 `protocol` 完全一致（ADR 0009 §共同采样规则 5）。
- `output.primary` —— 主结果序列：`warmupSamples`（5 个预热值）、`samples`（20 个有效
  样本原始值）、`failures`（失败样本的原因与重跑记录）、`stats.median` / `stats.p95`。
- `output.detail` —— 场景自留的原始细节：滚动场景含每次通过的逐帧间隔与全部计入帧的
  中位数/p95 帧时长；重算场景含链形状与完成判定；首屏场景含入口与边界描述。
- `environment` —— [ADR 0011](decisions/0011-public-performance-environment-record.md)
  的 `einfach.performance-environment/v1` 环境记录（机器、浏览器、缓存/网络条件、
  workload 引用）。取不到的字段写 `"unknown"` 并附原因，不留空。
- `nonGuarantee` —— 随结果一起导出的非承诺声明（见下节）。

## 解释边界（ADR 0010）

按 [ADR 0010](decisions/0010-public-performance-non-guarantees.md)，本页与归档结果中的
任何数字都是**一次具名运行的观测证据，不是产品承诺**：

- 不构成任何机器、浏览器、网络或工作负载下的最低性能，也不是 SLO/SLA 或回归门槛；
- 不预测未测场景、生产流量、最差情况或未来版本；
- 不支持与其他产品的快慢、体积比较；
- 只有场景定义、完成条件、统计规则与环境可比的运行才能并列比较，改变任一项即为新序列。

## 已归档的实测记录

- [`observations/bench/2026-08-17-ad505-bench-chromium-headless.json`](observations/bench/2026-08-17-ad505-bench-chromium-headless.json)
  —— 基准页交付时用 Playwright 驱动 headless Chromium 跑通三个场景的一次真实结果
  （三份场景 JSON 的数组；机器与浏览器条件见各自的 `environment` 字段）。按上述边界，
  它只证明"该环境那次跑出了这些值"，不外推到其他环境。
