# ADR 0018：对外 Node.js 基线为 `>=22.12.0`

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-100：让人装得上（发布链路）](../adoption-issues/AD-100-publish-pipeline.md)（D5 → AD-121、AD-136~141）

## 背景

`@einfach/spreadsheet-ui-core` 与 `@einfach/excel-core-ts` 的 `engines` 都写着
`"node": ">=14.18.0"`。这个数字从未被验证过，且与仓库现实矛盾：pnpm workspace、Vite 5、
Playwright 1.59 在 Node 14 上都装不起来。一个没有人验证过的 `engines` 比不写更糟 ——
它对外承诺了一条必定失败的安装路径。

定基线要区分两个不同的对象：**贡献者**需要能跑构建、Rust/WASM 工具链与 e2e（本仓实测
环境是 Node v24.14.0）；**消费者**只是 import 一个已经构建好的包，要求应当宽得多。
把开发环境的版本直接当作对外基线，会毫无必要地挡掉大量生产环境。

## 决策

对外支持的 Node.js 基线是 `>=22.12.0`。全部待发包的 `engines.node` 统一改写为该值。
AD-136~141 的仓外安装冒烟（Vite、webpack、Next、Nuxt）在该基线上执行。

取 `22.12.0` 的两条理由：

1. Node 22 是本 ADR 落笔时**最老的仍在维护**的 LTS 线（Node 20 的维护期已于
   2026-04-30 结束）。基线不落在 EOL 线上，否则等于承诺一条不再收安全补丁的路径 ——
   这正是本 ADR 要消灭的问题。
2. `22.12.0` 是 Node 22 线上第一个稳定支持 `require(esm)` 的版本。本仓产物同时提供
   ESM 与 CJS 入口，低于该版本的 CJS 消费者会撞上加载 ESM 依赖的边界情况。

## 后果

- 明确不支持 Node 14/16/18/20。这些线均已过维护期，不构成对现役生产环境的排除。
- 贡献者环境要求（Rust 工具链、wasm-pack、Playwright、更高的 Node）与本基线是两套口径，
  不得互相推导；贡献者要求写在 CONTRIBUTING，消费者基线写在包元数据与 README。
- AD-134 的稳定性声明与首条 release notes（AD-135）必须显式写出该基线，让使用者在安装
  失败之前就能判断。
- CI 的 Node 版本矩阵需覆盖该基线下界，否则冒烟结论不可采信 —— 只在 24.x 上跑通不能
  证明 22.12 可用。

## 不在范围

- 浏览器基线（WASM 与 worker 的运行环境要求另行裁决）。
- 贡献者本地开发环境的 Node 版本要求。
- 未来随 Node 22 进入 EOL 抬高基线的时机。抬高需要写新 ADR，不能靠悄悄改 `engines`。
