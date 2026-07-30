# 数字格式（number-format）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/format-cells/（number-format-dialog.ts、types.ts）+
> src/operations/format/（numberFormat.ts、numberFormatParser.ts 渲染管线）；
> excel/solid-excel/src-vnext/toolbar/NumberFormatDropdown.tsx +
> src-vnext/format-cells/（SpreadsheetFormatCellsDialog、SpreadsheetNumberFormatDialogs）
> 存量 spec 行数超限登记：无（本文件夹两个 spec 均 ≤360 行）

引擎支持矩阵（backend/types.ts）：WASM wire 仅实现 general/number(decimal)/percent/currency/
date/custom 六类；accounting、time、fraction、scientific、text、special 会静默降级 general。
Wave 5 demo 走 static backend（TS 渲染管线，全类支持），双 project 下行为一致。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| NF-01 | 数字格式按钮可见/本地化 | 打开 wave5→检查按钮 | tooltip/aria 非 raw i18n key | ✅ 存量 | toolbar-number-format #"number-format button is visible and labels are localized" |
| NF-02 | 下拉选 Percent | 选 B2(120)→下拉→Percent | 显示 "12000%" | ✅ 存量 | toolbar-number-format #"opening number-format dropdown and choosing Percent shows 12000%" |
| NF-03 | % 快捷按钮直接应用 | 点 toolbar-btn-percent-format | 不开下拉直接 12000% | ✅ 存量 | toolbar-number-format #"percent shortcut formats directly without opening dropdown" |
| NF-04 | 排序后应用到可见行 | 排序→选可见行→Percent | 格式落在显示行对应的源行 | ✅ 存量 | toolbar-number-format #"percent dropdown applies to the selected visible row after sorting" |
| NF-05 | 货币快捷按钮 | 点 currency 快捷键 | $120.00 | ✅ 存量 | toolbar-number-format #"currency shortcut formats directly without opening dropdown" |
| NF-06 | 增减小数位 | +1 位→−1 位→0 位再减 | 小数位数变化、0 位时减号禁用 | ✅ 存量 | toolbar-number-format #"increase decimal applies 1 decimal, decrease restores integer and disable at 0" |
| NF-07 | Esc/外点关闭下拉 | 开下拉→Esc / 点外部 | 关闭且值不变 | ✅ 存量 | toolbar-number-format #"Escape and outside click close number-format dropdown without changing value" |
| NF-08 | 更多货币/日期/数字格式子菜单 | Custom 行 hover 子菜单→轻量对话框 | 本地化、选项数、应用 | ✅ 存量（整档挂起） | toolbar-more-number-formats（全档 test.describe.skip —— Wave 5 移除子菜单，Custom 行直达 Format Cells 对话框；轻量对话框保留给宿主显式接线） |
| NF-10 | 货币经对话框往返 | Custom 行开对话框→currency→Save→重开 | $120.00；重开 currency 选中、符号 $ 保持；Cancel 不改值 | 🆕 本轮 | format-cells-roundtrip.spec.ts #"currency picked in the dialog survives save and reopens intact" |
| NF-11 | date pattern 编辑往返 | 45432→date 类目→pattern 改 yyyy/MM/dd→Save→重开 | 显示 2024/05/20；重开 pattern 输入框保持 | 🆕 本轮 | format-cells-roundtrip.spec.ts #"date pattern edited in the dialog round-trips through reopen" |
| NF-12 | 小数位数经对话框往返 | number 类目 decimals 2→3→Save→重开 | 1234.500；重开 decimals=3 | 🆕 本轮 | format-cells-roundtrip.spec.ts #"decimal digits edited in the number category round-trip" |
| NF-13 | 下拉 Percent 重开直接 Save 不改小数位 | 下拉 Percent(0 位)→Custom 行重开→直接 Save | percentage 类目选中；仍 "12000%"（不被类目默认 2 位覆写成 "12000.00%"） | 🆕 本轮 | format-cells-roundtrip.spec.ts #"percent applied from the dropdown reopens as percentage and Save keeps digits" |
| NF-14 | Number 格式的负数/零 | −1234.5 / 0 应用 Number | "-1234.50" / "0.00" | 🆕 本轮 | number-format-values.spec.ts #"Number format renders negative and zero with two decimals" |
| NF-15 | 千分位分组的负数 | ±1234.5 应用 NumberThousands | "1,234.50" / "-1,234.50" | 🆕 本轮 | number-format-values.spec.ts #"thousands grouping keeps the minus sign on negatives" |
| NF-16 | Percent 的零/负分数 | 0 / −0.25 应用 Percent | "0%" / "-25%" | 🆕 本轮 | number-format-values.spec.ts #"percent format renders zero and negative fractions" |
| NF-17 | Currency 的零/负数 | 0 / −1234.5 应用 Currency | "$0.00" / "$-1,234.50"（$ 字面量在符号前） | 🆕 本轮 | number-format-values.spec.ts #"currency format renders zero and negatives with grouping" |
| NF-18 | 千分位→百分比整体替换 | NumberThousands 后再应用 Percent | "123450%"，无残留分组符 | 🆕 本轮 | number-format-values.spec.ts #"switching thousands to percent replaces the format wholesale" |
| NF-20 | 自定义格式串自由输入→应用→重开保持 | 输入任意 pattern（如 `0.0"件"`）→应用→重开 | — | ⏳ P2 延后 | — Wave 5 UI 无自定义 pattern 输入入口：Format Cells 数字页 custom 类目为 "coming soon"（映射 general），轻量 more-formats 对话框未在 demo 接线（见 NF-08） |
| NF-21 | 正/负/零/文本四段式格式串 | `#,##0.00_);[Red](#,##0.00);"-";@` 类分段 | — | ⏳ P2 延后 | — 渲染管线（numberFormatParser splitSections）已支持分段与 [Red]，缺 NF-20 的输入入口；红色负数经 `negative: 'red'` 变体同样无 UI 入口 |
| NF-22 | locale 相关渲染 | 切 locale 后千分位符/小数点符变化 | — | ⏳ P2 延后 | — resolveLocale 已实现，demo 未暴露数字格式 locale 切换入口（`?locale=` 只切 i18n 文案） |

覆盖统计：存量 8 行（映射 2 个 spec 文件；其中 toolbar-more-number-formats 全档挂起）、本轮
新增 9（2 个新 spec 文件、9 用例）、延后 3。

关联：数字格式的下拉 16 行结构、Esc/外点、%$ 快捷键在 `../format/audit-format.spec.ts`
（#"Format audit — number format"、#"Univer-parity shortcuts"）也有覆盖，登记见
`../format/CASES.md` FMT-15。
