# 021 独立审查：清理现行 src-vnext 残留

## 结论

**REJECTED**

9 个产品文件中的 15 处 `src-vnext` 字符串、三份活 mockup 残留、文件范围、
目标存在性、全局历史 allowlist 与存量超限记账均核对通过；但
`excel/excel-core-ts/docs/ARCHITECTURE.md` 把 TS core 的现行 worker 实现机械改指
WASM lite 入口，路径虽然存在，职责却不成立。021 尚未满足“逐处核对替换语义”的要求。

## 必须修复的问题

### Important — TS core 架构图指向了错误的 worker 实现

- `excel/excel-core-ts/docs/ARCHITECTURE.md:17`

该行从 `src-vnext/adapter/worker-runtime.ts` 机械改成了
`src/adapter/worker-runtime.ts`，并继续声称这个 worker “Calls into
@einfach/excel-core”。当前 `excel/solid-excel/src/adapter/worker-runtime.ts:3-4`
静态导入的是 `@einfach/excel-wasm`，文件注释也明确它只是选择 lite WASM 产物的叶子
入口；dispatcher 在 `worker-runtime-core.ts`。它不承载本文所述的 TypeScript core。

本文对应的现行 TS worker 是
`excel/solid-excel/src/adapter/worker-runtime-ts.ts`：该文件装配 TS command handlers、
安装 `message` listener，并持有由 `worker-runtime-ts/runtime-state.ts` 创建的
`@einfach/excel-core-ts` workbook state。执行报告的 `test -e` 只能证明错误目标存在，
不能证明职责吻合。

同一现行文档还有两处与该错误一致的职责陈述：

- `excel/excel-core-ts/docs/ARCHITECTURE.md:117` 写
  `worker-runtime.ts decodes request`；
- `excel/excel-core-ts/docs/ARCHITECTURE.md:319` 在本轮已改为 canonical `src/adapter/`
  的章节下，仍写 `worker-runtime.ts` 负责解码、调用 worker-side core 与编码响应。

要求修复：把 TS core 数据流中的 worker 路径统一到真实的
`worker-runtime-ts.ts`，并同步上述两处局部职责叙述；不要把 WASM
`worker-runtime.ts` 或其 `worker-runtime-core.ts` dispatcher 写成 TS core 的实现。

## 审查范围与证据

- 基准：任务声明的 `723082739d66140ac697a5a9c203a6fd99649d4a` 到当前工作树。
- 已完整读取：任务树 `index.md`、`021-close-current-src-vnext-residuals.md`、
  `reports/012-report.md` 的 F-012-1 及其上下文、`reports/021-report.md`、会话提供的
  全局 `AGENTS.md` 规则与 `one-file-one-thing` 技能全文；仓库及其上级适用路径未发现
  额外 `AGENTS.md`。
- 未重复执行 `npm run check:docs` 或其他重型测试。执行报告记录该门退出 0；独立轻量
  核对中，9 个产品文件的限定 `rg -n 'src-vnext'` 零命中，限定文件的
  `git diff --check` 退出 0。
- 9 个产品文件恰好各有 F-012-1 指定的单行替换：numstat 均为等量增删，总计
  15 additions / 15 deletions；没有夹带格式化或其他产品语义改动。除上列错误外，
  其余 14 处新路径与相邻职责相符。
- 15 处替换涉及的现行目标均存在：`src/`、`src/adapter/`、
  `worker-runtime-ts.ts`、`worker-runtime.ts`、`async-custom-pump.ts`、
  `worker-workbook-backend.ts`、`error-display-token.ts`、
  `worker-custom-formulas.ts`、`provider/history-dispatch.ts` 与
  `adapter/filter-predicate.ts`。`static-backend.ts`、`worker-factory.ts` 也存在；
  目标存在性本身通过，但不能抵消 `ARCHITECTURE.md:17` 的职责错配。
- 三份活 `excel/excel-site/docs/mockups/*.html` 的 scoped 扫描均为零；未新增 allowlist。
- 全仓 tracked `git grep -n 'src-vnext'` 当前剩 205 处、47 个文件：37 个位于
  `/archive/`；另 10 个与 012 已确认的集合完全一致，即 AD-142 日期化走查、
  `PARITY_BACKLOG_HANDOFF_2026-08-04.md`、AD-100 固定提交史实、ADR 0004/0005/0006/0015、
  两份 AD-311 audit-time snapshot、`REMOTE_RESTART_PLAN_2026-07-28.md`。
  因此**既定 allowlist 之外的全局 tracked `src-vnext` 已归零**。
- 产品 diff 只落在任务声明的 9 个产品文件；021 报告也位于任务白名单。

## 文件职责与行数

`wc -l` 复核与执行报告一致。6 个路过存量超限文件分别为 322、394、393、344、
500、426 行；本轮都只是必要的单行路径修正。`reports/021-report.md` 已逐个准确记账，
并按 `one-file-one-thing` 的存量小改例外避免范围外拆分。其余三个产品文件为
68、124、61 行。未发现本轮新增的文件职责或行数违规。

## 验收项判定

1. 9 个产品文件 `src-vnext` 清零：**通过**。
2. 改写目标存在：**字面通过**；15 处逐项语义：**不通过**，见 Important。
3. `npm run check:docs`：执行报告为 **通过**，本审查按要求未重跑。
4. `git diff --check`：独立限定复核 **通过**。
5. 三份活 mockup、严格文件范围、存量超限记账：**通过**。
6. 全局非历史 tracked `src-vnext` 清零：**通过**。

一句话回执：**REJECTED — 字符串 cutover 与历史 allowlist 已闭环，但 TS core 架构图
把 `worker-runtime.ts` 的 WASM lite 入口误写成 TS worker，必须改到真实
`worker-runtime-ts.ts` 并统一同文职责叙述。**

---

## R1 复审结论

**APPROVED**

首审唯一 Important 已完整关闭，其他已通过项未回归；未发现新的阻断问题。

### 首审阻断关闭证据

- `excel/excel-core-ts/docs/ARCHITECTURE.md:17` 已改指真实 TS worker
  `excel/solid-excel/src/adapter/worker-runtime-ts.ts`；同一图中的调用目标与本包名称也
  分别在 `:20`、`:26`、`:43` 统一为真实 package name
  `@einfach/excel-core-ts`。该名称与 `excel/excel-core-ts/package.json#name` 一致。
- mutation flow 的 `:117` 已改为 `worker-runtime-ts.ts decodes request`；adapter
  职责清单的 `:319` 也准确写明它解码消息、针对 TS workbook state 分派并编码响应。
  源码中 `worker-runtime-ts.ts:93-113` 创建并持有 runtime state、执行 dispatch，
  `:116-141` 安装 `message` listener、生成 `RpcResponseWire` 并 `postMessage`，职责吻合。
- `worker-runtime-ts/runtime-state.ts:1,47-57` 从 `@einfach/excel-core-ts` 导入
  `createWorkbook` / `Workbook` 并创建 `RuntimeState.workbook`；文档所称 TS workbook
  state 有直接实现证据。
- `ARCHITECTURE.md:318` 的 entry 接线真实：`worker-factory.ts` 同时导出独立的
  WASM-lite 与 TS-core factory；后者 spawn `worker-entry-ts.ts`，该 entry 导入并调用
  `installWorkerRuntimeTs()`。相对地，`worker-runtime.ts:3-4,25` 静态导入
  `@einfach/excel-wasm` 并调用 `installWorkerRuntime(wasm)`，仍是独立 WASM-lite
  叶入口。R1 已准确区分两套 runtime，没有再把 WASM 路径写成 TS core。

### 已通过项回归核对

- 9 个任务产品文件的限定 `rg -n 'src-vnext'` 仍退出 1、零命中；三份活 mockup
  仍全部清零。
- 9 个产品 diff 仍只落在任务白名单。`ARCHITECTURE.md` 当前 10 additions /
  10 deletions，其中除原 3 处路径 cutover 外均是首审要求的同文包名、数据流与职责
  修正；未越出该文件。其他 8 个文件仍只有原 F-012-1 的单行替换。
- 新增或改写所指的 `src/`、adapter、provider、`worker-runtime-ts.ts`、
  `worker-entry-ts.ts`、`worker-runtime-ts/runtime-state.ts` 等目标均存在；限定产品文件的
  `git diff --check` 退出 0。
- 全仓 tracked `src-vnext` 仍为 205 处、47 个文件：37 个 archive + 012 已确认的
  10 个日期化记录、历史 ADR 或 audit snapshot。既定 allowlist 外仍为零。
- 6 个路过存量超限文件行数仍为 322、394、393、344、500、426；R1 没有增加物理
  行数，更新后的执行报告继续逐项记账。其余三个产品文件仍为 68、124、61 行。
- 更新后的执行报告记录 `npm run check:docs` 通过（347 份活文档、2832 份文件无失效
  路径）；本复审按要求未重复运行该重型门。

R1 一句话回执：**APPROVED — TS core 的 package、runtime、entry 与 workbook state
接线均已按真实源码统一，WASM-lite `worker-runtime.ts` 不再被误写成 TS 实现，其余
路径、范围、历史 allowlist 与行数风险检查未回归。**
