---
id: "020"
title: 收口跨范围文档引用
kind: leaf
parent: W2
depends_on: ["010"]
discovered_from: "011"
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/excel-site/docs/SITE_REBUILD_PLAN_2026-08-04.md
  - excel/spreadsheet-ui-core/docs/frozen-panes.md
  - excel/spreadsheet-ui-core/src/copy-as/encodeSelectionAsImage.ts
  - excel/spreadsheet-ui-core/src/operations/format/numberFormat.ts
  - .tasks/solid-excel-source-cutover/reports/020-report.md
---

# 收口跨范围文档引用

## 目标

接管 011 发现的四处白名单外引用，使可点击链接与源码注释指向扶正后的 `src`，同时不重写日期化计划的叙事正文。

## 粒度

四处改动都只负责关闭源码扶正后的跨范围引用；不改正文架构结论，不扩展为文档重写。

## 上下文

- `SITE_REBUILD_PLAN_2026-08-04.md` 是日期化计划，不属于 observation/archive/旧 ADR；保留叙事正文，只维护 worker backend 的可点击链接目标到现行 `src`。文档检查器的 `allow-stale-paths` 不豁免死链，不能用它掩盖不存在的目标。
- `frozen-panes.md` 是现行文档，链接应改到 `solid-excel/src/adapter/static-backend.ts`。
- 两处 UI-core 源码注释已由 011 执行者越界改为 `solid-excel/src/**`；本叶显式接管并验证这些改动，不在 011 中继续冒充白名单内修改。

## 覆盖矩阵行

- `C-016`、`C-017`。

## 接口

### 消费

- 任务 008 的物理目录扶正结果。
- 任务 011 首审的跨范围 findings。

### 产出

- 四处引用具有明确的现行或历史语义，文档链接检查恢复为绿。

## 验收标准

1. `npm run check:docs` → 零死链。
2. `rg -n 'src-vnext' excel/spreadsheet-ui-core/docs/frozen-panes.md excel/spreadsheet-ui-core/src/copy-as/encodeSelectionAsImage.ts excel/spreadsheet-ui-core/src/operations/format/numberFormat.ts` → 零结果。
3. `rg -n 'src-vnext' excel/excel-site/docs/SITE_REBUILD_PLAN_2026-08-04.md` → 零结果。
4. `git diff --check` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：由 011 首审发现并派发；精确接管两处越界源码注释与两条跨白名单链接。
- 2026-08-31：执行中确认 `allow-stale-paths` 不豁免 Markdown 死链；裁决为只维护日期化计划中的链接目标，不改叙事正文。
- 2026-08-31：独立审查 `APPROVED`；四处精确引用与文档链接门均已闭环。
