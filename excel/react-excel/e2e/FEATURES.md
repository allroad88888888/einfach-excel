# React 功能点与 E2E 对照

每个功能点登记唯一编号、独立主验收用例的文件和完整标题；同一功能可以有桌面、窄屏及交叉回归附加用例。
不要把一个综合用例重复登记为多个独立功能的主验收。删除／改名、skip、fixme 和预期失败会使校验失败。
同一控件的等价参数是变体，不把每种颜色、字号或任意输入值都扩成一个功能；不同入口、命令及转换语义独立验收。

清单按当前 React 工作簿的实际用户入口人工核对，不从测试数反推完整功能范围。
本轮既有入口的源码核对矩阵、最终候选及执行证据见 [FEATURE_PROGRESS](../FEATURE_PROGRESS.md)。
原有824个具体操作的旧候选证据仍保留；本轮最终单次完整2474/2474通过，同一JSON核验955/955登记操作各恰一次成功，不复用旧通过数替代本轮结果。
条件格式的规则管理、八种数值条件、文本／重复值／公式／排名、色阶／数据条及取消／纠错已分别登记。
名称管理器的新增／改名／删除、范围／工作表修改及新草稿已分别登记。
Table 的创建／改名／转区域、列改名、范围／行结构、外观与表头／汇总行显隐、九种汇总计算选项已分别登记。
文件下载／新建／打开、水平／垂直对齐选项、文字旋转、六种边框线型、字号增减、取消冻结及拆分已分别登记。
数字格式快捷按钮、日期／文本设置、超链接及快捷公式／函数选择器各入口已拆开登记；
数据验证的六种规则创建、范围修改、清除、取消、空白策略及八种比较条件已分别登记；
排序的快捷入口、自定义键／层级、表头／大小写／空白选项及取消入口已分别登记；
普通区域与 Table 筛选、条件／候选值／搜索分页及纠错，大纲行列分组／折叠／级别入口已分别登记；
查找的范围／匹配／分页／导航、面板鼠标／快捷键／焦点循环及查询／替换纠错已分别登记；
各面板会话、名称框提交、指针捕获、键盘入口及错误恢复也已分别核对；新增入口须同步登记，不能用父项或综合用例替代。
协作、自动保存等未实现功能不以占位／跳过测试冒充通过。

运行 `pnpm check:e2e-features` 只确认绑定存在；
运行 `pnpm check:e2e-features --results /path/to/playwright.json` 才核对这份报告中的实际成功结果。
结果报告必须来自同一候选代码；批次记录保留源码版本／指纹，不以旧报告验证新实现。
新增或修复功能时，先登记具体用户动作，再写可复现失败的 E2E，修复后核对结果；完整回归仍按批次执行。

| 编号 | 功能点 | E2E 文件（相对本目录） | 完整主用例标题 |
| --- | --- | --- | --- |
| MRSEL-001 | Ctrl 点击追加单元格 | `multi-range-selection/modifier-click.spec.ts` | Control click appends a disjoint cell and keeps the gap unselected at 1280px |
| MRSEL-002 | Command 点击追加单元格 | `multi-range-selection/modifier-click.spec.ts` | Meta click appends a disjoint cell and keeps the gap unselected at 1280px |
| MRSEL-003 | 修饰键拖动追加矩形 | `multi-range-selection/modifier-drag.spec.ts` | modifier drag appends a rectangle without replacing previous cells at 1280px |
| MRSEL-004 | 普通点击退出多区 | `multi-range-selection/exit.spec.ts` | ordinary click replaces manually appended areas with one cell at 1280px |
| MRSEL-005 | Escape 保留主区退出 | `multi-range-selection/exit.spec.ts` | Escape exits manual multi-area selection and keeps only the primary rectangle at 1280px |
| MRSEL-006 | 格式化手动追加的所有区域 | `multi-range-selection/multi-format.spec.ts` | formatting manually appended areas changes every target and preserves the gap at 1280px |
| MRSEL-007 | 清除手动追加的所有区域 | `multi-range-selection/multi-clear.spec.ts` | clearing manually appended areas preserves gap values and undoes in one step at 1280px |
| MRSEL-008 | 查看重叠多区的去重统计 | `multi-range-selection/overlap-statistics.spec.ts` | overlapping manual areas count and aggregate each cell once at 1280px |
| AFORM-001 | 公式栏提交同源 JSON 异步公式并传播原生依赖 | `async-formulas/settlement.spec.ts` | enter FETCHJSON through the formula bar and settle real HTTP with native dependents |
| AFORM-002 | 现有重算入口重试失败异步公式 | `async-formulas/settlement.spec.ts` | retry a failed FETCHJSON with the existing Recalculate control |
| FARG-001 | 参数表单生成并提交 SUM 公式 | `formula-arguments/native-calls.spec.ts` | FARG-001 SUM arguments create one native formula edit |
| FARG-002 | IF 表单省略未使用的可选参数 | `formula-arguments/native-calls.spec.ts` | FARG-002 IF omits an unused optional argument |
| FARG-003 | XLOOKUP 表单保留中间可选参数空位 | `formula-arguments/native-calls.spec.ts` | FARG-003 XLOOKUP preserves an optional middle argument hole |
| FARG-004 | LET 表单编辑重复绑定与固定尾参数 | `formula-arguments/native-calls.spec.ts` | FARG-004 LET edits repeated bindings before its fixed calculation |
| FARG-005 | 参数表单生成 TODAY 零参数调用 | `formula-arguments/native-calls.spec.ts` | FARG-005 TODAY creates a zero-argument native call |
| FARG-006 | 参数表单使用原生自定义表达式参数 | `formula-arguments/native-calls.spec.ts` | FARG-006 ORDER_NET uses native custom expression parameters |
| FARG-007 | 取消参数表单与生成草稿 | `formula-arguments/cancel-errors.spec.ts` | FARG-007 cancelling argument forms and generated drafts writes nothing |
| FARG-008 | 必填或重复参数不完整时纠正表单 | `formula-arguments/cancel-errors.spec.ts` | FARG-008 required and incomplete repeated arguments keep the form draft |
| FARG-009 | 添加重复参数组并保留固定尾参数 | `formula-arguments/group-actions.spec.ts` | FARG-009 adding an argument group keeps the fixed final expression |
| FARG-010 | 移除重复参数组并保留其余参数 | `formula-arguments/group-actions.spec.ts` | FARG-010 removing an argument group preserves the remaining parameters |
| FARG-011 | 取消按钮丢弃未提交的参数表单 | `formula-arguments/group-actions.spec.ts` | FARG-011 Cancel button discards the argument form without a write |
| FARG-012 | Escape 丢弃参数表单并恢复触发器焦点 | `formula-arguments/group-actions.spec.ts` | FARG-012 Escape discards the argument form and restores its trigger |
| AFILT-001 | 添加 OR 组并应用任一组匹配 | `advanced-filter/add-or-group.spec.ts` | advanced filter Add OR group includes either alternative in one apply at 1280px |
| AFILT-002 | 为当前 AND 组添加交集条件 | `advanced-filter/add-and-condition.spec.ts` | advanced filter Add condition intersects only its AND group at 1280px |
| AFILT-003 | 编辑分组中的一个条件 | `advanced-filter/edit-condition.spec.ts` | advanced filter editing one grouped condition preserves the other group at 1280px |
| AFILT-004 | 移除组内条件并保留非空组 | `advanced-filter/remove-condition.spec.ts` | advanced filter Remove condition retains its nonempty group at 1280px |
| AFILT-005 | 移除单个 OR 组 | `advanced-filter/remove-group.spec.ts` | advanced filter Remove group removes only that OR alternative at 1280px |
| AFILT-006 | 跨候选页全选当前搜索匹配项 | `advanced-filter/select-search.spec.ts` | advanced filter Select all search matches includes off-page values at 1280px |
| AFILT-007 | 跨候选页取消当前搜索匹配项 | `advanced-filter/clear-search.spec.ts` | advanced filter Clear all search matches removes only the complete current query at 1280px |
| AFILT-008 | 原重新应用入口刷新分组筛选快照 | `advanced-filter/reapply.spec.ts` | advanced filter Reapply refreshes grouped snapshots only on demand at 1280px |
| XSCUT-001 | 键盘跨表剪切并原子改写三表引用 | `cross-sheet-cut/move.spec.ts` | XSCUT-01 keyboard cut across tabs retargets mixed references in three sheets with one undo |
| XSCUT-002 | 工具栏跨表剪切格式、链接与空白格 | `cross-sheet-cut/move.spec.ts` | XSCUT-02 toolbar cut across tabs moves formatting hyperlinks and blank payloads |
| XSCUT-003 | 部分引用范围拒绝后修正目标重试 | `cross-sheet-cut/recovery.spec.ts` | XSCUT-03 partial range rejection preserves data redo and the same cut for a corrected retry |
| XSCUT-004 | Stop 验证拒绝后修正跨表剪切目标 | `cross-sheet-cut/recovery.spec.ts` | XSCUT-04 stop validation rolls back the cross-sheet cut and permits a corrected destination |
| XSCUT-005 | Warning 取消与明确继续跨表剪切 | `cross-sheet-cut/recovery.spec.ts` | XSCUT-05 warning cancel keeps the cut and explicit continue moves it with one history entry |
| XSCUT-006 | 合并目标拒绝后保留剪切并重试普通格 | `cross-sheet-cut/recovery.spec.ts` | XSCUT-06 merged destination rejects atomically and the same cut can move to an ordinary cell |
| XSCUT-007 | 解除第三表依赖保护后重试跨表剪切 | `cross-sheet-cut/protection.spec.ts` | XSCUT-07 protected third-sheet dependents block a cross-sheet cut until explicitly unprotected |
| XSCUT-008 | 浏览器剪切写入失败后保留原复制 | `cross-sheet-cut/browser-failure.spec.ts` | XSCUT-08 failed browser cut write leaves the source untouched and preserves the previous copy across tabs |
| SEL-001 | 单元格点击单选 | `selection/basic-selection.spec.ts` | single cell click replaces the selection at 1280px |
| SEL-002 | 鼠标拖拽矩形选区 | `selection/basic-selection.spec.ts` | pointer drag selects a rectangle at 1280px |
| SEL-003 | 行号选择整行 | `selection/basic-selection.spec.ts` | row header selects its complete extent at 1280px |
| SEL-004 | 列名选择整列 | `selection/basic-selection.spec.ts` | column header selects its complete extent at 1280px |
| SEL-005 | 左上角选择整表 | `selection/basic-selection.spec.ts` | all header selects its complete extent at 1280px |
| SEL-006 | Shift 点击单元格扩选 | `selection/shift-click.spec.ts` | Shift click extends from the original cell at 1280px |
| SEL-007 | Shift 连续点击缩选及反向扩选 | `selection/shift-click.spec.ts` | repeated Shift clicks shrink and reverse without moving the anchor at 1280px |
| SEL-008 | Shift 拖拽沿用原起点 | `selection/shift-click.spec.ts` | Shift drag continues the existing anchor at 1280px |
| SEL-009 | Shift 行号扩选 | `selection/basic-selection.spec.ts` | Shift row header extends the original axis selection at 1280px |
| SEL-010 | Shift 列名扩选 | `selection/basic-selection.spec.ts` | Shift column header extends the original axis selection at 1280px |
| SEL-011 | 丢失指针捕获后结束自动滚动 | `selection/drag-capture-recovery.spec.ts` | losing native pointer capture stops edge scrolling and permits a new selection |
| SEL-012 | Shift 向上键扩选及缩选 | `selection/keyboard-selection.spec.ts` | Shift ArrowUp extends and shrinks the original cell at 1280px |
| SEL-013 | Shift 向下键扩选及缩选 | `selection/keyboard-selection.spec.ts` | Shift ArrowDown extends and shrinks the original cell at 1280px |
| SEL-014 | Shift 向左键扩选及缩选 | `selection/keyboard-selection.spec.ts` | Shift ArrowLeft extends and shrinks the original cell at 1280px |
| SEL-015 | Shift 向右键扩选及缩选 | `selection/keyboard-selection.spec.ts` | Shift ArrowRight extends and shrinks the original cell at 1280px |
| SEL-016 | Shift PageDown 扩选及缩选 | `selection/keyboard-selection.spec.ts` | Shift PageDown selects a page and returns to its anchor at 1280px |
| SEL-017 | Shift PageUp 扩选及缩选 | `selection/keyboard-selection.spec.ts` | Shift PageUp selects a page and returns to its anchor at 1280px |
| SEL-018 | 键盘扩选后 Shift 点击沿用原起点 | `selection/keyboard-selection.spec.ts` | Shift click after keyboard extension keeps the initial anchor at 1280px |
| SEL-019 | Shift 扩选后批量格式及单次撤销 | `selection/shift-click.spec.ts` | formatting applies to every Shift selected cell at 1280px |
| SEL-020 | 普通拖选靠近下边缘持续滚动 | `selection/drag-autoscroll.spec.ts` | bottom selection drag keeps scrolling without further pointer movement at 1280px |
| SEL-021 | 普通拖选靠近右边缘持续滚动 | `selection/drag-autoscroll.spec.ts` | right selection drag keeps scrolling without further pointer movement at 1280px |
| SEL-022 | 普通拖选靠近上边缘持续滚动 | `selection/drag-autoscroll.spec.ts` | top selection drag keeps scrolling without further pointer movement at 1280px |
| SEL-023 | 普通拖选靠近左边缘持续滚动 | `selection/drag-autoscroll.spec.ts` | left selection drag keeps scrolling without further pointer movement at 1280px |
| SEL-024 | 普通拖选靠近角落斜向持续滚动 | `selection/drag-autoscroll.spec.ts` | diagonal selection drag keeps scrolling without further pointer movement at 1280px |
| SEL-025 | 松开拖选结束双轴自动滚动且可新选 | `selection/drag-autoscroll.spec.ts` | release stops selection autoscroll and permits a new anchor at 1280px |
| NAV-001 | 名称框定位范围及露出填充柄 | `workbook/name-box-range-visibility.spec.ts` | name box reveals the fill corner on both axes at 1280px |
| NAV-002 | 名称框可见目标不多滚 | `workbook/name-box-scroll.spec.ts` | name box only scrolls when its target is outside the viewport at 1280px |
| NAV-003 | F5 打开定位弹窗 | `navigation/go-to.spec.ts` | F5 opens Go To and Escape restores grid focus |
| NAV-004 | Ctrl+G 打开定位弹窗 | `navigation/go-to.spec.ts` | Control+g opens Go To and Escape restores grid focus |
| NAV-005 | Command+G 打开定位弹窗 | `navigation/go-to.spec.ts` | Meta+g opens Go To and Escape restores grid focus |
| NAV-006 | 绝对 R1C1 定位至边界 | `navigation/go-to.spec.ts` | absolute R1C1 reaches the last canvas row and column without clipping or adding history |
| NAV-007 | 定位历史去重及上限 | `navigation/go-to.spec.ts` | history is capped, deduplicated and scoped to the current workbook page |
| NAV-008 | 定位常量 | `navigation/go-to-special.spec.ts` | Constants selects only the native seed identities, including visually empty cells |
| NAV-009 | 定位公式 | `navigation/go-to-special.spec.ts` | Formulas selects only the native seed identities, including visually empty cells |
| NAV-010 | 定位空白 | `navigation/go-to-special.spec.ts` | Blanks selects only the native seed identities, including visually empty cells |
| NAV-011 | 通过名称框创建命名区域 | `navigation/named-ranges.spec.ts` | name box creates a native range usable by formulas, manager, Go To and undo |
| NAV-012 | 定位命名区域 | `navigation/named-ranges.spec.ts` | Go To uses the native name seed across sheets at 1280px |
| NAV-013 | 名称框跳转命名区域 | `navigation/named-ranges.spec.ts` | name box navigates names and keeps errors correctable at 1280px |
| NAV-014 | 名称管理器定位 Table | `workbook/table-columns.spec.ts` | name manager locates a Table on another worksheet without adding history |
| NAV-015 | 普通向上键导航 | `navigation/grid-movement.spec.ts` | grid ArrowUp selects exactly B4 without editing at 1280px |
| NAV-016 | 普通向下键导航 | `navigation/grid-movement.spec.ts` | grid ArrowDown selects exactly B6 without editing at 1280px |
| NAV-017 | 普通向左键导航 | `navigation/grid-movement.spec.ts` | grid ArrowLeft selects exactly A5 without editing at 1280px |
| NAV-018 | 普通向右键导航 | `navigation/grid-movement.spec.ts` | grid ArrowRight selects exactly C5 without editing at 1280px |
| NAV-019 | 未编辑时 Enter 向下导航 | `navigation/grid-movement.spec.ts` | grid Enter selects exactly B6 without editing at 1280px |
| NAV-020 | 未编辑时 Shift+Enter 向上导航 | `navigation/grid-movement.spec.ts` | grid Shift+Enter selects exactly B4 without editing at 1280px |
| NAV-021 | 普通 Tab 向右导航 | `navigation/grid-movement.spec.ts` | grid Tab selects exactly C5 without editing at 1280px |
| NAV-022 | 普通 Shift+Tab 向左导航 | `navigation/grid-movement.spec.ts` | grid Shift+Tab selects exactly A5 without editing at 1280px |
| NAV-023 | Home 定位当前行首格 | `navigation/grid-movement.spec.ts` | grid Home selects exactly A5 without editing at 1280px |
| NAV-024 | End 定位当前列末格 | `navigation/grid-movement.spec.ts` | grid End selects exactly B1001 without editing at 1280px |
| NAV-025 | Ctrl+Home 定位首格 | `navigation/grid-movement.spec.ts` | grid Control+Home selects exactly A1 without editing at 1280px |
| NAV-026 | Command+Home 定位首格 | `navigation/grid-movement.spec.ts` | grid Meta+Home selects exactly A1 without editing at 1280px |
| NAV-027 | Ctrl+End 定位画布右下角 | `navigation/grid-movement.spec.ts` | grid Control+End selects exactly P1001 without editing at 1280px |
| NAV-028 | Command+End 定位画布右下角 | `navigation/grid-movement.spec.ts` | grid Meta+End selects exactly P1001 without editing at 1280px |
| NAV-029 | Ctrl+向上键定位列首 | `navigation/grid-movement.spec.ts` | grid Control+ArrowUp selects exactly B1 without editing at 1280px |
| NAV-030 | Command+向上键定位列首 | `navigation/grid-movement.spec.ts` | grid Meta+ArrowUp selects exactly B1 without editing at 1280px |
| NAV-031 | Ctrl+向下键定位列末 | `navigation/grid-movement.spec.ts` | grid Control+ArrowDown selects exactly B1001 without editing at 1280px |
| NAV-032 | Command+向下键定位列末 | `navigation/grid-movement.spec.ts` | grid Meta+ArrowDown selects exactly B1001 without editing at 1280px |
| NAV-033 | Ctrl+向左键定位行首 | `navigation/grid-movement.spec.ts` | grid Control+ArrowLeft selects exactly A5 without editing at 1280px |
| NAV-034 | Command+向左键定位行首 | `navigation/grid-movement.spec.ts` | grid Meta+ArrowLeft selects exactly A5 without editing at 1280px |
| NAV-035 | Ctrl+向右键定位行末 | `navigation/grid-movement.spec.ts` | grid Control+ArrowRight selects exactly P5 without editing at 1280px |
| NAV-036 | Command+向右键定位行末 | `navigation/grid-movement.spec.ts` | grid Meta+ArrowRight selects exactly P5 without editing at 1280px |
| NAV-037 | PageDown 按可视高度向下翻页 | `navigation/grid-page-navigation.spec.ts` | grid PageDown moves exactly one rendered page at 1280px |
| NAV-038 | PageUp 按可视高度向上翻页 | `navigation/grid-page-navigation.spec.ts` | grid PageUp moves exactly one rendered page at 1280px |
| NAV-039 | 鼠标打开定位弹窗 | `navigation/go-to-session.spec.ts` | Open Go To preserves selection scroll and native redo at 1280px |
| NAV-040 | 取消定位草稿 | `navigation/go-to-session.spec.ts` | Cancel Go To preserves selection scroll and native redo at 1280px |
| NAV-041 | Escape 丢弃定位草稿 | `navigation/go-to-session.spec.ts` | Escape Go To preserves selection scroll and native redo at 1280px |
| NAV-042 | 定位弹窗 Tab 焦点循环 | `navigation/go-to-session.spec.ts` | Tab Go To preserves selection scroll and native redo at 1280px |
| NAV-043 | 定位弹窗 Shift+Tab 焦点循环 | `navigation/go-to-session.spec.ts` | Shift+Tab Go To preserves selection scroll and native redo at 1280px |
| NAV-044 | 非法定位地址原地纠正 | `navigation/go-to.spec.ts` | invalid and out-of-canvas cross-sheet addresses do not change tabs, selection or scroll |
| NAV-045 | Go 按钮提交绝对 A1 区域 | `navigation/go-to-references.spec.ts` | Go button submits absolute A1 without changing data or history at 1280px |
| NAV-046 | Go 按钮提交相对 R1C1 地址 | `navigation/go-to-references.spec.ts` | Go button submits relative R1C1 without changing data or history at 1280px |
| NAV-047 | Go 按钮提交带引号跨表地址 | `navigation/go-to-references.spec.ts` | Go button submits quoted cross-sheet without changing data or history at 1280px |
| NAV-048 | Enter 提交定位地址 | `navigation/go-to-submit.spec.ts` | Enter navigates to the exact saved target without workbook history at 1280px |
| NAV-049 | 点击最近定位位置 | `navigation/go-to-submit.spec.ts` | Recent location navigates to the exact saved target without workbook history at 1280px |
| NAV-050 | 定位条件无匹配后更正重试 | `navigation/go-to-special.spec.ts` | no matches preserves selection and dialog; changing condition retries without history |
| NAV-051 | 打开定位条件面板 | `navigation/go-to-special-session.spec.ts` | Open Go To Special preserves its exact scope and native redo at 1280px |
| NAV-052 | 取消定位条件查询 | `navigation/go-to-special-session.spec.ts` | Cancel Go To Special preserves its exact scope and native redo at 1280px |
| NAV-053 | Escape 放弃定位条件查询 | `navigation/go-to-special-session.spec.ts` | Escape Go To Special preserves its exact scope and native redo at 1280px |
| NAV-054 | 定位条件 Tab 焦点循环 | `navigation/go-to-special-session.spec.ts` | Tab Go To Special preserves its exact scope and native redo at 1280px |
| NAV-055 | 定位条件 Shift+Tab 焦点循环 | `navigation/go-to-special-session.spec.ts` | Shift+Tab Go To Special preserves its exact scope and native redo at 1280px |
| NAV-056 | 单格范围查询整表公式 | `navigation/go-to-special.spec.ts` | single-cell scope finds offscreen formulas and keeps frozen and hidden geometry intact |
| NAV-057 | 定位跟随名称修改及删除 | `navigation/named-ranges.spec.ts` | Go To follows the current renamed target and refuses deleted names |
| NAV-058 | 拒绝失效命名区域 | `navigation/named-ranges.spec.ts` | Go To reports a broken named range without creating a replacement name |
| NAV-059 | 名称框失焦提交地址定位 | `navigation/name-box-session.spec.ts` | Blur address name box preserves native values and its exact history boundary at 1280px |
| NAV-060 | 名称框 Escape 丢弃未提交地址 | `navigation/name-box-session.spec.ts` | Escape name box preserves native values and its exact history boundary at 1280px |
| NAV-061 | 名称框失焦创建原生名称 | `navigation/name-box-session.spec.ts` | Blur name name box preserves native values and its exact history boundary at 1280px |
| NAV-062 | 点击名称框后直接打字替换整个地址 | `navigation/name-box-session.spec.ts` | Focus replace name box preserves native values and its exact history boundary at 1280px |
| NAV-063 | 名称框空白失焦还原原选区地址 | `navigation/name-box-session.spec.ts` | Blank blur name box preserves native values and its exact history boundary at 1280px |
| NAV-064 | 名称框越界地址在原输入纠正重试 | `navigation/name-box-session.spec.ts` | Invalid correction name box preserves native values and its exact history boundary at 1280px |
| NAME-001 | 名称管理器新增名称 | `workbook/named-ranges.spec.ts` | create a name through the manager without changing its source at 1280px |
| NAME-002 | 名称管理器重命名 | `workbook/named-ranges.spec.ts` | rename a seeded name rewrites its formula in one step at 1280px |
| NAME-003 | 名称管理器删除名称 | `workbook/named-ranges.spec.ts` | delete a seeded name keeps its formula and can undo once at 1280px |
| NAME-004 | 修改名称引用范围 | `workbook/named-ranges.spec.ts` | seed names are native definitions, update their formulas and start without history |
| NAME-005 | 修改名称目标工作表 | `workbook/named-ranges.spec.ts` | change a named range worksheet without changing its address at 1280px |
| NAME-006 | 重置新名称草稿 | `workbook/named-ranges.spec.ts` | new name discards an existing name draft without saving at 1280px |
| NAME-007 | 打开名称管理器 | `workbook/name-manager-dialog.spec.ts` | Open name manager preserves native definitions formulas and redo at 1280px |
| NAME-008 | 名称管理器 Tab 焦点循环 | `workbook/name-manager-dialog.spec.ts` | Tab name manager preserves native definitions formulas and redo at 1280px |
| NAME-009 | 名称管理器 Shift+Tab 焦点循环 | `workbook/name-manager-dialog.spec.ts` | Shift+Tab name manager preserves native definitions formulas and redo at 1280px |
| NAME-010 | 取消名称管理草稿 | `workbook/name-manager-dialog.spec.ts` | Cancel name manager preserves native definitions formulas and redo at 1280px |
| NAME-011 | Escape 丢弃名称管理草稿 | `workbook/name-manager-dialog.spec.ts` | Escape name manager preserves native definitions formulas and redo at 1280px |
| NAME-012 | 重名原地纠正重试 | `workbook/name-manager-recovery.spec.ts` | duplicate name corrects in the same manager before one native creation at 1280px |
| EDIT-001 | 格内原始数值编辑 | `editing/input-semantics.spec.ts` | P3 edits the original number and retains it after Enter and blur |
| EDIT-002 | 格内 IME 确认键不提交 | `editing/input-semantics.spec.ts` | cell editing does not consume IME confirmation or cancellation keys |
| EDIT-003 | 公式栏 IME 确认键不提交 | `editing/input-semantics.spec.ts` | formula editing does not consume IME confirmation or cancellation keys |
| EDIT-004 | 格内 Alt+Enter 换行 | `editing/input-semantics.spec.ts` | cell Alt+Enter inserts a newline at the caret and commits one multiline value |
| EDIT-005 | 公式栏 Alt+Enter 换行 | `editing/input-semantics.spec.ts` | formula Alt+Enter inserts a newline at the caret and commits one multiline value |
| EDIT-006 | 格内强制文本输入 | `editing/typed-cell-input.spec.ts` | cell preserves forced text through re-editing and formula references |
| EDIT-007 | 公式栏强制文本输入 | `editing/typed-cell-input.spec.ts` | formula preserves forced text through re-editing and formula references |
| EDIT-008 | 格内布尔值输入 | `editing/typed-cell-input.spec.ts` | cell installs a Boolean and recalculates its dependent formula |
| EDIT-009 | 公式栏布尔值输入 | `editing/typed-cell-input.spec.ts` | formula installs a Boolean and recalculates its dependent formula |
| EDIT-010 | 格内百分比输入 | `editing/typed-cell-input.spec.ts` | cell stores a percentage as a number and changes only its number format |
| EDIT-011 | 公式栏百分比输入 | `editing/typed-cell-input.spec.ts` | formula stores a percentage as a number and changes only its number format |
| EDIT-012 | 格内 24 小时时间输入 | `editing/time-fraction-input.spec.ts` | cell: 13:30 becomes a native number, re-edits and calculates |
| EDIT-013 | 格内 AM/PM 时间输入 | `editing/time-fraction-input.spec.ts` | cell: 1:30 PM becomes a native number, re-edits and calculates |
| EDIT-014 | 格内带分数输入 | `editing/time-fraction-input.spec.ts` | cell: 1 1/2 becomes a native number, re-edits and calculates |
| EDIT-015 | 公式栏 24 小时时间输入 | `editing/time-fraction-input.spec.ts` | formula: 13:30 becomes a native number, re-edits and calculates |
| EDIT-016 | 公式栏 AM/PM 时间输入 | `editing/time-fraction-input.spec.ts` | formula: 1:30 PM becomes a native number, re-edits and calculates |
| EDIT-017 | 公式栏带分数输入 | `editing/time-fraction-input.spec.ts` | formula: 1 1/2 becomes a native number, re-edits and calculates |
| EDIT-018 | 失焦提交后连续双击编辑 | `editing/blur-continuous-editing.spec.ts` | cell valid blur opens the next double-clicked cell without a second click |
| EDIT-019 | 双击进入格内编辑 | `editing/editing-entries.spec.ts` | double-click opens the correct native draft and commits once at 1280px |
| EDIT-020 | F2 编辑原始内容 | `editing/editing-entries.spec.ts` | F2 opens the correct native draft and commits once at 1280px |
| EDIT-021 | 直接打字替换内容 | `editing/editing-entries.spec.ts` | printable key opens the correct native draft and commits once at 1280px |
| EDIT-022 | Backspace 从空草稿开始编辑 | `editing/cell-key-actions.spec.ts` | cell Backspace preserves its distinct write and history semantics at 1280px |
| EDIT-023 | 格内 Escape 丢弃未提交草稿 | `editing/cell-key-actions.spec.ts` | cell Escape preserves its distinct write and history semantics at 1280px |
| EDIT-024 | 格内 Enter 提交后向下 | `editing/commit-navigation.spec.ts` | editor Enter commits once before moving to E3 at 1280px |
| EDIT-025 | 格内 Shift+Enter 提交后向上 | `editing/commit-navigation.spec.ts` | editor Shift+Enter commits once before moving to E1 at 1280px |
| EDIT-026 | 格内 Tab 提交后向右 | `editing/commit-navigation.spec.ts` | editor Tab commits once before moving to F2 at 1280px |
| EDIT-027 | 格内 Shift+Tab 提交后向左 | `editing/commit-navigation.spec.ts` | editor Shift+Tab commits once before moving to D2 at 1280px |
| EDIT-028 | 公式栏 Enter 提交且留原格 | `editing/formula-bar-actions.spec.ts` | formula bar Enter keeps the source selected with correct native history at 1280px |
| EDIT-029 | 公式栏 Escape 取消且保留重做 | `editing/formula-bar-actions.spec.ts` | formula bar Escape keeps the source selected with correct native history at 1280px |
| EDIT-030 | 格内失焦提交且不抢新控件焦点 | `editing/blur-actions.spec.ts` | cell blur commits once without stealing the new control focus at 1280px |
| EDIT-031 | 公式栏失焦提交且不抢新控件焦点 | `editing/blur-actions.spec.ts` | formula blur commits once without stealing the new control focus at 1280px |
| EDIT-032 | 格内失焦拒绝后留原草稿纠正 | `editing/rejected-draft-replacement.spec.ts` | cell rejected blur cannot be replaced by another cell at 1280px |
| EDIT-033 | 公式栏失焦拒绝后留原草稿纠正 | `editing/rejected-draft-replacement.spec.ts` | formula rejected blur cannot be replaced by another cell at 1280px |
| EDIT-034 | 格内拒绝后显式取消再编辑 | `editing/rejected-draft-replacement.spec.ts` | cell rejected draft can explicitly cancel before editing the next cell |
| EDIT-035 | 公式栏拒绝后显式取消再编辑 | `editing/rejected-draft-replacement.spec.ts` | formula rejected draft can explicitly cancel before editing the next cell |
| LINK-001 | 插入超链接 | `hyperlink/hyperlink.spec.ts` | insert hyperlink is independent and undoes once at 1280px |
| LINK-002 | 修改原生超链接 | `hyperlink/hyperlink.spec.ts` | edit hyperlink is independent and undoes once at 1280px |
| LINK-003 | 移除原生超链接 | `hyperlink/hyperlink.spec.ts` | remove hyperlink is independent and undoes once at 1280px |
| LINK-004 | Ctrl/Command 点击单元格链接 | `hyperlink/hyperlink.spec.ts` | Rust seed links select normally; Ctrl/Meta+click opens without changing the selection |
| LINK-005 | Ctrl/Command K 插入超链接 | `hyperlink/hyperlink.spec.ts` | keyboard hyperlink insert keeps the formula and undoes once at 1280px |
| LINK-006 | 超链接弹窗打开新标签页 | `hyperlink/hyperlink.spec.ts` | dialog link opens a new tab without changing workbook or selection at 1280px |
| LINK-007 | 取消超链接草稿 | `hyperlink/hyperlink.spec.ts` | cancel hyperlink discards both fields without history at 1280px |
| LINK-008 | Escape 丢弃超链接草稿 | `hyperlink/hyperlink.spec.ts` | hyperlink dialog fits desktop and narrow viewports, traps focus and restores it on Escape |
| LINK-009 | 超链接非法地址拒绝及重试 | `hyperlink/hyperlink.spec.ts` | dangerous URL fails without changing text or losing a retryable draft |
| LINK-010 | 打开超链接面板 | `hyperlink/hyperlink-dialog.spec.ts` | Open hyperlink dialog preserves native formulas fonts and redo at 1280px |
| LINK-011 | 超链接面板 Tab 循环 | `hyperlink/hyperlink-dialog.spec.ts` | Tab hyperlink dialog preserves native formulas fonts and redo at 1280px |
| LINK-012 | 超链接面板 Shift+Tab 循环 | `hyperlink/hyperlink-dialog.spec.ts` | Shift+Tab hyperlink dialog preserves native formulas fonts and redo at 1280px |
| CLEAR-001 | 清除内容 | `editing/clear-selection.spec.ts` | clear contents keeps formatting and Delete recalculates dependent formulas |
| CLEAR-002 | 清除格式 | `editing/clear-selection.spec.ts` | clear formatting preserves values and formulas |
| CLEAR-003 | 全部清除 | `editing/clear-selection.spec.ts` | clear all erases a selected row including offscreen cells without touching neighbours |
| CLEAR-004 | Delete 键清除内容并重算 | `editing/cell-key-actions.spec.ts` | cell Delete preserves its distinct write and history semantics at 1280px |
| CLIP-001 | 系统复制及重复粘贴 | `editing/system-clipboard.spec.ts` | system copy freezes value and format and permits repeated pastes |
| CLIP-002 | Ctrl/Command 复制粘贴公式 | `editing/system-clipboard.spec.ts` | keyboard copy and paste preserve formulas with relative references |
| CLIP-003 | 同表剪切移动 | `editing/system-clipboard.spec.ts` | cut only clears on paste and formulas follow the moved quantity |
| CLIP-004 | 外部 TSV 矩形粘贴 | `editing/system-clipboard.spec.ts` | external TSV pastes a rectangle with quotes, empty cells, booleans and formulas |
| CLIP-005 | 仅粘贴值 | `editing/paste-special.spec.ts` | values-only uses the unrounded Rust value and keeps destination formatting |
| CLIP-006 | 仅粘贴格式 | `editing/paste-special.spec.ts` | formatting-only copies source style but leaves the destination formula intact |
| CLIP-007 | 矩形选区平铺粘贴 | `editing/paste-special.spec.ts` | normal paste tiles a rectangular selection including source formatting |
| CLIP-008 | 转置粘贴 | `editing/paste-options.spec.ts` | transposes seed data with styles then repeats using the transposed dimensions |
| CLIP-009 | 跳过空白粘贴 | `editing/paste-options.spec.ts` | skip blanks preserves a target formula and its style, but writes zero and false |
| CLIP-010 | 粘贴值及格式 | `editing/paste-options.spec.ts` | values and formatting freezes the formula result and keeps source number and font styles |
| CLIP-011 | 粘贴加法 | `editing/paste-arithmetic.spec.ts` | add combines seed numbers and undo restores the entire operation |
| CLIP-012 | 粘贴减法 | `editing/paste-arithmetic.spec.ts` | subtract combines seed numbers and undo restores the entire operation |
| CLIP-013 | 粘贴乘法 | `editing/paste-arithmetic.spec.ts` | multiply combines seed numbers and undo restores the entire operation |
| CLIP-014 | 粘贴除法 | `editing/paste-special-dialog.spec.ts` | divide uses the destination as dividend and undo restores the seed |
| CLIP-015 | 组合选择性粘贴 | `editing/paste-special-dialog.spec.ts` | values, multiplication, transpose and skip blanks compose in one undo step |
| CLIP-016 | 仅粘贴列宽 | `editing/paste-column-widths.spec.ts` | column widths copy from Summary without copying its text, bold or row height |
| CLIP-017 | 复制为纯文本 | `editing/copy-as.spec.ts` | plain text copies the formatted result without the internal snapshot marker |
| CLIP-018 | 复制为 Markdown | `editing/copy-as.spec.ts` | Markdown copies a table with bold and italic from the Rust seed |
| CLIP-019 | 复制为 HTML | `editing/copy-as.spec.ts` | HTML copies a real table with styles and a plain-text alternative |
| CLIP-020 | 仅粘贴公式 | `editing/paste-formula-modes.spec.ts` | formulas only shifts references without copying source fonts or replacing target number format |
| CLIP-021 | 粘贴公式及数值格式 | `editing/paste-formula-modes.spec.ts` | formulas and number formats replaces only number formatting and retains a live formula |
| CLIP-022 | 粘贴值及数值格式 | `editing/paste-formula-modes.spec.ts` | values and number formats keeps precision and destination italic without source bold |
| CLIP-023 | 工具栏剪切按钮 | `editing/clipboard-entries.spec.ts` | Cut button preserves native styles and has one undo at 1280px |
| CLIP-024 | 工具栏粘贴按钮 | `editing/clipboard-entries.spec.ts` | Paste button preserves native styles and has one undo at 1280px |
| CLIP-025 | 键盘系统粘贴 | `editing/clipboard-entries.spec.ts` | Paste keyboard preserves native styles and has one undo at 1280px |
| CLIP-026 | 打开选择性粘贴 | `editing/paste-special-session.spec.ts` | Open paste special preserves target and resets choices without losing redo at 1280px |
| CLIP-027 | 取消选择性粘贴草稿 | `editing/paste-special-session.spec.ts` | Cancel paste special preserves target and resets choices without losing redo at 1280px |
| CLIP-028 | Escape 丢弃选择性粘贴草稿 | `editing/paste-special-session.spec.ts` | Escape paste special preserves target and resets choices without losing redo at 1280px |
| CLIP-029 | 选择性粘贴 Tab 焦点循环 | `editing/paste-special-session.spec.ts` | Tab paste special preserves target and resets choices without losing redo at 1280px |
| CLIP-030 | 选择性粘贴 Shift+Tab 焦点循环 | `editing/paste-special-session.spec.ts` | Shift+Tab paste special preserves target and resets choices without losing redo at 1280px |
| CLIP-031 | 弹窗全部内容及格式粘贴 | `editing/paste-special-content.spec.ts` | all content in paste special has native scope and one undo at 1280px |
| CLIP-032 | 弹窗仅粘贴值 | `editing/paste-special-content.spec.ts` | values content in paste special has native scope and one undo at 1280px |
| CLIP-033 | 弹窗仅粘贴格式 | `editing/paste-special-content.spec.ts` | formats content in paste special has native scope and one undo at 1280px |
| CLIP-034 | 弹窗粘贴值及格式 | `editing/paste-special-formulas.spec.ts` | values-formats paste special preserves formula semantics with one undo at 1280px |
| CLIP-035 | 弹窗仅粘贴公式 | `editing/paste-special-formulas.spec.ts` | formulas paste special preserves formula semantics with one undo at 1280px |
| CLIP-036 | 弹窗粘贴公式及数字格式 | `editing/paste-special-formulas.spec.ts` | formulas-number-formats paste special preserves formula semantics with one undo at 1280px |
| CLIP-037 | 弹窗粘贴值及数字格式 | `editing/paste-special-formulas.spec.ts` | values-number-formats paste special preserves formula semantics with one undo at 1280px |
| CLIP-038 | 弹窗仅粘贴列宽 | `editing/paste-column-widths.spec.ts` | default column width clears an existing override and preserves Summary row style |
| CLIP-039 | 选择性粘贴拒绝后原地纠正 | `editing/paste-special-dialog.spec.ts` | native rejection stays in the dialog and permits correcting the option |
| CLIP-040 | 弹窗选择不运算 | `editing/paste-special-arithmetic.spec.ts` | none operation in paste special recalculates one native transaction at 1280px |
| CLIP-041 | 弹窗加法粘贴 | `editing/paste-special-arithmetic.spec.ts` | add operation in paste special recalculates one native transaction at 1280px |
| CLIP-042 | 弹窗减法粘贴 | `editing/paste-special-arithmetic.spec.ts` | subtract operation in paste special recalculates one native transaction at 1280px |
| CLIP-043 | 弹窗乘法粘贴 | `editing/paste-special-arithmetic.spec.ts` | multiply operation in paste special recalculates one native transaction at 1280px |
| CLIP-044 | 弹窗除法粘贴 | `editing/paste-special-arithmetic.spec.ts` | divide operation in paste special recalculates one native transaction at 1280px |
| CLIP-045 | 弹窗转置粘贴复选框 | `editing/paste-special-options.spec.ts` | transpose checkbox rotates the native paste without touching neighbors at 1280px |
| CLIP-046 | 弹窗跳过空白复选框 | `editing/paste-special-options.spec.ts` | skip blanks checkbox preserves a formula but writes zero and false at 1280px |
| CLIP-047 | 弹窗列宽模式清除互斥选项 | `editing/paste-special-dialog.spec.ts` | cancel discards choices and width-only clears incompatible options |
| CLIP-048 | 剪贴板权限等待期间防重复提交 | `editing/paste-special-dialog.spec.ts` | waiting for clipboard permission renders busy controls before Rust paste completes |
| FILL-001 | 向下填充 | `editing/directional-fill.spec.ts` | seed formula fills down with relative/absolute references and one undo step |
| FILL-002 | 向右填充 | `editing/directional-fill.spec.ts` | fill right copies seed text and underline, then shifts a formula horizontally |
| FILL-003 | 等差数值序列 | `editing/fill-series.spec.ts` | native number seed extends with one undo step while source samples stay intact |
| FILL-004 | 文本编号序列 | `editing/fill-series.spec.ts` | text numbering preserves padding and native seed formatting |
| FILL-005 | 线性趋势及拒绝后重试 | `editing/fill-series.spec.ts` | nonuniform samples reject arithmetic but a four-sample linear trend can retry |
| FILL-006 | 星期名称序列 | `editing/fill-named-series.spec.ts` | weekday seed wraps through the weekend, carries bold and undoes in one step |
| FILL-007 | 月份名称序列 | `editing/fill-named-series.spec.ts` | month seed wraps into January as text and carries italic |
| FILL-008 | 自定义文本序列 | `editing/fill-named-series.spec.ts` | custom priority list cycles, preserves underline and keeps its draft for reuse |
| FILL-009 | 多列独立向下序列 | `editing/fill-matrix.spec.ts` | multi-column independent series and one undo at 1280px |
| FILL-010 | 多行独立向右序列 | `editing/fill-matrix.spec.ts` | multi-row independent horizontal series at 1280px |
| FILL-011 | 双击填充柄向下延伸 | `editing/fill-double-click.spec.ts` | double-click fills formulas to adjacent data once at 1280px |
| FILL-012 | 保存并复用自定义列表 | `editing/custom-fill-lists.spec.ts` | save and reuse a preset with one native fill and undo at 1280px |
| FILL-013 | 修改自定义列表 | `editing/custom-fill-lists.spec.ts` | edit replaces only the saved preset and Rust uses the new order at 1280px |
| FILL-014 | 删除自定义列表 | `editing/custom-fill-lists.spec.ts` | delete never changes cells or leaves a stale selected list at 1280px |
| FILL-015 | 打开序列填充回读默认值 | `editing/fill-series-session.spec.ts` | Open series dialog preserves samples and native redo at 1280px |
| FILL-016 | 取消序列填充草稿 | `editing/fill-series-session.spec.ts` | Cancel series dialog preserves samples and native redo at 1280px |
| FILL-017 | Escape 丢弃序列填充草稿 | `editing/fill-series-session.spec.ts` | Escape series dialog preserves samples and native redo at 1280px |
| FILL-018 | 序列弹窗 Tab 焦点循环 | `editing/fill-series-session.spec.ts` | Tab series dialog preserves samples and native redo at 1280px |
| FILL-019 | 序列弹窗 Shift+Tab 焦点循环 | `editing/fill-series-session.spec.ts` | Shift+Tab series dialog preserves samples and native redo at 1280px |
| FILL-020 | 序列非法样本数原地纠正 | `editing/fill-series-validation.spec.ts` | invalid series sample count corrects without partial native writes at 1280px |
| FILL-021 | 新建自定义列表草稿按钮 | `editing/custom-list-entries.spec.ts` | New list entry preserves saved presets and fills only after Apply at 1280px |
| FILL-022 | 列表下拉框切换未保存草稿 | `editing/custom-list-entries.spec.ts` | New unsaved list entry preserves saved presets and fills only after Apply at 1280px |
| FILL-023 | 选择已保存的自定义列表 | `editing/custom-list-entries.spec.ts` | Saved list entry preserves saved presets and fills only after Apply at 1280px |
| FILL-024 | 日期序列填充 | `editing/date-input-fill.spec.ts` | date series infers day, week and month ends from native samples |
| FILL-025 | 序列面板选择向下方向 | `editing/fill-series-directions.spec.ts` | series direction down uses its actual dropdown and one undo at 1280px |
| FILL-026 | 序列面板选择向右方向 | `editing/fill-series-directions.spec.ts` | series direction right uses its actual dropdown and one undo at 1280px |
| FILL-027 | 填充柄向下拖拽推断序列 | `editing/fill-handle.spec.ts` | number seed previews without writing then extends, undoes and redoes |
| FILL-028 | 填充柄向上拖拽推断序列 | `editing/fill-handle.spec.ts` | upwards drag extends numbers before the source |
| FILL-029 | 点击填充柄但不拖拽 | `editing/fill-handle.spec.ts` | clicking the handle without dragging does not fill the adjacent cell |
| FILL-030 | Ctrl 拖动时强制复制 | `editing/fill-handle.spec.ts` | Control pressed during drag switches number series to tiled copy |
| FILL-031 | Command 拖动时强制复制 | `editing/fill-handle.spec.ts` | Meta pressed during drag switches number series to tiled copy |
| FILL-032 | 填充柄拖填公式相对引用 | `editing/fill-handle.spec.ts` | formula fill uses native relative references and one undo |
| FILL-033 | 填充柄靠近底边持续自动滚动 | `editing/fill-handle.spec.ts` | holding at bottom autoscrolls without further pointer moves |
| FILL-034 | 填充柄靠近右边自动滚动后提交 | `editing/fill-handle.spec.ts` | holding at right edge scrolls horizontally and releases into an offscreen column |
| FILL-035 | 填充合并目标拒绝后重试 | `editing/fill-handle.spec.ts` | merged target rejects atomically and retains source selection for retry |
| FILL-036 | 填充柄向左复制 | `editing/fill-handle-horizontal.spec.ts` | fill handle left copies underline without changing source or neighbors at 1280px |
| FILL-037 | 填充柄向右复制 | `editing/fill-handle-horizontal.spec.ts` | fill handle right copies underline without changing source or neighbors at 1280px |
| FILL-038 | Escape 取消填充拖拽后重试 | `editing/fill-handle-cancellation.spec.ts` | Escape cancels fill drag without losing redo and permits a fresh drag at 1280px |
| FILL-039 | pointercancel 中断填充后重试（DOM 事件） | `editing/fill-handle-cancellation.spec.ts` | pointercancel cancels fill drag without losing redo and permits a fresh drag at 1280px |
| FILL-040 | 丢失真实指针捕获中断填充后重试 | `editing/fill-handle-cancellation.spec.ts` | lost pointer capture cancels fill drag without losing redo and permits a fresh drag at 1280px |
| FILL-041 | 窗口 blur 中断填充后重试（DOM 事件） | `editing/fill-handle-cancellation.spec.ts` | window blur cancels fill drag without losing redo and permits a fresh drag at 1280px |
| FILL-042 | Ctrl+D 向下填充 | `editing/fill-shortcuts.spec.ts` | Control+d fills down through the focused grid with one undo at 1280px |
| FILL-043 | Command+D 向下填充 | `editing/fill-shortcuts.spec.ts` | Meta+d fills down through the focused grid with one undo at 1280px |
| FILL-044 | Ctrl+R 向右填充 | `editing/fill-shortcuts.spec.ts` | Control+r fills right through the focused grid with one undo at 1280px |
| FILL-045 | Command+R 向右填充 | `editing/fill-shortcuts.spec.ts` | Meta+r fills right through the focused grid with one undo at 1280px |
| FILL-046 | 填充柄靠近上边持续自动滚动 | `editing/fill-handle-reverse-scroll.spec.ts` | holding fill handle at top edge keeps scrolling without writing at 1280px |
| FILL-047 | 填充柄靠近左边持续自动滚动 | `editing/fill-handle-reverse-scroll.spec.ts` | holding fill handle at left edge keeps scrolling without writing at 1280px |
| FILL-048 | 冻结行源拖填到滚动区 | `editing/fill-handle.spec.ts` | frozen row source has one handle and can fill into the scrolling body |
| FILL-049 | 无效列表及原生拒绝后纠正 | `editing/custom-fill-lists.spec.ts` | invalid presets and native source rejection keep drafts retryable |
| FILL-050 | 拒绝非法序列几何及数量 | `editing/fill-series.spec.ts` | invalid geometry and count never allocate native history |
| FILL-051 | Ctrl 双击填充柄遵守平台语义（Mac 右键不写入） | `editing/fill-double-copy.spec.ts` | Control double-click obeys platform copy semantics in one native fill at 1280px |
| FILL-052 | Command 双击填充柄强制复制 | `editing/fill-double-copy.spec.ts` | Meta double-click obeys platform copy semantics in one native fill at 1280px |
| FILL-053 | 强制复制矩阵样本 | `editing/fill-matrix.spec.ts` | forced matrix copy repeats samples instead of inferring each column |
| FILL-054 | 无相邻连续数据拒绝后重新填充 | `editing/fill-double-click.spec.ts` | no adjacent continuation does not write and another source can fill afterwards |
| FILL-055 | 合并目标拒绝后拆分重试 | `editing/fill-double-click.spec.ts` | merged destination rejects atomically and succeeds after unmerge |
| FILL-056 | 双击使用右邻数据且在首个空隙停止 | `editing/fill-double-click.spec.ts` | right-neighbor fallback extends a numeric source only to the first gap |
| FONT-001 | 粗体 | `format/text-style.spec.ts` | Bold toggles the selected Rust cell style |
| FONT-002 | 斜体 | `format/text-style.spec.ts` | Italic toggles the selected Rust cell style |
| FONT-003 | 下划线 | `format/text-style.spec.ts` | Underline toggles the selected Rust cell style |
| FONT-004 | 删除线 | `format/text-style.spec.ts` | Strikethrough toggles the selected Rust cell style |
| FONT-005 | 字体族 | `format/text-layout.spec.ts` | font family is written through Rust and reflected by the ribbon |
| FONT-006 | 字号 | `format/text-layout.spec.ts` | font size is written through Rust and reflected by the ribbon |
| FONT-007 | 大字只撑高所在行 | `format/text-layout.spec.ts` | a 36px cell font grows only its own row |
| FONT-008 | 自动换行 | `format/text-layout.spec.ts` | wrap text toggles the selected Rust cell style |
| FONT-009 | 增加缩进 | `format/text-layout.spec.ts` | increase indent preserves text and undoes once at 1280px |
| FONT-010 | 自定义字号 | `format/font-size-controls.spec.ts` | custom size grows only its row, preserves other styles and undoes with the row height |
| FONT-011 | 增大字号 | `format/font-size-controls.spec.ts` | Increase font size changes only the target and undoes once at 1280px |
| FONT-012 | 减小字号 | `format/font-size-controls.spec.ts` | Decrease font size changes only the target and undoes once at 1280px |
| FONT-013 | 减小缩进 | `format/text-layout.spec.ts` | decrease indent uses the seeded value and undoes once at 1280px |
| FONT-014 | 取消自定义字号草稿 | `format/font-size-recovery.spec.ts` | Cancel custom font size discards draft and preserves redo at 1280px |
| FONT-015 | Escape 丢弃自定义字号草稿 | `format/font-size-recovery.spec.ts` | Escape custom font size discards draft and preserves redo at 1280px |
| FONT-016 | 非法字号纠正重试及行高恢复 | `format/font-size-recovery.spec.ts` | invalid custom font size retries once and restores row geometry on undo at 1280px |
| FONT-017 | 打开自定义字号弹窗 | `format/font-size-recovery.spec.ts` | Open custom font dialog keeps focus and does not write at 1280px |
| FONT-018 | 自定义字号正向焦点循环 | `format/font-size-recovery.spec.ts` | Tab custom font dialog keeps focus and does not write at 1280px |
| FONT-019 | 自定义字号反向焦点循环 | `format/font-size-recovery.spec.ts` | Shift+Tab custom font dialog keeps focus and does not write at 1280px |
| FONT-020 | 增大字号原生写入失败后重试 | `format/font-size-controls.spec.ts` | failed Increase stays readable and retries at 390px |
| FONT-021 | 减小字号原生写入失败后重试 | `format/font-size-controls.spec.ts` | failed Decrease stays readable and retries at 390px |
| FONT-022 | 字号提交中禁用编辑和取消 | `format/font-size-controls.spec.ts` | pending custom size disables editing and cancellation until the native response |
| STYLE-001 | 快捷应用填充颜色 | `format/cell-appearance.spec.ts` | Fill color reapplies the last color and No fill clears it explicitly |
| STYLE-002 | 快捷应用文字颜色 | `format/cell-appearance.spec.ts` | Text color reapplies the last color and Automatic clears it explicitly |
| STYLE-003 | 水平居中 | `format/cell-appearance.spec.ts` | horizontal center is an independent undoable choice at 1280px |
| STYLE-004 | 垂直居中 | `format/cell-appearance.spec.ts` | vertical center is an independent undoable choice at 1280px |
| STYLE-005 | 文字旋转 45° | `format/cell-appearance.spec.ts` | rotation 45 preserves cell data and undoes once at 1280px |
| STYLE-006 | 水平左对齐 | `format/cell-appearance.spec.ts` | horizontal left is an independent undoable choice at 1280px |
| STYLE-007 | 水平右对齐 | `format/cell-appearance.spec.ts` | horizontal right is an independent undoable choice at 1280px |
| STYLE-008 | 垂直顶端对齐 | `format/cell-appearance.spec.ts` | vertical top is an independent undoable choice at 1280px |
| STYLE-009 | 垂直底端对齐 | `format/cell-appearance.spec.ts` | vertical bottom is an independent undoable choice at 1280px |
| STYLE-010 | 自动水平对齐 | `format/text-layout-controls.spec.ts` | automatic alignment uses native types and explicit alignment remains undoable |
| STYLE-011 | 默认垂直对齐 | `format/text-layout-controls.spec.ts` | default vertical alignment clears only the seeded alignment at 1280px |
| STYLE-012 | 取消文字旋转 | `format/text-layout-controls.spec.ts` | rotation off clears the seeded angle in one undoable operation at 1280px |
| STYLE-013 | 文字旋转 -90° | `format/cell-appearance.spec.ts` | rotation -90 preserves cell data and undoes once at 1280px |
| STYLE-014 | 文字旋转 -45° | `format/cell-appearance.spec.ts` | rotation -45 preserves cell data and undoes once at 1280px |
| STYLE-015 | 文字旋转 90° | `format/cell-appearance.spec.ts` | rotation 90 preserves cell data and undoes once at 1280px |
| STYLE-016 | 竖排文字 | `format/cell-appearance.spec.ts` | rotation vertical preserves cell data and undoes once at 1280px |
| STYLE-017 | 恢复无填充 | `format/color-palette.spec.ts` | No fill resets the seeded color in one step at 1280px |
| STYLE-018 | 恢复自动文字色 | `format/color-palette.spec.ts` | Automatic text color resets the seeded color in one step at 1280px |
| STYLE-019 | 色板填充预设色 | `format/color-application.spec.ts` | fill preset color preserves other fields and undoes once at 1280px |
| STYLE-020 | 色板文字预设色 | `format/color-application.spec.ts` | text preset color preserves other fields and undoes once at 1280px |
| STYLE-021 | 自定义填充 Hex 颜色 | `format/color-application.spec.ts` | fill hex color preserves other fields and undoes once at 1280px |
| STYLE-022 | 自定义文字 Hex 颜色 | `format/color-application.spec.ts` | text hex color preserves other fields and undoes once at 1280px |
| STYLE-023 | 原生填充颜色控件 | `format/color-application.spec.ts` | fill picker color preserves other fields and undoes once at 1280px |
| STYLE-024 | 原生文字颜色控件 | `format/color-application.spec.ts` | text picker color preserves other fields and undoes once at 1280px |
| STYLE-025 | 关闭按钮丢弃色板草稿 | `format/color-palette.spec.ts` | close fill palette discards the draft without history at 1280px |
| STYLE-026 | 点击遮罩丢弃色板草稿 | `format/color-palette.spec.ts` | backdrop dismisses fill palette without writes at 1280px |
| STYLE-027 | Escape 丢弃色板草稿 | `format/color-palette.spec.ts` | palette stays inside 1280px, traps keyboard focus and Escape returns to trigger |
| STYLE-028 | 打开填充色板 | `format/palette-dialog.spec.ts` | Open fill palette preserves native formulas colors and redo at 1280px |
| STYLE-029 | 填充色板 Tab 循环 | `format/palette-dialog.spec.ts` | Tab fill palette preserves native formulas colors and redo at 1280px |
| STYLE-030 | 填充色板 Shift+Tab 循环 | `format/palette-dialog.spec.ts` | Shift+Tab fill palette preserves native formulas colors and redo at 1280px |
| STYLE-031 | 打开文字色板 | `format/palette-dialog.spec.ts` | Open text palette preserves native formulas colors and redo at 1280px |
| STYLE-032 | 文字色板 Tab 循环 | `format/palette-dialog.spec.ts` | Tab text palette preserves native formulas colors and redo at 1280px |
| STYLE-033 | 文字色板 Shift+Tab 循环 | `format/palette-dialog.spec.ts` | Shift+Tab text palette preserves native formulas colors and redo at 1280px |
| STYLE-034 | 关闭布局错误提示 | `format/layout-recovery.spec.ts` | dismiss layout error preserves native format formula and redo at 1280px |
| STYLE-035 | 布局原生写入拒绝后重试 | `format/text-layout-controls.spec.ts` | native rejection is visible and a retry creates only one undo entry |
| STYLE-036 | 布局提交中禁用重复操作 | `format/text-layout-controls.spec.ts` | pending native layout disables all three choices and makes one undo entry |
| NUM-001 | 数值格式设置 | `format/number-format-settings.spec.ts` | number settings preserve formulas and apply grouping and precision in one history entry |
| NUM-002 | 百分比格式设置 | `format/number-format-settings.spec.ts` | percent settings change display only, retain raw number and integrate with precision buttons |
| NUM-003 | 货币格式设置 | `format/number-format-settings.spec.ts` | currency uses the chosen literal symbol or none without dropping bold or raw precision |
| NUM-004 | 科学计数格式 | `format/advanced-number-formats.spec.ts` | scientific half-up precision preserves formulas and supports decimal shortcuts |
| NUM-005 | 分数格式 | `format/advanced-number-formats.spec.ts` | fractions use precision or fixed denominators, retain the value and undo one write |
| NUM-006 | 时间及累计时长格式 | `format/advanced-number-formats.spec.ts` | time displays day fractions, clock rollover and elapsed hours without changing values |
| NUM-007 | 百分比格式快捷按钮 | `format/number-format.spec.ts` | percent format is stored and rendered through Rust |
| NUM-008 | 货币格式快捷按钮 | `format/number-format.spec.ts` | currency format is stored and rendered through Rust |
| NUM-009 | 千分位格式快捷按钮 | `format/number-format.spec.ts` | thousands format is stored and rendered through Rust |
| NUM-010 | 增加小数位快捷按钮 | `format/number-precision.spec.ts` | Increase decimal places is independent and undoes once at 1280px |
| NUM-011 | 减少小数位快捷按钮 | `format/number-precision.spec.ts` | Decrease decimal places is independent and undoes once at 1280px |
| NUM-012 | 恢复常规数字格式 | `format/number-precision.spec.ts` | General format is independent and undoes once at 1280px |
| NUM-013 | 日期格式快捷按钮 | `format/number-format-session.spec.ts` | date shortcut replaces only the seeded pattern and undoes once at 1280px |
| NUM-014 | 日期样式设置 | `format/number-format-session.spec.ts` | date preview does not write until Apply and one undo restores the old display |
| NUM-015 | 文本格式设置 | `format/number-format-session.spec.ts` | Text does not convert an existing formula but subsequent input stays literal |
| NUM-016 | 打开数字格式并回读原生设置 | `format/number-format-dialog.spec.ts` | Open number settings keeps the native format formula and redo at 1280px |
| NUM-017 | 取消数字格式草稿 | `format/number-format-dialog.spec.ts` | Cancel number settings keeps the native format formula and redo at 1280px |
| NUM-018 | Escape 丢弃数字格式草稿 | `format/number-format-dialog.spec.ts` | Escape number settings keeps the native format formula and redo at 1280px |
| NUM-019 | 数字格式 Tab 焦点循环 | `format/number-format-dialog.spec.ts` | Tab number settings keeps the native format formula and redo at 1280px |
| NUM-020 | 数字格式 Shift+Tab 焦点循环 | `format/number-format-dialog.spec.ts` | Shift+Tab number settings keeps the native format formula and redo at 1280px |
| NUM-021 | 非法小数位原地纠正 | `format/number-format-validation.spec.ts` | invalid decimal places correct in the same draft with one native undo at 1280px |
| NUM-022 | 原生拒绝后保留数字格式重试 | `format/number-format-feedback.spec.ts` | native rejection retains number settings, fits 390px and retries as one history entry |
| NUM-023 | 数字格式处理中阻止重复及取消 | `format/number-format-feedback.spec.ts` | pending format blocks duplicate apply, draft edits and cancellation until Rust responds |
| NUM-024 | 空白文本错误值只读预览 | `format/number-format-session.spec.ts` | preview reads blank, text and formula errors without inventing a sample or writing |
| BORDER-001 | 外边框 | `format/border-settings.spec.ts` | outside uses selection edges, not every cell perimeter |
| BORDER-002 | 内边框 | `format/border-settings.spec.ts` | inside uses selection edges, not every cell perimeter |
| BORDER-003 | 所有边框 | `format/border-settings.spec.ts` | all uses selection edges, not every cell perimeter |
| BORDER-004 | 内部水平边框 | `format/border-settings.spec.ts` | horizontal uses selection edges, not every cell perimeter |
| BORDER-005 | 内部垂直边框 | `format/border-settings.spec.ts` | vertical uses selection edges, not every cell perimeter |
| BORDER-006 | 上边框 | `format/border-settings.spec.ts` | top uses selection edges, not every cell perimeter |
| BORDER-007 | 右边框 | `format/border-settings.spec.ts` | right uses selection edges, not every cell perimeter |
| BORDER-008 | 下边框 | `format/border-settings.spec.ts` | bottom uses selection edges, not every cell perimeter |
| BORDER-009 | 左边框 | `format/border-settings.spec.ts` | left uses selection edges, not every cell perimeter |
| BORDER-010 | 清除边框 | `format/border-settings.spec.ts` | none uses selection edges, not every cell perimeter |
| BORDER-011 | 细线边框 | `format/border-settings.spec.ts` | thin border has exact width and one undo step at 1280px |
| BORDER-012 | 中线边框 | `format/border-settings.spec.ts` | medium border has exact width and one undo step at 1280px |
| BORDER-013 | 粗线边框 | `format/border-settings.spec.ts` | thick border has exact width and one undo step at 1280px |
| BORDER-014 | 虚线边框 | `format/border-settings.spec.ts` | dashed border has exact width and one undo step at 1280px |
| BORDER-015 | 点线边框 | `format/border-settings.spec.ts` | dotted border has exact width and one undo step at 1280px |
| BORDER-016 | 双线边框 | `format/border-settings.spec.ts` | double border has exact width and one undo step at 1280px |
| BORDER-017 | 快捷开关全部边框 | `format/cell-appearance.spec.ts` | Borders toggles thin borders through Rust |
| BORDER-018 | 预设边框颜色 | `format/border-colors.spec.ts` | border palette color commits one native edge and undoes once at 1280px |
| BORDER-019 | Hex 边框颜色 | `format/border-colors.spec.ts` | border Hex color commits one native edge and undoes once at 1280px |
| BORDER-020 | 原生颜色控件设置边框颜色 | `format/border-colors.spec.ts` | border native color color commits one native edge and undoes once at 1280px |
| BORDER-021 | 取消边框草稿 | `format/border-recovery.spec.ts` | Cancel border settings discards invalid draft and preserves redo at 1280px |
| BORDER-022 | Escape 丢弃边框草稿 | `format/border-recovery.spec.ts` | Escape border settings discards invalid draft and preserves redo at 1280px |
| BORDER-023 | 非法边框 Hex 拒绝后纠正重试 | `format/border-recovery.spec.ts` | invalid border Hex stays correctable and commits only the valid retry at 1280px |
| BORDER-024 | 打开边框设置回读原生线型与颜色 | `format/border-dialog.spec.ts` | Open border dialog preserves native settings and selection at 1280px |
| BORDER-025 | 边框弹窗正向焦点循环 | `format/border-dialog.spec.ts` | Tab border dialog preserves native settings and selection at 1280px |
| BORDER-026 | 边框弹窗反向焦点循环 | `format/border-dialog.spec.ts` | Shift+Tab border dialog preserves native settings and selection at 1280px |
| CF-001 | 新增条件格式规则 | `format/conditional-rule-lifecycle.spec.ts` | adding a conditional rule changes only its applied cells at 1280px |
| CF-002 | 修改条件格式规则 | `format/conditional-rule-lifecycle.spec.ts` | editing a seeded conditional rule keeps one rule and one undo step at 1280px |
| CF-003 | 删除条件格式规则 | `format/conditional-rule-lifecycle.spec.ts` | deleting a seeded conditional rule preserves other rules at 1280px |
| CF-004 | 启用条件格式规则 | `format/conditional-rule-management.spec.ts` | enable one conditional rule without changing priority at 1280px |
| CF-005 | 停用条件格式规则 | `format/conditional-rule-management.spec.ts` | disable one conditional rule without deleting it at 1280px |
| CF-006 | 复制条件格式规则 | `format/conditional-rule-management.spec.ts` | copy a conditional rule preserves its disabled state at 1280px |
| CF-007 | 条件格式规则上移 | `format/conditional-rule-management.spec.ts` | move a conditional rule up changes only its priority at 1280px |
| CF-008 | 条件格式规则下移 | `format/conditional-rule-management.spec.ts` | move a conditional rule down changes only its priority at 1280px |
| CF-009 | 重置条件格式新规则草稿 | `format/conditional-rule-management.spec.ts` | new conditional rule resets an edited draft without writing at 1280px |
| CF-010 | 文本条件格式包含 | `format/conditional-text-duplicates.spec.ts` | text contains uses real values and native rejection preserves the draft |
| CF-011 | 文本条件格式不包含 | `format/conditional-text-duplicates.spec.ts` | text not-contains uses real values and native rejection preserves the draft |
| CF-012 | 文本条件格式开头是 | `format/conditional-text-duplicates.spec.ts` | text begins-with uses real values and native rejection preserves the draft |
| CF-013 | 文本条件格式结尾是 | `format/conditional-text-duplicates.spec.ts` | text ends-with uses real values and native rejection preserves the draft |
| CF-014 | 重复值条件格式 | `format/conditional-text-duplicates.spec.ts` | duplicate values ignores text case but keeps spaces in one undo at 1280px |
| CF-015 | 唯一值条件格式 | `format/conditional-text-duplicates.spec.ts` | unique values changes the seeded rule and undoes once at 1280px |
| CF-016 | 条件命中后停止低优先规则 | `format/conditional-text-duplicates.spec.ts` | Stop blocks lower data bars without removing numbers or base styles |
| CF-017 | 混合引用公式条件格式 | `format/conditional-formula-rank.spec.ts` | formula condition uses mixed references and undoes once at 1280px |
| CF-018 | 条件排名前 N 项 | `format/conditional-ranking.spec.ts` | top items conditional ranking undoes once at 1280px |
| CF-019 | 条件排名前百分比 | `format/conditional-ranking.spec.ts` | top percent conditional ranking undoes once at 1280px |
| CF-020 | 条件排名后 N 项 | `format/conditional-ranking.spec.ts` | bottom items conditional ranking undoes once at 1280px |
| CF-021 | 条件排名后百分比 | `format/conditional-ranking.spec.ts` | bottom percent conditional ranking undoes once at 1280px |
| CF-022 | 双色阶条件格式 | `format/conditional-visuals.spec.ts` | 2-color scale applies independently and undoes once at 1280px |
| CF-023 | 三色阶条件格式 | `format/conditional-visuals.spec.ts` | 3-color scale applies independently and undoes once at 1280px |
| CF-024 | 正负数据条条件格式 | `format/conditional-visuals.spec.ts` | data bar applies independently and undoes once at 1280px |
| CF-025 | 数值条件大于 | `format/conditional-value-comparisons.spec.ts` | gt conditional value matches its boundary and undoes once at 1280px |
| CF-026 | 数值条件小于 | `format/conditional-value-comparisons.spec.ts` | lt conditional value matches its boundary and undoes once at 1280px |
| CF-027 | 数值条件等于 | `format/conditional-value-comparisons.spec.ts` | eq conditional value matches its boundary and undoes once at 1280px |
| CF-028 | 数值条件不等于 | `format/conditional-value-comparisons.spec.ts` | ne conditional value matches its boundary and undoes once at 1280px |
| CF-029 | 数值条件大于等于 | `format/conditional-value-comparisons.spec.ts` | gte conditional value matches its boundary and undoes once at 1280px |
| CF-030 | 数值条件小于等于 | `format/conditional-value-comparisons.spec.ts` | lte conditional value matches its boundary and undoes once at 1280px |
| CF-031 | 数值条件介于（含边界） | `format/conditional-value-comparisons.spec.ts` | between conditional value matches its boundary and undoes once at 1280px |
| CF-032 | 数值条件不介于（不含边界） | `format/conditional-value-comparisons.spec.ts` | not-between conditional value matches its boundary and undoes once at 1280px |
| CF-033 | 取消条件规则草稿 | `format/conditional-rule-lifecycle.spec.ts` | cancel conditional rule discards its range value and color draft at 1280px |
| CF-034 | Escape 丢弃条件规则草稿 | `format/conditional-format.spec.ts` | invalid input stays correctable; Escape does not create a rule or history |
| CF-035 | 条件格式文字颜色 | `format/conditional-rule-lifecycle.spec.ts` | conditional text color keeps fill and undoes once at 1280px |
| CF-036 | 条件规则越界范围纠正重试 | `format/conditional-rule-lifecycle.spec.ts` | out-of-sheet conditional range can retry without partial writes at 1280px |
| CF-037 | 打开条件格式管理面板 | `format/conditional-dialog.spec.ts` | Open conditional dialog preserves native rules colors and redo at 1280px |
| CF-038 | 条件格式面板 Tab 循环 | `format/conditional-dialog.spec.ts` | Tab conditional dialog preserves native rules colors and redo at 1280px |
| CF-039 | 条件格式面板 Shift+Tab 循环 | `format/conditional-dialog.spec.ts` | Shift+Tab conditional dialog preserves native rules colors and redo at 1280px |
| PAINT-001 | 单击格式刷后点击目标 | `format/format-painter.spec.ts` | single paint copies seeded bold, retains target content, exits and undoes once |
| PAINT-002 | 格式刷拖拽平铺异构格式 | `format/format-painter.spec.ts` | drag paints a tiled heterogeneous source range without replacing values |
| PAINT-003 | 双击开启连续格式刷 | `format/format-painter.spec.ts` | double click paints multiple targets from one snapshot; Escape stops subsequent clicks |
| PAINT-004 | Enter 应用格式刷到当前选区 | `format/format-painter.spec.ts` | number format paints a formula result without changing the formula |
| PAINT-005 | 再点格式刷按钮退出 | `format/format-painter.spec.ts` | clicking the active button cancels without painting or adding history |
| PAINT-006 | Escape 退出格式刷 | `format/format-painter.spec.ts` | Escape cancels with focus on another toolbar button or in the name box |
| PAINT-007 | 格式刷目标尺寸错误纠正 | `format/format-painter.spec.ts` | mismatched target fails without partial paint and can retry at 1280px |
| SIZE-001 | 设置行高 | `format/selection-sizes.spec.ts` | row height affects selected rows only and preserves formulas and style |
| SIZE-002 | 设置列宽 | `format/selection-sizes.spec.ts` | column width aligns headers, selection outline and cell editor |
| SIZE-003 | 恢复所选行列尺寸 | `format/selection-sizes.spec.ts` | reset restores defaults only for selected rows and columns |
| SIZE-004 | 自动适应列宽 | `format/auto-fit.spec.ts` | double-click fits a column to styled offscreen content, with one undo and redo |
| SIZE-005 | 拖拽行高 | `format/resize-drag.spec.ts` | drag row previews one boundary and undo restores its native size |
| SIZE-006 | 隐藏行 | `format/visibility.spec.ts` | hidden rows collapse without gaps, navigation skips them and undo restores seed data |
| SIZE-007 | 隐藏列 | `format/visibility.spec.ts` | hidden columns collapse and cell editor stays aligned after arrow and Tab navigation |
| SIZE-008 | 恢复选中范围隐藏行列 | `format/visibility.spec.ts` | unhide selected range preserves unrelated hidden rows and columns |
| SIZE-009 | 全部隐藏后恢复 | `format/visibility.spec.ts` | all hidden axes remain recoverable from the toolbar |
| SIZE-010 | 拖拽列宽 | `format/resize-drag.spec.ts` | drag column previews one boundary and undo restores its native size |
| SIZE-011 | Enter 自动适应行高 | `format/auto-fit.spec.ts` | Enter fits a row to multiline Chinese content and restores grid focus |
| SIZE-012 | 双击自动适应行高 | `format/auto-fit.spec.ts` | frozen headers stay clickable after scrolling to an automatic row fit |
| SIZE-013 | 行高向上键缩小十像素 | `format/resize-keyboard.spec.ts` | resize row ArrowUp changes exactly ten pixels with one undo at 1280px |
| SIZE-014 | 行高向下键增大十像素 | `format/resize-keyboard.spec.ts` | resize row ArrowDown changes exactly ten pixels with one undo at 1280px |
| SIZE-015 | 列宽向左键缩小十像素 | `format/resize-keyboard.spec.ts` | resize column ArrowLeft changes exactly ten pixels with one undo at 1280px |
| SIZE-016 | 列宽向右键增大十像素 | `format/resize-keyboard.spec.ts` | resize column ArrowRight changes exactly ten pixels with one undo at 1280px |
| SIZE-017 | Escape 取消尺寸拖拽 | `format/resize-cancellation.spec.ts` | Escape cancels resize without writing and a new drag still works at 1280px |
| SIZE-018 | 窗口 blur 取消尺寸拖拽（DOM 事件） | `format/resize-cancellation.spec.ts` | window blur cancels resize without writing and a new drag still works at 1280px |
| SIZE-019 | Enter 自动适应列宽 | `format/auto-fit-entries.spec.ts` | Enter fits a column to styled offscreen content with one undo at 1280px |
| SIZE-020 | 取消尺寸草稿 | `format/size-dialog-recovery.spec.ts` | Cancel discards size drafts and preserves native redo at 1280px |
| SIZE-021 | Escape 丢弃尺寸草稿 | `format/size-dialog-recovery.spec.ts` | Escape discards size drafts and preserves native redo at 1280px |
| SIZE-022 | 打开尺寸设置回读原生值 | `format/size-dialog-validation.spec.ts` | open size dialog reads native dimensions without mutation at 1280px |
| SIZE-023 | 非法行高纠正重试 | `format/size-dialog-validation.spec.ts` | invalid row size can correct without partial writes at 1280px |
| SIZE-024 | 非法列宽纠正重试 | `format/size-dialog-validation.spec.ts` | invalid column size can correct without partial writes at 1280px |
| SIZE-025 | 尺寸设置 Tab 焦点循环 | `format/size-dialog-interaction.spec.ts` | Tab size dialog cycles focus without writing at 1280px |
| SIZE-026 | 尺寸设置 Shift+Tab 焦点循环 | `format/size-dialog-interaction.spec.ts` | Shift+Tab size dialog cycles focus without writing at 1280px |
| SIZE-027 | 尺寸发送失败原地重试 | `format/size-dialog-interaction.spec.ts` | size transport failure retries the same draft with one undo at 1280px |
| SHEET-001 | 新增工作表 | `workbook/sheet-tabs.spec.ts` | new sheet is blank, editable and uses the existing Worker |
| SHEET-002 | 切换工作表 | `workbook/sheet-tabs.spec.ts` | seed summary reads the same Rust workbook and sheet switching keeps values isolated |
| SHEET-003 | Enter 提交工作表名 | `workbook/sheet-tabs.spec.ts` | rename retargets cross-sheet formulas and later source edits still recalculate |
| SHEET-004 | 向右移动工作表 | `workbook/sheet-movement.spec.ts` | move sheet right preserves identity and undoes once at 1280px |
| SHEET-005 | 删除工作表 | `workbook/sheet-structure.spec.ts` | deletes active sheet, chooses the neighbor, and rejects deleting the last sheet |
| SHEET-006 | 切表恢复视图 | `workbook/sheet-view-memory.spec.ts` | sheet tabs restore selection and both scroll axes at 1280px |
| SHEET-007 | 上一张工作表按钮（桌面入口） | `workbook/sheet-entries.spec.ts` | Previous sheet button switches the native sheet without history at 1280px |
| SHEET-008 | 下一张工作表按钮（桌面入口） | `workbook/sheet-entries.spec.ts` | Next sheet button switches the native sheet without history at 1280px |
| SHEET-009 | 按钮打开重命名 | `workbook/sheet-entries.spec.ts` | rename button opens a selected native name without mutation at 1280px |
| SHEET-010 | 双击标签打开重命名 | `workbook/sheet-rename-entries.spec.ts` | double click opens sheet rename without mutation at 1280px |
| SHEET-011 | F2 打开工作表重命名 | `workbook/sheet-rename-entries.spec.ts` | F2 opens sheet rename without mutation at 1280px |
| SHEET-012 | Save 提交工作表名 | `workbook/sheet-rename-entries.spec.ts` | Save sheet name rewrites references and undoes once at 1280px |
| SHEET-013 | 取消工作表名草稿 | `workbook/sheet-rename-recovery.spec.ts` | Cancel discards a sheet name draft and retains redo at 1280px |
| SHEET-014 | Escape 丢弃工作表名草稿 | `workbook/sheet-rename-recovery.spec.ts` | Escape discards a sheet name draft and retains redo at 1280px |
| SHEET-015 | 工作表重名纠正重试 | `workbook/sheet-rename-recovery.spec.ts` | duplicate sheet name can correct without partial rename at 1280px |
| SHEET-016 | 工作表名非法字符纠正 | `workbook/sheet-rename-recovery.spec.ts` | invalid characters sheet name can correct without partial rename at 1280px |
| SHEET-017 | 空工作表名纠正 | `workbook/sheet-rename-recovery.spec.ts` | empty sheet name can correct without partial rename at 1280px |
| SHEET-018 | 超长工作表名纠正 | `workbook/sheet-rename-recovery.spec.ts` | too long sheet name can correct without partial rename at 1280px |
| SHEET-019 | 保留工作表名纠正 | `workbook/sheet-rename-recovery.spec.ts` | reserved sheet name can correct without partial rename at 1280px |
| SHEET-020 | 向左移动工作表 | `workbook/sheet-movement.spec.ts` | move sheet left preserves identity and undoes once at 1280px |
| SHEET-021 | 打开删除工作表确认 | `workbook/sheet-delete-recovery.spec.ts` | Open delete confirmation preserves cells and redo at 1280px |
| SHEET-022 | 取消删除工作表 | `workbook/sheet-delete-recovery.spec.ts` | Cancel delete confirmation preserves cells and redo at 1280px |
| SHEET-023 | Escape 放弃删除工作表 | `workbook/sheet-delete-recovery.spec.ts` | Escape delete confirmation preserves cells and redo at 1280px |
| SHEET-024 | 删除确认 Tab 焦点循环 | `workbook/sheet-delete-recovery.spec.ts` | Tab delete confirmation preserves cells and redo at 1280px |
| SHEET-025 | 删除确认 Shift+Tab 焦点循环 | `workbook/sheet-delete-recovery.spec.ts` | Shift+Tab delete confirmation preserves cells and redo at 1280px |
| SHEET-026 | 删除传输失败原地重试 | `workbook/sheet-delete-retry.spec.ts` | delete transport failure retries in the same confirmation with one undo at 1280px |
| TABLE-001 | 创建 Table | `workbook/tables.spec.ts` | create a table preserves its source and undoes once at 1280px |
| TABLE-002 | Table 重命名 | `workbook/tables.spec.ts` | rename a seeded table rewrites only its references at 1280px |
| TABLE-003 | Table 转普通区域 | `workbook/tables.spec.ts` | convert a seeded table keeps data and visible formatting at 1280px |
| TABLE-004 | 面板重命名 Table 列 | `workbook/table-columns.spec.ts` | panel column rename updates header, formulas and totals in one undo step |
| TABLE-005 | 格内编辑 Table 表头 | `workbook/table-columns.spec.ts` | direct cell header edit shares column history |
| TABLE-006 | 公式栏编辑 Table 表头 | `workbook/table-columns.spec.ts` | direct formula header edit shares column history |
| TABLE-007 | 调整 Table 范围 | `workbook/table-resize.spec.ts` | resizing moves totals, adds a native column and keeps one undo step |
| TABLE-008 | Table 添加数据行 | `workbook/table-append-row.spec.ts` | new seed table records inherit calculated formulas with one undo |
| TABLE-009 | 重置 Table 新建草稿 | `workbook/tables.spec.ts` | new table discards an existing draft without writing at 1280px |
| TABLE-010 | 设置 Table 样式预设 | `workbook/table-style.spec.ts` | table preset green preserves values and undoes once at 1280px |
| TABLE-011 | Table 行条纹 | `workbook/table-style.spec.ts` | Banded rows changes independently and undoes once at 1280px |
| TABLE-012 | Table 首列强调 | `workbook/table-style.spec.ts` | First column emphasis changes independently and undoes once at 1280px |
| TABLE-013 | Table 列条纹 | `workbook/table-column-style.spec.ts` | Banded columns changes independently and undoes once at 1280px |
| TABLE-014 | Table 末列强调 | `workbook/table-column-style.spec.ts` | Last column emphasis changes independently and undoes once at 1280px |
| TABLE-015 | 隐藏 Table 表头 | `workbook/table-headers.spec.ts` | hide table headers preserves data and undoes once at 1280px |
| TABLE-016 | 显示 Table 表头 | `workbook/table-headers.spec.ts` | show table headers is one undoable action after hiding at 1280px |
| TABLE-017 | 显示 Table 汇总行 | `workbook/table-totals.spec.ts` | show totals uses the seeded table without totals and undoes once at 1280px |
| TABLE-018 | 隐藏 Table 汇总行 | `workbook/table-totals.spec.ts` | hide seeded totals preserves table data and undoes once at 1280px |
| TABLE-019 | Table 不汇总 | `workbook/table-total-functions.spec.ts` | total none preserves data and undoes once at 1280px |
| TABLE-020 | Table 汇总求和 | `workbook/table-total-functions.spec.ts` | total sum preserves data and undoes once at 1280px |
| TABLE-021 | Table 汇总平均值 | `workbook/table-total-functions.spec.ts` | total average preserves data and undoes once at 1280px |
| TABLE-022 | Table 汇总非空计数 | `workbook/table-total-functions.spec.ts` | total count preserves data and undoes once at 1280px |
| TABLE-023 | Table 汇总数值计数 | `workbook/table-total-functions.spec.ts` | total countNums preserves data and undoes once at 1280px |
| TABLE-024 | Table 汇总最大值 | `workbook/table-total-functions.spec.ts` | total max preserves data and undoes once at 1280px |
| TABLE-025 | Table 汇总最小值 | `workbook/table-total-functions.spec.ts` | total min preserves data and undoes once at 1280px |
| TABLE-026 | Table 汇总标准差 | `workbook/table-total-functions.spec.ts` | total stdDev preserves data and undoes once at 1280px |
| TABLE-027 | Table 汇总方差 | `workbook/table-total-functions.spec.ts` | total var preserves data and undoes once at 1280px |
| TABLE-028 | 已有 Table 表头输入遵守验证规则 | `workbook/table-header-validation.spec.ts` | existing table header rejects invalid input and preserves redo at 1280px |
| TABLE-029 | 自动扩列表头输入遵守验证规则 | `workbook/table-header-validation.spec.ts` | expanding table header rejects invalid input and preserves redo at 1280px |
| TABLE-030 | Table 表头筛选 | `workbook/table-filter.spec.ts` | table header filter excludes totals and undoes once at 1280px |
| TABLE-031 | 只清除目标 Table 筛选 | `workbook/table-filter.spec.ts` | a table filter coexists with another table and an ordinary region; clear affects only its target |
| TABLE-032 | 重新应用 Table 筛选 | `workbook/table-filter.spec.ts` | editing keeps the snapshot until reapply, and undo restores that snapshot before undoing the value |
| TABLE-033 | 清除 Table 单列筛选 | `workbook/table-filter.spec.ts` | clearing one table column preserves the other condition and header buttons |
| TABLE-034 | 取消 Table 筛选草稿 | `workbook/table-filter-recovery.spec.ts` | Cancel table filter discards value choices and preserves redo at 1280px |
| TABLE-035 | Escape 丢弃 Table 筛选草稿 | `workbook/table-filter-recovery.spec.ts` | Escape table filter discards value choices and preserves redo at 1280px |
| TABLE-036 | 打开 Table 目录面板 | `workbook/table-dialog.spec.ts` | Open Tables preserves native tables cell styles and redo at 1280px |
| TABLE-037 | Table 面板 Tab 循环 | `workbook/table-dialog.spec.ts` | Tab Tables preserves native tables cell styles and redo at 1280px |
| TABLE-038 | Table 面板 Shift+Tab 循环 | `workbook/table-dialog.spec.ts` | Shift+Tab Tables preserves native tables cell styles and redo at 1280px |
| TABLE-039 | 取消 Table 未提交草稿 | `workbook/table-dialog.spec.ts` | Cancel Tables preserves native tables cell styles and redo at 1280px |
| TABLE-040 | Escape 丢弃 Table 未提交草稿 | `workbook/table-dialog.spec.ts` | Escape Tables preserves native tables cell styles and redo at 1280px |
| TABLE-041 | Table 重叠范围在原面板纠正重试 | `workbook/table-recovery.spec.ts` | overlapping table corrects in the same panel before one native creation at 1280px |
| STRUCT-001 | 插入所选行 | `workbook/row-column-structure.spec.ts` | insert selected rows moves native cells, formulas and styles; undo and redo restore them |
| STRUCT-002 | 插入所选列 | `workbook/row-column-structure.spec.ts` | insert selected columns moves formulas and underline, and delete columns reverses the shift |
| STRUCT-003 | 删除所选行 | `workbook/row-column-structure.spec.ts` | delete rows removes data, exposes reference errors and undo restores cross-sheet values |
| STRUCT-004 | 删除所选列 | `workbook/row-column-structure.spec.ts` | delete columns works from the original seed with one undo at 1280px |
| FREEZE-001 | 冻结首行 | `workbook/freeze-ui.spec.ts` | freezes the first row while vertical scrolling and edits the fixed cells |
| FREEZE-002 | 冻结首列 | `workbook/freeze-ui.spec.ts` | freezes the first column while horizontal scrolling and keeps row headers aligned |
| FREEZE-003 | 按活动格冻结 | `workbook/freeze-ui.spec.ts` | freezes at B3 and follows keyboard moves below the fixed band with one undo |
| FREEZE-004 | 取消冻结 | `workbook/freeze-ui.spec.ts` | unfreeze uses the seeded panes and undoes once at 1280px |
| MERGE-001 | 确认合并单元格 | `workbook/merged-cells.spec.ts` | confirmed merge keeps its anchor and restores discarded values in one undo |
| MERGE-002 | 合并后居中 | `workbook/merged-cells.spec.ts` | merge and center has one outer frame and both editors use its anchor |
| MERGE-003 | 拆分合并单元格 | `workbook/merged-cells.spec.ts` | unmerge preserves the seeded anchor and other merges at 1280px |
| MERGE-004 | 取消合并确认 | `workbook/merge-dialog.spec.ts` | Cancel merge confirmation preserves content focus and redo at 1280px |
| MERGE-005 | Escape 放弃合并确认 | `workbook/merge-dialog.spec.ts` | Escape merge confirmation preserves content focus and redo at 1280px |
| MERGE-006 | 合并确认 Tab 焦点循环 | `workbook/merge-dialog.spec.ts` | Tab merge confirmation preserves content focus and redo at 1280px |
| MERGE-007 | 合并确认 Shift+Tab 焦点循环 | `workbook/merge-dialog.spec.ts` | Shift+Tab merge confirmation preserves content focus and redo at 1280px |
| MERGE-008 | 打开合并内容损失确认 | `workbook/merge-dialog.spec.ts` | Open merge confirmation preserves content focus and redo at 1280px |
| MERGE-009 | 合并确认发送失败重新确认 | `workbook/merge-retry.spec.ts` | confirmed merge transport failure requires a fresh confirmation and undoes once at 1280px |
| OUTLINE-001 | 创建行分组 | `workbook/outline-group-actions.spec.ts` | group rows creates only membership and undoes once at 1280px |
| OUTLINE-002 | 创建列分组 | `workbook/outline-group-actions.spec.ts` | group columns creates only membership and undoes once at 1280px |
| OUTLINE-003 | 嵌套分组 | `workbook/outline.spec.ts` | nested groups retain child collapse and partial overlaps fail without losing history |
| OUTLINE-004 | 取消行分组 | `workbook/outline-group-actions.spec.ts` | ungroup rows removes only membership and undoes once at 1280px |
| OUTLINE-005 | 取消列分组 | `workbook/outline-group-actions.spec.ts` | ungroup columns removes only membership and undoes once at 1280px |
| OUTLINE-006 | 全部折叠行分组 | `workbook/outline-bulk-actions.spec.ts` | collapse all row groups preserves manual hiding and undoes once at 1280px |
| OUTLINE-007 | 全部展开行分组 | `workbook/outline-bulk-actions.spec.ts` | expand all row groups preserves manual hiding and undoes once at 1280px |
| OUTLINE-008 | 全部折叠列分组 | `workbook/outline-bulk-actions.spec.ts` | collapse all column groups preserves manual hiding and undoes once at 1280px |
| OUTLINE-009 | 全部展开列分组 | `workbook/outline-bulk-actions.spec.ts` | expand all column groups preserves manual hiding and undoes once at 1280px |
| OUTLINE-010 | 侧边按钮折叠行分组 | `workbook/outline-toggle-actions.spec.ts` | row gutter collapse changes only its child group in one undo at 1280px |
| OUTLINE-011 | 侧边按钮展开行分组 | `workbook/outline-toggle-actions.spec.ts` | row gutter expand changes only its child group in one undo at 1280px |
| OUTLINE-012 | 侧边按钮折叠列分组 | `workbook/outline-toggle-actions.spec.ts` | column gutter collapse changes only its child group in one undo at 1280px |
| OUTLINE-013 | 侧边按钮展开列分组 | `workbook/outline-toggle-actions.spec.ts` | column gutter expand changes only its child group in one undo at 1280px |
| OUTLINE-014 | 行大纲第一级 | `workbook/outline-levels.spec.ts` | row outline level 1 applies the native nesting threshold in one undo at 1280px |
| OUTLINE-015 | 行大纲第二级 | `workbook/outline-levels.spec.ts` | row outline level 2 applies the native nesting threshold in one undo at 1280px |
| OUTLINE-016 | 行大纲第三级 | `workbook/outline-levels.spec.ts` | row outline level 3 applies the native nesting threshold in one undo at 1280px |
| OUTLINE-017 | 列大纲第一级 | `workbook/outline-levels.spec.ts` | column outline level 1 preserves manual hiding in one undo at 1280px |
| OUTLINE-018 | 列大纲第二级 | `workbook/outline-levels.spec.ts` | column outline level 2 preserves manual hiding in one undo at 1280px |
| OUTLINE-019 | 分组部分重叠拒绝后纠正重试 | `workbook/outline-recovery.spec.ts` | overlapping group rejection preserves redo and a corrected range commits once at 1280px |
| DATA-001 | 等值筛选工作表 | `editing/filter.spec.ts` | filter 1,000 rows through Rust, preserve header and source row numbers, undo/redo once |
| DATA-002 | 清除筛选 | `editing/filter.spec.ts` | clear filter preserves manually hidden rows and can be undone |
| DATA-003 | 重新应用筛选 | `editing/filter.spec.ts` | edit does not live-filter; reapply hides the changed row and undo restores the snapshot |
| DATA-004 | 升序排序 | `editing/sort.spec.ts` | ascending sort moves complete records and styles, with one undo/redo step |
| DATA-005 | 删除重复项 | `editing/remove-duplicates.spec.ts` | native seed removes matching records and restores once at 1280px |
| DATA-006 | 分隔符分列 | `editing/text-columns.spec.ts` | native delimited seed previews overwrite and undoes once at 1280px |
| DATA-007 | 固定宽度分列 | `editing/text-columns.spec.ts` | fixed-width seed uses Unicode positions and preserves leading zeros |
| DATA-008 | 分列字段类型 | `editing/text-column-types.spec.ts` | field types convert native seed and undo as one operation at 1280px |
| DATA-009 | 降序排序 | `editing/sort.spec.ts` | descending numeric sort is stable and a repeated sort creates no history step |
| DATA-010 | 自定义多级混合排序 | `editing/sort.spec.ts` | custom sort keeps the header and uses ordered, mixed-direction keys |
| DATA-011 | 排序区分大小写 | `editing/sort-options.spec.ts` | native seed sort case=true empty=last order=asc is stable and undoable |
| DATA-012 | 排序空白单元格排前 | `editing/sort-options.spec.ts` | native seed sort case=true empty=first order=asc is stable and undoable |
| DATA-013 | 排序空白单元格排后 | `editing/sort-options.spec.ts` | native seed sort case=false empty=last order=asc is stable and undoable |
| DATA-014 | 添加排序层级 | `editing/sort-levels.spec.ts` | add sort level changes tie ordering in one undo at 1280px |
| DATA-015 | 删除排序层级 | `editing/sort-levels.spec.ts` | remove sort level discards its key in one undo at 1280px |
| DATA-016 | 上移排序层级 | `editing/sort-levels.spec.ts` | move sort level up changes priority in one undo at 1280px |
| DATA-017 | 下移排序层级 | `editing/sort-levels.spec.ts` | move sort level down changes priority in one undo at 1280px |
| DATA-018 | 排序首行表头选项 | `editing/sort-options.spec.ts` | sort header option true controls first-row movement at 1280px |
| DATA-019 | 取消排序草稿 | `editing/sort-options.spec.ts` | cancel sort discards keys and options without history at 1280px |
| DATA-020 | Escape 丢弃排序草稿 | `editing/sort-options.spec.ts` | sort options and priority controls fit 1280px; cancel does not write |
| DATA-021 | 选择自定义排序列 | `editing/sort-options.spec.ts` | custom sort column changes the chosen key in one undo at 1280px |
| DATA-022 | 自定义排序升序 | `editing/sort-options.spec.ts` | custom sort order-asc changes the chosen key in one undo at 1280px |
| DATA-023 | 自定义排序降序 | `editing/sort-options.spec.ts` | custom sort order-desc changes the chosen key in one undo at 1280px |
| DATA-024 | 设置选区筛选范围 | `editing/filter-range.spec.ts` | enable bounded filter creates only its header buttons in one undo at 1280px |
| DATA-025 | 表头列筛选入口 | `editing/filter-range.spec.ts` | a bounded filter starts at its own header and never hides records outside its rectangle |
| DATA-026 | 清除单列筛选 | `editing/filter-range.spec.ts` | clear one column filter preserves the other condition and undoes once at 1280px |
| DATA-027 | 包含文字筛选 | `editing/filter-conditions.spec.ts` | filter contains independently preserves sources and undoes once at 1280px |
| DATA-028 | 数值区间筛选 | `editing/filter-conditions.spec.ts` | filter range independently preserves sources and undoes once at 1280px |
| DATA-029 | 值列表筛选 | `editing/filter-conditions.spec.ts` | filter list independently preserves sources and undoes once at 1280px |
| DATA-030 | 筛选区分大小写 | `editing/filter-conditions.spec.ts` | filter match case toggles exact matching without changing source data at 1280px |
| DATA-031 | 添加筛选条件 | `editing/filter-conditions.spec.ts` | add filter condition intersects columns and undoes once at 1280px |
| DATA-032 | 移除筛选条件 | `editing/filter-conditions.spec.ts` | remove filter condition preserves the remaining column and undoes once at 1280px |
| DATA-033 | 取消筛选草稿 | `editing/filter-recovery.spec.ts` | Cancel filter discards draft conditions and preserves redo at 1280px |
| DATA-034 | Escape 丢弃筛选草稿 | `editing/filter-recovery.spec.ts` | Escape filter discards draft conditions and preserves redo at 1280px |
| DATA-035 | 非法筛选区间纠正重试 | `editing/filter-recovery.spec.ts` | invalid filter bounds stay correctable and commit only the corrected range at 1280px |
| DATA-036 | 展开筛选候选值 | `workbook/filter-value-controls.spec.ts` | choose filter values loads exact native candidates without history at 1280px |
| DATA-037 | 收起筛选候选值 | `workbook/filter-value-controls.spec.ts` | hide filter values retains selected raw strings for apply and undo at 1280px |
| DATA-038 | 搜索按钮查询筛选候选值 | `workbook/filter-value-controls.spec.ts` | filter value Search button loads matching candidates without filtering until apply at 1280px |
| DATA-039 | 勾选／取消勾选筛选候选值 | `workbook/filter-value-controls.spec.ts` | toggle filter values commits the exact selected set in one undo at 1280px |
| DATA-040 | 选择当前候选页 | `workbook/filter-value-controls.spec.ts` | select page filter values commits the exact selected set in one undo at 1280px |
| DATA-041 | 清空候选选择 | `workbook/filter-value-controls.spec.ts` | clear selection filter values commits the exact selected set in one undo at 1280px |
| DATA-042 | Enter 搜索筛选候选值 | `workbook/filter-value-paging.spec.ts` | filter values Enter search retains exact offscreen choices at 1280px |
| DATA-043 | 筛选候选值下一页 | `workbook/filter-value-paging.spec.ts` | filter values next page retains exact offscreen choices at 1280px |
| DATA-044 | 筛选候选值上一页 | `workbook/filter-value-paging.spec.ts` | filter values previous page retains exact offscreen choices at 1280px |
| DATA-045 | 打开自定义排序面板 | `editing/sort-dialog-focus.spec.ts` | Open custom sort retains draft data and native redo at 1280px |
| DATA-046 | 排序面板 Tab 焦点循环 | `editing/sort-dialog-focus.spec.ts` | Tab custom sort retains draft data and native redo at 1280px |
| DATA-047 | 排序面板 Shift+Tab 焦点循环 | `editing/sort-dialog-focus.spec.ts` | Shift+Tab custom sort retains draft data and native redo at 1280px |
| DATA-048 | 工具栏打开筛选条件面板 | `editing/filter-dialog-focus.spec.ts` | Open toolbar filter keeps native data and redo at 1280px |
| DATA-049 | 筛选面板 Tab 焦点循环 | `editing/filter-dialog-focus.spec.ts` | Tab toolbar filter keeps native data and redo at 1280px |
| DATA-050 | 筛选面板 Shift+Tab 焦点循环 | `editing/filter-dialog-focus.spec.ts` | Shift+Tab toolbar filter keeps native data and redo at 1280px |
| DATA-051 | 去重首行表头选项 | `editing/remove-duplicates.spec.ts` | header option changes whether the first matching value participates |
| DATA-052 | 定位重复记录 | `editing/remove-duplicates.spec.ts` | locating the duplicate seed record selects it and restores grid focus at 1280px |
| DATA-053 | 定位首次保留记录 | `editing/remove-duplicates.spec.ts` | locating the first seed record selects it and restores grid focus at 1280px |
| DATA-054 | 精确文字去重 | `editing/duplicate-comparison.spec.ts` | exact duplicates preserves native record order in one undo at 1280px |
| DATA-055 | 忽略大小写去重 | `editing/duplicate-comparison.spec.ts` | ignoreCase duplicates preserves native record order in one undo at 1280px |
| DATA-056 | 去首尾空白去重 | `editing/duplicate-comparison.spec.ts` | trim duplicates preserves native record order in one undo at 1280px |
| DATA-057 | 去首尾空白且忽略大小写去重 | `editing/duplicate-comparison.spec.ts` | trimIgnoreCase duplicates preserves native record order in one undo at 1280px |
| DATA-058 | 选择全部去重比较列 | `editing/duplicate-column-choices.spec.ts` | Select all duplicate columns invalidates confirmation without losing redo at 1280px |
| DATA-059 | 清空去重比较列 | `editing/duplicate-column-choices.spec.ts` | Clear all duplicate columns invalidates confirmation without losing redo at 1280px |
| DATA-060 | 打开去重面板并读默认草稿 | `editing/duplicate-dialog.spec.ts` | Open duplicate dialog resets its draft and preserves native redo at 1280px |
| DATA-061 | 取消去重草稿 | `editing/duplicate-dialog.spec.ts` | Cancel duplicate dialog resets its draft and preserves native redo at 1280px |
| DATA-062 | Escape 丢弃去重草稿 | `editing/duplicate-dialog.spec.ts` | Escape duplicate dialog resets its draft and preserves native redo at 1280px |
| DATA-063 | 去重面板 Tab 焦点循环 | `editing/duplicate-dialog.spec.ts` | Tab duplicate dialog resets its draft and preserves native redo at 1280px |
| DATA-064 | 去重面板 Shift+Tab 焦点循环 | `editing/duplicate-dialog.spec.ts` | Shift+Tab duplicate dialog resets its draft and preserves native redo at 1280px |
| DATA-065 | 更新去重预览并重新确认 | `editing/duplicate-preview.spec.ts` | Update duplicate preview requires a fresh confirmation before one native removal at 1280px |
| DATA-066 | 打开分列面板并回读草稿 | `editing/text-columns-session.spec.ts` | Open text columns resets its draft without overwriting source or redo at 1280px |
| DATA-067 | 取消分列草稿 | `editing/text-columns-session.spec.ts` | Cancel text columns resets its draft without overwriting source or redo at 1280px |
| DATA-068 | Escape 丢弃分列草稿 | `editing/text-columns-session.spec.ts` | Escape text columns resets its draft without overwriting source or redo at 1280px |
| DATA-069 | 分列面板 Tab 焦点循环 | `editing/text-columns-session.spec.ts` | Tab text columns resets its draft without overwriting source or redo at 1280px |
| DATA-070 | 分列面板 Shift+Tab 焦点循环 | `editing/text-columns-session.spec.ts` | Shift+Tab text columns resets its draft without overwriting source or redo at 1280px |
| DATA-071 | 分列目标越界后原地纠正及应用 | `editing/text-columns-destination.spec.ts` | invalid split destination corrects before one native overwrite and undo at 1280px |
| DATA-072 | 分列字段保留文字及原格式 | `editing/text-column-literal-types.spec.ts` | preserve split field owns only its native value and number format at 1280px |
| DATA-073 | 分列 General 字段 | `editing/text-column-literal-types.spec.ts` | general split field owns only its native value and number format at 1280px |
| DATA-074 | 分列 Text 字段 | `editing/text-column-literal-types.spec.ts` | text split field owns only its native value and number format at 1280px |
| DATA-075 | 分列日期顺序 MDY | `editing/text-column-date-orders.spec.ts` | dateMdy split field uses its selected date order in one native undo at 1280px |
| DATA-076 | 分列日期顺序 DMY | `editing/text-column-date-orders.spec.ts` | dateDmy split field uses its selected date order in one native undo at 1280px |
| DATA-077 | 分列日期顺序 YMD | `editing/text-column-date-orders.spec.ts` | dateYmd split field uses its selected date order in one native undo at 1280px |
| DATA-078 | 分列日期顺序 MYD | `editing/text-column-date-orders.spec.ts` | dateMyd split field uses its selected date order in one native undo at 1280px |
| DATA-079 | 分列日期顺序 DYM | `editing/text-column-date-orders.spec.ts` | dateDym split field uses its selected date order in one native undo at 1280px |
| DATA-080 | 分列日期顺序 YDM | `editing/text-column-date-orders.spec.ts` | dateYdm split field uses its selected date order in one native undo at 1280px |
| DATA-081 | 跳过分列字段并左压紧结果 | `editing/text-column-field-rules.spec.ts` | Skip field keeps source field numbering and one native split at 1280px |
| DATA-082 | 非法源字段编号纠正 | `editing/text-column-field-rules.spec.ts` | Field number keeps source field numbering and one native split at 1280px |
| DATA-083 | 改变分列规则重置字段类型 | `editing/text-column-field-rules.spec.ts` | Reset rules keeps source field numbering and one native split at 1280px |
| DATA-084 | Tab 制表符分列 | `editing/text-column-delimiters.spec.ts` | Tab split delimiter preserves source and literal zeros in one undo at 1280px |
| DATA-085 | 分号分列 | `editing/text-column-delimiters.spec.ts` | Semicolon split delimiter preserves source and literal zeros in one undo at 1280px |
| DATA-086 | 空格分列 | `editing/text-column-delimiters.spec.ts` | Space split delimiter preserves source and literal zeros in one undo at 1280px |
| DATA-087 | 自定义分隔字符分列 | `editing/text-column-qualifiers.spec.ts` | Other delimiter split rule controls literal boundaries without writing outside the output at 1280px |
| DATA-088 | 单引号保护分列文字 | `editing/text-column-qualifiers.spec.ts` | Single quote split rule controls literal boundaries without writing outside the output at 1280px |
| DATA-089 | 不使用引号保护分列文字 | `editing/text-column-qualifiers.spec.ts` | No qualifier split rule controls literal boundaries without writing outside the output at 1280px |
| DATA-090 | 连续分隔符合并为一个 | `editing/text-column-empty-fields.spec.ts` | Merge consecutive split preserves target formatting through one overwrite and undo at 1280px |
| DATA-091 | 关闭连续分隔符合并并清空空字段 | `editing/text-column-empty-fields.spec.ts` | Keep empty field split preserves target formatting through one overwrite and undo at 1280px |
| DATA-092 | 双引号保护分列文字 | `editing/text-column-empty-fields.spec.ts` | Double quote split preserves target formatting through one overwrite and undo at 1280px |
| DATA-093 | 分列数字的小数分隔符 | `editing/text-column-number-controls.spec.ts` | Decimal separator split setting creates a native number and one undo at 1280px |
| DATA-094 | 分列数字的千位分隔符 | `editing/text-column-number-controls.spec.ts` | Thousands separator split setting creates a native number and one undo at 1280px |
| DATA-095 | 分列数字允许尾随负号 | `editing/text-column-number-controls.spec.ts` | Trailing minus split setting creates a native number and one undo at 1280px |
| DATA-096 | 去重预览下一页 | `editing/duplicate-pages.spec.ts` | Next page duplicate preview reads its exact page without changing source history at 1280px |
| DATA-097 | 去重预览上一页 | `editing/duplicate-pages.spec.ts` | Previous page duplicate preview reads its exact page without changing source history at 1280px |
| DATA-098 | 切换单列去重比较键 | `editing/duplicate-column-choices.spec.ts` | Compare column duplicate columns invalidates confirmation without losing redo at 1280px |
| FIND-001 | 工作簿查找 | `editing/find-replace.spec.ts` | workbook find navigates offscreen into Summary and previous/next wrap exact occurrences |
| FIND-002 | 当前替换 | `editing/find-replace.spec.ts` | current replacement changes only the chosen Unicode occurrence and undo restores it |
| FIND-003 | 全部替换 | `editing/find-replace.spec.ts` | replace all changes every matching order beyond 500 and is one undoable operation |
| FIND-004 | 查找全部 | `editing/find-result-pages.spec.ts` | find all lists the first native result page without editing at 1280px |
| FIND-005 | 查找当前工作表范围 | `editing/find-options.spec.ts` | current sheet find excludes matches on another worksheet at 1280px |
| FIND-006 | 查找原始选区范围 | `editing/find-options.spec.ts` | original selection find retains its initial rectangle after result navigation at 1280px |
| FIND-007 | 查找区分大小写 | `editing/find-options.spec.ts` | find match case changes occurrence membership without editing cells at 1280px |
| FIND-008 | 匹配整个单元格 | `editing/find-options.spec.ts` | find entire cell excludes substrings inside text and formula source at 1280px |
| FIND-009 | 通配符查找 | `editing/find-options.spec.ts` | find wildcards distinguishes star question mark and escaped literal at 1280px |
| FIND-010 | 按显示值查找 | `editing/find-options.spec.ts` | displayed value find locates a formula result without changing its source at 1280px |
| FIND-011 | 按公式源码查找 | `editing/find-options.spec.ts` | raw formula find matches source text rather than the displayed result at 1280px |
| FIND-012 | 非法公式替换原子回滚及纠正 | `editing/find-replace.spec.ts` | failed formula replacement rolls back the earlier text cells and can be corrected |
| FIND-013 | 显示值替换拒绝后纠正为源码替换 | `editing/find-replace.spec.ts` | displayed-value replacement rejects formula writes and allows corrected raw replacement |
| FIND-014 | 查找结果第一页 | `editing/find-result-pages.spec.ts` | First page search results returns to the native first page at 1280px |
| FIND-015 | 查找结果上一页 | `editing/find-result-pages.spec.ts` | Previous page search results returns to the native first page at 1280px |
| FIND-016 | 查找结果下一页 | `editing/find-result-pages.spec.ts` | Next page search results loads the exact native page boundary at 1280px |
| FIND-017 | 查找结果最后一页 | `editing/find-result-pages.spec.ts` | Last page search results loads the exact native page boundary at 1280px |
| FIND-018 | 点击查找结果定位 | `editing/find-result-pages.spec.ts` | click search result selects its exact Unicode cell without editing at 1280px |
| FIND-019 | 查找下一个按钮 | `editing/find-navigation.spec.ts` | Find next find navigates exact occurrences and wraps without editing at 1280px |
| FIND-020 | 查找上一个按钮 | `editing/find-navigation.spec.ts` | Previous find navigates exact occurrences and wraps without editing at 1280px |
| FIND-021 | Enter 查找下一个 | `editing/find-navigation.spec.ts` | Enter find navigates exact occurrences and wraps without editing at 1280px |
| FIND-022 | 工具栏打开查找 | `editing/find-panel-entries.spec.ts` | toolbar opens Find with focused input and preserves the selection at 1280px |
| FIND-023 | Ctrl+F 打开查找 | `editing/find-panel-entries.spec.ts` | Control+f opens Find with focused input and preserves the selection at 1280px |
| FIND-024 | Command+F 打开查找 | `editing/find-panel-entries.spec.ts` | Meta+f opens Find with focused input and preserves the selection at 1280px |
| FIND-025 | Ctrl+H 打开替换 | `editing/find-panel-entries.spec.ts` | Control+h opens Replace with focused input and preserves the selection at 1280px |
| FIND-026 | Command+H 打开替换 | `editing/find-panel-entries.spec.ts` | Meta+h opens Replace with focused input and preserves the selection at 1280px |
| FIND-027 | 点击替换标签 | `editing/find-panel-entries.spec.ts` | Replace tab click retains the find draft without writing cells at 1280px |
| FIND-028 | 点击查找标签 | `editing/find-panel-entries.spec.ts` | Find tab click hides replacement controls without applying the draft at 1280px |
| FIND-029 | 关闭查找替换弹窗 | `editing/find-panel-entries.spec.ts` | Close find panel keeps unapplied replacement and existing redo intact at 1280px |
| FIND-030 | Escape 关闭查找替换弹窗 | `editing/find-panel-entries.spec.ts` | Escape find panel keeps unapplied replacement and existing redo intact at 1280px |
| FIND-031 | 右箭头切换查找替换标签 | `editing/find-panel-keyboard.spec.ts` | ArrowRight find tabs synchronizes focused tab and panel at 1280px |
| FIND-032 | 左箭头切换查找替换标签 | `editing/find-panel-keyboard.spec.ts` | ArrowLeft find tabs synchronizes focused tab and panel at 1280px |
| FIND-033 | Home 切换查找标签 | `editing/find-panel-keyboard.spec.ts` | Home find tabs synchronizes focused tab and panel at 1280px |
| FIND-034 | End 切换替换标签 | `editing/find-panel-keyboard.spec.ts` | End find tabs synchronizes focused tab and panel at 1280px |
| FIND-035 | Tab 弹窗内首尾焦点循环 | `editing/find-panel-keyboard.spec.ts` | Tab find dialog wraps focus inside its own controls at 1280px |
| FIND-036 | Shift+Tab 弹窗内反向焦点循环 | `editing/find-panel-keyboard.spec.ts` | Shift+Tab find dialog wraps focus inside its own controls at 1280px |
| FIND-037 | 空查询禁用操作后纠正 | `editing/find-query-recovery.spec.ts` | empty find query clears stale actions and recovers without losing redo at 1280px |
| FIND-038 | 超长 UTF-8 查询拒绝后纠正 | `editing/find-query-recovery.spec.ts` | oversized find query clears stale actions and recovers without losing redo at 1280px |
| FIND-039 | 无匹配后纠正重试 | `editing/find-query-recovery.spec.ts` | no-match find query clears stale actions and recovers without losing redo at 1280px |
| RULE-001 | 整数验证 | `editing/data-validation.spec.ts` | integer seed rejects fractions without changing cell; corrected draft commits and undoes |
| RULE-002 | 小数验证 | `editing/data-validation.spec.ts` | decimal seed accepts a fraction and rejects a formula outside bounds |
| RULE-003 | 列表验证 | `editing/data-validation.spec.ts` | list seed chooses literal text, restores history and disappears on another cell |
| RULE-004 | 日期验证 | `editing/data-validation.spec.ts` | date native seed enforces bounds and accepted input is undoable |
| RULE-005 | 时间验证 | `editing/data-validation.spec.ts` | time native seed enforces bounds and accepted input is undoable |
| RULE-006 | 文本长度验证 | `editing/data-validation.spec.ts` | text-length native seed enforces bounds and accepted input is undoable |
| RULE-007 | 创建整数验证规则 | `editing/data-validation-rules.spec.ts` | create whole-number validation independently and undo once at 1280px |
| RULE-008 | 创建小数验证规则 | `editing/data-validation-rules.spec.ts` | create decimal validation independently and undo once at 1280px |
| RULE-009 | 创建列表验证规则 | `editing/data-validation-rules.spec.ts` | create list validation independently and undo once at 1280px |
| RULE-010 | 创建日期验证规则 | `editing/data-validation-rules.spec.ts` | create date validation independently and undo once at 1280px |
| RULE-011 | 创建时间验证规则 | `editing/data-validation-rules.spec.ts` | create time validation independently and undo once at 1280px |
| RULE-012 | 创建文本长度验证规则 | `editing/data-validation-rules.spec.ts` | create text-length validation independently and undo once at 1280px |
| RULE-013 | 清除原生验证规则 | `editing/data-validation-rules.spec.ts` | clear seeded validation keeps values and undoes once at 1280px |
| RULE-014 | 取消验证草稿 | `editing/data-validation-rules.spec.ts` | cancel validation discards all draft fields without history at 1280px |
| RULE-015 | Escape 丢弃验证草稿 | `editing/data-validation-rules.spec.ts` | escape validation discards all draft fields without history at 1280px |
| RULE-016 | 启用忽略空白 | `editing/data-validation-rules.spec.ts` | enable ignore blank changes native input and undoes once at 1280px |
| RULE-017 | 禁用忽略空白 | `editing/data-validation-rules.spec.ts` | disable ignore blank changes native input and undoes once at 1280px |
| RULE-018 | 非法日期／时间验证边界纠正重试 | `editing/data-validation.spec.ts` | bad date and time bounds stay correctable without creating history |
| RULE-019 | 验证条件介于（含边界） | `editing/data-validation-comparison.spec.ts` | between enforces its native boundary and keeps a rejected draft correctable |
| RULE-020 | 验证条件不介于（排除边界） | `editing/data-validation-comparison.spec.ts` | not-between enforces its native boundary and keeps a rejected draft correctable |
| RULE-021 | 验证条件等于 | `editing/data-validation-comparison.spec.ts` | equal enforces its native boundary and keeps a rejected draft correctable |
| RULE-022 | 验证条件不等于 | `editing/data-validation-comparison.spec.ts` | not-equal enforces its native boundary and keeps a rejected draft correctable |
| RULE-023 | 验证条件大于 | `editing/data-validation-comparison.spec.ts` | greater-than enforces its native boundary and keeps a rejected draft correctable |
| RULE-024 | 验证条件大于等于 | `editing/data-validation-comparison.spec.ts` | greater-than-or-equal enforces its native boundary and keeps a rejected draft correctable |
| RULE-025 | 验证条件小于 | `editing/data-validation-comparison.spec.ts` | less-than enforces its native boundary and keeps a rejected draft correctable |
| RULE-026 | 验证条件小于等于 | `editing/data-validation-comparison.spec.ts` | less-than-or-equal enforces its native boundary and keeps a rejected draft correctable |
| RULE-027 | 修改验证规则的应用范围 | `editing/data-validation-rules.spec.ts` | change validation range preserves existing values and restores neighboring rules at 1280px |
| RULE-028 | 打开数据验证面板 | `editing/validation-dialog.spec.ts` | Open validation dialog preserves native rules values and redo at 1280px |
| RULE-029 | 数据验证面板 Tab 循环 | `editing/validation-dialog.spec.ts` | Tab validation dialog preserves native rules values and redo at 1280px |
| RULE-030 | 数据验证面板 Shift+Tab 循环 | `editing/validation-dialog.spec.ts` | Shift+Tab validation dialog preserves native rules values and redo at 1280px |
| CALC-001 | 当前表重算 | `editing/manual-calculation.spec.ts` | native seed RAND changes on current-sheet calculation, its dependent agrees and history stays empty |
| CALC-002 | 整个工作簿重算 | `editing/manual-calculation.spec.ts` | worksheet scope leaves unrelated sheet cached; workbook scope refreshes it without adding history |
| CALC-003 | 显示公式 | `editing/manual-calculation.spec.ts` | formula view covers frozen and merged cells, remembers each sheet and preserves forced text |
| CALC-004 | 快捷公式 SUM | `editing/quick-formula.spec.ts` | sum infers native seed range, confirms once and supports undo, redo and recalculation |
| CALC-005 | 快捷公式 AVERAGE | `editing/quick-formula.spec.ts` | average infers native seed range, confirms once and supports undo, redo and recalculation |
| CALC-006 | 快捷公式 COUNT | `editing/quick-formula.spec.ts` | count infers native seed range, confirms once and supports undo, redo and recalculation |
| CALC-007 | 自动求和按钮 | `editing/quick-formula.spec.ts` | explicit selection uses an empty trailing cell, permits draft correction and Escape writes nothing |
| CALC-008 | 函数选择器插入草稿 | `editing/insert-function.spec.ts` | insert creates a draft, confirms via Rust and has one undo/redo step |
| CALC-009 | 取消函数选择器 | `editing/insert-function.spec.ts` | cancel function picker keeps its target without history at 1280px |
| CALC-010 | 函数搜索及无匹配恢复 | `editing/insert-function.spec.ts` | function search handles no match and correction without writing |
| CALC-011 | 函数分类筛选 | `editing/insert-function.spec.ts` | function category filters the native list without writing |
| CALC-012 | 函数列表选择 | `editing/insert-function.spec.ts` | function list choice determines the draft without writing |
| CALC-013 | 格内公式函数补全 | `editing/insert-function.spec.ts` | cell autocomplete commits a native formula in one step at 1280px |
| CALC-014 | 公式栏函数补全 | `editing/insert-function.spec.ts` | formula autocomplete commits a native formula in one step at 1280px |
| CALC-015 | Escape 关闭函数选择器 | `editing/insert-function.spec.ts` | escape function picker keeps its target without history at 1280px |
| CALC-016 | 格内鼠标接受函数候选 | `editing/formula-assist-actions.spec.ts` | cell pointer accepts a function without committing its draft at 1280px |
| CALC-017 | 公式栏鼠标接受函数候选 | `editing/formula-assist-actions.spec.ts` | formula pointer accepts a function without committing its draft at 1280px |
| CALC-018 | 格内 Enter 接受函数候选 | `editing/formula-assist-actions.spec.ts` | cell Enter accepts a function without committing its draft at 1280px |
| CALC-019 | 公式栏 Enter 接受函数候选 | `editing/formula-assist-actions.spec.ts` | formula Enter accepts a function without committing its draft at 1280px |
| CALC-020 | 格内向下键选择函数候选 | `editing/formula-assist-actions.spec.ts` | cell ArrowDown accepts a function without committing its draft at 1280px |
| CALC-021 | 格内向上键选择函数候选 | `editing/formula-assist-actions.spec.ts` | cell ArrowUp accepts a function without committing its draft at 1280px |
| CALC-022 | 公式栏向下键选择函数候选 | `editing/formula-assist-actions.spec.ts` | formula ArrowDown accepts a function without committing its draft at 1280px |
| CALC-023 | 公式栏向上键选择函数候选 | `editing/formula-assist-actions.spec.ts` | formula ArrowUp accepts a function without committing its draft at 1280px |
| CALC-024 | 格内 Escape 先关闭候选再取消草稿 | `editing/formula-assist-dismissal.spec.ts` | cell Escape dismisses suggestions before cancelling the draft at 1280px |
| CALC-025 | 公式栏 Escape 先关闭候选再取消草稿 | `editing/formula-assist-dismissal.spec.ts` | formula Escape dismisses suggestions before cancelling the draft at 1280px |
| CALC-026 | 格内嵌套函数参数帮助 | `editing/formula-argument-help.spec.ts` | cell nested argument help follows the active call without writing at 1280px |
| CALC-027 | 公式栏嵌套函数参数帮助 | `editing/formula-argument-help.spec.ts` | formula nested argument help follows the active call without writing at 1280px |
| CALC-028 | 格内点击拾取单元格引用 | `editing/formula-reference.spec.ts` | cell: click references, type operators and commit once through Rust |
| CALC-029 | 公式栏点击拾取单元格引用 | `editing/formula-reference.spec.ts` | formula-bar: click references, type operators and commit once through Rust |
| CALC-030 | 反向拖拽拾取规范化引用区域 | `editing/formula-reference.spec.ts` | dragging backwards inserts a normalized range and cancel never modifies the workbook |
| CALC-031 | 格内 F4 切换引用锁定 | `editing/formula-reference-keys.spec.ts` | cell F4 cycles all reference locks before one native commit at 1280px |
| CALC-032 | 公式栏 F4 切换引用锁定 | `editing/formula-reference-keys.spec.ts` | formula F4 cycles all reference locks before one native commit at 1280px |
| CALC-033 | 格内 F2 切换文字与引用模式 | `editing/formula-keyboard.spec.ts` | F2 switches actual DOM caret movement and resumes the existing reference without duplicating it |
| CALC-034 | 公式栏 F2 切换文字与引用模式 | `editing/formula-reference-keys.spec.ts` | formula F2 changes caret mode without duplicating the picked reference at 1280px |
| CALC-035 | 格内开始跨表点击引用 | `editing/formula-cross-sheet.spec.ts` | cell: cross-sheet click writes original cell once and supports undo/redo |
| CALC-036 | 公式栏开始跨表点击引用 | `editing/formula-cross-sheet.spec.ts` | formula-bar: cross-sheet click writes original cell once and supports undo/redo |
| CALC-037 | 格内键盘拾取及 Shift 扩大引用 | `editing/formula-keyboard.spec.ts` | cell: arrows and Shift build a formula, F4 locks survive, and one undo restores the cell |
| CALC-038 | 公式栏键盘拾取及 Shift 扩大引用 | `editing/formula-keyboard.spec.ts` | formula-bar: arrows and Shift build a formula, F4 locks survive, and one undo restores the cell |
| CALC-039 | 跨表反向拖拽引用区域 | `editing/formula-cross-sheet.spec.ts` | cross-sheet backwards drag creates a range and native recalculation follows source data |
| CALC-040 | 跨表键盘引用及锁定扩选 | `editing/formula-cross-sheet.spec.ts` | cross-sheet keyboard references retain F4 locks through Shift and F2 |
| CALC-041 | F2 重开已有跨表引用 | `editing/formula-cross-sheet.spec.ts` | F2 reopens an existing cross-sheet reference and saves into the original cell |
| CALC-042 | 取消跨表引用后回原格 | `editing/formula-cross-sheet.spec.ts` | cross-sheet pick keeps formula visible and cancel returns offscreen source at 1280px |
| CALC-043 | 打开原生函数选择器 | `editing/function-dialog.spec.ts` | Open function dialog preserves native formulas fonts and redo at 1280px |
| CALC-044 | 函数选择器 Tab 循环 | `editing/function-dialog.spec.ts` | Tab function dialog preserves native formulas fonts and redo at 1280px |
| CALC-045 | 函数选择器 Shift+Tab 循环 | `editing/function-dialog.spec.ts` | Shift+Tab function dialog preserves native formulas fonts and redo at 1280px |
| STAT-001 | 整列统计包含视口外记录 | `selection/statistics-actions.spec.ts` | column statistics include all offscreen native records at 1280px |
| STAT-002 | 恢复全部统计默认显示 | `selection/statistics-preferences.spec.ts` | restore default statistics resets all six without changing redo at 1280px |
| STAT-003 | 复制求和完整精度 | `selection/statistics-actions.spec.ts` | copies full precision to the real system clipboard and pastes as a scalar |
| STAT-004 | 总数统计显示开关 | `selection/statistics-preferences.spec.ts` | toggle Count statistic changes only its visibility at 1280px |
| STAT-005 | 数值个数统计显示开关 | `selection/statistics-preferences.spec.ts` | toggle Numerical count statistic changes only its visibility at 1280px |
| STAT-006 | 求和统计显示开关 | `selection/statistics-preferences.spec.ts` | toggle Sum statistic changes only its visibility at 1280px |
| STAT-007 | 平均值统计显示开关 | `selection/statistics-preferences.spec.ts` | toggle Average statistic changes only its visibility at 1280px |
| STAT-008 | 最小值统计显示开关 | `selection/statistics-preferences.spec.ts` | toggle Min statistic changes only its visibility at 1280px |
| STAT-009 | 最大值统计显示开关 | `selection/statistics-preferences.spec.ts` | toggle Max statistic changes only its visibility at 1280px |
| STAT-010 | 打开统计显示设置 | `selection/statistics-preferences.spec.ts` | Open statistics settings preserves immediate preferences and history at 1280px |
| STAT-011 | 完成统计显示设置 | `selection/statistics-preferences.spec.ts` | Done statistics settings preserves immediate preferences and history at 1280px |
| STAT-012 | Escape 关闭统计显示设置 | `selection/statistics-preferences.spec.ts` | Escape statistics settings preserves immediate preferences and history at 1280px |
| STAT-013 | 复制总数统计 | `selection/statistics-copy.spec.ts` | copy Count statistic writes its native scalar and pastes once at 1280px |
| STAT-014 | 复制数值个数统计 | `selection/statistics-copy.spec.ts` | copy Numerical count statistic writes its native scalar and pastes once at 1280px |
| STAT-015 | 复制平均值统计 | `selection/statistics-copy.spec.ts` | copy Average statistic writes its native scalar and pastes once at 1280px |
| STAT-016 | 复制最小值统计 | `selection/statistics-copy.spec.ts` | copy Min statistic writes its native scalar and pastes once at 1280px |
| STAT-017 | 复制最大值统计 | `selection/statistics-copy.spec.ts` | copy Max statistic writes its native scalar and pastes once at 1280px |
| STAT-018 | 统计复制权限失败后重试 | `selection/statistics-actions.spec.ts` | clipboard denial is visible and retry copies the current selected result |
| STAT-019 | 统计复制清除旧剪切状态 | `selection/statistics-actions.spec.ts` | copying a statistic never creates a cut token or clears the source on paste |
| STAT-020 | 统计设置 Tab 焦点循环 | `selection/statistics-preferences.spec.ts` | Tab statistics settings preserves immediate preferences and history at 1280px |
| STAT-021 | 统计设置 Shift+Tab 焦点循环 | `selection/statistics-preferences.spec.ts` | Shift+Tab statistics settings preserves immediate preferences and history at 1280px |
| STAT-022 | 刷新恢复六项会话统计默认值 | `selection/statistics-preferences.spec.ts` | reload resets only session statistics preferences to six defaults at 1280px |
| SPILL-001 | 打开原生溢出详情 | `editing/spill-actions.spec.ts` | Open spill details preserves native values and redo at 1280px |
| SPILL-002 | 溢出查询失败后刷新重试 | `editing/spill-actions.spec.ts` | Refresh spill details preserves native values and redo at 1280px |
| SPILL-003 | 选择完整溢出区域 | `editing/spill-actions.spec.ts` | Select spill range spill details preserves native values and redo at 1280px |
| SPILL-004 | 定位溢出公式格 | `editing/spill-actions.spec.ts` | Go to formula cell spill details preserves native values and redo at 1280px |
| SPILL-005 | 定位溢出阻挡格 | `editing/spill-actions.spec.ts` | Select blocking cell spill details preserves native values and redo at 1280px |
| SPILL-006 | 关闭溢出详情按钮 | `editing/spill-actions.spec.ts` | Close spill details preserves native values and redo at 1280px |
| SPILL-007 | Escape 关闭溢出详情 | `editing/spill-actions.spec.ts` | Escape spill details preserves native values and redo at 1280px |
| SPILL-008 | 溢出详情正向焦点循环 | `editing/spill-actions.spec.ts` | Tab spill details preserves native values and redo at 1280px |
| SPILL-009 | 溢出详情反向焦点循环 | `editing/spill-actions.spec.ts` | Shift+Tab spill details preserves native values and redo at 1280px |
| SPILL-010 | 普通格不提供伪造溢出定位 | `editing/spill-availability.spec.ts` | ordinary cell spill details never fabricates navigation at 1280px |
| SPILL-011 | 编辑草稿禁用溢出详情及恢复入口 | `editing/spill-availability.spec.ts` | editing draft disables spill details and cancellation restores entry at 1280px |
| SPILL-012 | 超画布溢出拒绝定位后仍可定位公式格 | `editing/spill-availability.spec.ts` | outside canvas spill refuses clamping and still allows valid anchor navigation at 1280px |
| VIEW-001 | 分类标签切换 | `workbook/ribbon-tabs.spec.ts` | categories expose existing tools and remain reachable at 1280px |
| VIEW-002 | 动态切换中英文 | `workbook/localization.spec.ts` | live language switching preserves Rust data and editing at 1280px |
| VIEW-003 | 滚动不搬移旧格坐标 | `workbook/scroll-stability.spec.ts` | vertical scroll reuses buffered cells at their actual sheet coordinates |
| VIEW-004 | 保留原合并演示 | `workbook/demo-data-isolation.spec.ts` | original merge demo survives ordinary test data at 1280px |
| VIEW-005 | 分类标签 End 键到末项 | `workbook/ribbon-keyboard.spec.ts` | ribbon End activates and focuses exactly View without losing redo at 1280px |
| VIEW-006 | 分类向右键循环切换 | `workbook/ribbon-keyboard.spec.ts` | ribbon ArrowRight activates and focuses exactly Start without losing redo at 1280px |
| VIEW-007 | 分类向左键循环切换 | `workbook/ribbon-keyboard.spec.ts` | ribbon ArrowLeft activates and focuses exactly View without losing redo at 1280px |
| VIEW-008 | 分类标签 Home 键到首项 | `workbook/ribbon-keyboard.spec.ts` | ribbon Home activates and focuses exactly Start without losing redo at 1280px |
| VIEW-009 | 横向滚动保持旧格真实坐标 | `workbook/scroll-stability.spec.ts` | horizontal scroll reuses buffered cells at their actual sheet coordinates |
| VIEW-010 | 斜向滚动保持旧格真实坐标 | `workbook/scroll-stability.spec.ts` | diagonal scroll reuses buffered cells at their actual sheet coordinates |
| VIEW-011 | 定位多行内容后公式栏与视口稳定 | `workbook/name-box-scroll.spec.ts` | multiline target keeps its formula bar and viewport stable at 1280px |
| FILE-001 | 下载原生工作簿 | `workbook/workbook-files.spec.ts` | download preserves workbook data and history at 1280px |
| FILE-002 | 无效文件不破坏当前工作簿 | `workbook/workbook-files.spec.ts` | invalid native content leaves values, selection, history and current file usable |
| FILE-003 | 新建空白工作簿 | `workbook/workbook-files.spec.ts` | new workbook cancellation keeps data before confirmed replacement at 1280px |
| FILE-004 | 打开原生工作簿 | `workbook/workbook-files.spec.ts` | open can retry the same file after cancellation and starts fresh history at 1280px |
| FILE-005 | 打开文件面板及默认焦点 | `workbook/file-dialog.spec.ts` | Open file dialog preserves native redo and restores focus at 1280px |
| FILE-006 | 关闭文件面板 | `workbook/file-dialog.spec.ts` | Close file dialog preserves native redo and restores focus at 1280px |
| FILE-007 | Escape 关闭文件面板 | `workbook/file-dialog.spec.ts` | Escape file dialog preserves native redo and restores focus at 1280px |
| FILE-008 | 文件面板 Tab 焦点循环 | `workbook/file-dialog.spec.ts` | Tab file dialog preserves native redo and restores focus at 1280px |
| FILE-009 | 文件面板 Shift+Tab 焦点循环 | `workbook/file-dialog.spec.ts` | Shift+Tab file dialog preserves native redo and restores focus at 1280px |
| FILE-010 | 无效文件在原面板纠正重试 | `workbook/file-correction.spec.ts` | invalid native file corrects in the same dialog before replacing the workbook at 1280px |
| HIST-001 | 撤销按钮 | `editing/history-actions.spec.ts` | Undo button restores input and cross-sheet formulas without switching tabs at 1280px |
| HIST-002 | 重做按钮 | `editing/history-actions.spec.ts` | Redo button reapplies input and cross-sheet formulas without switching tabs at 1280px |
| HIST-003 | 最近操作列表 | `editing/history-actions.spec.ts` | Recent operations lists native addresses and undone records without changing history at 1280px |
| HIST-004 | 关闭历史列表按钮 | `editing/history-actions.spec.ts` | Close history closes native history without applying or losing redo at 1280px |
| HIST-005 | Escape 关闭历史列表 | `editing/history-actions.spec.ts` | Escape closes native history without applying or losing redo at 1280px |
| HIST-006 | Ctrl+Z 撤销 | `editing/history-shortcuts.spec.ts` | Control+z grid history shortcut changes one native entry at 1280px |
| HIST-007 | Command+Z 撤销 | `editing/history-shortcuts.spec.ts` | Meta+z grid history shortcut changes one native entry at 1280px |
| HIST-008 | Ctrl+Y 重做 | `editing/history-shortcuts.spec.ts` | Control+y grid history shortcut changes one native entry at 1280px |
| HIST-009 | Ctrl+Shift+Z 重做 | `editing/history-shortcuts.spec.ts` | Control+Shift+z grid history shortcut changes one native entry at 1280px |
| HIST-010 | 调整窗口期间快捷键撤销 | `editing/history-resize.spec.ts` | undo during resize is not discarded at 1280px |
| HIST-011 | Command+Shift+Z 重做 | `editing/history-shortcuts.spec.ts` | Meta+Shift+z grid history shortcut changes one native entry at 1280px |
| HIST-012 | Command+Y 重做 | `editing/history-shortcuts.spec.ts` | Meta+y grid history shortcut changes one native entry at 1280px |
| HIST-013 | 撤销后新编辑丢弃旧重做分支 | `editing/history-mutations.spec.ts` | percent input undo restores raw text and a new edit discards redo |
| HIST-014 | 调整窗口期间快捷键重做 | `editing/history-resize.spec.ts` | redo during resize is not discarded at 1280px |
| HIST-015 | 历史弹窗 Tab 焦点循环 | `editing/history-dialog.spec.ts` | Tab history dialog keeps keyboard focus and native redo at 1280px |
| HIST-016 | 历史弹窗 Shift+Tab 焦点循环 | `editing/history-dialog.spec.ts` | Shift+Tab history dialog keeps keyboard focus and native redo at 1280px |
| HIST-017 | 空历史列表不生成伪操作 | `editing/history-dialog.spec.ts` | Empty history dialog keeps keyboard focus and native redo at 1280px |
| NOTE-001 | 新增多行备注 | `notes/actions.spec.ts` | insert multiline note preserves values and undoes once at 1280px |
| NOTE-002 | 查看已有备注 | `notes/actions.spec.ts` | view existing note reads saved text without creating history at 1280px |
| NOTE-003 | 修改备注 | `notes/actions.spec.ts` | edit note preserves original through native undo at 1280px |
| NOTE-004 | 删除备注 | `notes/actions.spec.ts` | delete note ignores unsaved draft and restores with undo at 1280px |
| NOTE-005 | 取消草稿 | `notes/actions.spec.ts` | cancel note draft retains saved text and focus at 1280px |
| NOTE-006 | Escape取消 | `notes/actions.spec.ts` | Escape dismisses note draft without saving at 1280px |
| NOTE-007 | 空白文本恢复 | `notes/actions.spec.ts` | blank note text keeps a retryable draft at 1280px |
| NOTE-008 | 公式/空格备注 | `notes/actions.spec.ts` | note on formula and blank cell preserves native content at 1280px |
| NOTE-009 | 焦点循环/响应布局 | `notes/actions.spec.ts` | note dialog traps focus and fits viewport at 1280px |
| NOTE-010 | 文件往返 | `notes/persistence.spec.ts` | note file roundtrip restores multiline metadata and leaves cell formulas intact |
| NOTE-011 | 错误文件/旧文件 | `notes/persistence.spec.ts` | invalid note file keeps open workbook and legacy file restores no notes |
| NOTE-012 | 原生结构随动 | `notes/persistence.spec.ts` | native row and column edits move notes and restore them through undo |
| NOTE-013 | 内容编辑隔离 | `notes/persistence.spec.ts` | ordinary cell input preserves note independently of value undo |
| NOTE-014 | 超限文本恢复 | `notes/actions.spec.ts` | over-limit note text keeps a retryable draft at 1280px |
| NOTE-015 | 中英文切换 | `notes/localization.spec.ts` | Chinese note editor preserves text through language switching at 1280px |
| CFADV-001 | 色阶最小阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale min threshold applies and undoes once at 1280px |
| CFADV-002 | 色阶最大阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale max threshold applies and undoes once at 1280px |
| CFADV-003 | 色阶数值阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale number threshold applies and undoes once at 1280px |
| CFADV-004 | 色阶百分比阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale percent threshold applies and undoes once at 1280px |
| CFADV-005 | 色阶百分位阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale percentile threshold applies and undoes once at 1280px |
| CFADV-006 | 色阶公式阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale formula threshold applies and undoes once at 1280px |
| CFADV-007 | 数据条最小阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar min threshold applies and undoes once at 1280px |
| CFADV-008 | 数据条最大阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar max threshold applies and undoes once at 1280px |
| CFADV-009 | 数据条数值阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar number threshold applies and undoes once at 1280px |
| CFADV-010 | 数据条百分比阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar percent threshold applies and undoes once at 1280px |
| CFADV-011 | 数据条百分位阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar percentile threshold applies and undoes once at 1280px |
| CFADV-012 | 数据条公式阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar formula threshold applies and undoes once at 1280px |
| CFADV-013 | 图标最小阈值 | `advanced-conditional-format/icons.spec.ts` | icon set min threshold applies and undoes once at 1280px |
| CFADV-014 | 图标最大阈值 | `advanced-conditional-format/icons.spec.ts` | icon set max threshold applies and undoes once at 1280px |
| CFADV-015 | 图标数值阈值 | `advanced-conditional-format/icons.spec.ts` | icon set number threshold applies and undoes once at 1280px |
| CFADV-016 | 图标百分比阈值 | `advanced-conditional-format/icons.spec.ts` | icon set percent threshold applies and undoes once at 1280px |
| CFADV-017 | 图标百分位阈值 | `advanced-conditional-format/icons.spec.ts` | icon set percentile threshold applies and undoes once at 1280px |
| CFADV-018 | 图标公式阈值 | `advanced-conditional-format/icons.spec.ts` | icon set formula threshold applies and undoes once at 1280px |
| CFADV-019 | 三箭头 | `advanced-conditional-format/icons.spec.ts` | choose three-arrows icon style at 1280px |
| CFADV-020 | 三交通灯 | `advanced-conditional-format/icons.spec.ts` | choose three-traffic-lights icon style at 1280px |
| CFADV-021 | 三旗帜 | `advanced-conditional-format/icons.spec.ts` | choose three-flags icon style at 1280px |
| CFADV-022 | 图标反向 | `advanced-conditional-format/icons.spec.ts` | reverse icon order preserves values and undoes once at 1280px |
| CFADV-023 | 仅显示图标 | `advanced-conditional-format/icons.spec.ts` | show icon only preserves the raw value and undoes once at 1280px |
| CFADV-024 | 显式三色中点 | `advanced-conditional-format/thresholds.spec.ts` | third color accepts an explicit midpoint threshold at 1280px |
| CFADV-025 | 恢复自动阈值 | `advanced-conditional-format/thresholds.spec.ts` | reset threshold to automatic restores native full-range scaling at 1280px |
| CFADV-026 | 编辑公式引用值重算阈值 | `advanced-conditional-format/thresholds.spec.ts` | formula threshold tracks a changed reference without changing its rule at 1280px |
| CFADV-027 | 错误阈值恢复及取消 | `advanced-conditional-format/lifecycle.spec.ts` | invalid threshold stays correctable and cancel restores focus at 1280px |
| CFADV-028 | 图标颜色/Stop/优先级组合 | `advanced-conditional-format/lifecycle.spec.ts` | icons combine with highlight until stop and priority exclude lower rules at 1280px |
| CFADV-029 | 下载/打开高级规则 | `advanced-conditional-format/lifecycle.spec.ts` | advanced rules survive workbook download and open without baked display metadata at 1280px |
| CFADV-030 | 英中界面保持图标数据 | `advanced-conditional-format/lifecycle.spec.ts` | advanced editor fits and preserves data through English and Chinese at 1280px |
| CFADV-031 | 隐藏行统计域 | `advanced-conditional-format/boundaries.spec.ts` | hidden numeric members remain in advanced visual statistics at 1280px |
| CFADV-032 | 合并锚点单图标 | `advanced-conditional-format/boundaries.spec.ts` | merged anchor renders the native icon once at 1280px |
| CFADV-033 | 冻结滚动单图标 | `advanced-conditional-format/boundaries.spec.ts` | frozen pane renders the native icon once while scrolling at 1280px |
| CFADV-034 | 格式刷隔离 | `advanced-conditional-format/boundaries.spec.ts` | format painter copies base formatting without copying conditional icons at 1280px |
| CFADV-035 | 原生高级图标种子 | `advanced-conditional-format/lifecycle.spec.ts` | native advanced icon seed displays without history at 1280px |
| PROTECT-001 | 保护当前工作表 | `protection/protection.spec.ts` | protect worksheet rejects locked input without changing data or content history at 1280px |
| PROTECT-002 | 选区设为允许编辑 | `protection/protection.spec.ts` | allow selection permits native editing and undo while its neighbor stays locked at 1280px |
| PROTECT-003 | 取消工作表保护 | `protection/protection.spec.ts` | unprotect worksheet restores locked input and retains configured editable ranges at 1280px |
| PROTECT-004 | 删除允许编辑范围 | `protection/protection.spec.ts` | remove editable range relocks that selection without creating content undo at 1280px |
| PROTECT-005 | 打开保护面板 | `protection/dialog.spec.ts` | open worksheet protection reads native settings and fits the viewport at 1280px |
| PROTECT-006 | Close关闭面板 | `protection/dialog.spec.ts` | Close worksheet protection preserves redo and restores focus at 1280px |
| PROTECT-007 | Escape关闭面板 | `protection/dialog.spec.ts` | Escape worksheet protection preserves redo and restores focus at 1280px |
| PROTECT-008 | Tab焦点循环 | `protection/dialog.spec.ts` | Tab worksheet protection preserves redo and restores focus at 1280px |
| PROTECT-009 | Shift+Tab焦点循环 | `protection/dialog.spec.ts` | Shift+Tab worksheet protection preserves redo and restores focus at 1280px |
| PROTECT-010 | 保护面板中英文切换 | `protection/dialog.spec.ts` | worksheet protection switches language without losing native settings at 1280px |
| PROTECT-011 | 保护原生下载/打开 | `protection/persistence.spec.ts` | native file roundtrip retains worksheet protection and editable ranges at 1280px |
| PROTECT-012 | 预设范围但默认开放的真实原生种子 | `protection/seed.spec.ts` | native protection seed remains open with configured editable ranges and no startup history at 1280px |
| CUSTOM-001 | 打开目录 | `custom-formulas/actions.spec.ts` | open custom formula directory reads native definitions at 1280px |
| CUSTOM-002 | 注册定义 | `custom-formulas/actions.spec.ts` | register custom expression leaves user cells unchanged at 1280px |
| CUSTOM-003 | 公式栏调用 | `custom-formulas/actions.spec.ts` | call registered expression from formula bar at 1280px |
| CUSTOM-004 | 选择已有定义 | `custom-formulas/actions.spec.ts` | select saved custom definition reads native expression at 1280px |
| CUSTOM-005 | 替换表达式 | `custom-formulas/actions.spec.ts` | replace custom expression recalculates existing callers at 1280px |
| CUSTOM-006 | 移除定义 | `custom-formulas/actions.spec.ts` | remove custom expression returns native name error at 1280px |
| CUSTOM-007 | Cancel放弃草稿 | `custom-formulas/actions.spec.ts` | cancel custom expression draft preserves saved definition at 1280px |
| CUSTOM-008 | Escape放弃草稿 | `custom-formulas/actions.spec.ts` | Escape dismisses custom expression draft at 1280px |
| CUSTOM-009 | 切回新定义模式 | `custom-formulas/actions.spec.ts` | new custom formula mode clears selected draft at 1280px |
| CUSTOM-010 | 键盘焦点循环 | `custom-formulas/actions.spec.ts` | custom formula dialog traps focus and fits viewport at 1280px |
| CUSTOM-011 | 撤销定义替换 | `custom-formulas/history-file.spec.ts` | undo custom definition replacement restores native result and catalog |
| CUSTOM-012 | 重做定义移除 | `custom-formulas/history-file.spec.ts` | redo custom definition removal restores native name error and removes catalog entry |
| CUSTOM-013 | 下载表达式定义 | `custom-formulas/history-file.spec.ts` | download workbook stores custom expression as data without rewriting formulas |
| CUSTOM-014 | 打开恢复定义 | `custom-formulas/history-file.spec.ts` | open workbook restores custom definitions before formulas and updates completion |
| CUSTOM-015 | 接受自定义补全和参数帮助 | `custom-formulas/history-file.spec.ts` | custom completion accepts native definition and shows exact parameter help |
| CUSTOM-016 | 重复参数错误后重试 | `custom-formulas/history-file.spec.ts` | invalid custom expression stays retryable and missing arguments produce native error |
| CUSTOM-017 | 保护拒绝写入 | `custom-formulas/history-file.spec.ts` | protected worksheet rejects custom definition mutation without changing native callers |
| CUSTOM-018 | 跨工作表重算 | `custom-formulas/history-file.spec.ts` | custom expression replacement recalculates consumers in another worksheet |
| CUSTOM-019 | 非法文件拒绝 | `custom-formulas/history-file.spec.ts` | invalid custom formula file is rejected atomically and never executes source |
| CUSTOM-020 | 中文和切换语言 | `custom-formulas/localization.spec.ts` | Chinese custom formula editor preserves definitions after language change at 1280px |
| HELP-002 | 浏览每个真实函数的完整参数帮助 | `formula-help/catalog.spec.ts` | HELP-002 every real picker entry renders its own help at 1280px |
| HELP-003 | 中文参数及实现限制 | `formula-help/catalog.spec.ts` | HELP-003 Chinese parameters and implementation limits at 1280px |
| HELP-004 | 格内真实参数组与固定尾参帮助 | `formula-help/editing.spec.ts` | HELP-004 cell actual parameter groups and suffixes at 1280px |
| HELP-008 | 公式栏真实参数组与固定尾参帮助 | `formula-help/editing.spec.ts` | HELP-004 formula actual parameter groups and suffixes at 1280px |

参数帮助的构件目录检查（HELP-001）属于补充原生证据，不登记为用户DOM操作。
HELP-005/007扩展原CALC插入/搜索/取消操作，保留原唯一primary；HELP-006为只读文件跨域补充。

| ID | 操作 | E2E 文件 | 主测试精确标题 |
| --- | --- | --- | --- |
| VALADV-001 | 创建相对公式验证 | `advanced-validation/custom-formula.spec.ts` | create custom formula validation relative to the selected range at 1280px |
| VALADV-002 | 选格显示输入提示 | `advanced-validation/custom-formula.spec.ts` | show input message on cell selection without native history at 1280px |
| VALADV-003 | Stop 拒绝输入 | `advanced-validation/custom-formula.spec.ts` | Stop rejects invalid native input with the configured error message at 1280px |
| VALADV-004 | 取消修改规则 | `advanced-validation/custom-formula.spec.ts` | cancel custom validation changes preserves the prior native rule and focus at 1280px |
| VALADV-005 | 清除规则及撤销 | `advanced-validation/custom-formula.spec.ts` | clear advanced validation and undo restores its formula and messages at 1280px |
| VALADV-006 | Warning 明确继续 | `advanced-validation/error-levels.spec.ts` | continue warning submits the native draft exactly once at 1280px |
| VALADV-007 | Warning 取消保草稿 | `advanced-validation/error-levels.spec.ts` | cancel warning keeps the draft without changing values or history at 1280px |
| VALADV-008 | Information 明确继续 | `advanced-validation/error-levels.spec.ts` | continue information submits the native draft exactly once at 1280px |
| VALADV-009 | Information 取消保草稿 | `advanced-validation/error-levels.spec.ts` | cancel information keeps the draft without changing values or history at 1280px |
| VALADV-010 | 整批粘贴继续 | `advanced-validation/batch-input.spec.ts` | continue warning paste applies the original whole range atomically at 1280px |
| VALADV-011 | 整批粘贴取消 | `advanced-validation/batch-input.spec.ts` | cancel warning paste leaves every target and native undo untouched at 1280px |
| VALADV-012 | 整批填充继续 | `advanced-validation/batch-input.spec.ts` | continue information fill accepts one whole native transaction at 1280px |
| VALADV-013 | 原生文件往返 | `advanced-validation/persistence-language.spec.ts` | native workbook file preserves custom validation prompts and error level at 1280px |
| VALADV-014 | 中文字段切换 | `advanced-validation/persistence-language.spec.ts` | Chinese advanced validation controls preserve the same native rule at 1280px |
| VALADV-015 | 空白策略 | `advanced-validation/edge-input.spec.ts` | custom formula blank policy uses the actual native candidate at 1280px |
| VALADV-016 | 数组拒绝与回滚 | `advanced-validation/edge-input.spec.ts` | custom validation rolls back rejected array input and its spill neighbors at 1280px |
| VALADV-017 | 跨表依赖变化 | `advanced-validation/edge-input.spec.ts` | custom validation follows cross sheet dependency changes at 1280px |
| COMMENT-001 | 新建线程 | `comments/actions.spec.ts` | new comment retains author and local time through undo and redo at 1280px |
| COMMENT-002 | 查看线程纯文本 | `comments/actions.spec.ts` | view thread is read only and displays plain text at 1280px |
| COMMENT-003 | 回复线程 | `comments/actions.spec.ts` | post reply retains both authors and undo restores original thread at 1280px |
| COMMENT-004 | 解决讨论 | `comments/actions.spec.ts` | resolve discussion records actor and prevents replies at 1280px |
| COMMENT-005 | 重新打开讨论 | `comments/actions.spec.ts` | reopen discussion appends history and permits a later reply at 1280px |
| COMMENT-006 | 关闭丢弃草稿 | `comments/actions.spec.ts` | close comments discards a reply draft and restores trigger focus at 1280px |
| COMMENT-007 | Escape取消 | `comments/actions.spec.ts` | Escape dismisses a new discussion without saving at 1280px |
| COMMENT-008 | 对话框键盘焦点 | `comments/actions.spec.ts` | comment dialog traps focus and fits viewport at 1280px |
| COMMENT-009 | 空作者修正 | `comments/input.spec.ts` | reject blank display name and recover at 1280px |
| COMMENT-010 | 超长作者修正 | `comments/input.spec.ts` | reject long display name and recover at 1280px |
| COMMENT-011 | 空正文修正 | `comments/input.spec.ts` | reject blank comment and recover at 1280px |
| COMMENT-012 | 超长正文修正 | `comments/input.spec.ts` | reject long comment and recover at 1280px |
| COMMENT-013 | 插行迁移 | `comments/boundaries.spec.ts` | native insert-rows carries comment history at 1280px |
| COMMENT-014 | 删行历史恢复 | `comments/boundaries.spec.ts` | native delete-rows carries comment history at 1280px |
| COMMENT-015 | 插列迁移 | `comments/boundaries.spec.ts` | native insert-columns carries comment history at 1280px |
| COMMENT-016 | 删列历史恢复 | `comments/boundaries.spec.ts` | native delete-columns carries comment history at 1280px |
| COMMENT-017 | 普通值写入共存 | `comments/boundaries.spec.ts` | ordinary input preserves independent comment metadata at 1280px |
| COMMENT-018 | 跨表线程归属 | `comments/boundaries.spec.ts` | sheet switching keeps discussions attached to the correct native sheet at 1280px |
| COMMENT-019 | 空白与公式格 | `comments/boundaries.spec.ts` | blank and formula cells retain comment markers without replacing content at 1280px |
| COMMENT-020 | 合并锚点 | `comments/boundaries.spec.ts` | merged anchor displays one comment marker and retains the thread at 1280px |
| COMMENT-021 | 冻结滚动 | `comments/boundaries.spec.ts` | frozen pane retains the comment marker while scrolling at 1280px |
| COMMENT-022 | 保护与允许区 | `comments/boundaries.spec.ts` | protected cells reject comments while an editable range accepts them at 1280px |
| COMMENT-023 | 下载完整线程 | `comments/persistence.spec.ts` | downloaded workbook preserves comment authors timestamps messages and status events |
| COMMENT-024 | 打开恢复完整线程 | `comments/persistence.spec.ts` | opening workbook restores the complete thread and keeps formulas and neighbors |
| COMMENT-025 | 错误文件恢复 | `comments/persistence.spec.ts` | invalid comment file leaves the currently open workbook intact |
| COMMENT-026 | 旧文件无批注 | `comments/persistence.spec.ts` | legacy workbook without comments restores no thread and preserves ordinary data |
| COMMENT-027 | 中英切换 | `comments/localization.spec.ts` | Chinese comments retain authored text when switching to English at 1280px |
| COMMENT-028 | 原生种子例 | `comments/seed.spec.ts` | native comment example on Summary reads without adding history or altering the Orders demo |
