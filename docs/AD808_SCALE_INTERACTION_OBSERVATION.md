# AD-808 大规模已填充交互 E2 观察

## 结论

在本记录的 revision 与环境下，**实际达到的交互档位是 6,000,000 个非空单元格**（6,000 行 × 1,000 列，AD-806 确定性值样式），在真实 `DemoMillion` 表格表面上完成了逐段视口推进、远角跳转与全表选区，全过程 DOM 单元格数、活跃订阅数保持视口量级，投影内容与 AD-806 定义逐格一致。

**请求的千万档位（10,000×1,000）没有达成**，且本轮记录了两条可复现的边界：

1. headless 直连 worker 的 direct 模式灌入，三次尝试都在**累计接受恰好 7,340,000 格**时被 WASM 引擎 trap（`unreachable`）终止；
2. 在带 UI 的 DemoMillion 活页面上以同一路径灌 7,000×1,000，两次尝试浏览器页面（渲染进程）都在灌入期间关闭。

这是一份带失败边界的实测记录，不是千万级交互通过报告。完整原始载荷见[原始观察记录](observations/ad808/scale-interaction-2026-08-17.json)。

## 实际输入与复现

夹具在浏览器测试进程内确定性生成（AD-806 值样式 `r{row}c{col}`，零基），经 wire 协议的**非原子 `direct` 导入模式**按 10,000 格 chunk 灌入活页面的 worker 工作簿——不是文件上传路径。AD-807/AD-810 记录的 200,000 格原子会话上限只约束 atomic 会话，本观察未改动任何 worker 保护、导入协议或配置。`DemoMillion` 本次新增了仅测试用的 `?rows=&cols=` 网格尺寸覆写（默认不变，仍为 1000×1000）。

```sh
# 交互观察（记录档位 6,000×1,000）
NO_PROXY=localhost,127.0.0.1 EINFACH_E2E_PORT=5187 AD808_SCALE_ROWS=6000 \
  npx playwright test ad808-scale-interaction --project=wasm --reporter=line
# 千万请求的灌入边界（headless，三次一致）
NO_PROXY=localhost,127.0.0.1 EINFACH_E2E_PORT=5187 AD808_FILL_BOUNDARY_ROWS=10000 \
  npx playwright test ad808-fill-boundary --project=wasm --reporter=line
```

测试文件：`excel/solid-excel/e2e/perf-virtual/ad808-scale-interaction.spec.ts` 与 `ad808-fill-boundary.spec.ts`。

## 运行事实

revision `986cd74e564da8e998cef7956ae41b741bab4895` 加本轮未提交的 AD-808/809/812 文件；macOS 26.5.2（Apple M4、16 GiB）、Node v24.14.0、pnpm 10.15.1、Playwright 1.59.1、Chrome 147.0.7727.15、`wasm` project。6M 档一次干净运行通过（32.8s 含 web-server 准备）。

灌入：6,000,000 格全部接受（`accepted=6000000, errors=0`），页内耗时 18,737 ms。灌入落定后 A1 显示 `r0c0`。

各交互步骤（耗时为含 Playwright 轮询等待的墙钟毫秒；订阅数 = `activeSubscriptionCount`）：

| 步骤                       | 落定断言                      | 耗时 ms | DOM `.cell` | 活跃订阅 |
| -------------------------- | ----------------------------- | ------: | ----------: | -------: |
| 就绪基线                   | A1 可见                       |       — |         630 |      630 |
| 推进至第 300 行            | F301=`r300c5`                 |     747 |         630 |      630 |
| 推进至第 900 行            | F901=`r900c5`                 |     679 |         630 |      630 |
| 推进至第 1,800 行          | F1801=`r1800c5`               |     720 |         630 |      630 |
| 推进至第 3,000 行          | F3001=`r3000c5`               |     802 |         630 |      630 |
| 推进至第 4,200 行          | F4201=`r4200c5`               |     728 |         630 |      630 |
| 推进至第 5,100 行          | F5101=`r5100c5`               |     782 |         630 |      630 |
| 推进至末行                 | F6000=`r5999c5`               |     468 |         504 |      504 |
| 远角跳转（A1→ALL6000）     | ALL6000=`r5999c999`、邻格正确 |     305 |         384 |      384 |
| 回家（ALL6000→A1）         | A1=`r0c0`、ALL6000 已卸载     |     672 |         630 |      630 |
| 全表选区（A1:ALL6000）     | `selectionAddrs()===null`     |    10.1 |         384 |      384 |

全程活跃订阅数与 DOM 可见格数逐点相等，未随累计走过的行程增长；`formulaEvalCountTotal` 在灌入落定后为 50（demo 种子公式在被覆写前的可见区求值），此后所有纯值浏览步骤保持 50 不变。主线程 `performance.memory.usedJSHeapSize` 六次采样均为 53,500,000 bytes——这是 Chromium 非标准调试字段，不含 worker/WASM 堆，不能当作进程内存；`measureUserAgentSpecificMemory` 在该运行不可用。

### 千万尝试的边界

| 路径                                   | 尝试次数 | 结果                                                                     |
| -------------------------------------- | -------: | ------------------------------------------------------------------------ |
| headless 直连 direct 灌入 10,000×1,000 |        3 | 每次都在累计接受 7,340,000 格时 WASM trap（`unreachable`），三次数值一致 |
| DemoMillion 活页面灌入 7,000×1,000     |        2 | 页面（渲染进程）在灌入期间关闭，两次一致                                 |

headless 档位 7,000×1,000（7,000,000 格）可干净完成并读到远角 `r6999c999`（该运行记录在 [AD-809 记录](AD809_SCALE_RECALC_OBSERVATION.md)）；带 UI 的活页面在同档位崩溃，故交互观察档位定为 6,000×1,000。

## settled 与解释边界

settled 定义：每个行程步骤以目标格 `.cell-display` 文本等于其 AD-806 确定值为落定，然后读取 DOM 计数、订阅数、worker debug counter 与可用内存字段。

本记录只证明该 revision、构建与环境下上述档位与边界的观察值。墙钟耗时含测试框架轮询开销，是单次采样，不构成基准、吞吐或 SLO 主张；7,340,000 与页面崩溃是**本构建灌入路径**的边界，不是地址空间上限、其他导入路径的上限或跨环境结论；也不能由此声称"支持六百万格"之外的任何容量承诺。有界性质（DOM/订阅视口量级、选区不物化、纯值浏览零求值增量）已由 AD-812 固化为常驻契约断言。
