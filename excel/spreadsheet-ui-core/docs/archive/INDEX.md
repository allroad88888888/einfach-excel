# 归档索引 —— @einfach/spreadsheet-ui-core

本目录是**冻结记录**：一次性的设计稿与波次执行计划。它们描述的是**当时的意图**，
不是现状，其中的文件路径多为「计划中要建的文件」，未必存在。
现行契约一律在 `src/<feature>/README.md`。

- [auto-fill-series.md](auto-fill-series.md) — 自动填充/序列填充的原始设计稿
- [clear-cells-endpoint.md](clear-cells-endpoint.md) — 清空区域端口设计稿（as-built 端口名为 clearRange，与稿中 clearCells 不同）
- [collab-presence.md](collab-presence.md) — 协作光标/presence 设计稿
- [conditional-formatting.md](conditional-formatting.md) — 条件格式设计稿
- [data-validation.md](data-validation.md) — 数据验证设计稿
- [error-codes.md](error-codes.md) — 错误码分级细化提案（SpreadsheetErrorCode 仍是五值，本提案未落地）
- [find-replace.md](find-replace.md) — 查找替换设计稿（稿中 findReplaceStatusAtom 从未存在；as-built 状态并入 cursor atom）
- [formula-reference-mode.md](formula-reference-mode.md) — 公式引用拾取模式设计稿
- [hidden-rows-columns.md](hidden-rows-columns.md) — 隐藏行列设计稿（归属已于 2026-07-22 翻转至引擎，见 ADR 0003）
- [history.md](history.md) — 撤销/重做设计稿
- [merge-cells.md](merge-cells.md) — 合并单元格设计稿
- [multi-range-selection.md](multi-range-selection.md) — 多区间（不连续）选择设计稿
- [named-ranges.md](named-ranges.md) — 命名区间设计稿
- [print-page-area.md](print-page-area.md) — 打印/页面区域设计稿
- [protect-sheet-locked-cells.md](protect-sheet-locked-cells.md) — 工作表保护与锁定单元格设计稿
- [rich-types-text-links.md](rich-types-text-links.md) — 富类型/富文本/超链接设计稿
- [wave-5-shell-and-canvas-overlay.md](wave-5-shell-and-canvas-overlay.md) — Wave 5 执行计划（稿中 OverlayRenderer/AggregatePicker/ZoomSlider 路径从未按此落地）
- [wave-6-cell-format-complete.md](wave-6-cell-format-complete.md) — Wave 6 执行计划
- [wave-7-data-ops-and-navigation.md](wave-7-data-ops-and-navigation.md) — Wave 7 执行计划（7.1-7.5 全部已落地）
- [wave-8-formula-extension-and-export.md](wave-8-formula-extension-and-export.md) — Wave 8 执行计划（as-built 与稿显著偏离；实际模块名为 custom-formulas，非 formula-custom）
- [wave-8-png-export-design.md](wave-8-png-export-design.md) — Wave 8 PNG 导出设计（exportRangeAsImage 端口已落地）
- [AGENT_COLLABORATION.md](AGENT_COLLABORATION.md) — 2026-05 双 agent 协作看板与交接记录（工程约束已抽出到 `docs/CONVENTIONS.md`）
