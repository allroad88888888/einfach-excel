# rows-cols-outline — 行列结构 + 分组 e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/viewport/（hidden.ts / effective-hidden.ts /
> structural-remap.ts）+ excel/spreadsheet-ui-core/src/outline/ +
> excel/spreadsheet-ui-core/src/operations/；引用移位与 #REF! 哨兵在
> excel/rust/excel-core/src/shift.rs；UI 入口在 src-vnext/grid/ + src-vnext/context-menu/ +
> src-vnext/menu-bar/
> 存量 spec 行数超限登记：无（最长 audit-structural.spec.ts 174 行）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| RC-01 | sheet tab 添加 | + 按钮 | tab 数 +1 且新 tab 激活 | ✅ 存量 | audit-structural #"1. sheet tab add…"（sheet 生命周期与 sheets/ 重叠，历史文件归此） |
| RC-02 | sheet tab 重命名 | 双击 tab → 输入 → Enter | tab 文本更新 | ✅ 存量 | audit-structural #"2. sheet tab rename…" |
| RC-03 | sheet tab 删除（应用内确认框） | 右键 → Delete → confirm | tab 数 -1 | ✅ 存量 | audit-structural #"3. sheet tab delete…" |
| RC-04 | 行头右键插入行 | 右键行 3 头 → Insert row | 后续行下移、原行清空 | ✅ 存量 | audit-structural #"4. right-click row header → Insert row…" |
| RC-05 | 列头右键插入列 | 右键列 B 头 → Insert column | 后续列右移 | ✅ 存量 | audit-structural #"5. right-click column header → Insert column…" |
| RC-06 | 行头右键菜单含 Delete | 右键行头 | 菜单含 delete | ✅ 存量 | audit-structural #"6. row header right-click…" |
| RC-07 | 列头右键菜单含 Delete | 右键列头 | 菜单含 delete | ✅ 存量 | audit-structural #"7. column header right-click…" |
| RC-08 | Data→Sort 升序物理重排 | 选 A2 → Data → Sort A→Z | 首个数据行变 Central（与 filter-sort/ 覆盖重叠） | ✅ 存量 | audit-structural #"8. Data → Sort A→Z…" |
| RC-09 | filter dropdown equals 过滤 | — | — | ⏳ 延后 | audit-structural #9 存量 test.skip：menubar 移除后 Wave 5 无 filter dropdown 触发面，待 header funnel icon |
| RC-10 | 隐藏行：header 跳号 + undo 复原 | 行头右键 Hide → undo | 序号跳 2、窗口回填、`viewport.hidden` local 条目 | ✅ 存量 | vnext-hidden-rows-real-backend #"row header context menu hides row 2…" |
| RC-11 | 隐藏行 SUBTOTAL 109/9 差异 | 藏一行数据 | 109 剔除、9 保留、undo 复原 | ✅ 存量 | vnext-subtotal-hidden-real-backend #"hiding a data row excludes it…" |
| RC-12 | 单层行分组/折叠/展开 | Data→Group Rows → gutter 折叠/展开 | gutter 出现、序号跳段、history `outline` local 条目 | ✅ 存量 | vnext-outline-real-backend #"group rows 2-4 via Data menu…" |
| RC-13 | 插入行后同列引用移位 | F5 `=F1+F2` → 行 2 上方插行 | 公式随格下移且源码改写为 `=F1+F3`、值不变 | 🆕 本轮 | vnext-structural-ref-shift-real-backend.spec.ts #"inserting a row…" |
| RC-14 | 删除被引用行 → #REF! | F4 `=F1+F2` → 删除行 2 | 结果格 #REF!、公式栏源码含 `#REF!`、undo 复原公式与值 | 🆕 本轮 | vnext-structural-ref-shift-real-backend.spec.ts #"deleting a referenced row…" |
| RC-15 | 插入列后跨列引用移位 | D1 `=F1*2` → 列 F 前插列 | 数据移到 G1、公式源码改写为 `=G1*2`、值不变 | 🆕 本轮 | vnext-structural-ref-shift-real-backend.spec.ts #"inserting a column…" |
| RC-16 | 多级 outline 嵌套折叠/展开 | 外层 2-5 + 内层 3-4 分组 | 两级 toggle 独立收放、外层折叠吞内层 toggle、展开全复原 | 🆕 本轮 | vnext-outline-multilevel-real-backend.spec.ts #"nested groups collapse…" |
| RC-17 | outline level 按钮 + ungroup 剥层 | level 1/2/3 按钮、Data→Ungroup | level N 折叠 level≥N、max+1 全展开、ungroup 移除内层且 level rail 缩回 | 🆕 本轮 | vnext-outline-multilevel-real-backend.spec.ts #"level buttons…" |
| RC-18 | 隐藏全部数据行的 SUBTOTAL 边界 | 逐行藏光 F1:F3 | 109→0，9 与 SUM 恒 60，undo 逐条剥回 | 🆕 本轮 | vnext-subtotal-hidden-boundary-real-backend.spec.ts #"hiding every data row…" |
| RC-19 | SUBTOTAL 101 vs 1（AVERAGE 对） | 藏 30 那行 | 101 重均值 15、1 保持 20、undo 复原 | 🆕 本轮 | vnext-subtotal-hidden-boundary-real-backend.spec.ts #"the AVERAGE pair…" |
| RC-20 | 删除被引用列 → #REF! | — | — | ⏳ P2 延后 | —（与 RC-14 同根因的对称路径，shift.rs 同一哨兵，控规模） |
| RC-21 | 行/列 unhide 菜单路径 | — | — | ⏳ P2 延后 | —（`row.unhide` 命令存在，但需跨隐藏行选区手势，交互口径待定） |
| RC-22 | 列分组（groupCols）多级 | — | — | ⏳ P2 延后 | —（与行轴同一实现 outline/index.ts，先覆盖行轴） |
| RC-23 | ts 后端结构编辑 | — | — | ⏳ 延后 | —（TS worker 声明 `structuralEdits: false` fail-closed，insert/delete 菜单项不渲染，无 UI 可走；wasm-only skip 与 vnext-filter-structural-shift 同口径） |

## 备注

- RC-13/14/15/18/19 均为 wasm-only（`test.skip` ts project）：结构编辑与
  `setEvalHiddenRows` 在 TS worker 上 fail-closed（见 RC-23 与
  vnext-subtotal-hidden-real-backend.spec.ts 头注）。
- RC-16/17 outline 为 UI-core canonical，双后端均跑。
- 断言口径：结果格走 `cellDisplay`，公式源码走 `formula-bar-input` 的 value
  （不戳内部状态）。
- 实测口径：结构移位后引擎按 canonical 形式重打印公式源码并加括号
  （`=F1+F2` 插行后变 `=(F1+F3)`，见 shift.rs 打印路径与 auto_fill.rs
  fixture）；undo 恢复的是记录的原始源码（`=F1+F2`，不带括号）。RC-13/15
  的断言按此书写。
