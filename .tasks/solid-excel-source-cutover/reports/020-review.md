# 020 独立审查：收口跨范围文档引用

## 结论

**APPROVED**

未发现 Important 或 Minor 问题。020 精确接管了 011 首审指出的两条死链与两处
源码注释，最终 diff、目标真实性、文档门禁和存量超限风险记录均符合任务约束。

## 审查范围与证据

- 基准：`723082739d66140ac697a5a9c203a6fd99649d4a` 到当前工作树。
- 已完整读取：任务树 `index.md`、`020-close-cross-scope-doc-references.md`、
  `reports/020-report.md`、011 首审 `reports/011-review.md`、仓库提供的全局文件职责
  约束与 `one-file-one-thing` 技能说明；仓库及其上级目录未发现额外 `AGENTS.md`。
- 范围符合：任务白名单中的四个产品文件各只有一处单行路径替换，另有白名单内
  `reports/020-report.md`；任务定义与 index 无 020 执行改动。两处 `.ts` 已由 020
  的精确白名单正式接管，不再构成 011 的范围越界。
- `excel/excel-site/docs/SITE_REBUILD_PLAN_2026-08-04.md:193` 只把链接目标从
  `src-vnext` 改为 `src`；相邻叙事未变，文件基线与当前均为 283 行。
- `excel/spreadsheet-ui-core/docs/frozen-panes.md:135` 指向现存的
  `excel/solid-excel/src/adapter/static-backend.ts`；该入口继续导出静态后端，而冻结
  端口由其后端装配链消费。
- `excel/spreadsheet-ui-core/src/copy-as/encodeSelectionAsImage.ts:23` 指向现存的
  `excel/solid-excel/src/copy-as/renderRangeAsImage.ts`；目标仍定义注释所述的
  96×24 默认尺寸。
- `excel/spreadsheet-ui-core/src/operations/format/numberFormat.ts:11` 指向现存的
  `excel/solid-excel/src/adapter/static-backend.ts`；静态后端装配链的 projection
  仍调用该 number-format pipeline。三个目标相对基线均是 `R100` 目录扶正，语义未漂移。
- 独立轻量复跑 `npm run check:docs`，退出 0 并复现报告结果：
  `340 份活文档零死链；2823 份文件（含源码注释）无失效路径`。四个目标文件的
  `src-vnext` 扫描零命中，限定文件的 `git diff --check` 退出 0。
- `numberFormat.ts` 基线与当前均为 338 行。本叶只接管单行注释路径，属于
  `one-file-one-thing` 的“路过存量超限文件 + 小改”例外；执行报告
  `reports/020-report.md:22` 已明确记账，并正确避免范围外重构。

## 验收项判定

1. `npm run check:docs`：**通过**。
2. 三个 UI-core 文件的 `src-vnext` 扫描：**通过**。
3. 日期化计划的 `src-vnext` 扫描：**通过**。
4. `git diff --check`：**通过**。
5. 严格文件范围、链接目标真实性、叙事保护与超限风险记账：**通过**。
