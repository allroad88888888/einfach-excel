# 011 执行报告：统一现行架构文档术语（R1）

四态：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`。

## 实现

- 现行规范、架构图、教程和源码 README 统一把现役实现写为 `excel/solid-excel/src`，旧实现明确写为 `excel/solid-excel/legacy`；旧 `sheet-store` 证据已指向 `legacy/`。
- canonical npm 示例统一为根入口、`/worker-factory` 和 `/styles.css`。Solid README 的 worker 示例现在使用真实导出 `defaultVNextWorkbookWorkerFactory`，并演示将其传给 `createWorkerWorkbookSpreadsheetBackend`。
- 修正基准目录为 `excel/solid-excel/bench/`；Structural Undo 的 legacy 路径；两份 portability boundary 中已下沉到 UI-core 的 editable-source-text、commit-feedback 和 arrow-pick 职责；以及 W7 的 styles 包路径。
- AD-100 恢复提交 `8aadfff` 当时的 `src`/`src-vnext` 产物事实。AD-311 恢复当时审计命令和计数，明确标识为 audit-time snapshot，未伪造为当前树盘点。日期化 `PARITY_BACKLOG_HANDOFF_2026-08-04.md` 与 `REMOTE_RESTART_PLAN_2026-07-28.md` 的机械路径改写均已恢复。

## 验证

1. **通过**：`npm run check:docs`：`340 份活文档零死链；2823 份文件（含源码注释）无失效路径`。
2. **通过**：`git grep -n 'excel/solid-excel/src-vnext\|@einfach/solid-excel/vnext' -- CLAUDE.md CONTRIBUTING.md README.md README.zh-CN.md docs/ARCHITECTURE.md docs/QUICKSTART.md excel/solid-excel/README.md` 零结果。
3. **通过**：`git diff --check` 退出 0。
4. **通过**：worker factory 导出核对：`src/adapter/worker-factory.ts` 导出 `defaultVNextWorkbookWorkerFactory` 与 `defaultExcelCoreTsWorkerFactory`；README 只示例真实导出。
5. **通过**：白名单内现行 Markdown 路径存在性扫描。排除 archive、日期化历史/observation、旧 ADR 与 AD 历史快照后，提取 `excel/solid-excel/{src,legacy,bench}/...` 的 51 个唯一字面路径，`test -e` 结果为 `missing=0`。
6. **通过**：`git diff --name-only <base> -- docs/PARITY_BACKLOG_HANDOFF_2026-08-04.md excel/solid-excel/docs/REMOTE_RESTART_PLAN_2026-07-28.md` 零结果，证明两份日期化历史正文未被本叶保留机械改写。

## 范围

- 仅修改 011 白名单内文档和本报告；未修改任务定义、index、archive、日期化 observation 或旧 ADR 正文；未 commit、未派生 agent。
- `excel/excel-site/docs/SITE_REBUILD_PLAN_2026-08-04.md`、`excel/spreadsheet-ui-core/docs/frozen-panes.md` 与两个 UI-core `.ts` 已转交并由 020 处理。本叶未写入这四个文件；本报告的 docs-check 绿证据来自合并后的工作树。
- `docs/QUICKSTART.md` 与 `docs/recipes/**` 的既有 010 改动保持不变并与本叶术语一致。

## 风险与后续

- `docs/PARITY_BACKLOG_HANDOFF_2026-08-04.md` 是 384 行的日期化存量历史文档。本叶只恢复历史路径，未为压行而拆分；该存量超限债务应由拥有者在独立任务中按职责处理。
- `/vnext`、`/vnext-worker-*`、`/vnext-styles.css` 仍作为兼容 exports 保留；它们不再是现行文档的 canonical 入口，历史快照中的旧文字按约束保留。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`（384 行日期化历史文档债务已记录）。
