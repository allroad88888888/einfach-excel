# clipboard — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/clipboard/ + excel/spreadsheet-ui-core/src/paste-special/
> + src-vnext/grid/SpreadsheetGrid.tsx（copySelectionToClipboard / pasteFromClipboard）
> + src-vnext/paste-special/；legacy 路径：src/Table.tsx（Blank demo）
> 存量 spec 行数超限登记（如有）：audit-clipboard.spec.ts 302 行（历史文件，只登记不拆）

三条产品路径：legacy Blank demo（selection-clipboard）、vNext Wave 5 静态后端
（audit-clipboard / paste-special）、vNext worker 真后端 wasm+ts（vnext-clipboard-real-backend）。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| CB-01 | Shift+Arrow 扩展 2x2 选区 | A1→Shift+→/↓ | B2 cell-selected，其余角 cell-in-range | ✅ 存量 | selection-clipboard #"Shift+ArrowRight then Shift+ArrowDown extends to a 2x2 range" |
| CB-02 | Shift+Click 锚点扩展 | A1→Shift+Click C3 | 矩形四角 in-range，外侧无泄漏 | ✅ 存量 | selection-clipboard #"Shift+Click expands the range from anchor to clicked cell" |
| CB-03 | 普通方向键塌缩选区 | 范围后按 → | 单格 selected，旧范围类移除 | ✅ 存量 | selection-clipboard #"plain ArrowRight after a range collapses back to a single cell" |
| CB-04 | 网格边缘 clamp | 行 1 上 Shift+↑ | A1 保持 focus，无 range | ✅ 存量 | selection-clipboard #"Shift+ArrowUp from row 1 clamps within the grid" |
| CB-05 | 2x2 复制粘贴还原 | copy A1:B2 → paste D5 | 相对位置保持 | ✅ 存量 | selection-clipboard #"copy A1:B2 then paste at D5 reproduces the 2x2 block" |
| CB-06 | 公式相对引用随粘贴偏移 | copy =A1*2 → paste D5 | 公式栏 =C5*2 | ✅ 存量 | selection-clipboard #"copying a formula shifts relative refs on paste" |
| CB-07 | 剪切+粘贴+撤销 | cut A1 → paste D5 → 2×undo | 源清空/落值/恢复 | ✅ 存量 | selection-clipboard #"cut clears the source, paste lands the value, and undo restores it" |
| CB-08 | 无标记外部 TSV 字面粘贴（legacy） | writeText 注入 2x2 TSV | 零偏移逐字落格 | ✅ 存量 | selection-clipboard #"external TSV (no origin marker) pastes literally without ref shift" |
| CB-09 | 跨表引用粘贴保 sheet 名 | copy =Data!A1+1 → paste | Data!B2+1，sheet 名不变 | ✅ 存量 | selection-clipboard #"cross-sheet ref preserves sheet name through copy/paste shift" |
| CB-10 | 单格复制粘贴（vNext 静态） | B2 → D2 | D2 显示 120 | ✅ 存量 | audit-clipboard #1 |
| CB-11 | 范围复制粘贴（vNext 静态） | B2:C3 → G2 | G2:H3 镜像源 | ✅ 存量 | audit-clipboard #2 |
| CB-12 | 剪切粘贴清源（vNext 静态） | cut B2 → D2 | B2 空、D2=120 | ✅ 存量 | audit-clipboard #3 |
| CB-13 | 粘贴同步公式栏 | paste 后查公式栏 | display+公式栏都 120 | ✅ 存量 | audit-clipboard #4 |
| CB-14 | 粘贴到初始投影窗外 | name box 跳 J2 再 paste | status 不再是 Ready | ✅ 存量 | audit-clipboard #5 |
| CB-15 | 大范围粘贴角点（DOM 外） | B2:E8 → G2 | J 列 td 不在 DOM，无法断言 | ⏳ P2 延后 | audit-clipboard #6（test.skip，等 scroll-to-pasted-range） |
| CB-16 | Ctrl+Shift+V 独立 paste-special UI | Ctrl+Shift+V | 键盘层无 shift 分支（Ctrl+Alt+V 已实现） | ⏳ P2 延后 | audit-clipboard #7（test.skip） |
| CB-17 | 粘贴驱动 status-last-command | copy→paste 看状态栏 | 含 paste/clipboard | ✅ 存量 | audit-clipboard #8 |
| CB-18 | 粘贴写入 history timeline | copy→paste 看时间线 | 含 clipboard/cells.import 条目 | ✅ 存量 | audit-clipboard #9 |
| CB-19 | 真后端复制粘贴全态证据（wasm+ts） | B4 → D4 | 源保留 + 名称框/公式栏/状态栏/聚合全对 | ✅ 存量 | vnext-clipboard-real-backend #"copy/paste preserves the source and exposes the populated target state" |
| CB-20 | 真后端剪切粘贴全态证据（wasm+ts） | cut C4 → E4 | 源清空 + 全套状态断言 | ✅ 存量 | vnext-clipboard-real-backend #"cut/paste clears the source and exposes the moved target state" |
| PS-01 | Ctrl+Alt+V 打开对话框并确认关闭 | copy → Ctrl+Alt+V → values → Paste | 对话框出现后消失 | ✅ 存量 | paste-special #"Ctrl+Alt+V opens the dialog, choosing \"values\" + Paste closes it" |
| PS-02 | values + add 算术 | 120 + 50 | 目标 170，同步重绘 | ✅ 存量 | paste-special #"values-only paste with arithmetic add: 120 + 50 → 170" |
| PS-03 | 转置粘贴 | 1×3 行 → 3×1 列 | J3/J4/J5 = 1/2/3 | ✅ 存量 | paste-special #"transpose paste: A1:C1 row → A3:A5 column" |
| PS-04 | skip-blanks 保留目标 | 源中空格 + 目标预填 | 中间目标保持 8 | ✅ 存量 | paste-special #"skip-blanks preserves the target value for a blank source cell" |
| PS-05 | Escape 取消不提交 | 打开后 Escape | 对话框关、目标不变 | ✅ 存量 | paste-special #"Escape closes the dialog without committing to the target" |
| PS-06 | 除零算术出 #DIV/0! | 源 0 divide | 目标 #DIV/0! | ✅ 存量 | paste-special #"divide-by-zero arithmetic surfaces #DIV/0!" |
| CB-21 | 外部多行多列 TSV 形状还原（vNext 路径） | writeText 注入 2x2 → J1 paste | 4 格逐字落位 | 🆕 本轮 | external-paste-matrix.spec.ts #"multi-row multi-column external TSV…" |
| CB-22 | 外部 TSV CRLF 归一化 | \r\n 行分隔注入 | 与 \n 相同矩形 | 🆕 本轮 | external-paste-matrix.spec.ts #"CRLF line endings…" |
| CB-23 | 参差行只写自己字段 | 短行 + 邻格预填 | 未覆盖格保持原值 | 🆕 本轮 | external-paste-matrix.spec.ts #"ragged short row…" |
| CB-24 | 外部公式文本零偏移粘贴并求值 | 注入 =B2*2（无标记） | 公式逐字保留，显示 240 | 🆕 本轮 | external-paste-matrix.spec.ts #"external formula text…" |
| CB-25 | 粘贴到更大多格选区不铺贴 | copy 1 格 → 选 J1:K2 → paste | 只有 focus 格 K2 落值，其余保持空 | 🆕 本轮 | paste-target-bounds.spec.ts #"pasting into a larger…" |
| CB-26 | 粘贴越过最后一列 | copy 2x2 → P2 paste | P 列在界内落值，Q 列 td 不存在，无报错 | 🆕 本轮 | paste-target-bounds.spec.ts #"paste overflowing the last column…" |
| CB-27 | 粘贴越过最后一行 | copy 2x2 → C50 paste | 行 50 落值，行 51 td 不存在，无报错 | 🆕 本轮 | paste-target-bounds.spec.ts #"paste overflowing the last row…" |
| CB-28 | 外部 text/html flavour 粘贴解析 | 注入 HTML 表格 | — | ⏳ P2 延后 | —（pasteFromClipboard 仅 readText 消费 TSV，产品无 HTML 解析路径） |
| CB-29 | 超 CLIPBOARD_CELL_LIMIT 流式导出 | 超大选区 Ctrl+C | — | ⏳ P2 延后 | —（需 1M 级表面，归 perf-virtual/worker-backend 专项） |
| CB-30 | backend 缺 pasteRange 时 paste-special 隐藏 | — | — | ⏳ P2 延后 | —（Wave 5 静态后端恒有该 port；单测 vnext-grid.test.tsx 已覆盖 pasteSpecialSupportedAtom） |
| CB-31 | 多 range（Ctrl+Click 不连续）选区复制 | — | — | ⏳ P2 延后 | —（网格尚无多 range 选区，归 selection/ A4 缺口） |

## 备注

- 越界语义（CB-26/27，以实际产品行为为准）：`createClipboardTsvPastePlan.estimatedRange`
  不做 clamp，`resolveContentMutationAtom` 只校验坐标合法性 + 保护锁，静态后端
  `importCells` 无边界检查 —— 越界格被写入 map 但永不渲染（viewport 50×16 封顶）。
  用户可见行为 = 界内部分照常落值、界外部分静默不可见、无错误。断言按此写。
- 铺贴语义（CB-25）：`pasteFromClipboard` 只取 `selection.activeCell` 为原点粘贴一份，
  不做 Excel 式对多格目标的重复铺贴。实测 `activeCell` = 选区 **focus** 格
  （`getActiveCell`，spreadsheet-ui-core/src/selection）：Shift+Click 扩选后 focus 在
  被点击角，粘贴落在该角而非锚点角 —— 与 Excel 的"active 停在锚点"有意/一致的分歧，
  产品内部（名称框/状态栏/键入起点）全按 focus 口径，故按实际行为断言，不标 bug。
