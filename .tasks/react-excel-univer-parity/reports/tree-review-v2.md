# React Excel · Rust-only 任务树 v2 独立终审

结论：**NEEDS_CHANGES**

审查日期：2026-09-01  
范围：完整读取 `index.md`、`ledger.md`、`stages.md`、`coverage.md`、当前 21 个叶子、
v1 `tree-review.md`，并核对当前 React demo、worker protocol/runtime/backend、workspace
配置、构建脚本与架构文档。只写本报告，未改产品、任务、索引、覆盖、阶段或台账。

## 已确认成立

- 21 个叶子的依赖图无环、无未知 task id；当前依赖初始 ready-set 只有 001。
- M0 内 `package.json` / `tsconfig` / `pnpm-lock.yaml` 的声明所有权总体按
  002 → 010 → 011 → 012 串行；003/013 与 004/013 的两处重复文件也有直接依赖，
  本身不是同 ready-set 冲突。
- `coverage.md:9-49` 恰好保留旧总账 #01–#41；v1 指出的 #10–#12、#23、#24、
  #32、#39、#41 合同缺口仍明确标为 A/B 或 B/C，没有被 presentation 任务冒充完成。
- 后续 S02–S16 被 `index.md:73-75`、`stages.md:7-8` 明确标为未展开 backlog group，
  当前不应派发；接受进入各 stage 前再拆叶的 progressive elaboration 策略。
- v1 的方向性缺口已有正确回应：新 neutral worker、真实 Rust runtime、workspace、
  virtual grid、editing、composition、package export 与 E2E 都有概念 owner；四类 capability
  原则也已写入 `index.md:39-46`。
- 当前仓库的 `pnpm --filter @einfach/react-excel typecheck:demo` 与 `build:demo` 命令存在且可运行。
  M0 新脚本尚未创建，不能作为本次树审的通过证据。

## Critical（5）

### C1. Rust runtime/backend 的真实相对-import 闭包没有完整 owner，004 还纳入了 TS-only 文件

证据：以当前 Rust 入口 `worker-runtime.ts`、协议入口 `worker-protocol.ts`、backend 入口
`worker-workbook-backend.ts` 做相对 import 闭包，得到 128 个 adapter 源文件；按 001–013
的 `files` 做 brace/glob 匹配后，107 个单 owner、2 个串行多 owner、**19 个无 owner**。
代表性断边如下：

- `worker-runtime-core.ts:1-17` 直接依赖 `worker-command.ts`、各 command、post/rejection、
  resources 与 host；004 的范围 `004-rust-wasm-dispatcher.md:15-23` 漏掉
  `worker-command.ts`。
- `worker-runtime-resources.ts:1-8` 又依赖 `worker-custom-formulas.ts` 与
  `worker-session-registry.ts`；两者都不在 004。
- `worker-runtime.ts:19-29` re-export `worker-import-normalize.ts` / `worker-import-stats.ts`；
  004 同样没有 owner。
- backend assembly 当前位于 `worker/backend.ts:3-28`，公开类型位于
  `worker/types.ts:3-44`；005–010 没有任何叶拥有这两个旧实现文件，因此无法把它们变成
  re-export/删除后的单一 truth。

完整 19 项为：`cell-write-reject.ts`、`color-scale-projection.ts`、
`data-bar-projection.ts`、`filter-hidden-rows.ts`、`paste-range-plan.ts`、`range-tsv.ts`、
`top-bottom-projection.ts`、`worker/backend.ts`、`worker/types.ts`、`worker-cell-ops.ts`、
`worker-command.ts`、`worker-custom-formulas.ts`、`worker-import-{commit,normalize,stats}.ts`、
`worker-range-stream.ts`、`worker-session-registry.ts`、`worker-wire-guards.ts`、
`worker-wire-telemetry.ts`。

反方向，004 明列 `custom-array-return.ts` 与 `worker-spill-region.ts`
（`004-rust-wasm-dispatcher.md:22-23`），但它们分别直接 import TS core
（`custom-array-return.ts:30`、`worker-spill-region.ts:13`），真实消费者只在
`worker-runtime-ts/**`。它们不是 Rust runtime 闭包。

影响：执行者只能越过 `files`、让 neutral 包反向 import Solid、复制 helper 留下双 truth，
或交付无法编译的 runtime；任一结果都不满足 React → neutral worker → WASM → Rust。

精确修订：先落一张“当前源文件 → neutral 目标 → Solid compatibility stub/保留 TS-only”
闭包表，19 项逐一归属；Rust closure 中的旧文件必须由同一叶改成 re-export 或明确删除 owner。
从 004 移除 TS-only 两文件。至少按以下可独立验收 family 拆：

1. runtime envelope：`worker-runtime-core/command/post/rejections/wire-guards/wire-telemetry/workbook-host`；
2. runtime session streams：registry、cell ops、import commit/normalize/stats、range stream、
   sessions/snapshot commands；
3. runtime custom formulas：resources、custom-formula runtime、async pump、WASM custom surface；
4. backend assembly/types compatibility cleanup；
5. projection overlay helpers分别随 format、merge、validation、conditional-format、filter family 迁移。

### C2. M0 的多个叶远超 10–20 分钟，且 family 混合违反单一职责

证据：按当前 `files` 对已存在源文件运行 `wc -l`（不计将新增的代码/测试），003、004、
007、008、009 分别覆盖约 1,381、2,369、1,541、1,970、1,605 行。文档却都声称
15–20 分钟（`003-worker-rpc-contract.md:27-28`、`004-rust-wasm-dispatcher.md:31-32`、
`007-structure-format-ports.md:28-29`、`008-clipboard-data-ports.md:28-29`、
`009-formula-rule-table-ports.md:28-29`）。007 同时含 sheet/structure/size/format/hidden/merge
（`:25-26,43-49`），008 同时含 clipboard/fill/filter/sort/data-edge/history
（`:25-29,42-47`），009 同时含 custom formula/named range/validation/CF/Table/print/spill
（`:25-29,43-50`）。这些 family 不共享一个独立产品验收闭环。

影响：M0 不是“可立即派发”的 10–20 分钟树；reviewer 无法独立否决一个 family，失败时也只能
重跑千行迁移。`src/backend/common/**`（005 `:16-18`）还提供了一个不满足命名测试的杂物落点。

精确修订：003 拆成 wire types 与 client transport；004 按 C1 的三个 runtime family 拆；backend
至少拆为 session/capability、projection base、cell input/import transaction、sheet lifecycle、
structure/dimensions、format、merge overlay、clipboard TSV/paste、fill、filter/sort/hidden、history、
named range/custom formula、validation overlay、conditional format、Table、print/spill。每叶列精确旧文件、
新文件、compat stub、测试名与 `wc -l` 命令；不要按 `part1/part2` 机械切。

### C3. 011 把公共 runtime 合同放在 demo，101 的产品源码无法合法消费；1000 行 seed 端口也未产出

证据：011 的实现范围只有 `demo/backend/**`、`demo/App.tsx`、`demo/main.tsx` 与测试
（`011-react-rust-runtime.md:15-21`），却产出 `RustWorkbookRuntimeState`、
`RustWorkbookRuntime`、factory 与 hook（`:47-60`）。101 只能写 `src/workspace/**`
（`101-workspace-state-surface.md:15-17`），并逐名消费这些类型（`:35-54`）。React 包的
`tsconfig.json:4,9` 把 `rootDir/include` 限在 `src`，所以 `src/workspace` 不能反向依赖 demo；
重复声明则形成第二份 lifecycle truth。

此外 011 要“用 Rust import port 写入确定性 1000 行数据”（`:61-62`），但它的消费合同只列
task 010 的 backend/factory（`:40-45`）；006 的产出只含三个 required port
（`006-projection-cell-input-ports.md:43-47`），没有现有 `importCells/importCellChunks`。

影响：101/107 的包级 typecheck 或失败，或通过复制类型掩盖接口漂移；默认 demo 的 1000 行真实 Rust
seed 也只能靠执行者猜 optional method、request/result 与 capability 语义。

精确修订：让 011 拥有 `src/runtime/rust-workbook-runtime*.ts` 并在那里定义唯一公共 contract，
demo/backend 只做工厂组装；或先由 101 产出 generic `WorkspaceRuntimePort`，再让 011 依赖并实现。
同时在 required data leaf 精确产出 `importCellChunks(request): Promise<BackendMutationResult>`（或一个
`seedWorkbook` host API），写明 capability、拒绝、revision、取消与 1000 行分块上限。

### C4. capability manifest 方向正确，但 013 在 backend 存在前验 backend，不能独立修掉 null→full-trust

证据：当前风险真实存在：`worker/session.ts:50-63` 把非 full witness 设回 `null`，
`worker/capabilities.ts:6-15` 把 `null` 解释为 full trust，Rust command 又只回 scoped autoFill
（`worker-commands-workbook.ts:81-89`）。013 承诺 malformed/null 全 fail-closed
（`013-rust-capability-manifest.md:55-58`），但：

- `RustCapabilityKey` 只被引用，未列出精确 union 或“capability → RPC commands → backend methods →
  canonical 类别”映射（`:42-53`）。
- 013 只依赖 004（`:6`）；006–009 可能尚未完成，最终 backend 要到 010 才装配。
  因而 013 的“对应 backend method 为 undefined”验收（`:56-58`）在自己的 ready 时刻不可执行。
- 013 的 `files`（`:15-20`）不含 neutral backend capability gate；005 虽提到 fail-closed
  （`005-backend-session-kernel.md:31-33`），却不消费 013，也没有精确 gate 输出。

影响：manifest helper 可以测试通过，而实际 getter 仍 full-trust；反过来，一刀切 family witness 又会
错误隐藏 UI-core canonical/adapter overlay 能力，重现 v1 I7。

精确修订：拆成“Rust command manifest producer”和“backend exposure gate”两叶。前者给完整 key union、
protocolVersion、每 key 的 command witness；后者依赖所有 port family，逐项列 engine-required、
UI-core canonical、adapter overlay、external service，随后才让 010 assembly ready。测试必须从
null/malformed/unknown version 构造真实 backend，断言 required 三端口保留、engine optional 为 undefined、
overlay/canonical 不被误杀，并做 manifest/registered-command 双向集合相等。

### C5. 006–009 的声明产出遗漏现有 public methods，无法证明“当前 backend 完整迁移”

证据：当前 projection port 同时实现 `readViewportSizeProjection`
（`worker/ports/projection.ts:16-20,51-55`），cell-input port 同时实现
`importCells/importCellChunks/clearRange`（`worker/ports/cell-input.ts:23-28,68-83`），lifecycle 还实现
`subscribeContentChanges`（`worker/ports/lifecycle.ts:6-18`）。006 的精确产出却只列三个 required method。
同样，当前 structure port 有 `removeRows/removeRowsExact`（`worker/ports/structure.ts:22-36,84-94`），
hidden-state 有 `setEvalHiddenRows`（`worker/ports/hidden-state.ts:19-30,68-70`），而 005 options 与 007
产出均漏掉这些签名（`005-backend-session-kernel.md:41-47`、
`007-structure-format-ports.md:43-49`）。`coverage.md:38` 仍把 remove duplicates 标为 A。

影响：agent 可以按文档交付一个能过 S01 的缩水 backend，却悄悄丢掉后续标 A 的现有 Rust 能力；也可以
自行猜测“迁移文件意味着额外隐式产出”，违反跨叶只靠文档对齐的规则。

精确修订：为每个 backend family 列出完整 `Pick<SpreadsheetBackend, ...>`，并单列扩展 options/
methods（尤其 `removeRowsExactCapability`）；对每个 getter 写 capability key 与 canonical 类别。再增加一个
assembly 集合测试：旧 Rust backend 的 own method/getter allowlist 与 neutral Rust backend 完全相等，只有
明确 backlog 裁决的差异可豁免。

## Important（6）

### I1. DAG 无环但缺两个消费/阶段边；按 `depends_on` 调度会产生真实 package 冲突

106 消费“公开组件”并运行 demo build（`106-compose-first-workbook.md:40-50`），但不依赖负责根导出的
107（`107-first-react-public-surface.md:36-46`），两者会同时 ready。另，101/102 只依赖 011，104
只依赖 001（`index.md:65-69`）；这与 `ledger.md:31-33` 的“M0 全 done 后进入 S01”没有编码成 DAG。
若调度器遵循 `depends_on`，012 与 107 可同时 ready，且都拥有
`excel/react-excel/package.json`（012 `:16-23`；107 `:15-18`）。

修订：让 106 依赖 107；让 S01 根叶 101/102/104 依赖 012（或增加机器可验证的 stage gate，且 ready
计算必须读取它）。重跑 exact-file 与 ancestor/descendant glob 的 ready-set 冲突检查。

### I2. neutral worker 的发布/构建产物边界未冻结

010 要发布 `. /wasm-worker-factory /worker-runtime /package.json`（`010-rust-worker-public-surface.md:45-57`），
验收却只有 `tsc --noEmit` 与 Jest（`:59-62`）。当前通用 Rollup 只发现同时有 `main/module` 的包，且只以
`src/index.ts` 为入口（`rollup.config.mjs:16-24,132-164`）；它不会自动产出未被根入口引用的两个 worker
subpath。002/010 又都没有 rollup/artifact verifier 的文件所有权。

修订：明确二选一：若仅 workspace source package，则设 `private: true` 并说明 Solid 发布包不能依赖它；
若是 Solid/React 共用的可发布包，则给 multi-entry ESM 构建、worker URL 后缀改写、`files/exports/types`
与 `pnpm pack` artifact import 测试，并把相应构建配置列入 owner。

### I3. M0/S01 横切矩阵没有 leaf owner，仍不能双向审计

`coverage.md:66-79` 的 owner 列只有 stage，不列 task id；C01 实际被 001–013 多叶声明，C02–C07 又被
101/104/106/107/108 交叉声明。C08 更直接不一致：矩阵写 S03–S16（`:75`），105 却声明 S01 C08
（`105-accessible-overlay-primitives.md:32-35`），107/108 也声明覆盖到 C08。

修订：未来 backlog 行可暂留 stage owner；当前 detailed 的 C01–C08 必须拆成可验证子行或增加 leaf-owner
列，逐一列 producer、composition、audit、证据文件，保证矩阵↔叶子双向一致。

### I4. 多个验收命令不可复制或没有命中当前测试名

003 使用 `-t 'worker client'`（`003-worker-rpc-contract.md:55-58`），当前测试实际名是
`vnext-adapter.test.ts:898` 的 “consumes worker protocol TSV chunks...”，该 pattern 不验证兼容路径。
007–009 只写“Solid targeted tests 继续通过”而没有命令/精确 test name；108 的四项目 E2E 也没有给出
执行命令或 test discovery 断言（`108-first-rust-demo-acceptance.md:34-45`）。

修订：每叶给一个当前可复制的完整命令；compat 测试最好落为短小专用文件而不是从约 5k 行
`vnext-adapter.test.ts` 模糊筛选。108 明列 `pnpm --filter ... test:e2e -- ...`、四个 project 名与
`--list` 必须发现 `s01-workbook.spec.ts` 的断言。

### I5. dirty worktree 与 `base: null` 会让执行/审查混入用户改动

当前已修改 `react-excel/README.md`、`react-excel/package.json`、`pnpm-lock.yaml`、`rules/.eslintrc`，demo
目录与整棵任务树未跟踪。002 只提醒 lock dirty（`:35-38`），011/106 只笼统提醒 demo 视觉；但 001、
011、012、106、107 都会写这些重叠文件。以 HEAD 作为后续 `base` 时，review diff 会把既有用户改动也
算到执行 agent 名下。

修订：派发前记录每个重叠文件的 dirty baseline（路径、状态、blob/hash 或独立 pre-task patch），任务正文
逐项写“必须保留”的已有变更；这些叶保持串行。review 比较 pre-task→post-task，而不是只用 HEAD→post。

### I6. 102/103 对现有 React root 实现是“迁移”还是“包装”没有裁决

102 说复用并迁入现有 viewport/geometry/GridView（`102-visible-window-grid.md:28-30`），files 却只有新
`src/grid/**`（`:15-17`）；当前真相仍在 `src/use-spreadsheet-viewport.ts`、
`src/spreadsheet-grid-geometry.ts`、`src/SpreadsheetGridView.tsx`。103 对 root selection/editing/IME hooks
同样只拥有新目录（`103-selection-editing-chain.md:15-18,29-31`）。

修订：若只包装，正文明确 root modules 保持唯一算法 truth，新组件只组合且测试禁止复制；若要移动，
把旧 root 文件列入同叶并改为 compatibility re-export。两种都需让 107 的 export allowlist 与旧 subpath
兼容策略逐项明确。

## Minor（0）

无。现有问题都直接影响 M0/S01 的可派发性、独立验收或边界真实性，不应降级为文案建议。

## 放行前最小修订顺序

1. 先做 C1/C2/C5：用真实 import closure 重分 M0 family，补全旧源 cleanup 与完整 method allowlist。
2. 再做 C4：冻结精确 manifest，并把 backend exposure gate 放到 port families 之后、assembly 之前。
3. 修 C3/I1：把 runtime contract 移入 `src`，补 seed port、107→106 消费顺序与 M0→S01 DAG 门。
4. 修 I2/I4：冻结 worker artifact 形态与每叶可复制命令。
5. 最后同步 current-stage 横切 leaf owner、dirty baseline，再重跑 closure、DAG、ready-set 文件冲突审计。

在以上 Critical 修完前，不能派发 001；当前文档方向已转为 Rust-only，但执行边界还不足以保证最终产物
真的排除 Solid/TS core、保留完整 backend 能力并让 S01 默认 demo 可见可验。
