# 002 工作表保护交付报告

## 2026-10-21 E2E文件种子预期修复 R1（已冻结，待008实跑）

本次只修改`excel/react-excel/e2e/protection/persistence.spec.ts`和本报告，不修改产品、共享seed、协议或其它E2E。下载文件的`workbook.protection`仍用完整数组`toEqual`：保留sheet0的`mode:'protected'`及E2精确范围`{rowStart:1,rowEnd:1,colStart:4,colEnd:4}`，新增sheet1的`mode:'open'`及Summary A71:A73精确范围`{rowStart:70,rowEnd:72,colStart:0,colEnd:0}`。严格两项数组同时约束顺序、完整对象、长度及每表唯一性；没有改用`arrayContaining`或放宽字段。

唯一影响是PROTECT-011下载文件的种子预期，两宽测试标题保持不变。原真实下载/打开恢复、保护面板原生状态、E2可编辑、F2锁定拒绝、Escape及Undo断言均逐行保留；不修改已绿保护业务来迎合测试。Summary的初始open允许区是既有正确种子，不是本次新增产品行为。

- `pnpm --filter @einfach/react-excel exec playwright test e2e/protection/persistence.spec.ts --list`：exit0，只收集2例（1280px、390px），未启动浏览器；不计作E2E通过。
- `git diff --check -- excel/react-excel/e2e/protection/persistence.spec.ts .tasks/react-excel-seven-features/reports/002-report.md`：exit0；另用awk对两个当前文件内容检查尾随空白，exit0、无诊断（避免未跟踪文件被git diff忽略）。
- 冻结SHA-256：`9bcec60fb64daefc40945c49d914a11d93de512a55ba641cc4cd8992ab8a9952`（`persistence.spec.ts`；修前`485b2ad7d3ce1524b1358cf2b29d1ccdd58b6daf5cc2518f54e65339c2b443fc`）。
- 本轮没有运行browser、cargo、WASM、Vitest、build或完整检查；008/root可对上述两例按原预算实际复验。下文2026-10-20领域交付证据是历史记录，当前共享验证结果以index及008最终报告为准。

状态：DONE_WITH_CONCERNS（待主 agent 审阅）；2026-10-20。领域实现与持久验收源码已交付；共享接线、最终原生18例、真实Worker/WASM E2E及截图尚有未验证项。下列契约不等于通过声明。

## 共享接线契约（008）

调用链：`ProtectionTools` → `runNativeProtectionAtom` → `protection.read/change` → Rust `read_protection/change_protection` → 返回保护事实 → Core 面板/既有保护投影 → React。

- Rust `excel-core/src/lib.rs` 注册 `pub mod protection;`。
- `Workbook` 新字段：`pub(crate) protection: std::collections::BTreeMap<u64, crate::protection::SheetProtection>`；构造器 `Default::default()`。以现有稳定 `sheet_key` 索引，无需新增表级数组；移表/改名不迁移。已删除 key 的配置可保留供 sheet history 恢复，文件只保存当前存在的表。
- Rust 业务导出（`excel-core/src/protection/mod.rs`）：`ProtectionRange {row_start,row_end,col_start,col_end}`（serde camelCase）；`SheetProtection { mode: ProtectionMode, unlocked_ranges: Vec<ProtectionRange> }`；mode 是 `open|protected`；`ProtectionChange` serde `#[serde(tag="action", rename_all="kebab-case")]`：`Protect`, `Unprotect`, `AllowRange { range }`, `RemoveRange { index: usize }`。
- `Workbook` 方法：`read_protection(sheet: usize) -> Result<SheetProtection, &'static str>`；`change_protection(sheet, change: ProtectionChange) -> Result<bool, &'static str>`；`ensure_range_editable(sheet, range: CellRange) -> Result<(), &'static str>`；`ensure_sheet_unprotected(sheet) -> Result<(), &'static str>`；`ensure_workbook_unprotected() -> Result<(), &'static str>`；`shift_protection_ranges(sheet, edit: crate::shift::ShiftEdit)`。change 不接 `WorkbookHistory`，不推进内容 Undo；allow/remove 只可在 open 状态修改。
- `wasm/src/lib.rs` 在 `WasmWorkbook` 定义之后注册 `include!("protection/mod.rs");`。提供 `read_protection(sheet:u32)->Result<JsValue,JsValue>`、`change_protection(sheet:u32,change:JsValue)->Result<bool,JsValue>`。另导出供共享 WASM 入口使用的私有 helper `ensure_protection_range(sheet:u32,range:CellRange)->Result<(),JsValue>` / `ensure_protection_sheet(sheet:u32)->Result<(),JsValue>` / `ensure_protection_workbook()->Result<(),JsValue>`。
- persistence-v1：`WorkbookPersistenceV1JSON` 增 `#[serde(default,skip_serializing_if="Vec::is_empty")] protection: Vec<SheetProtectionJSON>`；该 wire 在本任务 WASM mod 定义 `{sheet:u32, protection:SheetProtection}`。snapshot 初始化 `protection: self.protection_json()`；恢复在所有内容/元数据恢复后、替换 self.workbook 前 `Self::restore_protection_json(&mut workbook, payload.protection)?;`（校验全部完成才应用）。旧文件缺省 open；所有构造该共享 struct 的测试 literal 要加 `protection: vec![]`。
- Core `RustWorkbookCommands extends RustProtectionCommands`，类型来自 `src/rust-workbook/protection/commands.ts`；`WasmWorkbook extends WasmProtectionQueries`，同目录导出该类型。runtime 注册：`protection.read` → `readProtection(current,sheetsById,input)`；`protection.change` → `const changed=changeProtection(current,sheetsById,input,revision); if(changed)revision+=1; return {changed,protection:readProtection(current,sheetsById,input),projection:readVisibleProjection(current,sheetIndex(input.sheetId),input.projection,revision)}`。import 函数也来自该文件。
- projection：visible result 新增可选 `protection?: SheetProtectionState`（既有形状 mode/unlockedRanges）；投影读取用 `workbook.read_protection?.(sheetIndex)`。应用投影时用既有 `setSheetProtectionAtom` 发布 Rust 返回事实（不传 source），供旧按钮禁用/clipboard policy 即时一致；文件/换表也因此只读原生投影。不得把旧 UI 自改状态当原生权威。
- 包 barrel 公开 `nativeProtectionPanelAtom`, `nativeProtectionOpenAtom`, `runNativeProtectionAtom`，来自 `src/protection/native/panel.ts`。React ribbon 引入并渲染 `ProtectionTools`（`src/workbook/protection/ProtectionTools.tsx`）。面板不含密码 UI。
- 原生集中守卫接线：准确入口清单见下；原则：普通/公式/Table 输入、粘贴剪切/格式刷、清除/格式/填充/排序/分列/去重/备注/批注/超链接用 range guard；行列/工作表结构、名称/Table/验证/条件规则、可视元数据用 sheet/workbook guard。Undo/Redo `HistoryEntry::apply` 在任何变更前重新检查当前保护（cells 精确快照坐标，结构/规则按 sheet/workbook）。全部检查必须在第一次写入/历史 begin 之前；失败不可推进历史 cursor。

## 文件职责清单

- Rust `protection/mod.rs`：保护事实及集中权限规则。
- Rust `protection/coverage.rs`：矩形并集完整覆盖算法。
- Rust `protection/structure.rs`：允许编辑区域跟随结构编辑。
- WASM `protection/mod.rs`：保护边界与文件 wire。
- Core `rust-workbook/protection/commands.ts`：Worker 命令契约与透传校验。
- Core `protection/native/panel.ts`：保护面板 UI 状态与命令。
- React `workbook/protection/ProtectionTools.tsx`：保护面板 DOM 与焦点。
- React `workbook/protection/protection.css`：复用现有 token 的面板布局。
- 所有测试在任务 files 范围；功能文档在 `react-excel/docs/protection/README.md`。

## 当前证据

已完整阅读项目两份 skill、one-file-one-thing、frontend-design-codex。旧 `protection/README.md` 明确是 UI canonical；Rust 现有 clipboard unlock policy 不构成工作表保护。

已通过的必要专项及仍待共享验证的项目在下文分别列出，不把mock、未编译回归或未运行E2E算作native通过。

## 原生守卫接线的实际入口清单（008，必须先全预检再写）

1. `workbook_write.rs`：`set_cell/set_formula/clear_cell` 地址解析后调用 `ensure_range_editable(sheet_idx,CellRange::single(addr))`，失败分别 return / false / return；`try_set_cell/try_clear_cell/try_set_formula` 同位置映射 `SheetError::ProtectedCell`。`clear_range` 在任何稀疏写入前检查整个 range，失败返回0。WASM `set_cell_number/text/boolean/error`, `clearCellAt`, `setFormulaAt`, `trySet*` 都路由这些方法，不能只在 `set_cell_input` 增守卫。旧 `wasm_sheet_cells.rs` 的独立 WasmSheet 没有工作簿保护状态，不是当前 workbook 的另一入口。
2. `workbook_input.rs::set_cell_input` 解析地址后 range guard。`workbook_history_input.rs::set_cell_input_with_table_expansion` 在 table 分支之前 range guard；`let expand_tables=expand_tables && workbook.read_protection(sheet)?.mode==ProtectionMode::Open`，不信任调用者传true。保护时普通 Table body 单格可写；header rename 必须 `ensure_workbook_unprotected`；insert-row activation 会变 Table 定义，应拒绝（在 prepare_insert_row_input 前识别 `table.has_insert_row()`，不能借关闭 expansion 激活元数据）。保护时 calculated column 自动整列写和旁边自动扩表都关闭；任意原生 `TableDefinitionChange::apply` 仍需要全 workbook guard。
3. `workbook_history_cells.rs::begin_ranges` 对所有实际 `targets` range guard（已接）；`workbook_history_format.rs::patch_format_range` 可直接在已有pending事务内调用，因此 range/row/column scope实际矩形必须在 shared border plan 产生之后、写入之前再次检查；`capture_extra_formats` 的邻边 plan 范围也检查；`workbook_history_borders.rs::patch_range_borders` 检查目标及实际邻边计划。Row/column format 应检查整行/整列，不能只检查可视画布。
4. `workbook_history_clear.rs::clear_selection` 全 targets/格式轴矩形在 begin 前全部预检（begin_ranges 可覆盖）；`workbook_history_replace.rs::replace_by_query` 应在任何写入前检查全部实际替换坐标，不是先写前几项才在后项出错。`workbook_history_text_columns.rs::split_text_columns`, remove_duplicates 同样让实际多目标入 begin_ranges，raw `Workbook` 对应入口也先检查结果范围。
5. `clipboard_paste.rs::paste_clipboard_recorded` 在 `range=snapshot.paste_target(...)` 后 range guard，`snapshot.cut` 时还检查 `snapshot.source_sheet` 和 source range（剪切后新保护也要挡）；这覆盖 raw `paste_clipboard` 无history调用，UI的 `options.unlocked_ranges` 不可作为权威。`ColumnWidths` 必须 sheet guard。原生保护状态还需禁止Table expansion（现仅凭 options.unlocked_ranges.is_none），禁止 `merges.changed()` 的结构变化；`enters_table` 激活定义也拒绝。计算 `planned` / `dependents` / `borders` 后在 apply前检查每个实际写入坐标（含跨表引用和边框邻居）；历史 `targets()` 的完整结果可复用做预检，即使 history=None 也要检查。`clipboard.rs::capture_clipboard` 若cut先 range guard；Copy和格式刷读取允许。
6. Auto-fill 实际 `Workbook::apply_auto_fill` 与 `WorkbookHistory::apply_auto_fill/apply_inferred_auto_fill` 在 plan 后对全部写入格和边框邻居 guard，不能仅检查 source范围；共享 history begin_ranges覆盖历史路径，raw也要拒绝。`sort_range` 目标range guard；受保护Table内排序/去重若改变定义需sheet guard。
7. `workbook_structural_preflight.rs::validate_structural_edit` 全 workbook guard（行列位移会改跨表公式、名称和条件规则）；`workbook_structural.rs::shift_sheet_and_tables` 在成功位移阶段调用 `shift_protection_ranges(sheet,edit)`。结构 undo/redo也需要同样跟随几何；被完整删除的允许范围不因内容undo重新获得授权，文档明确此保守语义。
8. `workbook_topology.rs::add_sheet/rename_sheet_with_formula_consumers/move_sheet`、`workbook_sheet_archive.rs::archive_sheet_with_conditional_refs`、sheet edit/history入口：全 workbook guard；void/usize API保持签名且保护时零写入；UI Worker调用必须经Result入口先报告失败。稳定key map不用在move/rename时迁移。
9. 名称：`workbook_history_named_range.rs::change_named_range` + `workbook_named_range_edit.rs`/raw named registry入口全 workbook guard；Table `prepare_table/delete_table`、`TableDefinitionChange` 各prepare/apply及raw `restore_tables/set_table_totals_row/set_table_total_function` 全 workbook guard；它们会重写跨表消费者，不能允许protected邻表被间接写。内部初始/文件恢复发生在新open workbook后再最后安装保护配置。
10. 规则：`workbook_history_data_validation.rs::set_data_validation` 用 sheet guard；条件格式 `manage/set/remove_conditional_format_rule` + workbook替换规则入口用sheet guard；旧WASM直接setDataValidation/条件规则必须进入这些同一方法。`WorkbookHistory::change_note(workbook,sheet,addr,Option<&str>)`、批注、超链接用range guard，当前内容可编辑区允许操作；保护设置自身不创建history。
11. 视图持久元数据：`wasm_workbook_viewport_persistence.rs::resize_range/set_row_height/set_col_width`、`wasm_workbook_auto_fit.rs::auto_fit_dimensions` sheet guard；`wasm_workbook_autofill_format.rs::set_format_range` range guard，`restore_format_snapshot`对快照range/scope检查；freeze/outline/visibility/filter/print设置sheet guard。`set_eval_hidden_rows/set_eval_filter_hidden_rows`, hide/unhide/restore_hidden 也不能绕过；读取投影/筛选候选/公式帮助/重算允许（重算不是用户改源）。
12. 导入：`wasm_workbook_import.rs` / bulk_install / instrumentation、`wasm_workbook_diagnostics.rs::restore_sparse` 一次性检查所有目标坐标（或全 workbook guard保守拒绝），不得逐格写后才失败。`restore_persistence_v1` 是完整文件替换命令，构造fresh workbook+最后安装保护配置，不受旧工作簿保护阻止；`restore_sparse/restore_format_snapshot/restore_tables`只是当前工作簿原始恢复，必须受保护限制。
13. Undo/Redo：`workbook_history.rs` 注册 `#[path="protection/history.rs"] mod protection;`；`HistoryEntry::apply` 在执行match前 `self.ensure_current_protection(workbook)?`（我方文件已经提供）。Cells检查before/after实际矩形；Table insert rows额外metadata须全workbook open；其它结构/名称/Table全workbook；其余元数据sheet guard。新增Note/Comment历史variant要在该方法显式走range guard，不能落默认metadata guard造成允许区无故不可撤销。cursor只有apply成功才移动，拒绝保留redo。

## 旧 Core projection hydrate/reset 精确接口

`set(setSheetProtectionAtom,{sheetId:result.sheetId,state:result.protection})`（不传source）可同步发布Rust事实给既有mutation-gateway/clipboard，无需另造数据镜像。每张表投影都必须hydration，而不是只在弹窗open时读。

由008改旧 `protection/index.ts`：`export const resetSheetProtectionAtom=atom(null,(_get,set)=>{set(sheetProtectionSourceAtom,EMPTY_SHEET_PROTECTION);set(sheetProtectionSeededSheetsAtom,new Set<string>());set(sheetProtectionDiagnosticBackingAtom,null)})`；初始化/打开新文件换document前调用，避免相同UI sheetId暂时继承旧保护。旧文档的canonical声明应注明仅legacy入口，当前Rust主线是权威。

## 专项验证进行中

- `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test protection --no-default-features` 首次 exit 101，原因我方structure旧参数调用与实际shift_interval不符，已修6参；当时测试未执行。未将编译失败记作原生通过。
- `tests/protection.rs` 提供7个真实原生测试，另加`protection/bulk.rs`8个、`protection/structure.rs`3个。先前16例候选已实际通过；新增两例及最后的Table workbook级守卫收紧后尚未成功编译，不能复用16例作为最终18例证据。

## 实际落地与当前验证（更新）

父任务已扩权批量入口，以下由002直接实现，不再只是给008的审计建议：clipboard cut/source/actual planned cells/cross-sheet dependents/border keys写前检查、保护时禁Table扩展/输入行激活/merge变更、column-width粘贴sheet guard；auto-fill显式与多序列推断共用实际cell/border plan权限；Workbook sort守卫与`SortRangeError::ProtectedRange`；auto-fit sheet guard；border targets/邻居、clear多区/轴、replace全部冻结写入、分列target、去重range的原子检查。

`SortRangeError::ProtectedRange`已通知008映射`protected-range`；AutoFill沿用现有`InvalidGeometry(PROTECTED_ERROR)`。共享raw setters/结构/文件/投影由008接入。发现并推动修复两项共享遗漏：protected allow区不可改验证规则；结构Undo不再恢复旧protection快照，改为当前配置跟随本次几何。

| 命令 | 结果 | 实际含义 |
| --- | --- | --- |
| `pnpm --filter @einfach/spreadsheet-ui-core test test/protection` | exit0，3文件62例 | 含legacy54例、新Worker contract3+native panel5；只证明Core契约，不冒充native |
| `pnpm --filter @einfach/react-excel test test/workbook/protection/protection.test.tsx` | 最后19:04重跑exit0，5例 | DOM焦点/取消/保护响应/错误重试/deferred read+save可见/保存中Escape禁用；含最终SVG及新版范围文案 |
| `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test protection --no-default-features` | exit0，16例 | raw setters/try/input、规则/拓扑拒绝、批量mix clipboard/fill、跨表cut、边框、历史、3条几何权限回归 |
| 同Rust命令，新增分列/去重及Table原始激活回归后 | exit101，未运行 | 005正在落地的formula_help模块缺limitations/parameters及多份tsv；保留上轮16例证据，不标当前18例通过 |

WASM `protection/tests.rs`新增原生文件往返/无效配置原子拒绝/旧文件缺省/raw WASM setters/保护非Undo helper测试；由008统一编译运行，当前未执行。当前原生测试输入18例；005已通知补齐资源，按父任务裁决不重复占用编译，由008在共享guard修后统一运行。原始空Table输入行可能从allowed cell经void/try setter激活，是已发现且尚无最终通过证据的共享风险；父任务已转008修，不隐藏为审计完成。

最后收紧：clipboard enters_table、fill计划激活输入行、Cells历史table_rows回放统一要求全workbook open（与TableDefinition守卫一致）；18例最后一条增加跨表受保护时阻止Table输入行历史回放断言。这些变更在上轮16例通过之后，仍待最终Rust专项验证。

新文件均≤300物理行（领域最大153，回归bulk158）；扩权修改现有`sort.rs`本身1179行，本次仅新增集中guard/错误variant，不扩大为无关重构。`git diff --check`本业务白名单最后检查exit0；领域源码/验收无skip/fixme/TODO占位。保留既有用户auto_fill改动，无commit/push。

## FEATURES登记行（008统一合并，当前E2E未运行）

每行主用1280版本；相同操作390版本是窄屏独立回归。路径以`excel/react-excel/`为根。

| ID | 操作 | 文件 | 完整主测试标题 |
| --- | --- | --- | --- |
| PROTECT-001 | 保护当前工作表 | `e2e/protection/protection.spec.ts` | `protect worksheet rejects locked input without changing data or content history at 1280px` |
| PROTECT-002 | 选区设为允许编辑 | `e2e/protection/protection.spec.ts` | `allow selection permits native editing and undo while its neighbor stays locked at 1280px` |
| PROTECT-003 | 取消工作表保护 | `e2e/protection/protection.spec.ts` | `unprotect worksheet restores locked input and retains configured editable ranges at 1280px` |
| PROTECT-004 | 删除允许编辑范围 | `e2e/protection/protection.spec.ts` | `remove editable range relocks that selection without creating content undo at 1280px` |
| PROTECT-005 | 打开保护面板 | `e2e/protection/dialog.spec.ts` | `open worksheet protection reads native settings and fits the viewport at 1280px` |
| PROTECT-006 | Close关闭面板 | `e2e/protection/dialog.spec.ts` | `Close worksheet protection preserves redo and restores focus at 1280px` |
| PROTECT-007 | Escape关闭面板 | `e2e/protection/dialog.spec.ts` | `Escape worksheet protection preserves redo and restores focus at 1280px` |
| PROTECT-008 | Tab焦点循环 | `e2e/protection/dialog.spec.ts` | `Tab worksheet protection preserves redo and restores focus at 1280px` |
| PROTECT-009 | Shift+Tab焦点循环 | `e2e/protection/dialog.spec.ts` | `Shift+Tab worksheet protection preserves redo and restores focus at 1280px` |
| PROTECT-010 | 保护面板中英文切换 | `e2e/protection/dialog.spec.ts` | `worksheet protection switches language without losing native settings at 1280px` |
| PROTECT-011 | 保护原生下载/打开 | `e2e/protection/persistence.spec.ts` | `native file roundtrip retains worksheet protection and editable ranges at 1280px` |
| PROTECT-012 | 预设范围但默认开放的真实原生种子 | `e2e/protection/seed.spec.ts` | `native protection seed remains open with configured editable ranges and no startup history at 1280px` |

`e2e/protection/native.spec.ts`补充lite/full直接WASM拒绝与文件验证，不替代任何React主操作用例。所有E2E只通过真实DOM执行产品操作，无浏览器写Core atom；native补充用新WasmWorkbook，不写页面工作簿。

## Lingui中英文清单（008合并）

| English | 中文 |
| --- | --- |
| Worksheet protection | 工作表保护 |
| Editing protection prevents accidental changes. It does not encrypt the workbook or keep its contents confidential. | 编辑保护用于防止意外修改。它不加密工作簿，也不保证内容保密。 |
| This worksheet is protected. | 此工作表已受保护。 |
| This worksheet is open for editing. | 此工作表可自由编辑。 |
| Editable ranges | 可编辑区域 |
| Configure editable ranges before protecting the worksheet. Cells inside those ranges remain editable; worksheet settings stay locked. | 请先设置可编辑区域，再保护工作表。这些区域内的单元格仍可编辑，工作表设置保持锁定。 |
| No editable ranges. | 尚无可编辑区域。 |
| Remove editable range {address} | 删除可编辑区域 {address} |
| Remove | 删除 |
| Allow editing in selection | 允许编辑选区 |
| Select one rectangular range to allow editing. | 请选择一个矩形区域以允许编辑。 |
| Reading worksheet protection… | 正在读取工作表保护… |
| Saving worksheet protection… | 正在保存工作表保护… |
| Protect worksheet | 保护工作表 |
| Unprotect worksheet | 取消工作表保护 |
| Close | 关闭（复用） |

新增feedback英文，需008加入translate-feedback及zh：`This worksheet is protected. Unprotect it before changing locked cells.` → `此工作表已受保护。请先取消保护，再修改锁定的单元格。`；`The workbook changed. Reopen worksheet protection.` → `工作簿已更改，请重新打开工作表保护。`；`The view changed. Reopen worksheet protection.` → `视图已更改，请重新打开工作表保护。`；`Rust worksheet protection is unavailable.` → `原生工作表保护暂不可用。`；`Rust returned invalid worksheet protection.` → `原生引擎返回的工作表保护配置无效。`；`Rust returned a mismatched protection result.` → `原生引擎返回的保护结果不匹配。`；`The editable range is outside the worksheet.` → `可编辑区域超出工作表范围。`；`The editable range no longer exists.` → `该可编辑区域已不存在。`；`A worksheet supports at most 256 editable ranges.` → `每张工作表最多支持256个可编辑区域。`；`Invalid protection change.` → `保护设置操作无效。`；`Invalid protection projection request.` → `保护投影请求无效。`；`Protection refers to a missing worksheet.` → `保护配置引用了不存在的工作表。`；`Duplicate worksheet protection configuration.` → `工作表保护配置重复。`。`Finish the current edit or history operation first.`及通用missing worksheet复用现有反馈。

## 尚待统一验证与截图

- 008需运行真实Worker/WASM E2E、WASM protection native helper专项、完整构件与API snapshot；本任务不运行这些共享gate。
- `dialog.spec.ts`会保存1280/390英文面板与中文面板截图，断言无横溢、在viewport内、焦点循环/返回与不增历史；截图未经实际生成/检查前不宣称视觉验收。
- 最终原生表输入行激活、源齐后18例专项与共享guard覆盖审计仍待008完成，不将16例旧候选通过当作当前源码通过。
- 保护E2E共24个产品DOM场景（12操作×1280/390）及2个lite/full直接WASM补充，均未运行。

## Demo seed最小共享接线（008）

不默认保护任意表，避免旧demo与其他用例失去编辑/结构能力。`RustWorkbookSheetInput`增加`readonly editableRanges?: readonly CellRange[]`（只代表初始open配置）；`initializeWorkbook`全部元数据初始化后，逐范围调用`workbook.change_protection(index,{action:'allow-range',range})`，缺能力明确报错；不建立第二套事实，不创造内容历史。只在产品Summary定义加`editableRanges:[{rowStart:70,rowEnd:72,colStart:0,colEnd:0}]`，即既有A71:A73=2/3/4，Orders不设。后续bulk导入与Table建立仍在open态进行，原有演示数据保留。plain fixture继承Summary，无需单独改种子。

`seed.spec.ts`通过真实产品DOM读取该配置并断言初始open、零启动历史、B71（范围外）仍可修改和单步Undo、A71邻格未受影响以及配置未被Undo清除。此seed接线已通知主agent转008，当前不宣称E2E通过。
