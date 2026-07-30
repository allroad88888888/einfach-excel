# 文本/样式格式化（format）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/format-cells/ + format-painter/ + toolbar/；
> excel/solid-excel/src-vnext/format-cells/ + format-painter/ + toolbar/（SpreadsheetToolbar、
> 各 Dropdown/Popover）
> 存量 spec 行数超限登记：audit-format.spec.ts 1036 行（历史文件，只登记不拆）

工具栏按钮态契约（SpreadsheetToolbar.tsx::activeCellFormat + core
selection/index.ts::getActiveCell）：`aria-pressed` 只反映**活动单元格**，不聚合整个选区；
range 选区的活动单元格是 **focus（拖选终点）**，不是拖选起点——与 Excel 的 anchor 口径不同，
是 core 既定的 "focused cell" 模型（本轮实测确认，非 bug）。点击切换按"活动格当前值取反"
计算并应用到整个选区。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| FMT-01 | B/I/U/删除线单格切换 | 选中→点按钮→再点 | aria-pressed 往返 + font-weight/font-style/text-decoration-line | ✅ 存量 | toolbar-text-style #"… toggles aria-pressed and updates active cell style"（×4）；audit-format #"Format audit — toolbar B/I/U"、#"strikethrough toolbar" |
| FMT-02 | 加粗应用到多格选区 | 拖选 B2:E2→加粗 | 四格 font-weight 700 | ✅ 存量 | audit-format #"bold applied to B2:E2 selection paints all four cells" |
| FMT-03 | 水平对齐下拉 | 打开下拉→选 left/center/right | text-align 独占生效、Esc 不应用 | ✅ 存量 | toolbar-alignment #"toolbar-btn-h-align sets center and right"；audit-format #"Format audit — horizontal alignment dropdown" |
| FMT-04 | 垂直对齐下拉 | 打开下拉→选 top/middle/bottom | cell-display 垂直对齐 CSS 往返 | ✅ 存量 | toolbar-alignment #"toolbar-btn-v-align sets top and middle"；audit-format #"Format audit — vertical alignment dropdown" |
| FMT-05 | 换行 + 文字旋转 | wrap 切换；rotation 选 90°/竖排/Esc | overflow-wrap、rotate(90deg)、writing-mode、Esc 不应用 | ✅ 存量 | toolbar-alignment #"toolbar-btn-wrap …"、#"toolbar-btn-rotation …"；audit-format #"wrap toolbar"、#"rotation dropdown" |
| FMT-06 | 填充色/文字色 popover | 开 popover→选 swatch→重置→Esc/外点 | td background / display color、no-fill 与 automatic 还原、关闭不改值 | ✅ 存量 | toolbar-colors（全部 5 用例）；audit-format #"Format audit — color buttons" |
| FMT-07 | 边框预设矩阵 | all/outer/none 预设、1x1 时 inner 禁用、Esc/外点 | data-borders 按 cell 位置正确、清除后属性移除 | ✅ 存量 | toolbar-borders（全部 7 用例）；audit-format #"Format audit — borders dropdown" |
| FMT-08 | 字体族下拉 | 开下拉→选 Helvetica→Esc/外点 | cell font-family 生效、按钮文本更新、关闭不改值 | ✅ 存量 | toolbar-font-family（全部 4 用例）；audit-format #"font-family dropdown on B2 …" |
| FMT-09 | 字号下拉与加减 | 选 24、+1/−1 步进、Esc/外点 | font-size px 精确值 | ✅ 存量 | toolbar-font-size（全部 4 用例）；audit-format #"font-size dropdown …"、#"font-size-up …" |
| FMT-10 | 清除格式基础路径 | 加格式→清除 | 样式 CSS 还原、按钮禁用/启用生命周期、EN 文案 | ✅ 存量 | toolbar-clear-format（全部 3 用例） |
| FMT-11 | 格式刷全状态机 | 单击刷一次、双击连刷、Esc 退出（armed 与 sticky）、再点关闭、切 sheet 清除、反向刷（无格式源清有格式目标） | data-format-painter-state idle/armed/sticky、aria-pressed、目标样式、grid data-format-painter-active | ✅ 存量 | toolbar-format-painter（全部 6 用例）；audit-format #"Format audit — format painter"（7 用例） |
| FMT-12 | Format Cells 对话框 | Ctrl+1 / 自定义格式行打开；Save 提交 bold+数字格式；Cancel 丢弃 | 对话框 5 tab、提交/丢弃差异 | ✅ 存量 | audit-format #"Format audit — Format Cells dialog"、#"keyboard shortcuts"（Ctrl+1/F/H） |
| FMT-13 | 工具栏图标与本地化 | 检查 SVG glyph、tooltip 非 raw key、无 Find/Print 按钮 | 图标存在、i18n 文案 | ✅ 存量 | audit-format #"Format audit — toolbar icon glyphs"；toolbar-alignment #"… tooltips are localized labels" |
| FMT-14 | 合并下拉（历史上归此文件） | 1x1 禁用、合并居中、取消合并 | 锚点渲染/隐藏、还原 | ✅ 存量 | audit-format #"Format audit — merge dropdown"（功能归属 merge-freeze/，用例随超限文件留此登记） |
| FMT-15 | 数字格式入口（历史上归此文件） | 下拉 16 行、百分比、Esc/外点、%$ 快捷键 | 12000% / $120.00 | ✅ 存量 | audit-format #"Format audit — number format"、#"Univer-parity shortcuts"（功能归属 number-format/，用例随超限文件留此登记） |
| FMT-16 | 旧壳 format toolbar 回归 | Blank demo：bold、percent、undo、大选区不物化地址网格、range API 缺失降级 | 内联样式、50%、undo 还原、set_format_range 探针 | ✅ 存量 | format.spec.ts（全部 5 用例，legacy 壳 + `?debug=1` 探针） |
| FMT-20 | 混合加粗选区的按钮态跟随 focus 格 | B2 加粗；C2→B2 拖选（focus 粗）与 B2→C2 拖选（focus 平） | aria-pressed 分别 true / false，与选区其余内容无关 | 🆕 本轮 | mixed-format-selection.spec.ts #"bold pressed-state follows the focus cell…" |
| FMT-21 | 混合选区点击（focus 平） | focus 非粗的混合选区点加粗 | 全选区变粗、aria-pressed → true | 🆕 本轮 | mixed-format-selection.spec.ts #"…plain focus cell bolds every cell" |
| FMT-22 | 混合选区再点一次（focus 粗） | focus 粗的混合选区点加粗 | 全选区取消加粗、aria-pressed → false | 🆕 本轮 | mixed-format-selection.spec.ts #"…bold focus cell unbolds every cell" |
| FMT-23 | 清除格式后 toolbar 态还原 | B2 加 bold+italic+wrap+percent→清除 | 四个 aria-pressed 复位、显示回 "120"、清除按钮回禁用 | 🆕 本轮 | clear-format-toolbar-state.spec.ts #"clearing resets pressed toggles…" |
| FMT-24 | 范围清除格式（混合格式） | B3 粗 + C3 斜→拖选→清除 | 两格都还原、切换活动格后按钮态均为 false | 🆕 本轮 | clear-format-toolbar-state.spec.ts #"clearing a mixed multi-cell range…" |
| FMT-30 | 格式刷目标为拖选 range 的连刷 | 刷格式到一个拖选区域 | — | ⏳ P2 延后 | — 画刷当前按单击单格生效，range 目标行为未定义产品规格 |
| FMT-31 | 混合格式的多值（indeterminate）指示 | 混合选区时按钮显示第三态 | — | ⏳ P2 延后 | — 当前规格是跟随活动单元格（Univer 口径），无 indeterminate 设计 |
| FMT-32 | 存量超限文件拆分 | audit-format.spec.ts 1036 行按 describe 拆至本目录多文件 | — | ⏳ P2 延后 | — 计划文档第 8 节：只登记，拆分另立专项 |

覆盖统计：存量 16 行（映射 10 个 spec 文件全部 describe 面）、本轮新增 5（2 个新 spec 文件、
5 用例）、延后 3。
