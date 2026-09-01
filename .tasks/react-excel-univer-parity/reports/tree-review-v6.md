# React Excel · Rust/WASM 任务树 v6 独立终审

VERDICT: NEEDS_CHANGES

审查日期：2026-09-01  
审查基线：产品 HEAD `fc174dfc7a9542ea6c198747d644d24c737f6a27`；任务树未提交。  
范围：完整读取 `index.md` / `stages.md` / `coverage.md` / `baseline.md` / `ledger.md`、
001–020、101–114、`tree-review-v4.md` / `tree-review-v5.md`；核对当前 TypeScript
package resolution、React/UI-core 合同、Rust/WASM binding、demo/E2E 配置与 worktree。
本次只新增本报告，不改产品、不提交。

## 结论摘要

v5 的 C1、I2–I4 与 M1 均已闭环；I1 的 revision 类型域也已收紧为
non-negative safe integer。private source package 的 Bundler/no-project-reference 方案经
TypeScript 5.8.3 同形 workspace 实测可解析，不会产生 TS6305/TS6059/TS6307。

但 backend session 还没有冻结 `ready()` 的 single-flight/idempotent 语义，cell-input
的 revision 溢出也没有冻结为“Rust RPC 前拒绝”。两者都可以让实现通过当前
targeted tests，却重置已 seed 的 workbook，或在 UI-core 收到 rejection 后留下
已应用的 Rust mutation。因此当前不应派发 001。

## v5 findings 逐项闭环

| v5 finding | 当前状态 | 证据/裁决 |
|---|---|---|
| C1 source package + project reference 导致 TS6305 | 闭环 | `002:35-36,50-52` 冻结 root/subpath source exports 与 symlink 物化；`017:39,44-46` 改为 Bundler 且明禁 excel-worker reference。TS 5.8.3 对现有同形 `@einfach/vue-excel` 实测：root/subpath 均 resolve 到 workspace `src/*.ts`、`isExternalLibraryImport:true`，consumer 的 `rootDir/composite/include` 下 TS6305/6059/6307 均为 0。 |
| I1 revision string/numeric 矛盾 | 类型闭环，溢出原子性未闭 | `index.md:140-150`、`012:37-41`已统一为 number 并定义计数器溢出；写入顺序断口见 I2。 |
| I2 selectable/editable/hook public signatures | 闭环 | `index.md:187-226` 已冻结 viewport result/handle/props、两个 wrapper props/forwardRef 与 editing hook/controller 全签名；`104–109` 逐名生产、导出、消费。 |
| I3 selection bounds/ready sheet A1 | 闭环 | 真实默认仍是 1,048,576×16,384 与空 sheet (`spreadsheet-ui-core/src/selection/index.ts:23-36`)；`104:31-39` 已指定唯一 owner、exact atoms、same-sheet 保留、sheet switch A1、bounds clamp 与真实 active `td`，`112:27-32` 加了未点击键盘/F2 E2E。 |
| I4 formula `installed:true` exact shape | 闭环 | `index.md:59-65`、`003:38-43`、`009:30-35` 均与真实 binding `excel/excel-wasm/lite/einfach_wasm.d.ts:672-681` 一致：true 分支只有 `{ok:true,installed:true}`；false 分支才追读 snapshot 并产出 diagnostic。 |
| M1 task010/coverage 路径漂移 | 闭环 | `010:30-36` 已改为 task003 classifier owner/task017 consumer；`coverage.md:73-78` 已与 handlers 及 projection/cell-input 子目录一致。脚本重算 row↔leaf 双向差集为 0。 |

## 已确认成立

- 34 个叶子无环、无未知依赖；重算得 28 个 ready waves，所有同波 exact
  `files` 写/写重叠为 0。`112 → 113 → 114` 串行，固定 5182 端口不再争用。
- C00–C07/C01 子行与 34 叶的 `coverage` 集合双向相等，0 漏行、0 孤儿；
  C08–C12 明确为后续阶段。
- baseline HEAD 与 20 个 sha256 全部匹配；worktree 除本未跟踪任务树外干净。
- 已展开文档均 ≤300 行；所有将修改的存量普通文件当前均 ≤300 行，
  `use-spreadsheet-viewport.ts` 255 行且 102 已按 transport 职责抽离。
- Rust-only 主线只调用实际 lite `WasmWorkbook` 已存在的稀疏读、snapshot、bulk import
  与 fallible setters；没有 TS core、Solid runtime 或 fallback 进入产品路径。
- 验收命令的 producer 时序成立：002/017 在 lockfile-only 后物化 workspace
  symlink，019 首次在三个 HTML input 齐全后运行 `build:e2e`，全包 gate 均位于
  相应 producer 之后。叶子仍基本符合单职责与 10–20 分钟尺度。

## Important（2）

### I1. `ready()` 没有 single-flight/idempotent 合同，每次投影/写入都可重建 workbook

`RuntimeWorkbookContext.initialize` 每次调用都创建新 workbook 与新 generation
(`006-runtime-generation-context.md:30-32`)。`012` 只冻结了一次 `ready` 的操作顺序
(`012-backend-session.md:33-37`)，没有说并发/重复 `ready()` 必须共享同一 promise、
同一 sheets 与一次 `afterInit`，验收也没有重复调用场景
(`012-backend-session.md:39-42`)。但两个 port 在每个操作前都再次
`await session.ready()` (`013-projection-backend-port.md:30-34`;
`014-cell-input-backend-port.md:29-33`)。

因此一个字面满足当前任务的实现可以在 task017 seed 后，首次 A1 读又
`initWorkbook`，把 42 重置为空值；或并发 read/write 各自运行 `afterInit`。task019 虽然
最终会发现 A1 不对，但 012 会先通过自己的独立验收，违反叶子的本地闭环。

精确修订：在 `index.md` backend/session 合同及 `012-backend-session.md:33-41`
加入：创建 session 时只建一个 cached ready promise；并发/后续 `ready()` 原样返回它；
`initWorkbook/manifest/afterInit` 各精确一次；成功后 sheets 身份稳定；失败在本 session
内 sticky，retry 必须由 task016/017 创建新 backend session。加入 concurrent ready、重复
projection/write 前不重新 init/seed 的 targeted tests。

### I2. revision 溢出没有冻结为写 RPC 前的原子门，可出现 rejection-after-mutation

`012` 使 `bumpRevision()` 在 `Number.MAX_SAFE_INTEGER` 抛
`RUST_REVISION_EXHAUSTED` 且不改计数器 (`012-backend-session.md:36-41`)。
`014` 则先选择 `clear/setFormulaDetailed/setCell`，成功后才 bump 并 ACK
(`014-cell-input-backend-port.md:29-33`)；当前溢出验收只断言“不 bump”，
没有断言零 RPC/零 Rust mutation (`014-cell-input-backend-port.md:35-38`)。

在初始 revision 已为 MAX 时，最直接的实现会先把 cell 写入 Rust，再因 bump
抛错；UI-core 根据真实合同会把 promise rejection 当作“未应用”并保留 draft
(`spreadsheet-ui-core/src/backend/types.ts:1109-1118`)，canonical workbook 却已改变。MAX-1 上
两个并发 non-editing caller 也有同样竞态；`014:32` 明确允许缺 requestId
的 non-editing caller，不能只依赖 UI-core editing lane 串行。

精确修订：在 `014-cell-input-backend-port.md:29-37` 把 revision capacity 冻结为
Rust client 前置门，并串行化本 port 的 mutation dispatch（或提供等价的原子 revision
reservation）；当无下一个 safe integer 时以 `RUST_REVISION_EXHAUSTED` 拒绝且零
client call。测试必须断言 MAX 下零 RPC/零 canonical mutation，以及 MAX-1 两个并发
请求最多一个进入 Rust。只有在该门之后，“overflow fail-closed”才与 strict ACK
语义一致。

修正 I1–I2 后再做一次静态复审；在此之前不派发 001。
