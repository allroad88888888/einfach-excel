# AD-810 原子导入会话精确边界观察

## 结论

在本记录的 revision、浏览器和 Wasm 环境中，真实 `DemoMillion` 文件输入提交了恰好 200,000 个确定性、非空且归一化的单元格；同一路径请求 200,001 个时，在第 201 个默认 chunk 被拒绝。两种终态的 worker 导入会话计数都回到 0。

这是 revision 特定的边界观察，不是性能、容量或 SLO 结论。全部机器可读原始载荷见[原始观察记录](observations/ad810/import-session-boundary-2026-08-13.json)。

## 实际输入与复现

夹具在浏览器测试进程内确定性生成，不提交数据文件。每个完整行有 1,000 个以制表符分隔的非空字段，字段值为零基 `r{row}c{column}`：

| 请求的归一化单元格 | 形状                                   |     bytes | SHA-256                                                            |
| -----------------: | -------------------------------------- | --------: | ------------------------------------------------------------------ |
|            200,000 | 200 行 × 1,000 列                      | 1,667,999 | `1946b8c62f8d5423b229c86d95eadc49c980d369d7a485f01f7a0ba8d182eadf` |
|            200,001 | 200 个完整行，另加 1 个字段的第 201 行 | 1,668,006 | `7e1efe1a18e76aa3b648c570b541872b8c642b3113660cb8cdcf317eed2bbd56` |

实际运行的测试和命令如下：

```sh
EINFACH_E2E_PORT=5210 pnpm --dir excel/solid-excel exec playwright test \
  e2e/perf-virtual/ad810-import-boundary.spec.ts --project=wasm --reporter=line
```

它通过实际浏览器的 `million-import-input` 上传这两个 TSV，而非直连 worker。默认 UI 路径每个 import chunk 为 1,000 个单元格；本观察不改变 worker 保护、导入协议、运行时或配置。

## 运行事实

运行时的仓库 revision 是 `05baa4803ea9ac4fa1f8b55257232e0f1cf049e4`，加本次未提交的 AD-810 观察文件。环境为 macOS 26.5.2（Build 25F84）、Apple M4（arm64，16 GiB）、Node v24.14.0、pnpm 10.15.1、Playwright 1.59.1，项目为 `wasm`。浏览器 UA 是 Chrome `147.0.7727.15`（完整 UA 在 JSON）。一次干净运行执行两个测试并通过（`2 passed (11.5s)`）；没有 warmup。

| 可观察项                         |        200,000 格 |                                      200,001 格 |
| -------------------------------- | ----------------: | ----------------------------------------------: |
| 终态 UI                          | `Import complete` |                                 `Import failed` |
| 可见错误                         |                无 | `import session exceeded normalized cell limit` |
| 尝试 / 成功 chunk                |         200 / 200 |                                       201 / 200 |
| 最近成功累计接受数               |           200,000 |                                         200,000 |
| 从选取文件到终态的记录耗时       |          2,885 ms |                                          448 ms |
| settled 时 worker import session |                 0 |                                               0 |

成功输入的可见统计文本是 `200 rows, 200000 cells, 200 chunks, 0 errors`。失败输入的可见统计文本原样为 `201 rows, 20100000 cells, 200 chunks, 0 errors`；这是失败前的 UI 进度文本，不能被解释为已提交单元格数或导入错误数。

## DOM、订阅与内存可用性

`settled` 表示 UI 已到达该输入的终态，随后读取可见状态、chunk 跟踪、worker debug counter、DOM、订阅和可用内存字段。两个输入均按 `ready`、`after-input-selected`、`settled` 三阶段取样：

| 输入与阶段                   | DOM 元素 | `.cell` 元素 | 活跃订阅 | worker import session |
| ---------------------------- | -------: | -----------: | -------: | --------------------: |
| 200,000 ready                |    1,471 |          630 |      630 |                     0 |
| 200,000 after-input-selected |    1,474 |          630 |      630 |                     1 |
| 200,000 settled              |    1,473 |          630 |      630 |                     0 |
| 200,001 ready                |    1,471 |          630 |      630 |                     0 |
| 200,001 after-input-selected |    1,474 |          630 |      630 |                     1 |
| 200,001 settled              |    1,474 |          630 |      630 |                     0 |

六个采样中的 legacy `performance.memory.usedJSHeapSize` 都是 53,500,000 bytes。它是 Chromium 的非标准调试字段，不等同于进程或总内存。`measureUserAgentSpecificMemory` 在此次浏览器中不可用，因此没有浏览器专用总内存测量值。worker counter 的完整快照也保存在 JSON。

## 解释边界

这次真实运行只记录：在上述 revision 和环境下，200,000 个归一化单元格沿默认原子浏览器导入路径成功提交，而同形状的第 200,001 个单元格导致该会话被拒绝。记录的耗时是单次环境采样，不构成基准、吞吐、性能或 SLO 主张；记录的 DOM、订阅和内存字段也不外推为资源上限或跨环境结论。
