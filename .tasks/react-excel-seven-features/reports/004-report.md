# 004 高级数据验证交付报告

状态：DONE_WITH_CONCERNS（2026-10-21 E2E准备修复R1已冻结待008实跑）。本轮只修改指定两个E2E文件及本报告，34例仅静态收集通过，没有新增浏览器通过证据。原生R5/R6/R8已由独立review按38/38专项复核关闭（见index最新账本），不重做原生修复；此前Core11/11、React5/5未改输入继续复用。

## 确定调用链与共享接线请求

React `AdvancedValidationFields` → 既有 `runNativeDataValidationAtom` → `validation.read` / `validation.change` → `DataValidationRuleJSON` → Rust `Workbook::validate_advanced_input_value`。

- `AdvancedValidationFields` props：`{ readonly id: string }`。组件直接读 `nativeDataValidationPanelAtom`、写 `runNativeDataValidationAtom`，不接 controller。
- `NativeDataValidationRule` 追加 `{kind:'custom-formula',formula:string,anchor?:{row:number,col:number}}`；所有规则可携带 `inputMessage?:{title:string,message:string}`、`errorAlert?:{style:'stop'|'warning'|'information',title:string,message:string}`。缺省 errorAlert 为 Stop；空文本提示无可见输出。
- 原生 `DataValidationKind::CustomFormula { formula:String, anchor:CellAddress }`；`DataValidationRule` 直接追加 `options:AdvancedValidationOptions`，默认值保持旧行为。旧 core tests literal 只机械补 options 默认；WASM tests 由 008 补。不引入递归包装。
- 008 在 `workbook.rs` 注册 `#[path="advanced_validation/mod.rs"] pub mod advanced_validation;`；追加瞬时字段 `pub(crate) validation_confirmation: Rc<Cell<bool>>`，初始化 `Rc::new(Cell::new(false))`。此字段不是文件数据，不进入历史。
- 008 已将 `workbook_input.rs` 的既有 `validate_input_value` 方法体委托 `self.validate_advanced_input_value(sheet,addr,value)`；新方法签名 `pub(crate) fn validate_advanced_input_value(&self,sheet:usize,addr:CellAddress,value:&Value)->Result<(),&'static str>`。审查修复已删除 `validate_input_literal_value` 和虚拟 CandidateProvider；literal / 格式化数字 / formula / hyperlink 显示文字统一真正安装后验证，依赖及元数据直接由原生 `WorkbookEvalProvider` 读取。
- 领域提供 `pub fn with_validation_confirmation<T>(&mut self, confirmed:bool, apply:impl FnOnce(&mut Self)->T)->T`，只能放宽 Warning/Information，Stop/保护/原子及 Table 校验均保持现有同一路径。RAII 恢复瞬时确认作用域。
- 领域 WASM 新文件 `advanced_validation/confirmed_input.rs` 提供 `#[wasm_bindgen(js_name=setCellInputConfirmed)] pub fn set_cell_input_confirmed(&mut self,sheet:usize,addr:&str,input:&str,expand_tables:bool)->Result<(),JsValue>`。008 在 wasm `lib.rs` include 该文件；wasm-types 声明 `setCellInputConfirmed?(sheet:number,address:string,input:string,expandTables:boolean):void`。
- 008 为 `SetCellInputRequest` / `CommitCellEditingInput` 增 `validationConfirmation?:'continue'`，commit 组装原样传输；runtime 仅当此值明确为 continue 时调用 confirmed 方法，其他情况沿既有 API。不允许自动重试 Warning/Information。
- 原生错误码 `DATA_VALIDATION_FAILED` / `DATA_VALIDATION_WARNING` / `DATA_VALIDATION_INFORMATION`。普通编辑失败时保持草稿；领域确认 UI 根据既有 editing lifecycle error 展示，用户点 Continue 才 `commitCellEditingAtom({validationConfirmation:'continue'})`；Cancel 仅关提示保留草稿。
- 多格粘贴/填充 Warning/Information 默认原子拒绝；Continue 必须带原失败的 request、目标范围、工作簿 connection/revision，调用同一批量原生入口并在 `with_validation_confirmation(true,...)` 中运行，Cancel 只关闭提示。不得逐格重放或重捕获已变化的剪贴板。008 已接共享 command/runtime；本领域已实现统一确认草稿协议、原生原子专项及持久真实 E2E。All / Formulas / FormulasAndNumberFormats / Values / ValuesAndFormats / ValuesAndNumberFormats 六种值/公式模式都验证实际整批结果；Formats / ColumnWidths 不改变内容，不触发值验证。
- 008 在 `DataValidationTools.tsx` 的 Allow 下增 Custom formula 选项；公式类型不渲染 comparison/min/max；在 Ignore blank 之后渲染 `<AdvancedValidationFields id={id}/>`。导入本地领域组件。
- 008 在 grid 的现有验证浮层位置增加 `<ValidationInputMessage/>` 与 `<ValidationErrorAlert/>`；领域组件复用 native-list 的原生读取缓存。Core barrel 导出高级面板草稿类型及 advanced/confirmation atoms。

## 文件职责

- Rust `data_validation.rs`：规则类型与纯值规则分派。
- Rust `advanced_validation/options.rs`：提示文本与级别的定义校验。
- Rust `advanced_validation/mod.rs`：原生验证与确认作用域。
- Rust `advanced_validation/formula.rs`：只求值验证条件，依赖读取原生缓存，不重建候选计算。
- Rust `advanced_validation/input_transaction.rs`：已有输入快照/安装/验证/回滚事务，以及受影响原生依赖/spill 的受控结算。
- Rust `advanced_validation/references.rs`：结构引用迁移及跨表 owner 预检。
- Rust `sheet_data_validation.rs`：验证区域/锚点随结构移动，完整行列也迁移公式。
- Rust `clipboard_paste_values.rs`：实际候选计划的模式完整验证；既有整批事务负责回滚。
- Rust `auto_fill/apply.rs` / `apply/inferred.rs`：保留保护守卫，整批安装后验证及私有原子回滚。
- WASM `wasm_data_validation_wire.rs`：规则传输及文件往返形状。
- WASM `advanced_validation/confirmed_input.rs`：明确确认的原生输入入口。
- Core `data-validation/advanced/`：高级表单草稿及确认提示状态。
- React `workbook/advanced-validation/`：公式/提示/级别字段、选格提示、提交确认 DOM。
- 各层 tests：专项语义与 DOM 状态；e2e/advanced-validation：真实用户操作。

## 批量确认准确接线（008）

- Core `data-validation/advanced/confirmation-state.ts` 导出 `offerNativeValidationConfirmationAtom`，输入 `{error:unknown,operation:{command:'cell.setInput'}|{command:'clipboard.paste',payload:RustWorkbookCommands['clipboard.paste']['payload']}|{command:'range.fill',payload:RustWorkbookCommands['range.fill']['payload']},witness?:ProjectionSnapshot}`。既有三个 command 在原生拒绝 catch 调用一次；batch 必须传发往 Worker 的完整原对象。该 atom 复制 batch payload 固定 text/token/范围/选项，存 connection/revision，无 callback、ticket 或 controller。
- 公开 `nativeValidationConfirmationAtom` / `runNativeValidationConfirmationAtom`；Continue 复用原 batch command/payload 并在 request 增 `validationConfirmation:'continue',validationRevision:原witness.result.revision`；Cancel 不再发请求。单格 Continue 调用原 commit，要求 `CommitCellEditingInput` / `SetCellInputRequest` 也传这两个字段。Worker 写入前检验明确 continue 且 validationRevision 等于当前 revision，否则拒绝；无确认不宽松。
- `confirmation-command.ts` 不直接发批量 Worker：粘贴使用 `resumeValidatedPasteAtom`（`clipboard/system-clipboard-command.ts`），填充使用 `resumeValidatedFillAtom`（`auto-fill/directional-command.ts`），两者输入均 `{connection:RustWorkbookConnection,witness:ProjectionSnapshot,payload:RustWorkbookCommands[对应command]['payload']}`。普通操作和确认共用原发送/ACK/投影/尺寸/feedback/扩选收尾；confirmed 失败在保留原反馈后 rethrow 原 error，领域可更新真实失败文案，若遇新 Stop 则立即移除 Continue。
- WASM `wasm_workbook_clipboard.rs` 的 `ClipboardPastePolicyJSON` 增 `validation_confirmation:Option<String>`（已有 `rename_all="camelCase"`，因此实际输入键 `validationConfirmation`）。`WasmWorkbook::paste_clipboard` 在调用前仅允许 None/Some("continue")，其它值拒绝 `CLIPBOARD_INVALID_POLICY`；已存在 `self.workbook.paste_clipboard_with_history(snapshot,sheet_idx as usize,&options,&mut self.history)` 改为 `let history=&mut self.history; self.workbook.with_validation_confirmation(policy.validation_confirmation.as_deref()==Some("continue"), |book| book.paste_clipboard_with_history(snapshot,sheet_idx as usize,&options,history))`。内部剪切快照消费仍仅在本调用成功后发生。
- WASM `wasm_autofill_wire.rs` 的 `AutoFillRequestJSON` 增 `#[serde(default)] validation_confirmation:Option<String>`；`wasm_workbook_autofill_format.rs::apply_auto_fill` 在 `let request:AutoFillRequest=request.into()` 之前读取确认并拒绝其它值，原 `self.history.apply_inferred_auto_fill` / `apply_auto_fill` 两分支整体用 `self.workbook.with_validation_confirmation(confirmed, |book| if automatic { history.apply_inferred_auto_fill(book,&request) } else { history.apply_auto_fill(book,&request) })`。不改现有 withHistory 外层，也不逐格重放。
- Core `rust-workbook/fill-io.ts` 构造传 `workbook.apply_auto_fill` 的真实原生 payload 时追加 `validationConfirmation:input.validationConfirmation`。Clipboard runtime 本就把 request 整体作为 policy 传入，无额外转换。
- `Workbook` 追加 `pub(crate) validation_failure:std::cell::RefCell<Option<advanced_validation::ValidationFailure>>` 并初始化 None。领域 `take_validation_failure()` / WASM `getLastValidationFailure()` 返回即消费。Worker 只对完整错误码 DATA_VALIDATION_FAILED/WARNING/INFORMATION（auto-fill 可带固定 `auto-fill rejected: ` 前缀）调用 getter，把结果放在 Error.detail，现有 rpcError 自动传给 Core。提示标题/消息纯文本；不得对任意 substring 匹配旧错误。
- 表格输入仍使用原 `set_cell_input_with_table_expansion` / `apply_calculated_input` 等路径，confirm scope 不绕开 Table 语义。填充领域已补安装整批后的验证与私有回滚，原生 Stop 在同批任何格出现都会拒绝全部。
- Stop 产品裁决：沿既有 inline 编辑错误反馈，领域补纯文本非 modal 状态提示，不夺焦点且保留一次 Escape 取消编辑语义；不显示 Continue。Warning/Information 才 modal 继续/取消。
- 结构：Sheet `shift_data_validations` 已移动 custom anchor、本表裸引用（包括完整行列范围）；008 已在 `workbook_structural.rs::shift_sheet_and_tables` 本表位移后调用 `self.retarget_validation_sheet_references(sheet_index,edit)` 更新所有表的限定引用。领域提供 `pub(crate) fn validation_reference_sheets(&self,target:usize,edit:ShiftEdit)->Vec<usize>`，与 retarget 共用纯重写算法，只返回实际受影响的其它表 owner；008 已用其在 StructuralSnapshot 的 before/after 捕获这些目录并接入 Undo/Redo，真实原生专项已通过。
- 拓扑准确契约（008已接）：`advanced_validation::ValidationRuleSources = Vec<(u64,Vec<DataValidationRegion>)>`；Workbook 四个 `pub(crate)` 方法：`validation_sheet_ref_rewrites(&self,old:&str,new:Option<&str>)->ValidationRuleSources`（只实际改变 owner 的新目录）、`capture_validation_rule_sources(&self,keys:&BTreeSet<u64>)->ValidationRuleSources`、`validate_validation_rule_sources(&self,sources:&ValidationRuleSources)->Result<(),&'static str>`、`apply_validation_rule_sources(&mut self,sources:&ValidationRuleSources)`。领域 `sources.rs` 直接复用既有 `workbook_sheet_refs::rewrite_sheet_refs`；共享沿既有 ConditionalRuleSources 的 Rename 双向 owner 并集 before/after、archive 过滤被删除 owner、stable key 恢复，不创建第二套解析或历史。三条实际拓扑专项通过。
- 填充额外格式快照使用 `sheet::border_plan_ranges(&borders)` 的真实连续行段，不再用 bbox 覆盖无关锁定角格；私有 validation rollback 与用户外层 history 两处相同。

## 文件及结构语义

扩展沿既有 `dataValidations` 文件字段，旧文件缺省高级字段仍为 Stop，无单独工作簿镜像。公式 anchor 由保存时选区左上角产生，区域拆分保留原 anchor；结构操作必须同步移动 anchor 与公式引用。历史沿既有 DataValidationChange；提示读取与错误确认本身不写历史。

## 待验证与边界

- 真实 Worker/WASM E2E、中英文、1280/390 截图均未执行；34 条持久用例已准备，统一执行归 008。Core/React mock 专项不替代原生或浏览器证据。
- WASM wire/persistence 专项已准备两例，主 agent 已交 008 统一执行，本任务不另编译；未重建 WASM 构件，未运行全量 gate。
- sheet rename/delete 验证公式边界由领域 helper + 008 共享接线本轮闭环，真实 rename 双向悬空源 / delete owner 索引变化 / Undo 新表保留原悬空源三例通过；稀疏锁角格式历史一例同时覆盖显式/推断、拒绝回滚、确认及 Undo/Redo。

## Lingui 汇总（008）

| English msgid | 中文 |
| --- | --- |
| Custom formula | 自定义公式 |
| Validation formula | 验证公式 |
| References are relative to the top left cell of Applies to. The formula must return TRUE. | 引用以应用区域左上角为基准。公式必须返回 TRUE。 |
| Show input message when selected | 选中时显示输入提示 |
| Input title | 输入提示标题 |
| Input message | 输入提示内容 |
| Error alert | 错误提示 |
| Stop | 停止 |
| Warning | 警告 |
| Information | 信息 |
| Error title | 错误标题 |
| Error message | 错误内容 |
| Invalid input requires an explicit Continue or Cancel choice. | 无效输入需要明确选择继续或取消。 |
| Validation input message | 数据验证输入提示 |
| Invalid input | 无效输入 |
| Validation warning | 数据验证警告 |
| Validation information | 数据验证信息 |
| This input does not satisfy the cell's data validation rule. | 此输入不符合单元格的数据验证规则。 |
| Continue with this input? | 是否继续使用此输入？ |
| Submitting input… | 正在提交输入… |
| Continue | 继续 |
| Dismiss validation message | 关闭验证提示 |
| Enter a validation formula. | 请输入验证公式。 |
| Enter a valid validation formula. | 请输入有效的验证公式。 |
| Validation messages cannot contain a null character. | 验证提示不能包含空字符。 |
| Validation titles allow 32 characters and messages allow 255 characters. | 验证标题最多 32 个字符，正文最多 255 个字符。 |
| Enter a formula of at most 8192 bytes with a valid range anchor. | 请输入不超过 8192 字节且锚点有效的公式。 |
| This validation formula cannot be translated across the range. | 无法在此区域平移该验证公式。 |
| Custom formulas do not support comparison operators. | 自定义公式不支持比较运算条件。 |
| The workbook changed. Submit the operation again. | 工作簿已更改，请重新提交操作。 |
| The input was not accepted. Review the draft and submit again. | 输入未被接受，请检查草稿后重新提交。 |
| Rust returned a mismatched validation confirmation result. | 原生引擎返回的验证确认结果不匹配。 |

## 每个操作的 FEATURES 登记行（008）

以下主标题均为 1280px；相同测试额外运行 390px 变体。全部尚待统一真实 Worker/WASM 执行。

| ID | 操作 | E2E 文件（相对 e2e/） | 完整主标题 |
| --- | --- | --- | --- |
| VALADV-001 | 创建相对公式验证 | advanced-validation/custom-formula.spec.ts | create custom formula validation relative to the selected range at 1280px |
| VALADV-002 | 选格显示输入提示 | advanced-validation/custom-formula.spec.ts | show input message on cell selection without native history at 1280px |
| VALADV-003 | Stop 拒绝输入 | advanced-validation/custom-formula.spec.ts | Stop rejects invalid native input with the configured error message at 1280px |
| VALADV-004 | 取消修改规则 | advanced-validation/custom-formula.spec.ts | cancel custom validation changes preserves the prior native rule and focus at 1280px |
| VALADV-005 | 清除规则及撤销 | advanced-validation/custom-formula.spec.ts | clear advanced validation and undo restores its formula and messages at 1280px |
| VALADV-006 | Warning 明确继续 | advanced-validation/error-levels.spec.ts | continue warning submits the native draft exactly once at 1280px |
| VALADV-007 | Warning 取消保草稿 | advanced-validation/error-levels.spec.ts | cancel warning keeps the draft without changing values or history at 1280px |
| VALADV-008 | Information 明确继续 | advanced-validation/error-levels.spec.ts | continue information submits the native draft exactly once at 1280px |
| VALADV-009 | Information 取消保草稿 | advanced-validation/error-levels.spec.ts | cancel information keeps the draft without changing values or history at 1280px |
| VALADV-010 | 整批粘贴继续 | advanced-validation/batch-input.spec.ts | continue warning paste applies the original whole range atomically at 1280px |
| VALADV-011 | 整批粘贴取消 | advanced-validation/batch-input.spec.ts | cancel warning paste leaves every target and native undo untouched at 1280px |
| VALADV-012 | 整批填充继续 | advanced-validation/batch-input.spec.ts | continue information fill accepts one whole native transaction at 1280px |
| VALADV-013 | 原生文件往返 | advanced-validation/persistence-language.spec.ts | native workbook file preserves custom validation prompts and error level at 1280px |
| VALADV-014 | 中文字段切换 | advanced-validation/persistence-language.spec.ts | Chinese advanced validation controls preserve the same native rule at 1280px |
| VALADV-015 | 空白策略 | advanced-validation/edge-input.spec.ts | custom formula blank policy uses the actual native candidate at 1280px |
| VALADV-016 | 数组拒绝与回滚 | advanced-validation/edge-input.spec.ts | custom validation rolls back rejected array input and its spill neighbors at 1280px |
| VALADV-017 | 跨表依赖变化 | advanced-validation/edge-input.spec.ts | custom validation follows cross sheet dependency changes at 1280px |

截图计划：输入提示、Warning/Information 对话框、中文高级字段在1280/390均由上述持久 E2E 输出 screenshot。尚未实际生成截图，不宣称视觉验收。

## 已执行专项

- `pnpm exec vitest run test/advanced-validation`（spreadsheet-ui-core），最终 2026-10-20 19:27 CST exit0：2 文件、11/11。表单保存/异步取消/迟到回复、冻结批量参数/修订号/确认锁，以及 confirmed 重试遇新 Stop 移除 Continue。此前10例首次通过；接共享 resume 后真实查出吞原 error 的一次9/10失败，008修复后新增 Stop 回归并全过。
- `pnpm exec vitest run test/workbook/advanced-validation`（react-excel），最终 19:26 CST exit0：1 文件、5/5。真实 DOM 的慢读可取消、慢保存锁定、错误保草稿、Stop非modal纯文本、Warning/Information明确选择。首轮4/5暴露 shared UI在reading时误禁Cancel，008已修。
- `cargo test --test advanced_validation`（excel-core），审查前 2026-10-20 exit0：23/23。相对/绝对/稀疏/跨表候选、空白、非法定义/运行数组/动态spill成员候选、规则拆分历史、警告/信息明确确认一次历史、Stop/保护/RAII、六模式粘贴/整批依赖/原子Stop、显式与inferred填充、精确边框格式历史/锁角、Table表头、旧公式转literal类型、局部/整列结构及跨表Undo/Redo、改名/删除/悬空源拓扑历史。先前18/18为增加5条边界前的中间候选，不与最终数相加；当前修复38/38见下方增量。
- 原生首次 exit101 为并发接线 NamedEntry / registry.contains 编译错误，0测试执行；第二次16例实际12过4败（literal类型接线漏项、clipboard内部snapshot fixture、Table header fixture、结构公式render括号断言）。已修实现或核正fixture，未删除边界，最终增至18例全过。
- 已对领域 Rust 精确文件运行 rustfmt；全部领域新增/主要文件≤300行。局部 `git diff --check` exit0；未运行 build/typecheck/full Vitest/E2E/wasm-pack，未 commit/push。

## 审查前候选指纹与交接

SHA-256 聚合：`bfb11f9b22770ebeac7c7c1b9beecab495d3c7abc83ec636a18941456c5a0fd4`。算法为下列精确领域文件集合 `rg --files ... | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256`，不含本报告及008共享文件：

- excel-core：`src/advanced_validation/`、`tests/advanced_validation/`、`tests/advanced_validation.rs`、`src/data_validation.rs`、`src/sheet_data_validation.rs`、`src/clipboard_paste_values.rs`、`src/auto_fill/apply.rs`、`src/auto_fill/apply/inferred.rs`。
- WASM：`src/advanced_validation/`、`src/wasm_data_validation_wire.rs`、`src/wasm_workbook_data_validation.rs`。
- UI Core：`src/data-validation/`、`test/advanced-validation/`。
- React：`src/workbook/advanced-validation/`、`test/workbook/advanced-validation/`、`e2e/advanced-validation/`、`docs/advanced-validation/`。

最终23例运行后已释放cargo给主 agent / 008 / 007；WASM两例、17主操作/34桌窄E2E、中文及截图证据统一由008完成。当前已知未验项仅上述共享构件/浏览器gate，不将专项通过冒充真实Worker或视觉完成。

## 独立审查修复增量（R1 / R5 / R6 / R8）

- 可确定复现：`cargo test --test advanced_validation repeated_references` exit101，3/3 实际失败、23 filtered；递增宿主函数 NEXTVALUE 在同格重复/跨表/同数组锚点与成员读取中被 CandidateProvider 反复求值。修复前 `formula.rs` SHA-256 `e232626c572844429df5cdb43a821cc3ffdde0c2b102640f5dd99dac300602dc`，首版 red fixture SHA-256 `c1c7cc15f8c12620d2693ada39c8989c5f5f2fcff556650d06f5d41b7cdf367b`。
- 中间单 provider memo 方案曾 26/26 exit0，但无法解决无关 RAND 缓存不一致与新增 spill member；该方案已完整删除，不以该绿灯关闭 R5/R6。
- 根批准的最终方向：`pub(crate) fn apply_validated_input(&mut self,sheet:usize,addr:CellAddress,install:impl FnOnce(&mut Self)->Result<(),&'static str>)->Result<(),&'static str>`，复用旧公式输入的 HistorySnapshot / Table insert-row / observer 延后和 rollback。008 共享接线将 literal、格式化数字、formula、hyperlink 真正安装后委托；Table header 使用原 TableDefinitionChange 正/反向 apply，不另造历史。
- 真实安装第一轮 `cargo test --test advanced_validation` exit101：33 例 26 过 7 败；重复引用/无关 host 缓存4例已过，但依赖/shape 7例在外层 Store.batch 内读到旧缓存。明确记录失败，不改 fixture 掩盖。原因是原生 Store 写传播在最外层 batch 关闭才发生；`settle_pending_reads` 仅适用顶层 read，不得用于写候选。
- 已落最小结算 hook：`pub(crate) fn settle_validation_candidate(&mut self,sheet:usize,range:CellRange)`。前置条件是所有 Sheet observers 已在第一写之前 detach，直到接受或完整回滚后才 resume；hook 从真实源 range 取 `array_dependents_for_range`，再 `store.flush()` → `recompute_array_formula_groups` → `flush()`。不全表重算、不新增缓存、不复制 spill 布局；Workbook Store 私有，生产订阅仅 Sheet 地址 fanout，暂停期间不向用户发布候选。领域 input/fill 已接；共享 Table/clipboard/结构入口由008审核接入。
- 新回归保留原23例，追加重复/跨表/数组锚点与成员/可确定宿主callback计数/真实RAND当前缓存、新spill直读/跨表SUM/缩小/失败几何回滚/Undo/Redo；observer矩阵涵盖 literal、percent、formula、paste、显式fill、inferred-fill 的扩大/缩小，拒绝本跨表通知0、接受只发最终一次。R8追加 Table 新行和空首行 literal/percent 条件依赖继承列接受，以及真正失败时整行/几何/既有redo/订阅0恢复。
- 最终实际结果：2026-10-20 19:59 CST，`cargo test --test advanced_validation`（`excel/rust/excel-core`）exit0，38 passed / 0 failed / 0 ignored / 0 filtered；原23例全部保留并通过。该轮之前有一次自有测试 helper 把 `Result<CellRange,_>` 直接当成 `Result<(),_>` 的编译错，0测试执行；仅补 `.map(|_| ())` 后重跑，未修改测试语义。Core / React / WASM / E2E 均未重复运行。
- 已复核每个共享 hook 调用处均在全 Sheet observers 已暂停的事务内；接受前及失败回滚后使用原生受影响范围结算。Table继承行由008抽同一个 `install_parsed_input` 实际安装入口，延迟所有 literal / 格式化数字及formula，完整行形成后统一验证，不是全局关闭验证。
- 当前最终领域聚合 SHA-256：`5349d5cb4d3db6d54d30886469181a4c20eaa78885bb12a6340dfd3dd8e1899c`，算法及精确路径集合与上节相同（新文件自然纳入），不含报告/008共享文件。`formula.rs` 为 `d581d3121b4420678849d9c29e700f8bd4e777737d93bc2273a5d3954ca38a12`，`input_transaction.rs` 为 `e19df030e9166550483644da9b736393ef72f08eae02106c3f8025f07f7c3014`。
- 新增/改动领域文件35/60/114/150/151/111行，均≤300；领域 `git diff --check` exit0。没有新 cache / provider / spill布局计算层，没有修改core Store；未 commit/push。38例结束后已通知根/008释放Cargo，源码冻结待reviewer复审；R1/R5/R6/R8不自行宣称独立审查关闭。

## E2E准备修复R1（2026-10-21，已冻结待真实浏览器）

- 范围严格为 `e2e/advanced-validation/support.ts`、`batch-input.spec.ts` 及本报告；不改产品、共享fixture、seed、数据、协议、标题、超时或业务断言。没有运行browser、cargo、WASM、full JS或build。
- 依据本任务转交的008真实失败现场 `/tmp/react-excel-seven-targeted-r2.euSgCD/report.json`：两例在Copy阶段缺clipboard权限，尚未进入validation写入；一例错误查找不存在的Fill down按钮。本轮没有自行重现或把静态检查当成这些真实故障已绿。
- `support.ts::start(page:Page)` 在goto前调用 `page.context().grantPermissions(['clipboard-read','clipboard-write'])`，授予现有真实浏览器context权限；仍使用原Copy/Paste DOM及系统剪贴板，没有mock或直接写Core。该共享本域启动函数被五文件全部34例消费。
- `batch-input.spec.ts` 的information-fill用例保留原 `D44:D46` selection，通过真实 `combobox[name="Fill selected range"]` 的 `selectOption('down')` 发起原填充命令；与当前 `FillTools.tsx` / 既有directional-fill E2E一致，不新增替代命令。
- 直接影响VALADV-010/011/012的1280与390两宽共6例。完整标题均未改：`continue warning paste applies the original whole range atomically at {width}px`、`cancel warning paste leaves every target and native undo untouched at {width}px`、`continue information fill accepts one whole native transaction at {width}px`。Continue/Cancel、原source及target范围、整批Undo、未变邻格与原值断言全部逐字保留。建议008先窄验这6例，再补齐本域34例，不能用6例代替全部。
- 静态验证：2026-10-21 10:02 CST，`pnpm exec playwright test e2e/advanced-validation --list`（`excel/react-excel`）exit0，34 tests in 5 files；这是收集，不是执行。指定范围 `git diff --check` exit0；两个E2E分别40/50行，无新增文件。
- 修前SHA-256：support `c25f42a61e292b44d0ce5247a9bed88939600ccac0eec99c762b08ba0306e3a4`，batch `c17380742561658c489b315905c048b5ffe59c55f6d6c3fe37389e5ae5c25d72`。冻结SHA-256：support `6803de08df8623d1b14be75a12af980a7f13e2d119e9d86bbda78c049005fb78`，batch `f139667e43e1b0182cd07f36ed338fc444498b86029b4c160d69c9707efcb3cf`。
- 两文件冻结聚合：`8c50cb7f8c54b5766524c8ec40d709652ff9364aedfc381f542cf878b652354a`，命令为仓库根 `shasum -a 256 excel/react-excel/e2e/advanced-validation/support.ts excel/react-excel/e2e/advanced-validation/batch-input.spec.ts | shasum -a 256`，不含本报告。上节5349…领域聚合仅代表此前原生修复候选，不是包含本次E2E准备修复的新全域指纹。
- 已就绪交008唯一browser窗口；没有commit/push，不把准备修复或list通过宣称为34例验收通过。
