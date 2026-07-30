# named-ranges-tables（命名区域 + Excel 表格）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/named-ranges/（NAMED_RANGE_CACHE_MAX = 500、
> 名称形状校验）+ src/tables/（CRUD 命令、totals、rename/delete 诊断）+
> excel/solid-excel/src-vnext/named-ranges/（SpreadsheetNameManagerDialog）+
> src-vnext/adapter/named-range-capability-port.ts（wasm 名称端口 fail-closed）
> 存量 spec 行数超限登记：无（最大 vnext-table-real-backend.spec.ts 169 行）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| NR-01 | toolbar 入口可见 + 本地化 | Wave5 断言按钮属性 | 可见/enabled、tooltip 非 i18n token | ✅ 存量 | toolbar-name-manager #"…visible, enabled, and localized" |
| NR-02 | 对话框控件齐全、Escape / close 重置草稿 | 打开→填表→Escape / close→重开 | 控件在场、草稿清空 | ✅ 存量 | toolbar-name-manager #"opens the dialog…" #"Escape closes…" #"close button…" |
| NR-03 | 保存名称持久化 + 重开清草稿 | 填 name/scope/refers→save→重开 | 列表含名称、表单归零、sheet: 前缀 scope | ✅ 存量 | toolbar-name-manager #"save persists a name…" |
| NR-04 | 非法名称校验：`1A`、含空格 | 填非法名→save | "The name or reference is invalid."、列表不新增、草稿保留 | 🆕 本轮 | name-validation.spec.ts |
| NR-05 | 空名 / 空引用的定向提示 | 只填一半→save | "Name is required" / "Refers to is required" | 🆕 本轮 | name-validation.spec.ts |
| NR-06 | 校验失败后修正即可保存（草稿不丢） | 拒绝后改合法名→save | 对话框关闭、重开列表含新名 | 🆕 本轮 | name-validation.spec.ts |
| NR-07 | 命名区域用于公式 =SUM(MyRange) | TS worker demo 定义 B2:B4→写公式 | H1 显示 60（live-reference 语义） | 🆕 本轮 | named-range-formula.spec.ts（wasm 引擎拒绝 defineName，流程走 TS demo，两 project 均可跑） |
| NR-08 | 删除名称后公式降级 #NAME? | 选中列表项→delete→触发重绘 | H1 变 #NAME?、对话框随 ack 关闭 | 🆕 本轮 | named-range-formula.spec.ts |
| NR-09 | wasm worker 名称端口 fail-closed 只读 | wasm demo 开 Name Manager 填草稿 | capability ready 但 save/delete 恒 disabled | 🆕 本轮 | named-range-formula.spec.ts（仅 wasm project；ts project 跳过） |
| NR-10 | 500 名称缓存上限 FIFO 逐出 | 构造 >500 名称 | 只保留最近 500 | ⏳ P2 延后 | —（500 次 UI 往返成本过高；上限语义已由 spreadsheet-ui-core/test/named-ranges.test.ts 单测覆盖） |
| NR-11 | name-box 定义/跳转命名区域 | name box 输入名称 | 选区跳转/新建名称 | ⏳ P2 延后 | —（UI-core 预留 'name-box' origin，但 src-vnext/name-box 未接命名区域，无 UI 入口） |
| TB-01 | 行内重命名表格 + 结构化引用跟随 | Wave5 建表→=SUM(Table1[Q1])→rename | 行重标、公式值不变（引擎改写引用） | ✅ 存量 | name-manager-table-actions #"renames a table inline…" |
| TB-02 | cell-ref 形名重命名拒绝 | rename 成 `Q1` | data-table-diagnostic-code=name-like-cell-ref、行保留 | ✅ 存量 | name-manager-table-actions #"a conflicting rename is rejected…" |
| TB-03 | 删除表格需行内确认 | delete→cancel→delete→confirm | 确认前行在、确认后空态 | ✅ 存量 | name-manager-table-actions #"deletes a table only after…" |
| TB-04 | real backend 建表 + 结构化引用聚合 | wasm worker 建表→SUM/MAX/COUNTA | 60/30/3、engine 赋名 Table1 | ✅ 存量 | vnext-table-real-backend #"Data > Create table then…" |
| TB-05 | 选区重叠建表结构化拒绝 | 再建重叠表 | data-table-diagnostic-code=range-overlap | ✅ 存量 | vnext-table-real-backend #"…rejected structurally…" |
| TB-06 | Name Manager tables 区列出引擎表 | 建表→开对话框 | 列出名称/range/列名 | ✅ 存量 | vnext-table-real-backend #"the Name Manager tables region…" |
| TB-07 | totals 行写 SUBTOTAL 且实时重算 | Data > Toggle totals→改数据 | F5=60→150、data-has-totals=true | ✅ 存量 | vnext-table-totals-real-backend 唯一 test |
| TB-08 | 建表 undo → 结构化公式回落 #NAME? | 建表→Ctrl+Z | H1 复现 #NAME? | ✅ 存量 | vnext-table-undo-real-backend #"Ctrl+Z after create table…" |
| TB-09 | totals 行 undo 原子回滚（行 + SUBTOTAL 格） | toggle totals→Ctrl+Z | F5 清空、无半态 | ✅ 存量 | vnext-table-undo-real-backend #"Ctrl+Z after toggling…" |
| TB-10 | 表格重命名冲突（含大小写不敏感） | Wave5 建 Table1+Table2→把 Table2 改名 Table1/TABLE1 | data-table-diagnostic-code=name-conflict、"That name is already in use."、行与草稿保留 | 🆕 本轮 | table-name-conflict.spec.ts |
| TB-11 | 表格扩展行（表格下一行输入自动并入） | 表格下一行输入 | 表 range 自动增长 | ⏳ P2 延后 | —（引擎与静态后端均无 auto-expand 行为，无产品面可断言） |
| TB-12 | totals 行切换聚合函数（SUM→AVERAGE…） | 切换某列聚合 | SUBTOTAL 函数号变化 | ⏳ P2 延后 | —（runSetTableTotalFunctionAtom 已导出但无 UI 面，tables/README "no dedicated UI surface yet"） |
