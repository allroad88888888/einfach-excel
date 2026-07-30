# history（撤销重做）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/history/（DEFAULT_HISTORY_CAP = 100、
> 生产者车道、revision 见证）+ excel/solid-excel/src-vnext/history/
> （SpreadsheetHistoryTimeline）+ src-vnext/provider/history-dispatch.ts
> 存量 spec 行数超限登记：无（最大 audit-history.spec.ts 261 行，未超 300）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| HI-01 | 单次编辑 undo/redo（legacy Blank） | 写值→Ctrl+Z→Ctrl+Y / Ctrl+Shift+Z | 值往返、一次 Ctrl+Z 即回退 | ✅ 存量 | undo-redo #"single edit…" #"Ctrl+Shift+Z…" |
| HI-02 | 新编辑清空 redo 栈（legacy 静态壳） | 写 1→写 2→undo→写 99→Ctrl+Y | 仍为 99，redo 不复活旧值 | ✅ 存量 | undo-redo #"a new edit after undo clears the redo stack" |
| HI-03 | 快照保真：浮点位级 + 公式源 | 写 0.30000000000000004 / 公式覆写后 undo | 位级不丢、FormulaBar 显示 =A1*2 | ✅ 存量 | undo-redo #"float precision…" #"undoing a literal write…" |
| HI-04 | 分组与长栈：粘贴单条目、Delete 恢复、10 连写 | 粘贴 2 格→1 次 undo；10 写→10 undo→10 redo | 多格同回退；空→终值往返 | ✅ 存量 | undo-redo #"paste groups…" #"Delete clears…" #"10 sequential…" |
| HI-05 | Wave5 时间线按钮/快捷键回退值、格式、合并、删除 | 编辑后点 timeline Undo/Redo、Ctrl+Z/Y | 值/bold/rowspan 恢复 | ✅ 存量 | audit-history #1–#8 |
| HI-06 | cursor "n / m" 与条目 kind 标签 | bold×2→undo→redo；set-input/format.set/range.merge | cursor 步进；list 含 kind | ✅ 存量 | audit-history #9 #10 |
| HI-07 | toolbar undo/redo 初始禁用 + 本地化 + 格式重放 | 初始态断言；bold→undo→redo | disabled、tooltip 英文、font-weight 往返 | ✅ 存量 | toolbar-history 全部 2 条 |
| HI-08 | real backend 事务 undo/redo + revision 见证 | worker demo 写值→Ctrl+Z→Ctrl+Y | entry data-kind/rev N、data-applied 翻转 | ✅ 存量 | vnext-worker-undo-real-backend 唯一 test |
| HI-09 | 100 条上限逐出：第 101 push 逐出最早条目，drain 后最早编辑不可撤销 | Wave5：1 次写值 + 100 次 bold（循环）→100 次 undo | cursor 恒 "100 / 100"；entry-0 变 format.set；drain 后 A10 仍 'first' | 🆕 本轮 | history-cap-eviction.spec.ts（≈201 次 UI 操作；本地 wasm 实测 12s，timeout 已放宽到 240s 兜底慢 CI） |
| HI-10 | real backend：新编辑截断 redo 尾 | worker demo 写 1→写 2→undo→写 9 | redo 按钮 disabled、Ctrl+Y 无操作、cursor 2 / 2 | 🆕 本轮 | history-branch-cross-sheet.spec.ts |
| HI-11 | 跨 sheet 撤销落点（实际行为：视图不回跳） | Sheet2 写值→切回 Sheet1→Ctrl+Z→切回 Sheet2 | 活动 tab 仍 Sheet1；Sheet2 的事实已回滚；redo 再恢复 | 🆕 本轮 | history-branch-cross-sheet.spec.ts（history-dispatch.ts 只刷新投影，无回跳逻辑，按实际行为断言） |
| HI-12 | 时间线 jumpTo 多步跳转（history-timeline-jump-N） | 点历史条目跳到任意 cursor | 多步 undo/redo 收敛到目标 | ⏳ P2 延后 | —（jumpTo 复用与 HI-05/08 相同的 dispatch 循环，增量风险低） |
| HI-13 | refresh-failed / outcome-unknown + Retry refresh | 后端 refresh 故障注入 | history-timeline-status/retry-refresh | ⏳ P2 延后 | —（需可注错后端，现有 demo 无入口） |
| HI-14 | local-replay 条目（冻结/隐藏行列）undo | 冻结/隐藏后 undo | 视图事实回滚、不动 revision 见证 | ⏳ 跨文件夹 | — 归 merge-freeze/、rows-cols-outline/ 的 CASES 覆盖，此处登记避免漏认领 |
