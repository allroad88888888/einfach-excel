# formula — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/formula-bar/ + formula-functions/ + formula-reference/
> + keyboard/（editing.start / formulaReference.\* intents）；
> excel/solid-excel/src-vnext/formula-bar/ + formula-autocomplete/ + grid/SpreadsheetGrid.tsx
> 存量 spec 行数超限登记：formula-flow.spec.ts 456 行（历史文件，只登记不拆）

计划文档第 3 节标注本文件夹缺口为「formula-autocomplete 零覆盖」——**过时**：
formula-flow.spec.ts 已覆盖 autocomplete 的开启/ArrowDown/Tab 接受/鼠标接受/Esc 关闭/
Backspace 重开/签名 tooltip/公式栏内接受（FML-20 ~ FML-27）。真实缺口是 Enter 接受、
ArrowUp 回绕、无匹配收起，以及**键盘方向键取引用**（`formulaReference.arrowPick`，
keyboard/index.ts `getFormulaReferenceModeIntent`）——后者此前零 e2e。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| FML-01 | 公式栏显示普通值 | 选中值单元格 | bar 显示原值 + 地址徽标 | ✅ 存量 | formula-bar #"FormulaBar — display" |
| FML-02 | 公式栏显示公式源码而非结果 | 选中公式单元格 | bar `=A1*5`，格显示 50 | ✅ 存量 | formula-bar #"FormulaBar — display" |
| FML-03 | 空单元格清空公式栏 | 选中空格 | bar 为空 | ✅ 存量 | formula-bar #"FormulaBar — display" |
| FML-04 | 公式栏 Enter 提交值/公式 | bar 输入 + Enter | 单元格显示计算结果 | ✅ 存量 | formula-bar #"FormulaBar — editing" |
| FML-05 | 公式栏 Escape 还原草稿 | bar 输入 + Escape | 单元格与 bar 均还原 | ✅ 存量 | formula-bar #"FormulaBar — editing" |
| FML-06 | 非法公式/循环引用错误徽标 | bar 提交非法公式 | `data-code=INVALID_FORMULA` / `FORMULA_CYCLE` | ✅ 存量 | formula-bar #"FormulaBar — editing" |
| FML-07 | 切 sheet 不泄漏上一 sheet 公式源码 | Multi-Sheet 切换 | bar 不残留 `=Expenses!B5` | ✅ 存量 | formula-bar #"FormulaBar — sheet switch leakage" |
| FML-08 | TEXT 格式化数字 | bar 写 `=TEXT(…)` | `1234.50` / `007` | ✅ 存量 | formula-functions #"Formula functions" |
| FML-09 | TODAY/NOW 返回当日合理序列 | bar 写公式 | 非错误 + 本地日期窗口 | ✅ 存量 | formula-functions #"Formula functions" |
| FML-10 | WASM 首屏算术/聚合/IF/除零 | Formulas demo 首屏 | SUM/AVERAGE/COUNT/MIN/MAX/IF、`cell-error` | ✅ 存量 | formulas-wasm #"WASM formulas — initial render" |
| FML-11 | WASM 依赖链改源传播 | 改 F8 / A3 | G8/H8/I8、C3~F3 原位更新 | ✅ 存量 | formulas-wasm #"WASM formulas — chain propagation" |
| FML-12 | 双击公式格显示源码非结果 | dblclick 公式格 | 输入框含 `=H8*3` | ✅ 存量 | formulas-wasm #"WASM formulas — formula source preservation" |
| FML-13 | 跨 sheet 链首屏求值 | 3-Sheet Chain 首屏 | Sheet1/2/3!C2 = 13/12/11 | ✅ 存量 | workbook-chain #"Workbook chain — initial evaluation" |
| FML-14 | 跨 sheet 叶子改动全链传播 | 改 Sheet1!B4 | 三 sheet C2 联动 | ✅ 存量 | workbook-chain #"Workbook chain — cross-sheet propagation" |
| FML-15 | 惰性公式不读不算 | 停在 Sheet1 观察徽标/日志 | cache badge dirty→clean、探针只打一次 | ✅ 存量 | workbook-chain #"Workbook chain — lazy non-read" |
| FML-16 | Wave5 静态后端求值矩阵 | 键入 `=B2+C2` 等 | 300/840/210、`#DIV/0!`、`#ERROR!` | ✅ 存量 | formula-flow #"formula interaction on Wave 5" |
| FML-17 | `=` 后指针点击/拖拽取引用 | 点击 B2、拖 B2:E2 | 草稿拼入 `B2` / `B2:E2`，编辑保持 | ✅ 存量 | formula-flow #"type \"=\" then click B2…"、#"dragging across cells…" |
| FML-18 | 运算符后第二次指针取引用是追加 | `=B2+` 再点 D2 | `=B2+D2`（不替换） | ✅ 存量 | formula-flow #"typing an operator between two clicks…" |
| FML-19 | 引用高亮覆盖层/历史/Esc 取消 | 草稿期观察、commit 后 undo | overlay 输入耦合、`cell.set-input`、Esc 不提交 | ✅ 存量 | formula-flow #"reference highlight…"、#"formula commit pushes…"、#"Esc cancels…" |
| FML-20 | autocomplete 输入 `=SU` 出候选 | 键入部分函数名 | 列表可见、SUM aria-selected | ✅ 存量 | formula-flow #"autocomplete dropdown opens…" |
| FML-21 | ArrowDown 移动候选游标 | `=SU` + ArrowDown | SUMIF selected、SUM 取消 | ✅ 存量 | formula-flow #"ArrowDown moves the autocomplete cursor…" |
| FML-22 | Tab 接受候选（格内/公式栏） | Tab | `=SUM(` + 焦点不丢 | ✅ 存量 | formula-flow #"autocomplete dropdown opens…"、#"autocomplete in the formula bar…" |
| FML-23 | 鼠标点击候选行接受 | click 行 | `=SUMIF(` | ✅ 存量 | formula-flow #"mouse-click on an autocomplete row…" |
| FML-24 | Esc 关候选但编辑保持、再输入重开 | Esc / 续输 | 列表消失、input 保留、重开 | ✅ 存量 | formula-flow #"Esc closes the autocomplete popup…" |
| FML-25 | Backspace 缩短片段重开候选 | `=SU` 退格 | ABS 等更宽匹配出现 | ✅ 存量 | formula-flow #"Backspace from =SU back to =S…" |
| FML-26 | 签名 tooltip 逗号推进活动参数 | `=IF(1,` … | active-arg 高亮流转 | ✅ 存量 | formula-flow #"signature tooltip highlights…" |
| FML-27 | 光标移动（F2+ArrowLeft）唤出签名 | F2 进入已有公式 | 进入括号内出签名 | ✅ 存量 | formula-flow #"caret-only ArrowLeft…" |
| FML-28 | 扩展求值器函数矩阵 + VLOOKUP | 键入各函数 | IF/SUMIF/…/VLOOKUP、`#N/A` | ✅ 存量 | formula-flow #"extended evaluator…"、#"VLOOKUP returns…" |
| FML-29 | Enter 接受候选而非提交单元格 | `=SU` + Enter | 值变 `=SUM(`、编辑仍活跃、未提交 | 🆕 本轮 | formula-autocomplete-keys.spec.ts |
| FML-30 | ArrowUp 候选游标回绕到列表尾 | `=SU` + ArrowUp | SUMIF selected（wrap）、再 ArrowDown 回 SUM | 🆕 本轮 | formula-autocomplete-keys.spec.ts |
| FML-31 | 片段无匹配时候选静默收起 | 键入 `=SUMZ` | 列表消失、编辑不受影响 | 🆕 本轮 | formula-autocomplete-keys.spec.ts |
| FML-32 | 键盘方向键取引用（左邻） | `=` + ArrowLeft + Enter | 草稿 `=F2`、提交显示 840 | ⚠️ 疑似 bug | formula-reference-keyboard.spec.ts（test.fixme） |
| FML-33 | 键盘方向键取引用（上邻） | `=` + ArrowUp + Enter | 草稿 `=B9`、提交显示 870 | ⚠️ 疑似 bug | formula-reference-keyboard.spec.ts（test.fixme） |
| FML-34 | 运算符后第二次键盘取引用是追加 | `=`←、`+`、← | `=F3+F3` → 1600 | ⚠️ 疑似 bug | formula-reference-keyboard.spec.ts（test.fixme） |

⚠️ FML-32…34 实测（2026-07-29，wasm project）：`=` 后按方向键草稿不变，仅移动输入框光标。
根因：方向键落在单元格编辑器 `<input>` 上，编辑器 onKeyDown 无取引用分支；而
`handleGridKeyDown`（SpreadsheetGrid.tsx:2499）对 INPUT target 直接 return——导致
`formulaReference.arrowPick` case（SpreadsheetGrid.tsx:2732）与
`getFormulaReferenceModeIntent` 的方向键分支（keyboard/index.ts:215）在编辑器持焦时
（即永远）不可达。core intent + grid 处理链路两头都实现了，中间接线被 target 守卫挡死。
三条用例按规程挂 test.fixme，产品侧修复后去掉 fixme 即可转绿。
| FML-35 | 键盘连按方向键推进引用游标（Excel 语义） | `=` + ArrowDown×2 | 引用推进到 anchor+2 | ⏳ P2 延后 | — 实现明确未存 pick focus（SpreadsheetGrid `formulaReference.arrowPick` 分支注释），连按仍取 anchor±1，非 bug 是简化；补齐语义前无从断言 |
| FML-36 | Shift+方向键扩展引用为区间 | `=` + Shift+Arrow | 拼入 `A1:B2` 型 range | ⏳ P2 延后 | — keyboard intent 带 `extend` 位但 grid 侧忽略（pickAnchor==pickFocus），UI 未支持 |
| FML-37 | 引用模式高亮颜色与 token 对位 | 多引用草稿 | overlay 每 token 一色 | ⏳ P2 延后 | — 高亮为 canvas 光栅，DOM 无可断言表面（FML-19 仅耦合输入侧） |
