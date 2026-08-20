# sheets（工作表生命周期）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/sheet-tabs/ + excel/solid-excel/src-vnext/sheet-tabs/
> （SpreadsheetSheetTabs.tsx）；backend port：excel/spreadsheet-ui-core/src/backend/types.ts 的
> addSheet / renameSheet / deleteSheet / reorderSheet；worker 侧实现
> excel/solid-excel/src-vnext/adapter/worker-workbook-backend.ts、引擎
> excel/rust/excel-core/src/workbook.rs（rename_sheet / remove_sheet / move_sheet）。
> 存量 spec 行数超限登记：无（multisheet-ui 282 行、vnext-sheet-lifecycle 100 行）。

引擎既定语义（本轮新用例按实际行为钉住）：公式 AST 按 **sheet 名** 存引用且改名/删除时
**不重写**（workbook.rs::rename_sheet 注释）。因此旧名引用在改名/删除后解析为
`Value::Error(InvalidRef)` → `#REF!`，改回原名即恢复。这与 Excel 的"引用跟随改名"语义相左，
登记为已知分歧（MS-16），不按 bug 处理。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| MS-01 | 三个种子 tab 有序渲染 | 打开 Multi-Sheet demo | 三 tab 可见、Sheet1 aria-selected | ✅ 存量 | multisheet-ui #"three seeded tabs render in order" |
| MS-02 | Sheet1 种子表头 | 打开 demo | A1/B1/C1 文本 | ✅ 存量 | multisheet-ui #"Sheet1 displays seeded headers" |
| MS-03 | Expenses 种子标题+总额 | 切到 Expenses | A1/B1/A2/B5 文本 | ✅ 存量 | multisheet-ui #"Expenses tab shows seeded title + total" |
| MS-04 | 跨 sheet 公式结果与公式栏源码 | 选中 Sheet1!B5 | 显示 11700、公式栏 =Expenses!B5 | ✅ 存量 | multisheet-ui #"Sheet1 displays a cross-sheet formula result" |
| MS-05 | 各 sheet 编辑互不串扰 | 两 sheet 各写 A1 再切回 | 值各自保留 | ✅ 存量 | multisheet-ui #"edits to one sheet do not bleed into another" |
| MS-06 | + 新增 sheet 并激活 | 点 Add sheet | Sheet4 出现且 aria-selected、A1 空 | ✅ 存量 | multisheet-ui #"clicking + appends Sheet4 and activates it" |
| MS-07 | 右键 Rename（prompt 流） | 右键 Notes → Rename → prompt | 新名可见、旧名消失 | ✅ 存量 | multisheet-ui #"right-click Rename updates the tab label" |
| MS-08 | 右键 Delete 非活动 sheet | 右键 Notes → Delete → confirm | tab 消失、其余保留 | ✅ 存量 | multisheet-ui #"right-click Delete on a non-active sheet removes it" |
| MS-09 | 最后一个 sheet 不可删 | 连删至剩 1 个再删 | Sheet1 仍在、tab 数 = 1 | ✅ 存量 | multisheet-ui #"cannot delete the last remaining sheet" |
| MS-10 | 离屏公式懒计算（debug 探针，历史存量口径） | debug=1 开 Sheet1 | eval 计数不增，切 Expenses 后增 | ✅ 存量 | multisheet-ui #"debug=1: opening Sheet1 keeps an off-screen formula lazy" |
| MS-11 | vNext 创建/切换/Ctrl+PageDown/重命名/删除全链路 | vNext Worker demo 走可见控件 | tab 数、data-active、B4 投影、状态栏/公式栏一致 | ✅ 存量 | vnext-sheet-lifecycle-real-backend #"create, switch, rename, and delete round-trip through visible controls" |
| MS-12 | sheet 拖拽排序 | 拖页签本体到首位(把手已删除,4px 阈值) | tab 顺序、sheetList、各 sheet C2 投影正确 | ✅ 存量（跨文件夹） | worker-backend/vnext-worker-backend #"reorders sheet tabs through the Rust worker backend metadata adapter" |
| MS-13 | 重命名被引用 sheet：旧名引用 → #REF!，改回恢复 | Sheet3→Data，看 Sheet2!C5/C2；再改回 | #REF! ↔ 105/12，公式文本不重写（仍 =Sheet3!B4+5） | 🆕 本轮 | sheet-rename-delete-refs.spec.ts |
| MS-14 | 重命名为已占用名被拒 | Sheet2 改名为 Sheet1 | sheet-tabs-error 可见、标签保持 Sheet2 | 🆕 本轮 | sheet-rename-delete-refs.spec.ts |
| MS-15 | 删除被公式引用的 sheet → #REF!（需一次重投影） | 在 Sheet2 上删 Sheet3，切 Sheet1 再切回 | Sheet2!C5/C2 → #REF! | 🆕 本轮 | sheet-rename-delete-refs.spec.ts |
| MS-16 | 改名后公式文本重写跟随（Excel 语义） | — | =Sheet3!… 自动变 =Data!… | ⏳ P2 延后 | —（引擎设计为 AST 存名不重写，需引擎公式重写能力，超出 e2e 范畴；与 MS-13 互为对照） |
| MS-17 | 拖拽排序进行中的 drop 指示线 / Escape、pointercancel 取消 | 拖页签本体越过阈值后 | data-reorder-drop 标记、取消恢复原序 | 🆕 本轮 | sheet-tab-reorder-lifecycle.spec.ts #"Escape cancels…"、#"pointercancel clears…" |
| MS-18 | Ctrl+PageUp 反向切 sheet | Worker demo 从 Sheet2 tab 获焦后 Ctrl+PageUp | Sheet1 aria-selected/data-active、roving tabindex；焦点转移至 Sheet1 tab | 🆕 本轮 | sheet-tab-pageup-navigation.spec.ts #"Ctrl+PageUp activates the previous sheet and moves tab focus" |
| MS-19 | 删除被引用 sheet 后当前 sheet 原地刷新 | 删 Sheet3 后不切表 | C5/C2 原地变 #REF! | ✅ 已修复 | sheet-rename-delete-refs.spec.ts #"deleting a referenced sheet refreshes the visible sheet in place"（37edd18） |
| MS-20 | 改名后被改名 sheet 自身的单元格保留 | 改名 Sheet3→Data，读 Data!C2 | 仍为 11 | ✅ 已修复 | sheet-rename-delete-refs.spec.ts #"renaming a referenced sheet breaks old-name refs to #REF! until renamed back"（240865c） |

### ✅ MS-19 / MS-20 修复与回归

`37edd18` 使删除被引用 sheet 后的当前可见投影立即重读依赖值；MS-19 已从 `test.fixme`
转为在不切表条件下断言 `#REF!` 的正常双后端 E2E。`240865c` 保留 TS worker 改名 sheet
的数据；MS-20 的 `Data!C2 = 11` 断言同样已纳入正常双后端 E2E。

统计：存量 12（MS-01..12，含 1 条跨文件夹引用）/ 本轮新增 5（MS-13..15、MS-17、MS-18）+
已修复 2（MS-19、MS-20；原 fixme 已转为正常双后端 E2E）/ 延后 1（MS-16）。
