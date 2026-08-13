# AD-807 真实千万单元格导入观察

## 结论

本次运行未完成千万格导入，因此没有首屏时间、成功后的内存、最终 DOM/订阅数或容量成功结论可报告。完整的 AD-806 已填充 TSV 确实通过 `DemoMillion` 的浏览器文件输入、流式解析和 Wasm worker 导入路径执行；在第 200,001 个单元格被当前原子导入会话的规范化单元格上限拒绝。

这是一份失败边界观察，不是千万单元格性能或容量通过报告。完整原始载荷见[原始观察记录](observations/ad807/ten-million-load-2026-08-13.json)。

## 实际输入与复现

夹具仅生成在 `/tmp`，不提交进仓库：

```sh
node scripts/generate-ad806-filled-tsv.mjs > /tmp/ad806-filled-10000x1000.tsv
AD807_TEN_MILLION_TSV=/tmp/ad806-filled-10000x1000.tsv EINFACH_E2E_PORT=5187 \
  pnpm --dir excel/solid-excel exec playwright test \
  e2e/perf-virtual/ad807-ten-million-load.spec.ts --project=wasm --reporter=line
```

实际文件为 10,000 行 × 1,000 列 = 10,000,000 个非空单元格，值为 `r{row}c{column}`（零基），大小 97,790,000 bytes，SHA-256 为 `5a72c35b7a68cadf267ce7416cbd54041b510f159a5fa05ed0742c18319c0936`。观测测试位于 `excel/solid-excel/e2e/perf-virtual/ad807-ten-million-load.spec.ts`；它必须接收环境变量指向这个完整文件，未提供时会跳过，不能悄悄换成缩小夹具。

## 运行事实

在修订 `030681cc62306a1b6b42b97cf6c3ef1943e18618` 加本次未提交 AD-807 观察文件的工作树，macOS 26.5.2（Apple M4、16 GiB）、Node v24.14.0、Playwright 1.59.1 上，Wasm 项目运行 1 个测试并通过测试断言。浏览器身份、命令和全部原始采样均保存在 JSON。

| 项目                     | 实测值                                                     |
| ------------------------ | ---------------------------------------------------------- |
| 完整 TSV 请求单元格数    | 10,000,000                                                 |
| 请求 chunk               | 201（每个 1,000 格）                                       |
| 成功 chunk               | 200                                                        |
| 最近一次成功的累计接受数 | 200,000                                                    |
| 失败边界                 | 第 200,001 格（第 201 个 chunk）                           |
| UI 错误                  | `import session exceeded normalized cell limit`            |
| 选取文件至失败状态       | 383 ms                                                     |
| warmup                   | 无；此记录保留全部一次真实失败运行的三个采样               |
| 浏览器专用内存 API       | 不支持；因此无可用的 `measureUserAgentSpecificMemory` 结果 |

`worker-import-normalize.ts` 的默认原子会话规范化单元格上限为 200,000；文件导入默认没有选择 direct 模式，因此当前运行触及该保护。观测只读取已有调试计数和 DOM，不修改 worker 保护、导入协议、配置或运行时。

三个采样的实际 DOM 和订阅值如下：

| 阶段                 | DOM 元素 | `.cell` 元素 | 活跃订阅 | worker 导入会话 |
| -------------------- | -------: | -----------: | -------: | --------------: |
| ready                |    1,471 |          630 |      630 |               0 |
| after-input-selected |    1,474 |          630 |      630 |               1 |
| failed               |    1,474 |          630 |      630 |               0 |

Legacy `performance.memory.usedJSHeapSize` 三次均为 53,500,000 bytes。这是 Chromium 的非标准调试字段，不等同于进程或总内存；`measureUserAgentSpecificMemory` 在该运行中不可用。失败时没有得到 `commitImport` 的结果，所以 `accepted` 和 `errors` 都记录为不可用，而不是零。界面显示的 `200 rows, 20100000 cells, 200 chunks, 0 errors` 原样保存在 JSON；它是失败前的进度文本，不是已提交的导入统计，不能作为成功接受数或错误数使用。

## settled 与解释边界

settled 定义为：真实 `DemoMillion` 文件输入的状态已到 `failed`，随后读取其可见错误、导入 chunk 跟踪、worker debug counter、DOM、订阅数和可用内存字段。此时 worker 的导入会话数已回到 0。

此次运行只证明该 revision 与环境下，完整的确定性千万格输入被当前原子导入保护在 200,001 格拒绝。它不证明千万格能加载、不能证明系统的最终容量，也不对首屏、成功导入后的内存、吞吐或跨环境表现作出结论。
