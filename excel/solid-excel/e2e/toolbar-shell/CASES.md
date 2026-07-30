# 壳层（工具栏 / 菜单栏 / 状态栏 / Name Box）— e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/menu-bar/ + toolbar/ + status-bar/ + name-box/ +
> backend/types.ts（可选 port → fail-closed 契约）；src-vnext/menu-bar/、toolbar/、status-bar/、
> name-box/、adapter/worker-runtime-ts.ts（TS_WORKER_RUNTIME_CAPABILITIES 见证）
> 存量 spec 行数超限登记（如有）：toolbar-buttons.spec.ts 490 行、vnext-wave5.spec.ts 480 行
> （历史文件，只登记不拆）

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| SH-01 | 全量工具栏按钮挂载 | 打开 wave5 | 每个登记按钮可见 | ✅ 存量 | toolbar-buttons #"every documented toolbar button mounts and is visible" |
| SH-02 | 打印预览开/关（按钮、Escape、Close、方向/缩放文案） | 点 print-preview → 各关闭路径 | overlay 出现/消失 | ✅ 存量 | toolbar-buttons #"clicking toolbar-btn-print-preview…" 等 4 条 |
| SH-03 | Ctrl+I/U/Z/Y 快捷键镜像工具栏 | 快捷键后查按钮态 | aria-pressed / 样式回滚 | ✅ 存量 | toolbar-buttons #"Ctrl+I mirrors italic…" 等 4 条 |
| SH-04 | 对齐预设（h-align left / v-align bottom） | 先设 center 再复位 | text-align / --cell-vertical-align | ✅ 存量 | toolbar-buttons #"toolbar-h-align-left resets…" 等 2 条 |
| SH-05 | 边框单边预设 top/bottom/left/right | 范围选择后逐预设 | 只画对应边 | ✅ 存量 | toolbar-buttons #"top preset only paints…" 等 4 条 |
| SH-06 | 旋转扩展预设 45/-45/-90/0 + 外点关闭 | 旋转下拉逐项 | transform 变化/清除 | ✅ 存量 | toolbar-buttons #"rotation 45 emits…" 等 5 条 |
| SH-07 | 组覆盖地图（指路其它文件夹的 test.skip 占位） | — | — | ✅ 存量 | toolbar-buttons #"toolbar — group coverage map (TODOs)" |
| SH-08 | 下拉菜单不溢出视口（720/560/440 三高度） | 开 number-format 菜单 | 无溢出且末项可点 | ✅ 存量 | toolbar-dropdown-viewport #"number-format 菜单末项可点并打开 Format Cells" |
| SH-09 | Wave5 全表面挂载（菜单栏 7 项/工具栏/公式栏/状态栏/canvas） | 打开 wave5 | 各 testid 可见 | ✅ 存量 | vnext-wave5 #"demo loads with all Wave 5 surfaces mounted" |
| SH-10 | host 缺 print port 时 File 菜单隐藏条目 | 开 File/Format 菜单 | printPreview count 0，unhide 可用 | ✅ 存量 | vnext-wave5 #"host defers print while Format exposes…" |
| SH-11 | Name Box 回显活动单元格 + 提交跳转 | name box 填 C4 回车 | value C4，status-active-cell C4 | ✅ 存量 | vnext-wave5 #"name box reflects active cell and jumps on commit" |
| SH-12 | 状态栏数字选区聚合可见 | B2:E8 shift 选择 | sum/avg/count 可见 | ✅ 存量 | vnext-wave5 #"status bar surfaces selection aggregates…" |
| SH-13 | 缩放滑块与预设 | 点 125/100 预设 | status-zoom-value 跟随 | ✅ 存量 | vnext-wave5 #"zoom slider shows current zoom level" |
| SH-14 | canvas overlay pointer-events none / 视口滚动 / 公式栏保值 / 填充色 / 列宽 | 各单测 | 相应 DOM 断言 | ✅ 存量 | vnext-wave5 #"canvas overlay mounts…" 等 5 条 |
| SH-15 | 行/列头点击选择、Find next 导航、Bold 按钮与 Ctrl+B | 各单测 | 选区/aria-pressed | ✅ 存量 | vnext-wave5 #"row header click selects the row" 等 5 条 |
| SH-16 | 编辑流 Excel parity（单击输入/Tab/F2/Esc/Backspace） | 逐键路径 | 提交/取消/追加语义 | ✅ 存量 | vnext-wave5 #"editing flow (Excel parity)" 5 条 |
| SH-17 | 拖选 + 合并/取消合并（含 history 记录） | 拖拽、合并下拉 | 选区类名/合并锚点 | ✅ 存量 | vnext-wave5 #"drag-select…" + #"merge / unmerge (toolbar)" 5 条 |
| SH-18 | 可见编辑+公式经 canonical 后端回读且聚合正确 | worker demo 写入→debug 口读回 | display/formula/聚合值 | ✅ 存量 | vnext-status-bar-real-backend #"visible edits and formulas round-trip…" |
| SH-19 | 千分位显示格式不污染原始聚合（ts skip：无 formats 传输） | 应用 NumberThousands | 回读 1234.5，sum 1234.5 | ✅ 存量 | vnext-status-bar-real-backend #"formatted numeric display preserves…" |
| SH-20 | 聚合配置可达可逆（numericCount/min/max/sum 开关） | 逐按钮 toggle | aria-pressed + 值出现/消失 | ✅ 存量 | vnext-status-bar-real-backend #"aggregate configuration is reachable…" |
| SH-21 | 切换 sheet 后聚合不残留 | Sheet1↔Sheet3 | sum 10/100 互不污染 | ✅ 存量 | vnext-status-bar-real-backend #"sheet changes replace aggregate truth…" |
| SH-22 | 超出投影选区披露截断 | name box 填 A1:J20 | data-truncated true | ✅ 存量 | vnext-status-bar-real-backend #"a selection outside the loaded projection…" |
| SH-23 | Insert 结构条目跟随后端能力见证（ts 隐藏 / wasm 可见） | 开 Insert 菜单 | 4 结构条目 count 0 / 可见 | ✅ 存量 | vnext-ts-failclosed-menu #"Insert structural entries follow…" |
| SH-24 | Data 菜单 fail-closed 矩阵：ts 隐藏 sortAsc/sortDesc/removeDuplicates/createTable/toggleTotals，wasm 全可见，控制项双端可见 | 开 Data 菜单按 project 分支 | 能力条目 count 0 / 可见 | 🆕 本轮 | failclosed-port-matrix.spec.ts |
| SH-25 | 工具栏 sort 入口随 sortRange 端口出现/消失；ts 上 filter 禁用（post-ready 见证） | worker demo 看工具栏 | ts: sort count 0 + filter disabled；wasm: sort 可见 | 🆕 本轮 | failclosed-port-matrix.spec.ts |
| SH-26 | find/replace 无 searchRange 端口时禁用（worker 双端），静态 host 启用 | worker demo vs wave5 | disabled / enabled | 🆕 本轮 | failclosed-port-matrix.spec.ts |
| SH-27 | Name Box 回显 shift-click 范围地址并在单击后回落单格 | B2 → shift D3 → C5 | value B2 / B2:D3 / C5 | 🆕 本轮 | status-name-box.spec.ts |
| SH-28 | Name Box 提交范围地址驱动选区与状态栏精确聚合 | 填 B2:C3 回车 | status-selection B2:C3，sum 540 avg 135 count 4 | 🆕 本轮 | status-name-box.spec.ts |
| SH-29 | 状态栏聚合随选区扩展/收缩重算 | B2:C2 → B2:C3 → B2 | sum 300→540→120，count 2→4→1 | 🆕 本轮 | status-name-box.spec.ts |
| SH-30 | Name Box 非法输入报错（role=alert）且选区不动，成功提交后错误清除 | 填 "!!!" 回车再填 A1 | name-box-error 可见→消失，active-cell 不变→A1 | 🆕 本轮 | status-name-box.spec.ts |
| SH-31 | 菜单 accessKey / 方向键遍历（Alt+字母开菜单、↑↓ 高亮） | — | — | ⏳ P2 延后 | 键盘导航矩阵大，独立专项更合适 |
| SH-32 | zoom 滑块拖动（非预设点击）与 view.fullScreen | — | — | ⏳ P2 延后 | 拖动交互 flake 风险高，预设路径已覆盖 |
| SH-33 | edit.pasteSpecial / data.textToColumns 的 port 撤除矩阵 | — | — | ⏳ P2 延后 | worker 后端两端口均无条件实现，当前无法构造缺失端；待出现真实缺端 host 再补 |

状态说明：fail-closed 矩阵按 `test.info().project.name` 分支（参考
vnext-ts-failclosed-menu 写法）。新增 2 个 spec 共 8 用例已在本地
`EINFACH_E2E_REUSE_SERVER=1` 下 `--project=wasm` 与 `--project=ts` 各跑一遍，16/16 绿。
断言依据源码行为核对：capability 捕获含 post-ready recapture（SpreadsheetMenuBar.tsx
onMount 与 SpreadsheetToolbar.tsx captureSortRangeCapabilityAtom），等 C2=13 保证读到
post-witness 真相。
