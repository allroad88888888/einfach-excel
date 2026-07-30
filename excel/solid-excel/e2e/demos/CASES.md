# 示例 demo 烟测（demos）— e2e cases

> 功能源码：src/demos/DemoBudget.tsx、src/demos/DemoGrades.tsx、src/demos/DemoSales.tsx
> （seed + createWasmSheet；渲染层复用 src/Table.tsx + src/sheet-store.ts）
> 存量 spec 行数超限登记：无（三个存量 spec 均 ≤160 行）

## 存量场景映射

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| DM-01 | Budget seed：收支净额 / diff 列 / 统计块 | 开 demo 读种子结果 | B5/C14/C16 等显示值、G4/G5 前缀匹配 | ✅ 存量 | demo-budget #"income / expense / net totals…" #"diff column computes…" #"stats block surfaces…" |
| DM-02 | Budget 编辑 C8 级联（diff→totals→net→MAX/AVG） | 改 2500→3000 | D8/C14/C16/G2/G4 全部重算 | ✅ 存量 | demo-budget #"editing C8 (Rent actual) propagates…" |
| DM-03 | Budget 双击公式格显示公式源 | 双击 D5 / G4→Escape | 输入框为 `=C5-B5` / `=AVERAGE(…)` | ✅ 存量 | demo-budget #"double-clicking D5…" #"double-clicking G4…" |
| DM-04 | Grades seed：行统计 / 班级统计 / 浮点格式 | 开 demo 读种子结果 | E/F/G 行统计、B11-B14 班级统计 | ✅ 存量 | demo-grades #"per-student AVERAGE / MAX / MIN…" #"non-integer averages…" #"class stats row 11-14…" |
| DM-05 | Grades 编辑 B7 级联（行 + 班级统计） | 改 45→90 | E7/F7/G7 + B11/B13 重算 | ✅ 存量 | demo-grades #"changing Frank math score…" |
| DM-06 | Grades 双击公式格显示公式源 | 双击 E2 / B14→Escape | `=AVERAGE(B2,C2,D2)` / `=COUNT(…)` | ✅ 存量 | demo-grades #"double-clicking a per-student AVERAGE…" #"double-clicking class Count…" |
| DM-07 | Sales seed：月合计 / Q1 合计均值 / KPI / 增长率 | 开 demo 读种子结果 | E 列、8/9 行、H4-H7、H9/H10 前缀 | ✅ 存量 | demo-sales #"monthly totals…" #"Q1 totals…" #"Q1 averages…" #"KPI panel surfaces…" #"growth-rate KPIs…" |
| DM-08 | Sales 编辑 B4 五级级联（含符号翻转） | 改 12000→20000 | E4→E8→H4→H5→H9 重算、H9 变负 | ✅ 存量 | demo-sales #"editing B4 cascades…" |
| DM-09 | Sales 双击公式格显示公式源 | 双击 H10 / E4→Escape | `=(E6-E5)/E5*100` / `=SUM(B4,C4,D4)` | ✅ 存量 | demo-sales #"double-clicking H10…" #"double-clicking E4…" |

三个存量 spec 均在 `beforeEach` 中启用 `guardConsoleErrors`（但未做末尾断言 —— 末尾断言由本轮
新增 spec 的 `afterEach expectNoConsoleErrors` 口径补上）。

## 缺口清单

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| DM-10 | Budget 级联编辑一步 undo / redo 全图回滚重放 | 编辑 C8→Ctrl+Z→Ctrl+Shift+Z | 源格 + 全部依赖格一步回退/重放 | 🆕 本轮 | demo-undo-cascade.spec.ts #"Budget: undo of the C8 edit…" |
| DM-11 | Grades 级联 undo（行 + 班级统计同步回退） | 编辑 B7→undo→redo | B7/F7/B11/B13 一步回退 | 🆕 本轮 | demo-undo-cascade.spec.ts #"Grades: undo of the B7 edit…" |
| DM-12 | Sales 级联 undo（KPI 符号翻转回退） | 编辑 B4→undo→redo | H9 由负翻回正、totals 复原 | 🆕 本轮 | demo-undo-cascade.spec.ts #"Sales: undo of the B4 edit…" |
| DM-13 | Budget 公式格被字面量覆写→依赖重算→undo 恢复公式源 | C14 输入 9000→undo→双击验源 | D14/C16 按字面量重算；undo 后源恢复 `=SUM(…)` | 🆕 本轮 | demo-edit-chains.spec.ts #"Budget: literal over the C14 total…" |
| DM-14 | Grades 非数值成绩进入数值聚合（Excel 语义） | B7 输入 "absent" | COUNT→7、AVG→84、MIN→63、行统计跳过文本 | 🆕 本轮 | demo-edit-chains.spec.ts #"Grades: a non-numeric score…" |
| DM-15 | Sales 清空源格从各 SUM 移除 | B4 提交空输入→undo | E4/B8/E8/H4 缩减；undo 复原 | 🆕 本轮 | demo-edit-chains.spec.ts #"Sales: clearing B4…" |
| DM-16 | demo 间切换后的状态语义（保留编辑 vs 重播种子） | 编辑→切走→切回 | 待定 | ⏳ P2 延后 | — 理由：`<Show keyed>` 重挂后 store 生命周期语义产品侧未定义（保留还是重播种子），先定语义再锁 e2e，避免把偶然行为钉成契约 |
| DM-17 | demo 内剪贴板 / 选区 / 格式化等高级操作 | — | — | ⏳ P2 延后 | — 理由：由 clipboard/、selection/、format/ 功能夹按功能覆盖；demos/ 只保证"代表性编辑链路"口径，避免同场景双份维护 |
