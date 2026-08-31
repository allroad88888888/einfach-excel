---
id: "021"
title: 清理现行 src-vnext 残留
kind: leaf
parent: W3
depends_on: ["011", "020"]
discovered_from: "012"
model: gpt-5.6-terra
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/excel-core-ts/README.md
  - excel/excel-core-ts/docs/ARCHITECTURE.md
  - excel/excel-site/docs/mockups/demo-async-formulas.html
  - excel/excel-site/docs/mockups/demo-export-roundtrip.html
  - excel/excel-site/docs/mockups/demo-viewport-projection.html
  - excel/rust/excel-core/src/CUSTOM_FORMULAS.md
  - excel/spreadsheet-ui-core/README.md
  - excel/spreadsheet-ui-core/docs/CONVENTIONS.md
  - excel/spreadsheet-ui-core/docs/filter-sort.md
  - .tasks/solid-excel-source-cutover/reports/021-report.md
---

# 清理现行 src-vnext 残留

## 目标

修正 012 审计发现的 9 个现行文档/设计稿中的 15 处旧物理路径，使当前材料只引用扶正后的 `solid-excel/src`。

## 粒度

这是同一个全局 cutover 漏项的精确残留清单；不改 archive、历史 ADR、日期化 observation 或 audit snapshot。

## 上下文

逐处先核对新目标真实存在，再替换路径；若正文还声称现役实现位于 `src-vnext`，同步修正该局部事实。三份 mockup 仍是活 `docs/mockups` 内容，不新增 allowlist 豁免。

## 覆盖矩阵行

- `C-016`。

## 接口

### 消费

- 任务 008 的物理目录扶正。
- 012 报告的 F-012-1 精确清单。

### 产出

- 9 个现行文件中的 `src-vnext` 残留归零，引用目标存在。

## 验收标准

1. `rg -n 'src-vnext'` 对本任务 9 个产品文件 → 零结果。
2. 对改写后的 `solid-excel/src/**` 字面路径逐项验证文件或目录存在。
3. `npm run check:docs` → 零死链。
4. `git diff --check` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：由 012 的 F-012-1 发现并派发，精确范围为 9 个非 allowlist 文件。
- 2026-08-31：首审发现 TS runtime 语义误指，R1 修正 `worker-runtime-ts.ts` / WASM-lite 边界后复审 `APPROVED`。
