# Solid Excel 源码主线扶正

## 目标结构

```text
excel/solid-excel/
├── src/          现役 Solid 组件、Provider、adapter、i18n、styles
├── legacy/       旧 Table/store/legacy demos，仅兼容与 parity
├── demo/         Vite 本地演示壳
├── bench/        `/?bench=1` 基准入口与场景
└── demo-remote/  远程后端演示
```

## 全局约束

- 现役新功能唯一落点是 `excel/solid-excel/src/`；不得新建第二个 `src-*`。
- `spreadsheet-ui-core` 继续独占产品状态；Solid 层只持 DOM、测量与动画句柄。
- 根入口 `@einfach/solid-excel` 切到现役 API；旧根 API 只从 `/legacy` 提供。
- `/vnext`、`/vnext-worker-*`、`/vnext-styles.css` 保留为兼容别名；本树不规定移除日期。
- canonical 新入口为 `/worker-factory`、`/worker-runtime*`、`/styles.css`。
- worker factory 继续独立于公共 barrel，禁止把 `import.meta` 传染给普通入口。
- 保持 Solid 单实例、双形态源码/ESM 发布、WASM/TS 双后端 parity。
- 普通新增或大改文件 `wc -l <= 300`；禁止 `helpers2`、`part1`、大杂烩 `utils`。
- 任务 013–019 是对同一个 2243 行存量 runtime 的连续迁移链：中间任务不得 commit 或对外交付，原文件行数必须单调下降；019 必须把最终装配壳降到 300 行内并关闭临时超限状态。
- `src/i18n/locales/{en,zh}.ts` 是 i18n 资源，按规则豁免行数。
- `renderRangeAsImage.ts`（单一图片渲染算法）、`sheet-tab-controller.ts`（单一交互状态机）、`wasm-workbook-surface.ts`（单一协议面）允许保持 301–500 行；拆开会迫使同一流程跨文件跳读。
- legacy 目录只做路径搬迁与导入修正，不顺手重写。存量超限债务：`sheet-store.ts`、`wasm-workbook-store.ts`、`Table.tsx`、`js-sheet.ts`、`demos/DemoMillion.tsx`、`wasm-sheet-proxy.ts`、`file-import.ts`。
- 日期化观察、ADR 历史正文、`docs/archive/**`、`excel/solid-excel/docs/archive/**` 保留历史路径文字；现行规范必须改到新路径。
- 所有执行 agent 不得 commit；范围外发现只写报告。

## 覆盖矩阵

| id | 表面 / 状态 | 精确入口或路径 | 归属叶子 | 验证证据 | 状态 |
|---|---|---|---|---|---|
| C-001 | 现役源码主线 | `excel/solid-excel/src/` | 008 | `test ! -d excel/solid-excel/src-vnext` + typecheck | done |
| C-002 | legacy 兼容树 | `excel/solid-excel/legacy/` | 007 | legacy Jest 组 + `/legacy` 入口断言 | done |
| C-003 | 默认本地 Demo | `excel/solid-excel/demo/` | 006 | Playwright current smoke | done |
| C-004 | legacy parity Demo | `/?legacy=1` | 006 | legacy demo smoke + 既有 demo spec | done |
| C-005 | 公共性能基准 | `/?bench=1`、`excel/solid-excel/bench/` | 006, 022 | registry Jest + benchmark route smoke | done |
| C-006 | 包根与 `/vnext` | `package.json#exports["."]`、`./vnext` | 009 | package-entry contract | done |
| C-007 | worker 子路径 | `./worker-*` 与 `./vnext-worker-*` | 009 | pack 后 import probe | done |
| C-008 | 样式子路径 | `./styles.css` 与 `./vnext-styles.css` | 009 | CSS tree-shaking test | done |
| C-009 | demos 与 i18n 子路径 | `./demos`、`./i18n` | 005, 009 | package-entry contract | done |
| C-010 | 官网消费者 | `excel/excel-site/src/**` | 010 | site typecheck + site build | done |
| C-011 | starter 消费者 | `templates/vite-starter/**` | 010 | starter tarball build | done |
| C-012 | 单测与深层内部导入 | `excel/solid-excel/test/**` | 007, 008, 023 | Jest package suite + migrated-path scan | done |
| C-013 | 双后端浏览器路径 | `excel/solid-excel/e2e/**` | 014–019, 006, 012 | wasm/ts targeted E2E | done |
| C-014 | 构建与发布产物 | `rollup.solid-excel.mjs`、tarball | 008, 009 | build + pack contents | done |
| C-015 | lint/cycle/type 工具 | root scripts、`.dependency-cruiser.cjs` | 008 | lint + cycles + tsc | done |
| C-016 | 现行架构文档 | `CLAUDE.md`、`docs/ARCHITECTURE.md` 等 | 011, 020, 021, 023 | docs links + two-class stale scan | done |
| C-017 | 历史文档 | 两个 archive 树与日期化观察 | N/A | 精确 allowlist 保留原文 | N/A |
| C-018 | 文件职责与行数 | 迁移后 `src/**` | 001, 003–005, 013–019, 012 | 553 files / 55666 lines audit | done |

## 任务树

- W0 现役超限文件按职责拆分 (`group`)
  - 001 重建 worker RPC 协议边界 (`leaf`，依赖：无)
  - 002 拆分 TS worker runtime (`leaf`，失败：粒度过大，由 013–019 替代)
  - 003 重建 static 公式求值模块边界 (`leaf`，依赖：无)
  - 004 重建 Grid overlay 渲染边界 (`leaf`，依赖：无)
  - 005 收口现役 Demo 组件 (`leaf`，依赖：无)
  - 013 抽出 TS worker runtime 基础状态边界 (`leaf`，依赖：001，来源：002)
  - 014 抽出 TS worker cell projection 边界 (`leaf`，依赖：013，来源：002)
  - 015 抽出 TS worker 数据传输边界 (`leaf`，依赖：014，来源：002)
  - 016 抽出 TS worker 自定义公式边界 (`leaf`，依赖：015，来源：002)
  - 017 抽出 TS worker viewport size 边界 (`leaf`，依赖：016，来源：002)
  - 018 抽出 TS worker sheet lifecycle 边界 (`leaf`，依赖：017，来源：002)
  - 019 收口 TS worker 命令分派壳 (`leaf`，依赖：018，来源：002)
- W1 物理目录归位 (`group`)
  - 006 清空旧 src 的非 legacy 职责 (`leaf`，依赖：001–005)
  - 007 迁移旧表格实现到 legacy 树 (`leaf`，依赖：006)
  - 008 将现役实现扶正为 src (`leaf`，依赖：007)
- W2 公共契约切换 (`group`)
  - 009 切换 Solid 包公开入口契约 (`leaf`，依赖：008)
  - 010 迁移仓内可执行消费者 (`leaf`，依赖：009)
  - 011 统一现行架构文档术语 (`leaf`，依赖：010)
  - 020 收口跨范围文档引用 (`leaf`，依赖：010，来源：011)
- W3 覆盖门 (`group`)
  - 021 清理现行 src-vnext 残留 (`leaf`，依赖：011、020，来源：012)
  - 022 补齐 benchmark 表面覆盖 (`leaf`，依赖：006，来源：012)
  - 023 清理已迁移 src 路径残留 (`leaf`，依赖：021、022，来源：012)
  - 012 审计源码扶正覆盖矩阵 (`leaf`，依赖：010、011、020、021、022、023)

## 状态表

| id | 任务 | model | status | created | done |
|---|---|---|---|---|---|
| 001 | 重建 worker RPC 协议边界 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 002 | 拆分 TS worker runtime | gpt-5.6-sol | failed | 2026-08-31 | |
| 003 | 重建 static 公式求值模块边界 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 004 | 重建 Grid overlay 渲染边界 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 005 | 收口现役 Demo 组件 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 006 | 清空旧 src 的非 legacy 职责 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 007 | 迁移旧表格实现到 legacy 树 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 008 | 将现役实现扶正为 src | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 009 | 切换 Solid 包公开入口契约 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 010 | 迁移仓内可执行消费者 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 011 | 统一现行架构文档术语 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 012 | 审计源码扶正覆盖矩阵 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 013 | 抽出 TS worker runtime 基础状态边界 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 014 | 抽出 TS worker cell projection 边界 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 015 | 抽出 TS worker 数据传输边界 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 016 | 抽出 TS worker 自定义公式边界 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 017 | 抽出 TS worker viewport size 边界 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 018 | 抽出 TS worker sheet lifecycle 边界 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 019 | 收口 TS worker 命令分派壳 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 020 | 收口跨范围文档引用 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 021 | 清理现行 src-vnext 残留 | gpt-5.6-terra | done | 2026-08-31 | 2026-08-31 |
| 022 | 补齐 benchmark 表面覆盖 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |
| 023 | 清理已迁移 src 路径残留 | gpt-5.6-sol | done | 2026-08-31 | 2026-08-31 |

## 遗留与发现

- 任务 007 Minor（已由 009 关闭）：package files 与 tarball 已同时包含 `@types/src`、`@types/legacy`。
- 任务 007 Info：两条 E2E 仍动态导入 `/src/wasm-*`；008 路径扶正时需改到明确 `/legacy/*`，012 再审计。
- 任务 005 路过存量债务：`test/vnext-menu-bar.test.tsx` 2958 行；本任务只做必要断言路径调整，不在当前叶子扩张重构。
- 任务 003 Minor：`static-formula/functions.ts` 函数签名格式与少量空行可读性一般；不影响职责、行为或验收，留待统一格式化处理。
- legacy 代码的最终删除不在本树；删除前必须把 31 个依赖 legacy Demo 导航的 E2E 路径逐项迁到现役表面。
- AD-393 是三框架版本协同，不由这次 Solid 包目录切换冒领完成状态；本树只产出可供其消费的 Solid 根入口契约。

## 决策与变更

- 2026-08-31：用户确认多并发开工；首批派发 001、003、004，三者产品文件范围不相交。
- 2026-08-31：任务 003 审查通过后补派 005；与在修 004、在审 001 的写入范围不相交。
- 2026-08-31：任务 001 审查通过，立即解锁并派发 002。
- 2026-08-31：任务 004 首审否决后完成 R1，复审通过；机械压行已移除，SVG geometry/layers 成为真实职责边界。
- 裁决: 任务 002 首执行者未产出实现后换新 sol 接管，不把 2243 行强内聚 runtime 拆成多个留有超限中间态的任务 — 任务自身要求按命令族形成最终闭环 — 错了的代价是新执行者仍可能需要重新理解同一状态机。
- 计划变更: 新执行者仍未产出实现，002 标记 `failed` 并由 013–019 替代 — 两份报告都证明原叶子超出可靠执行粒度，但职责边界可枚举 — 代价是迁移链必须串行，不能用并发换取该文件的速度。
- 2026-08-31：005 R1 复审仍否决 host 的 runtime 初始化职责，进入 R2；同时派发替代链首叶 013。
- 2026-08-31：005 R2 复审 `APPROVED`；host、runtime bootstrap、probe logger 达成单一职责边界。
- 2026-08-31：013 R1 复审 `APPROVED`，立即解锁并派发 014。
- 2026-08-31：014 R1 复审 `APPROVED`，立即解锁并派发 015。
- 2026-08-31：015 独立审查 `APPROVED`，立即解锁并派发 016。
- 2026-08-31：016 独立审查 `APPROVED`，立即解锁并派发 017。
- 2026-08-31：017 独立审查 `APPROVED`，立即解锁并派发 018。
- 2026-08-31：018 独立审查 `APPROVED`，立即解锁并派发 019 最终 runtime 门。
- 2026-08-31：019 R1 复审 `APPROVED`；公开壳 172 行、最大子模块 284 行，替代链完成并解锁 006。
- 2026-08-31：006 R1 复审 `APPROVED`，立即解锁并派发 007。
- 2026-08-31：007 独立审查 `APPROVED`，立即解锁并派发 008。
- 2026-08-31：008 R1 复审 `APPROVED`，W1 完成并派发 009。
- 2026-08-31：009 独立审查 `APPROVED`，立即解锁并派发 010。
- 2026-08-31：010 R1 复审 `APPROVED`，立即解锁并派发 011。
- 2026-08-31：011 首审 `REJECTED`；文档本体进入 R1，白名单外的两条死链与两处源码注释由发现叶 020 精确接管并并行修复。
- 裁决: 020 不使用 `allow-stale-paths` 掩盖日期化计划中的真实死链，只维护链接目标到现行 `src` — 链接检查器不会豁免死链，且该计划不属于 observation/archive/旧 ADR — 叙事正文保持不变。
- 2026-08-31：011 R1 与 020 独立复审均 `APPROVED`；W2 完成并派发 012 最终覆盖审计。
- 计划变更: 012 首轮审计不通过，新增并行叶 021/022 — C-016 仍有 9 个现行文件残留，C-005 缺少 benchmark 正向覆盖 — 修复后必须复跑 012，不能把覆盖缺口降级为遗留。
- 2026-08-31：021 R1 与 022 独立复审均 `APPROVED`；F-012-1/F-012-2 已关闭，立即复跑 012 总审计。
- 2026-08-31：012 R1 最终独立首审 `REJECTED`；新增 023 清理 9 个现行 E2E/spec/源码注释中的旧 `src` 悬空路径，012 不关闭。
- 2026-08-31：023 R1 复审 `APPROVED`；35 个迁移后路径目标及职责已核准，进入 012 R2 报告与最终复审。
- 2026-08-31：012 R2 最终独立复审 `APPROVED`，无未关闭 Critical/Important；C-001～C-018 全部 `done/N/A`，任务树关闭。
- 裁决: 本轮扶正现役目录但保留 legacy — 现有 parity 与规模测试仍依赖旧 Demo — 错删会失去 31 条浏览器路径的证据。
- 裁决: 包根切到现役 API，旧 API 迁到 `/legacy` — 新代码不应继续从名为 vnext 的子路径进入 — 外部旧根消费者升级时必须改 import。
- 裁决: 兼容别名本轮不删除 — 把物理整理与外部子路径移除解耦 — 代价是一个版本内 exports 仍有 vnext 名称。
- 裁决: archive 与日期化观察不批量改写 — 它们记录当时事实 — 全局搜索不能简单要求零 `src-vnext` 字符串，必须按 allowlist 审计。
