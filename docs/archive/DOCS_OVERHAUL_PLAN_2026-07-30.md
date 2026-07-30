> ✅ **已执行完毕，归档留档。** 本文是 2026-07-30 那次文档整理的提案与盘点依据，
> 按它自己第 3 节定的规则（提案落地即归档）存于此。
>
> 执行结果的现行入口：`docs/ARCHITECTURE.md`、`docs/decisions/`、各包 `docs/archive/INDEX.md`。
>
> 与提案的两处偏离：① `MAIN_FLOW.md` 改为归档而非重写（重写等于重新推导整个引擎流程，
> 超出文档整理范围且有编造风险，理由见其横幅）；② perf 报告落 `test/perf-reports/` 而非
> archive —— 它们的输出路径硬编码在 bench 里，且是可重新生成的产物，不是归档材料。

# 文档整理规划（对标主流开源实践）

<!-- doc-check: allow-stale-paths -->

- 日期：2026-07-30
- 状态：**executed**（2026-07-30 全部执行完毕，本文按第 3 节自己定的规则归档）
- 盘点方式：三路并行代码核验（solid-excel / spreadsheet-ui-core / rust + excel-core-ts），所有失效引用均经 ls/grep 实证，非目测。

## 1. 现状盘点

全仓约 **150 份 tracked markdown**。按性质分：

| 类别 | 规模 | 状态 |
|---|---|---|
| 贴码契约（`src/*/README.md` ×40、`e2e/*/CASES.md` ×27、`CUSTOM_FORMULAS.md`、`excel-site/README.md`） | ~70 份 | **健康**，是全仓唯一与实现同步的层，整理时的对齐样板 |
| 门面层（根 README / CONTRIBUTING / package.json 元数据 / CLAUDE.md 部分段落） | 4 份 | **全部失效**：仍是拆分前 einfach 状态库仓的身份 |
| 包级顶层活文档（各包 README、ROADMAP、MAIN_FLOW、wasm README 等） | ~10 份 | **普遍严重落后**（详见 §5 修复清单） |
| 冻结记录（phase/wave 计划、handoff、session 看板、audit、perf 报告） | **~60 份、超 2 万行** | 内容无错（本就是历史快照），错在**与活文档混在同一层**，新读者无法分辨「规范」与「某次会话的现场记录」 |

五个病灶（均有实证）：

1. **权威中心转移无人告知。** feature 归属的真规范是 `excel/solid-excel/docs/online-excel-parity/CANONICAL_OWNERSHIP.md`，`src/*/README.md` 已跟上引用；但 spreadsheet-ui-core 的 `README.md` / `ROADMAP.md` / `AGENT_COLLABORATION.md` 对它零感知，仍在讲已死的 wave 叙事（`tables`、`outline`、`formula-functions` 三个已上线 feature 不属于任何 wave）。
2. **归档目录假装活目录。** `excel/rust/docs/` 24 份里 15 份是 2026-05 同一轮战役的冻结计划；「当前状态」在 ROADMAP、TODO、ISSUES、MAIN_FLOW 各停在不同月份，互相矛盾且没有一层是真的。
3. **拆仓只迁了代码没扫文档。** 12 份文档硬编码老仓绝对路径 `/Volumes/work/self/einfach`；8 份引用已迁出的 `core/*`；两份 handoff 钉的 commit 在本仓 785 条历史里不存在；`excel/showcase/` 退役后残留只剩 `node_modules` 的空壳目录。
4. **计数型断言普遍腐坏。** solid-excel README 说 "419 jest specs"（实际 107 文件/1484 用例）、BACKEND_PARITY 说 59 spec（实际 140）、wasm README 说 12 个单测（实际 67）。反例：`CASES.md` 用「源码路径引用 + 行数登记」代替全局计数，抽查全部对得上。
5. **三套阶段命名并存。** `PHASE1-5_PARALLEL` / `WAVE1-6` / `ATOM_DELEGATION P1-P7` 指同一类东西；完结记录一半带日期一半不带。

## 2. 对标：主流开源项目怎么做

| 实践 | 代表项目 | 对应本仓的病 |
|---|---|---|
| 根 README = monorepo 门面；包 README = 包契约 | Babel、Jest、Vite | 根 README 还在介绍一个已迁走的状态库（病灶 3） |
| `ARCHITECTURE.md`：一份**故意粗粒度**的代码地图，只写不易变的层次，细节下沉到贴码文档 | rust-analyzer（matklad 惯例） | 本仓三层架构只散落在 CLAUDE.md 里，人类读者无入口 |
| ADR 决策记录：`docs/decisions/NNNN-*.md`，短、编号、带 status（accepted/superseded），**一经接受不改内容** | Nygard ADR；AWS/Spotify 等广泛采用 | solid-js 单实例、engine-owns-filter 等重大裁决埋在 CLAUDE.md 和 27 份看板里 |
| 设计提案生命周期：提案带状态头，**落地后真相迁入 reference 文档，提案本体归档** | Rust RFC、Kubernetes KEP | wave-*/phase-* 计划落地后原地腐烂，13 条失效路径全部来自「计划要建的文件名」（病灶 1、2） |
| reference 与 record 分离：契约文档与过程记录不同层 | Diátaxis（Django、Canonical） | ~60 份战役记录与契约混层（病灶 2） |
| 归档惯例：`docs/archive/` + 状态横幅，读者一眼可辨「现在」还是「当时」 | TypeScript wiki、React 旧文档处理 | 无任何 archive 目录 |
| docs-as-code 门禁：CI 跑 markdown 链接检查；文档禁写会腐坏的计数，改写「怎么算」的命令 | CNCF 项目普遍用 lychee / markdown-link-check | 病灶 3、4 均无自动防线 |
| changesets 管版本与 CHANGELOG | — | **已具备**，不动 |

## 3. 目标结构与文档分类学

```
docs/                                  # 新建：仓库级文档（本文件是首个住户）
  ARCHITECTURE.md                      # 三层架构 + 目录地图（粗粒度，matklad 风格）
  decisions/                           # ADR，编号递增，一经接受不改
    0001-solid-js-single-instance.md
    0002-upstream-core-via-npm.md
    0003-engine-owns-filter-sort.md
    0004-worker-factory-out-of-barrel.md
    0005-e2e-feature-folders.md
  DOCS_OVERHAUL_PLAN_2026-07-30.md     # 本提案，执行完迁入 archive/

excel/<pkg>/docs/                      # 各包：只留活的契约/参考文档
excel/<pkg>/docs/archive/              # 各包冻结记录就近下沉（不集中到根，git mv 短路径）
  INDEX.md                             # 每份一行：这是哪场战役的什么记录
```

四类文档，判定规则写进 CONTRIBUTING：

| 类型 | 判据 | 生命周期 |
|---|---|---|
| **契约 (reference)** | 描述现状，贴码（`src/*/README.md`、`CASES.md`、`CUSTOM_FORMULAS.md`） | 随代码 PR 同步更新 |
| **决策 (ADR)** | 一次裁决 + 理由 | 接受后不改，只能被新 ADR supersede |
| **提案 (plan)** | 文件名带日期的前瞻计划 | 落地时：结论上移进契约/ADR，本体 `git mv` 进 archive |
| **记录 (record)** | handoff / audit / perf 报告 / 会话看板 | 生成即冻结，直接住 archive |

配套硬规则：① 文件名带日期 = 冻结，不修内容只归档；② 文档禁写全局计数（"N 个测试"），要么删要么给出「怎么算」的命令；③ 归档一律 `git mv` 保历史。

## 4. 分阶段执行

### P0 · 门面止血（~半天，1 个 commit）

对外第一眼全是错的，优先级最高：

1. 重写根 `README.md`：表格栈 monorepo 门面 —— 是什么、包表格（含 rust crates）、快速上手（pnpm install / build / test / e2e）、指向 `docs/ARCHITECTURE.md` 与 CONTRIBUTING。
2. 重写 `CONTRIBUTING.md` 的「项目结构」节为 `excel/*` 实况（代码风格 / changesets 节仍准确，保留），并加入 §3 的文档分类学与硬规则。
3. 根 `package.json`：name / description / repository / homepage / bugs 改为本仓身份（新仓 URL 需拍板，见 §6）。
4. `CLAUDE.md`：Core Concepts 一节改为「上游 `@einfach/core` 概念简介（npm 依赖，源码在原仓）」，删除 `core/core/src/*`、`core/react-form/*` 死路径；契约测试引用只留本仓的 `provider-remount-1912.test.tsx`。
5. 删除 `excel/showcase/` 空壳（0 tracked file，仅剩 node_modules）。

### P1 · 立骨架（~半天，1 个 commit）

1. 写 `docs/ARCHITECTURE.md`：三层图（ui-core → solid-excel → rust/wasm via worker）、backend port 契约位置、目录地图。只写不易变的，细节链接到贴码 README。
2. 建 `docs/decisions/`，先补 5 条既有裁决（上表编号）：素材分别在 CLAUDE.md「Resolved」节、commit 66e0782 / 07150f0 / ce2815a、`CANONICAL_OWNERSHIP.md` 的 07-22 翻转记录。
3. 各包建 `docs/archive/` + `INDEX.md` 骨架。

### P2 · 归档潮（~1 天，每包 1 个纯 `git mv` commit）

| 区域 | 归档内容（去向 `<pkg>/docs/archive/`） | 留下 |
|---|---|---|
| spreadsheet-ui-core | 5 份 `wave-*.md`（13 条失效路径的集中地）；12 份从未同步的 planning spec（history / error-codes / clear-cells-endpoint / multi-range-selection / merge-cells / named-ranges / data-validation / conditional-formatting / rich-types-text-links / protect-sheet-locked-cells / print-page-area / collab-presence，各自 `src/*/README.md` 才是现行契约）；`find-replace.md`（文档化了不存在的 `findReplaceStatusAtom`，留着比删危险）；AGENT_COLLABORATION 的看板部分 | 已重写为契约的 6 份（frozen-panes、filter-sort、cell-format-expansion、auto-fill-series、comments-notes、formula-reference-mode、hidden-rows-columns 按实况取舍） |
| solid-excel | `E2E_TEST_PLAN.md`（已挂弃用横幅）、`INTERACTION_ATOM_PLAN.md`、`PC7_AGENT_PIPELINE.md`；`docs/online-excel-parity/` **整目录**（26+2 份战役看板，工作根还写着老仓路径）；`test/perf-*.md` ×4（可由 bench 重新生成） | 从 parity 目录**上移**到 `docs/`：`CANONICAL_OWNERSHIP.md`（现行唯一归属规范）、`REMOTE_RESTART_PLAN_2026-07-28.md`（grep 证实 REMOTE 零实现，唯一未兑现 backlog）；`E2E_FEATURE_FOLDER_PLAN_2026-07-29.md` 暂留（当前 e2e 结构唯一权威说明，待其内容并入 e2e 层 README 后再归档） |
| rust | `rust/docs/` 15 份 5 月战役（STEPS、HANDOFF、ONLINE_SPREADSHEET_*、PHASE1-5+4A、WAVE3-6、RELEASE_GATE）+ `ATOM_DELEGATION_PROGRESS`（与 MAINLINE 重复）+ `LAZY_FORMULA_EVAL`（被 excel-core 版接管）+ **ROADMAP / TODO / ISSUES**（不逐条更新，加「历史快照，截至 2026-05」横幅后整体归档）；`excel-core/docs/` 6 份全归档（`SCALE_TEST_SUITE_PLAN` 先把 bench 运行说明拆进 `PERF.md`） | `ATOM_DELEGATION_MAINLINE.md`、`ATOM_DELEGATION_REWRITE_PLAN.md`（门禁契约部分）、`PERF.md`、`MAIN_FLOW.md`（P3 重写后） |
| excel-core-ts | `docs/` 里 AGENT_COLLABORATION、FUNCTION_QUALITY（backlog 价值，INDEX 里注明）、KEY_GRANULAR_INVALIDATION、PERF_BULK_IMPORT、SESSION_HANDOFF ×2、STASH_AUDIT（纯考古，可径直删）、PLAN | `ARCHITECTURE.md`（P3 修掉 core 死引用后保留） |

归档动作固定三步：`git mv` → 文件头加一行状态横幅（`> ⚠️ 冻结记录（YYYY-MM），仅供考古，现行契约见 <指针>`）→ `INDEX.md` 登记一行。

### P3 · 活文档校准（~1–2 天，按包分 commit）

逐项修复清单（全部已核实到 file:line）：

**solid-excel**
- `README.md`：L89 `build:wasm` 抄的是老仓路径（`../../solid/excel/...`，实际 `package.json:33`）；L109 示例 `e2e/vnext-smoke.spec.ts` → `e2e/smoke/vnext-smoke.spec.ts`;L93 "419 specs" 计数删除改命令；L43/62-66 补 `@einfach/solid-excel/vnext-worker-factory` 子入口口径（worker factory 已刻意不从 vnext barrel 导出，`src-vnext/adapter/index.ts:7-14`）；L5 的 parity 目录引用改指 `CANONICAL_OWNERSHIP.md` 新位置。
- `e2e/BACKEND_PARITY.md`（门禁文档，就地修不归档）：头部 59-spec/515 用例过时口径；L302 「TS-core (core/core)」→ `excel/excel-core-ts`；L283 spec 路径。
- `docs/online-excel-parity/A11Y_BASELINE.md`（门禁文档）：4 处 `e2e/a11y-surfaces.spec.ts` → `e2e/i18n-a11y/`（随目录归档时一并修，因为它是可执行命令）。
- `docs/STRUCTURAL_UNDO.md` L4：`core/core/src/utils/createHistory.ts` → `@einfach/core`（npm）。

**spreadsheet-ui-core**
- `README.md`：模块表 31 → 46（缺 copy-as、custom-formulas、tables、outline 等 15 个）；wave 叙事改为指向 CANONICAL_OWNERSHIP + ROADMAP 新形态；两处过期计数改命令。
- `ROADMAP.md`：wave 表整体降级为历史（迁 archive），本体改写为「feature → 归属 → 契约文档」索引，纳入 wave 外的 tables / outline / formula-functions。
- `AGENT_COLLABORATION.md`：拆分 —— 前半的规则约定（框架无关、禁 per-cell atom、测试门禁）并入包 README 或独立 CONVENTIONS 节；看板 + handoff 归档；唯一失效引用 `e2e/vnext-smoke.spec.ts` 随之消灭。
- 补 5 个缺失的 feature README：`format-cells`、`format-painter`、`formula-functions`、`name-box`、`status-bar`（`internal/` 豁免）；`src/paste-special/README.md` 的死测试路径 `test/vnext-paste-special.test.tsx` 修正。
- wave-8 的「as-built diverges from spec」偏差声明上移进 `src/custom-formulas/README.md` 后，wave 文档才可安心归档。

**rust / excel-core-ts / wasm**
- `excel-core-ts/README.md` **重写**（最严重：自称 "Phase 0 skeleton, no parser/evaluator"，实为 26.6k 行、500 函数、被 `worker-runtime-ts.ts` 用作第二 worker 后端的引擎）：定位 = parity reference + TS worker 后端；`../core` 死链改 npm 口径。
- `rust/wasm/README.md` **重写**：测试数（12→用命令）、产物路径（`wasm-pkg` 实际在 `excel/solid-excel/wasm-pkg/`）、API 面（137 个 pub fn 按域分组列举：bulk import、tables、filters、persistence、spill、custom formulas、debug 探针），TODO 节删除（指向的两条早已完成）。
- `rust/docs/MAIN_FLOW.md` **重写或并入 MAINLINE**：`set_formula` 链路描述的代码已不存在；B.1/B.3/B.12/D.11 标「未修」与 ISSUES 自己的 ✅ 矛盾；链路要改讲 vnext worker adapter。它是 rust 侧唯一总览入口，值得重写而非冻结。
- `rust/docs/PERF.md`：补 `scale_bench.rs` 常开套件说明。
- `excel-core-ts/docs/ARCHITECTURE.md`：修 `core/core` 死引用。

### P4 · 防回潮（~半天，1 个 commit）

1. CI 加 markdown 链接检查（推荐 lychee，`--offline` 只查仓内相对链接，不碰外网，快且零误报面），对 `**/*.md` 排除 `docs/archive/` 与 `wasm-pkg/`。归档区豁免 —— 冻结记录里的死链是史实的一部分。
2. PR 模板加一项：「改了公共 API / 目录结构 / 后端 port？→ 同步对应契约文档」。
3. §3 的四类分类学与硬规则落进 CONTRIBUTING（P0 已做），CLAUDE.md 加一行指针。

## 5. 验收标准

- 新人从根 README 三跳内能到达任一包的现行契约（README → ARCHITECTURE → 包 README）。
- 任何 md 打开 5 秒内可判断「现在」还是「当时」（位置在 archive / 头部横幅 / 文件名日期，三信号至少其一）。
- `lychee --offline` 在非 archive 区零死链。
- 全仓活文档中不再存在指向 `core/*`、`excel/showcase`、扁平 `e2e/*.spec.ts` 的引用（当前分别为 8、1、20+ 处）。

## 6. 待拍板项

| 事项 | 建议 |
|---|---|
| 仓库身份命名（package.json name、repository URL、根 README 标题） | 建议定名后 P0 一并改；URL 未定前先只改 name/description |
| ROADMAP 处置 | **改写为 feature 索引**（而非归档消失）—— CLAUDE.md 引用它，且「全景在哪」的问题真实存在 |
| 归档位置 | **包内 `docs/archive/`**（就近、`git mv` 简单、不跨包长路径）；不建根级集中归档 |
| `E2E_FEATURE_FOLDER_PLAN_2026-07-29.md` | 暂留 `docs/`，内容并入 e2e 层说明后归档（它目前是 e2e 结构唯一权威） |
| `STASH_AUDIT.md` | 建议直接删（对象是老仓的 16 个 stash，不随拆仓存在） |

## 7. 非目标

- 不重写任何冻结记录的内容（历史就是历史，只挪位置、加横幅）。
- 不建独立文档站（excel-site 已承担 demo/门面职能）。
- 不动原仓（einfach 主仓）的任何文档，包括 `REPO_SPLIT_PLAN`。
- 不逐条更新 rust 的 TODO/ISSUES 旧账（冻结 + 横幅，新问题用新机制记）。
- 不在本轮处理 i18n / 双语化。
