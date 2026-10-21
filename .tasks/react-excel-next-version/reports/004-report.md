# 004 高级筛选执行报告

## 共享契约（2026-10-21，实施前发布）

- Rust 新模块 `advanced_filter`，公共类型 `ColumnFilterGroup { pub rules: Vec<ColumnFilterRule> }`。分组只允许两层：组内 AND、组间 OR；最多 8 组、每组最多 8 条、总计最多 32 条。空 groups 表示无条件，任一空组拒绝；同列可在同组出现（支持区间组合），非法条件/范围整次拒绝。沿用原比较/空值语义。
- `SheetAutoFilter` 保留旧 `rules`（旧 flat AND），另有 `groups: Vec<ColumnFilterGroup>`；两者必须互斥，分组条件只存 groups，不复制成 flat rules。新增 `groups()`、`has_conditions()`。`SheetFilterState` 请 007 增加 `pub groups: Vec<crate::advanced_filter::ColumnFilterGroup>`，所有原构造补 `groups: Vec::new()`。
- Core 公共类型请 007 在 `filter-sort/types.ts` 增加 `ColumnFilterGroup { readonly rules: readonly ColumnFilterRule[] }`。普通 projection 增加 `filterGroups?: readonly ColumnFilterGroup[]`；Table `autoFilter` 增加 `groups?: readonly ColumnFilterGroup[]`。wire 顶层 `rules` 默认空，`groups` 默认空，二者非空同时提供拒绝。旧文件无 groups 继续 flat AND。
- 004 负责 WASM `wasm_filter_wire.rs` 分组 JSON helper；007 负责 `applyFilter` 接线：有 groups 则 history.apply_filter_groups / apply_filter_range_groups，否则保旧；Table payload 增加 groups，并接 history.apply_table_filter_groups。native Table prepare/change 最小接线由 007 完成（004 提供 prepare_table_filter_groups）。导入 Table 可调用新增 `restore_auto_filter_groups(groups, hidden_rows)`（需 007 在 workbook_table_types.rs 接线）。
- Rust 新方法签名：`Workbook::{apply_filter_groups(sheet: usize, groups: &[ColumnFilterGroup]), apply_filter_range_groups(sheet: usize, range: CellRange, groups: &[ColumnFilterGroup]), apply_table_filter_groups(name: &str, groups: &[ColumnFilterGroup])}`；前两者返回 `Result<FilterApplyReport, FilterError>`，Table 返回 `Result<FilterApplyReport, String>`。history 前两者同名且首参 `&mut Workbook`；Table history 接线由 007。
- 全匹配查询复用现有 `filter_values` WASM export，新增 request `allMatches?: boolean`（默认 false）。true 时 `offset` 必须 0，原 limit 仍可 1..100；Rust 单次 50,000 predicate-cell 预算，返回全部匹配独立值但硬上限 1,000 个及 1 MiB UTF-8 payload（超预算明确拒绝，不截断）；Core 从该响应合并/移除搜索匹配，仍限制总选择数/字节。不增加 Worker command/export：`sheet.filterValues` payload 新增 `allMatches?: boolean`；WASM .d.ts 需 007 同步。Core readFilterValues 由 004 修改。
- 007 共享接线请求：Rust lib `pub mod advanced_filter;`；snapshot/persistence/Table/Worker types/default/validators 与 projection 保留 groups；Core index 导出 `advanced-filter/commands` 的 `configureAdvancedFilterAtom`、`advanced-filter/groups` 的 `nativeAdvancedFilterGroupsAtom`。React FilterTools 中按下述组件接入、移除旧 Add condition 按钮；原 FilterConditionFields/FilterValueChoices 由 007 处理兼容。
- React 独立入口 `<AdvancedFilterGroups />`（`src/workbook/advanced-filter/AdvancedFilterGroups.tsx`）替代 FilterTools 原 `<FilterConditionFields />`，组件自行渲染组及字段；分组仅完整面板，列面板沿用旧组件（已有 OR 条件时列入口显示完整分组，Core 将负责语义）。 `<FilterSearchSelection />` 由 FilterValueChoices 在 page 存在时渲染，提供 Select all search matches / Clear all search matches。

## 状态

原生/WASM 源码已冻结，可由 007 签名校验与构建；Core/React 完成，浏览器待 007。Cargo 窗口已释放。

## 最终接口补充

- 上述分组 API、`Workbook::filter_groups(sheet)` 已实现。`ColumnFilterGroupJSON` 位于 `wasm/src/advanced_filter/wire.rs`，由 `wasm_filter_wire.rs` include；`from_group`/`into_group` 可供 Table 共用。Table 恢复实际方法为 `with_filter_groups(groups, hidden_rows)`（007 接线）。
- 原生搜索完整集合方法为 `Workbook::filter_all_values(sheet, FilterValuesQuery)`，原查询类型不用加字段；WASM 根据 `allMatches` 路由，仍只有原 `filter_values` export。
- 原生组条件额外限保留体积 8 MiB，使前后条件快照留在原 32 MiB 历史预算内。Core 预校验同样限制 8 MiB（含保守对象开销）。普通条件及 Table 借用同一 `FilterCriteria` 谓词/扫描，不增加自动重扫。
- `nativeFilterRulesAtom`、`nativeFilterTargetAtom.rules` 是供旧头部/状态渲染的派生叶子；权威提交表示仍互斥，原 projection.filterRules 在分组时为空。`nativeFilterTargetAtom.groups` 始终数组。分组条件打开单列表头时改开完整分组面板，避免单列编辑偷偷破坏 OR。
- Core 新增 `configureAdvancedFilterAtom`（仅组草稿编辑）、`nativeAdvancedFilterGroupsAtom`（组/全局条件索引派生）。Apply 仍 `configureNativeFilterAtom → runNativeFilterAtom → sheet.filter/table.change → 原生 history → 返回 projection`。查询仍 `configureNativeFilterValuesAtom → sheet.filterValues → Rust 单次受预算扫描`。
- React 无 props 组件 `AdvancedFilterGroups` 复用旧 `FilterConditionFields indices/grouped`；`FilterSearchSelection` 位于现有 value-actions。不存在第二套字段框架。原组 1 的 `Add condition` 按钮名保留，原列面板不增加 OR 控件。

## 新稳定绑定（007 写 FEATURES）

以下均为 `e2e/advanced-filter/`，主绑定用 1280px 的完整标题；每项另有 390px 变体。

| ID | 文件 | 精确主标题 |
| --- | --- | --- |
| AFILT-001 | add-or-group.spec.ts | advanced filter Add OR group includes either alternative in one apply at 1280px |
| AFILT-002 | add-and-condition.spec.ts | advanced filter Add condition intersects only its AND group at 1280px |
| AFILT-003 | edit-condition.spec.ts | advanced filter editing one grouped condition preserves the other group at 1280px |
| AFILT-004 | remove-condition.spec.ts | advanced filter Remove condition retains its nonempty group at 1280px |
| AFILT-005 | remove-group.spec.ts | advanced filter Remove group removes only that OR alternative at 1280px |
| AFILT-006 | select-search.spec.ts | advanced filter Select all search matches includes off-page values at 1280px |
| AFILT-007 | clear-search.spec.ts | advanced filter Clear all search matches removes only the complete current query at 1280px |
| AFILT-008 | reapply.spec.ts | advanced filter Reapply refreshes grouped snapshots only on demand at 1280px |

补充：`scopes-file-protection.spec.ts` 3 例实际普通范围/双 Table/总计、Download+Open 文件、保护拒绝/保留草稿/纠正/Redo；`layout.spec.ts` 中英 × 1280/390，共4例，每例 top/footer 截图；`select-search.spec.ts` 另有真实 1000 候选合并已有草稿值越预算后拒绝、保草稿、缩小查询再 Apply 1 例。总计24条浏览器案例。全部真实浏览器尚未执行，不能据本报告声明 passed。

## Lingui 新消息（007 统一抽取及中译）

UI macros 建议准确中译（layout.spec.ts 使用下述标签）：

| English | 中文 |
| --- | --- |
| All conditions in a group must match. Any group can show a row. | 组内条件全部满足时匹配，任意一组匹配即可显示该行。 |
| Filter group {0} | 筛选组 {0} |
| Group {0} · AND | 第 {0} 组 · 且 |
| Add condition to group {0} | 为第 {0} 组添加条件 |
| Remove group {0} | 移除第 {0} 组 |
| Remove group | 移除组 |
| Add OR group | 添加或组 |
| Or | 或 |
| Select all search matches | 全选搜索匹配项 |
| Clear all search matches | 取消所有搜索匹配项 |
| {0} search matches | {0} 个搜索匹配项 |
| Up to 8 groups and 32 conditions; each group can contain up to 8 conditions. | 最多 8 组、共 32 个条件；每组最多 8 个条件。 |

新增 Core/原生反馈原文及中译（原有消息不重复）：

| English | 中文 |
| --- | --- |
| Use nonempty groups and valid numbers; minimum cannot exceed maximum. | 请使用非空组和有效数字；最小值不能大于最大值。 |
| Choose valid filter conditions in nonempty groups, or up to eight different columns. | 请在非空组中设置有效筛选条件，或选择最多八个不同列。 |
| Choose at most 1,000 values within 1 MiB, or narrow the search. | 最多选择 1,000 个值且不超过 1 MiB，或缩小搜索范围。 |
| All search matches exceed the 1,000-value or 1 MiB selection budget. Narrow the search. | 搜索匹配项超出 1,000 个值或 1 MiB 的选择预算，请缩小搜索范围。 |
| Rust returned incomplete search matches. The selection was not changed. | 原生引擎返回的搜索匹配项不完整，选择未改变。 |
| Search selection must start at the first match. | 搜索选择必须从首个匹配项开始。 |
| Use nonempty groups with valid filter conditions. | 请使用含有效筛选条件的非空组。 |
| Choose nonempty groups with valid filter conditions. | 请选择含有效筛选条件的非空组。 |

## 当前专项证据

- Core `vitest run test/advanced-filter test/native-filter-command.test.ts test/native-filter-range.test.ts test/native-filter-values.test.ts test/native-table-filter.test.ts --reporter=json --outputFile=.../004/core-vitest.json`：7 文件 53 项通过；新增分组/查询/传输17项包含其中。最后反馈文案与边界预校验调整后的最终 JSON 已保存。
- React `vitest run test/workbook/advanced-filter test/workbook/ribbon/filter.test.tsx test/workbook/ribbon/filter-values.test.tsx --reporter=json --outputFile=.../004/react-vitest.json`：4 文件15项通过（新4、原11）；最终 JSON 已保存。007 授权只删除 fixture 中 Testing Library 不支持的 `exact:true` 类型选项，不改断言语义。
- 原生 `cargo test --test advanced_filter --test engine_owned_filter --test filter_range --test filter_history --test filter_values --test table_filter_scope --test table_filter_history --test table_filter_structure`：8文件67项通过（新15、原52）；原始 `.codex-artifacts/react-excel-next-version.11oYiO/004/native.log`。首轮夹具 `Second` 是保留名称，修成 `SecondOrders` 后通过；未改既有测试断言。
- 普通源文件均≤300行，`filter.rs` 为既有超限文件，本次仅必要状态字段/访问器/错误枚举接线，未扩为重构。原生/浏览器新 E2E 仍待统一 WASM 与 DOM 验收；无独立浏览器通过或截图审阅声明。
- `source.sha256` 已记录本领域源码/测试指纹，证据根均为 `.codex-artifacts/react-excel-next-version.11oYiO/004/`。最终专项 JSON 两者 `success=true`、failed=0；已检查 tracked diff 空白及新增未跟踪代码尾空白。
- 未自动 commit、push 或发布。没有新增 seed，复用普通1000条 fixture 与其 Summary 的实际 Table/范围数据，保留原演示种子。

## 独立审查修复第1轮：UI-DATA-01

产品与测试已再次冻结。此轮仅 TS，未修改 Rust/WASM、export、共享 projection/Table validator 接口；已通知 007 可并行构建及开始统一真实浏览器。独立 reviewer 的正式关闭结论仍待补审。

根因：`validFilterCondition` 是旧 flat 文件、普通/Table projection、Worker apply 共用的持久形状校验。把新增 UI 选择的 `filterSelectionWithinBudget` 放在该叶子上，错误地将 1 MiB 总预算追溯到旧规则。40 个不同的 30,002 字符 ASCII 值共 1,200,080 UTF-8 字节，满足旧版 1,000 项/每项 32,767 UTF-16 单元上限，却被新预算拒绝。

最小生产修复仅 `src/advanced-filter/contracts.ts`：list 叶子恢复旧 count/string-length 上限；新 groups 校验显式保留原 per-list 1 MiB 预算及总保留体积 8 MiB。既有 `filter/values.ts` 的 allMatches 完整响应、合并选择、当前页全选和 toggle 预算未改；不增加第二套 validator/迁移镜像。保留 007 已加的 reduce 参数类型注解。

新增 9 项针对性测试：

- `legacy-list-compatibility.test.ts` 4 项：普通 projection 与 Table projection 均覆盖旧字段缺省 groups/显式空 groups；Worker apply 原样传给 native 并可 reapply；原 count/每项字符上限未放宽。
- `contracts.test.ts` 1 项：新 groups 的 per-list 1 MiB 与总 8 MiB 预算继续拒绝。
- `search-selection.test.ts` 4 项：allMatches 响应自身超预算、合法响应合并后超预算都整次拒绝并保草稿/页，缩小查询可纠正；当前页全选与 toggle 新选择同样拒绝超预算且不调用 apply。

红绿原始证据位于 `.codex-artifacts/react-excel-next-version.11oYiO/004/`：

1. 在旧生产校验上运行 `vitest run test/advanced-filter/legacy-list-compatibility.test.ts test/advanced-filter/contracts.test.ts test/advanced-filter/search-selection.test.ts --reporter=json --outputFile=.../004/review-r1-red.json`：3 文件 19 项，16 通过、3 失败。真实失败分别为普通 projection 校验、Table projection 校验、Worker apply 在 native 前拒绝；其余预算保护已绿。
2. 修复后运行 `vitest run test/advanced-filter test/native-filter-command.test.ts test/native-filter-range.test.ts test/native-filter-values.test.ts test/native-table-filter.test.ts test/next-version-integration/filter-groups-wiring.test.ts --reporter=json --outputFile=.../004/review-r1-core-vitest.json`：9 文件 67 项全部通过，`success=true`、failed=0。该 67 含先前 53、此轮新增 9、007 共享分组接线 5，非在旧结果上重复累计为全仓通过。
3. `review-r1.sha256` 记录此轮唯一生产文件及三个测试文件精确指纹；不覆盖旧 `source.sha256`，便于 reviewer 核对独立 delta。四文件分别 42/44/105/54 行，均≤300。`git diff --check` 通过，四个未跟踪源/测试文件的尾空白专项无匹配。

调用链未变：React 事件 → 既有 Core 面板/候选 command → Worker 原筛选命令 → Rust 事务或只读扫描 → 返回投影。本轮只纠正持久形状校验的兼容边界，不增加状态、查询或运行层。没有独立跑浏览器、重建 WASM 或重复原生/React 稳定专项；原24条真实DOM与8图仍由007统一验收。本轮无新UI文案、稳定ID或绑定变化。

## 真实浏览器影响集第1轮：新测试精确纠正

007 的 r1 真实影响集自然 max5 结束（20 pass / 5 fail / 152 未执行），不是整版通过。root 核实旧 seed 与原始红证后批准本轮仅改两个未纳入正在运行 r2、也不被 r2 import 的新 spec；007 已明确确认可写范围。产品、旧 seed、共享 support、配置与 WASM 全部未动。

- 既有 `src/page/demo/sales-orders/data/import-seed.ts:94` 的 `dataRow === 2` 始终是文本 `00123`，因此不存在 `SO-10003`。`SO-10` 的实际匹配为 998，`SO-100` 为 98；清除后仍是 900。`clear-search.spec.ts`/`select-search.spec.ts` 的新数量/页预期准确改为 998，第二页首个候选改 `SO-10052`（第一页末项因跳号是 `SO-10051`）。保留 off-page checked、邻格、Apply、Undo/Redo 及主标题。
- 390px 原红实际为 `0 selected`，不是单纯数量误算。只读 `007-e2e-impact-r1/advanced-filter-clear-sear-c0634-lete-current-query-at-390px/trace.zip` 中 `1-trace.trace`：全选 click (`bzts@71`) 于 15462.019 结束，下次 search fill (`bzts@73`) 于 15464.309 开始，相隔约 2.3ms；click 处快照仍是 `0 selected`，后续最终也是 0。Core 现有 `filter/values.ts:60` 的 search-text 会替换 browser，`:98` 会丢弃旧 pending 身份的返回结果，符合查询未结算即换查询的时序；不改变该保护。`clear-search.spec.ts` 现在先精确自动等待 `998 selected` 再改搜索，且保留改搜索之后仍 `998 selected` 的断言，无 sleep/retry/宽松计数。

改完立即再次通知 007 两 spec 冻结。`browser-r1-test-delta.sha256` 记录精确两文件；分别22/43行，diff 空白与未跟踪文件尾空白检查通过。没有重复 Core/Rust/React 稳定专项，没有自行运行浏览器；纠正后的真实绿证仍由 007 后续统一提供，本报告不提前签绿。
