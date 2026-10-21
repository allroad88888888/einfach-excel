# 006 自定义公式交付报告

状态：DONE_WITH_CONCERNS，待主线独立审阅。Rust9/9、Core64/64、React5/5领域专项已通过。真实Worker/WASM浏览器、WASM文件3例及构件由008统一验证；最新R3仅两项E2E准备就绪，尚未宣称整体验收完成。

## R3 两项历史/跨表E2E准备（2026-10-21）

本轮换新agent，仅修改`e2e/custom-formulas/history-file.spec.ts`与本报告。遵循仓库React Excel/feature-wave技能，继续使用真实Name box、公式栏与对话框，不写Core atom。产品、其他领域、共享fixture/seed、WASM、原生语义均未修改；未派子agent、未commit/push、未启动browser/cargo/WASM/full JS。原R1源值/E3引用、R2窄屏逐格定位及其余全部测试保持原样。

任务/index转交的历史证据为原15条两宽实际15/15、exit0、26.2s、0skipped/flaky；该证据不是本轮新跑。机器重启后旧`/tmp/react-excel-seven*`现场已丢失，本轮没有重新读取旧trace/截图，也不把旧路径描述为当前可复核产物。另按任务转交，原retry trace的#VALUE!写到A1、K3仍日期；当前lite Node直接写K3的`=DOUBLE()`曾得#VALUE!，因此不改变原生缺参预期。

- 跨表：只读核对plain fixture原样复用Summary，`SUMMARY_VISIBILITY`为`hiddenRows:[9]`、`hiddenColumns:[6]`，故G10与建议示例H10都不是可见目标。选H11（`10:7`）：H列/第11行未隐藏、outline两组均`collapsed:false`，该格没有原种子内容/合并/验证；先通过真实Name box定位并严格断言空白，再由真实公式栏写`=DOUBLE(5)`。结果仍严格10，替换`=amount*3`后仍严格15。之后真实定位Summary B11并断言原值20，再切回Sales Orders执行原A2/A3/G2邻格断言，覆盖两张表的原值保持。
- 重复参数重试/缺参：保留`amount, AMOUNT`注册报`unique`、修改为`amount`后重试；成功Register之后明确等待`editor(page)`数量为0，等原生结果与关闭收尾完成，再真实Name box定位K3、断言原日期`2026-09-04`，最后由真实公式栏输入`=DOUBLE()`并严格断言#VALUE!。原邻格断言和其他用例的目录/历史/文件断言均保留。没有sleep/timeout/skip或算术预期放宽。

| 本轮必要检查 | exit | 结果 |
| --- | --- | --- |
| `cd excel/react-excel && pnpm exec playwright test e2e/custom-formulas/history-file.spec.ts --grep 'invalid custom expression stays retryable and missing arguments produce native error\|custom expression replacement recalculates consumers in another worksheet' --list` | 0 | 仅两项/1文件可采集；没有启动浏览器，不是E2E通过证据 |
| `git diff --check -- excel/react-excel/e2e/custom-formulas/history-file.spec.ts .tasks/react-excel-seven-features/reports/006-report.md` | 0 | 无已跟踪内容空白错误 |
| `rg -n '[[:blank:]]+$' excel/react-excel/e2e/custom-formulas/history-file.spec.ts .tasks/react-excel-seven-features/reports/006-report.md` | 1 | 无尾随空白，补查这两个untracked文件 |
| `wc -l excel/react-excel/e2e/custom-formulas/history-file.spec.ts` | 0 | 112行，≤300 |

交008单一浏览器窗口精确待复跑标题（FEATURES的CUSTOM-016/018、标题均未改变）：

1. `invalid custom expression stays retryable and missing arguments produce native error`
2. `custom expression replacement recalculates consumers in another worksheet`

冻结spec SHA-256：`fd41fd13ffed26bf2e66579ca9a0224df493834d94e0c801416da27d2966ee40`。本域四个E2E文件按actions/fixtures/history-file/localization顺序，仓库相对路径`shasum -a 256`行再hash：`4d3239103666262599ff2a4563cf05bce7c3ca1cfd45c884d8ea5443e321f4fc`。其余三个文件hash与接手前完全相同。就绪后冻结，真实两项与最终全域结果由008回写持久产物；本轮不报新增browser通过。

## R2 窄屏虚拟网格可见性准备（2026-10-20）

本轮只修改本域`fixtures.ts`、`actions.spec.ts`与本报告，未改产品、数学预期、共享fixture、native/WASM或CI。接收008的实跑回执：`/tmp/react-excel-seven-smoke-repair.8zNSXd`中4个1280注册/调用/替换/删除已passed；390三项先通过了公式4/6断言，后在`neighbors`找不到已横向虚拟卸载的A2而失败，余10项未运行。该过程不是全绿，也不能据此认定公式计算失败。

- `neighbors`现在依次使用既有真实Name box helper定位A2、A3、G2，并等待格子可见及原生投影ACK，仍分别严格断言`SO-10001`、`SO-10002`、`79`。未删除邻居、未访问Core atom、未调整CSS/虚拟化。
- helper完成后选区为G2，属于有意进行的邻居核验。所有31例均调用它；焦点恢复/焦点循环检查均先于它完成，其他调用者在它之后结束，无需恢复此前选区。
- 唯一后续仍需原目标的是注册不改格子用例：在`neighbors`后通过同一真实Name box重新定位K3，再断言原日期`2026-09-04`。因此没有假定窄屏A/G/K三列能同时留在DOM。
- 已逐项审计其余K3/G10结果读取：公式输入本身先定位目标；定义变更继续使用当前可见投影；Undo/Redo的既有`runRustHistoryAtom`/`applyRustHistory`保持当前projection window而不跳往history range；文件重开/非法文件退出后已显式定位K3；跨表写入已显式定位G10。它们的目标结果断言都在邻居检查之前，不需要额外重置选区。保留4/6、#NAME?、#VALUE!、10→15及全部历史/文件/保护断言。

| 本轮必要检查 | exit | 结果 |
| --- | --- | --- |
| `cd excel/react-excel && pnpm exec playwright test e2e/custom-formulas --list` | 0 | 31例/3文件可采集；仅采集，不是浏览器通过证据 |
| `git diff --check -- excel/react-excel/e2e/custom-formulas .tasks/react-excel-seven-features/reports/006-report.md` | 0 | 无已跟踪内容空白错误 |
| `rg -n '[\\t ]+$' excel/react-excel/e2e/custom-formulas` | 1 | 无尾随空白，覆盖untracked文件 |
| `wc -l excel/react-excel/e2e/custom-formulas/*` | 0 | actions107/fixtures62/history-file105/localization23行，各文件≤300 |

四个E2E文件的`shasum -a256`行再hash为`f7807fc090311b3ecfd61eacbdf650245a6bef01fba81f2bddb977cafc536ac3`。候选已冻结交008单一浏览器窗口；建议先复跑原注册/调用/替换/删除两宽8例和原历史/文件/补全/保护/非法文件7例，共15例。helper被全部31例消费，后续整域仍须统一验证。本轮没有启动浏览器/cargo/WASM重建/全量，R2尚无实跑通过证据。R1与首版指纹保留作历史，不代表当前候选。

## R1 原始数据与公式引用一致性修复（2026-10-20）

本轮仅改本域E2E三个文件及本报告，未改产品、plain fixture、原始订单数据或demo。接收到的smoke现场为 `/tmp/react-excel-seven-smoke.3Oq7OF`，原调用用例实际2/预期4；未把该失败记为通过。本轮不启动浏览器、cargo、WASM重建或全量。

- 已只读核对 `src/page/demo/sales-orders/data/import-seed.ts::createDataRow`：quantity=`(dataRow % 24)+1`，E2（dataRow0）=1，E3（dataRow1）=2。`e2e/fixtures/plain-sales-orders/workbook.ts`复用该原始import数据，仅移除订单合并，不改数量。
- `fixtures.ts`统一公式为 `DOUBLE_ORDER_QUANTITY='=DOUBLE(E3)'`。默认调用准备先用真实名称框选中E3，明确断言其DOM值为2，再通过真实公式栏写入K3；因此 `=amount*2`结果仍严格4，替换为 `=amount*3`结果仍严格6，没有把预期改成实际值。
- `history-file.spec.ts`补全调用同样先确认E3=2，再输入同一公式常量；下载后的公式原文断言改为同一个E3公式。Undo恢复4、替换为6、删除/Redo为#NAME?、文件打开恢复4、保护失败保持4、非法文件保持4的数学断言全部保留。
- 额外核对出 `actions.spec.ts`注册用例曾误把K3视为空。原生成器K3的shipDay=`((1+2)%28)+1=4`，真实文本为`2026-09-04`；该用例现在注册前先真实选中K3并断言原日期，注册后再次断言相同日期，直接证明定义注册不改用户格子。
- 跨表用例显式实参5保持10→15；缺参用例`=DOUBLE()`仍为#VALUE!；中文GREETING与其他无算术调用用例不变。G2邻居原数量1×单价79=79断言不变。

直接行为影响15例：actions的register/call/replace/remove各1280与390共8例；history-file的undo/redo/download/open/completion/protected/invalid-file共7例。现有FEATURES测试标题及ID全部不变。其他用例继续采集但没有本轮语义改变。

| 本轮必要检查 | exit | 结果 |
| --- | --- | --- |
| `cd excel/react-excel && pnpm exec playwright test e2e/custom-formulas --list` | 0 | 31例/3文件可采集；仅采集，不是E2E通过证据 |
| `git diff --check -- excel/react-excel/e2e/custom-formulas .tasks/react-excel-seven-features/reports/006-report.md` | 0 | 无已跟踪内容空白错误 |
| `rg -n '[\\t ]+$' excel/react-excel/e2e/custom-formulas` | 1 | 无尾随空白，覆盖untracked文件 |
| `wc -l excel/react-excel/e2e/custom-formulas/*` | 0 | actions106/fixtures58/history-file105/localization23行，各文件≤300 |

本轮E2E四文件的`shasum -a256`行再hash为 `ddcb21e73dd5369223bdb5834579210cd2d93c2734629ee48deae104f5c2fcd3`。已就绪交008单一浏览器窗口复跑调用/替换/历史/文件及七域smoke；本轮尚无新的真实浏览器通过证据。以下首版领域指纹保留为历史记录，不代表本轮E2E候选。

## 原生与共享契约（2026-10-20）

- 唯一已提交定义保存在现有原生 `Workbook.named_values` registry 的新增 `NamedDefinition::CustomFormula(crate::custom_formulas::CustomFormulaDefinition)` 分支，不另建 TS registry，不覆盖宿主 callback registry。
- `CustomFormulaDefinition { name: String, parameters: Vec<String>, expression: String }` derives Clone/Debug/PartialEq/Eq/Serialize/Deserialize；JSON camelCase。定义表达式交原生 parser；以现有 ExcelLambda 求值并沿现有 name-version 依赖重算。参数/函数名 canonical uppercase；expression 保留 trim 后文本并补 `=`。
- 参数表达式支持常量、运算符、内置函数、已注册的其他自定义函数、LET/LAMBDA；只允许显式形参及词法局部名称，拒绝全局裸名、cell/range/sheet/table 引用、INDIRECT/OFFSET/CELL/ROW/COLUMN/SHEET/SHEETS/FORMULATEXT/ISFORMULA/INFO；须将数据作为实参传入。不执行 JavaScript。最大256条、64形参、8192字符表达式。静态调用环注册拒绝，动态 LAMBDA 递归仍由原生深度保护给出 #NUM!。
- Core/Worker：`customFormula.read { revision } -> { definitions, revision }`；`customFormula.change { sheetId, revision, action: {kind:'upsert', definition} | {kind:'remove', name}, projection } -> { changed, definitions, projection }`。definitions 为 Rust 全目录投影；Worker 成功变更递增 revision 一次，返回唯一可见投影。
- WASM：`read_custom_formulas() -> Result<String,JsValue>`（JS为JSON array string）；`change_custom_formula(sheet:u32, action_json:&str) -> Result<bool,JsValue>`。宿主原 `registerCustomFormula`/async/unregister API 保留；008为native CustomFunctionRegistry新增默认contains查询、WASM同步/异步覆盖，用户表达式拒绝同名callback。
- Rust public：`Workbook::custom_formula_definitions() -> Vec<CustomFormulaDefinition>`；`Workbook::restore_custom_formula_definitions(Vec<...>) -> Result<(), &'static str>`；`WorkbookHistory::change_custom_formula(&mut self, workbook:&mut Workbook, active_sheet:usize, action:CustomFormulaAction) -> Result<bool,&'static str>`；`CustomFormulaDefinition::lambda_value(&self, is_custom: impl Fn(&str)->bool) -> Value`。
- callable_scope.rs只限制函数名称的命名空间：把未编译builtin/当前表达式registry/合法词法callee之外的函数调用替换为原生#NAME? AST；求值仍完全交现有Rust Lambda。这使被移除的自定义依赖即便后来出现同名global LAMBDA/host callback，也不会悄悄改变含义。文件允许保留这种dangling错误，支持前向引用；注册新定义时未知函数拒绝。
- 每个声明的形参都必需：lambda构建时用原生ISOMITTED/IF护栏返回WrongArgCount，多参复用原生Lambda检查。缺参/多参均显示#VALUE!；参数错误与正文错误按Rust规则传播。
- React：`CustomFormulaTools(): React.JSX.Element`；Core 导出 `customFormulaPanelAtom`, `runCustomFormulaAtom`, `nativeCustomFormulaDefinitionsAtom`, `customFormulaFunctionSpecsAtom`。后两者仅原生目录投影，不是第二份已提交数据源。

### 008 共享修改请求

1. excel-core lib.rs 注册 `pub mod custom_formulas`；workbook_named.rs enum 新增上述分支，NamedEntry字段pub(crate)，workbook重导出NamedEntry。workbook_names.rs `get_named`、sheet_workbook_sync_context.rs `lookup_named` 在该分支返回 `.lambda_value(|name| 当前registry同名条目是CustomFormula分支)`。定义名称/函数调用仍走已有 native LAMBDA 分派，勿改 eval_core_dispatch.rs。
2. workbook_named_range_snapshot.rs 恢复命名区域时：冲突验证接受已存在 CustomFormula 为冲突；retain 同时保留 Value/CustomFormula（当前只保留 Value 会删除自定义定义）。旧命名值/范围 API 不可覆盖/删除 CustomFormula，须明确 NameConflict/false。
3. workbook_history.rs 注册/引入 `custom_formulas/history.rs`；HistoryChange 新增 `CustomFormula(Box<crate::custom_formulas::CustomFormulaChange>)`；history entry apply/bytes/protection 分支分别 `.apply(workbook,undo)`/`.retained_bytes()`/`ensure_workbook_unprotected`。此变更全工作簿预检，任何定义/历史写前完成。
4. WASM lib.rs include `custom_formulas/mod.rs`；原生文件 payload 新增 `#[serde(default)] custom_formulas: Vec<CustomFormulaDefinition>`（serialized camelCase customFormulas），serialize 读 `workbook.custom_formula_definitions()`；fresh-open parse 恢复在公式安装前、保护恢复前调用 `restore_custom_formula_definitions`。旧文件缺字段为空；不读/执行旧 JS source。
5. UI Core command union extends `RustCustomFormulaCommands`；WasmWorkbook extends `WasmCustomFormulaQueries`；runtime read/change 调用本功能 `readCustomFormulas`/`changeCustomFormula`，返回原生定义目录。Core barrel 导出 command/types/catalog；React ribbon 挂 `<CustomFormulaTools />`。
6. HELP/补全目录在 native builtin specs 后合并 `customFormulaFunctionSpecsAtom`；在 workbook 初始 hydrate / file open / undo / redo 的投影应用时调用 `hydrateCustomFormulaDefinitionsAtom` 更新目录（或每个返回投影附 definitions）。建议 native `functionCatalog` 或 `get_state` 附表达式定义目录，使所有历史/文件入口统一 hydrate。
7. 008 合并中英文 messages.po、translateFeedback 映射、FEATURES 行及 seed；本报告后续补精确清单。

## 文件职责清单

- Rust custom_formulas/mod.rs：定义读出/文件恢复；validation.rs：表达式/调用环校验；change.rs：原子registry变更；callable_scope.rs：原生命名空间限制；history.rs：原生历史事务；tests/custom_formulas/：专项。
- WASM custom_formulas/mod.rs：JSON API 到原生历史转发。
- Core custom-formulas/expression-types.ts：表达式定义 wire 契约；expression-command.ts：对话框命令；expression-catalog.ts：原生目录投影；rust-workbook/custom-formulas/command.ts：传输边界校验。
- React custom-formulas/CustomFormulaTools.tsx：DOM与焦点；custom-formulas.css：现有 token 弹窗布局。
- 各自 test 目录：专项；e2e/custom-formulas/：真实 DOM 操作；docs/custom-formulas/README.md：用户边界。

## 验证

| 命令 | exit | 实际结果 |
| --- | --- | --- |
| `cd excel/spreadsheet-ui-core && pnpm exec vitest run test/custom-formulas` | 0 | 3文件64/64；旧host registry59例+新增expression Core/transport5例。仅证明Core状态/协议，不算native/E2E |
| `cd excel/react-excel && pnpm exec vitest run test/workbook/custom-formulas` | 0 | 1文件5/5；空目录/注册/选择/替换/移除/失败恢复/Cancel/Escape/触发器焦点；deferred请求真实DOM确实出现reading/saving，读取可取消，保存禁取消/重复 |
| `cd excel/rust/excel-core && cargo test --test custom_formulas` 首次 | 101 | lib编译通过，测试错用DivZero及非Copy repeat导致未执行，已修；不计通过 |
| 同Rust专项第二次 | 101 | 实际1/9，发现Expr::Name保留大小写以及测试名SECOND为内置函数；已修scope大小写、测试名改INNERFN |
| 同Rust专项第三次 | 101 | 实际5/9，四例在共享workbook_cycles新enum分支unreachable panic；008已补CustomFormula→现有Lambda cycle walker |
| `cd excel/rust/excel-core && cargo test --test custom_formulas` 最终 | 0 | 9/9；真实Rust注册/替换/移除跨表重算、Undo/Redo、原格子值/公式/格式/邻居保持、数组spill重投、缺/多参、range实参、LET/LAMBDA、JSON定义forward/dangling、global/host冲突、纯参数/间接引用/静态循环、保护原子拒绝 |
| `rustfmt --edition 2021 <本功能Rust源码/测试入口>` | 0 | 最后Rust通过后仅格式调整，无语义变化，复用9/9证据 |
| `wc -l` 自己全部新增源码/测试 | 0 | 最终最大217行（semantics.rs），普通文件≤300；既有custom-formulas/index.ts及types.ts未修改 |
| `git diff --check -- <本功能所有目录>` | 0 | 无空白错误 |
| `rg -n '[\\t ]+$' <本功能全部新文件>` | 1 | 无匹配；补检git diff不会枚举的untracked新文件尾随空白 |

未运行full Vitest/build/typecheck/wasm-pack/Playwright；没有把mock测试当Rust或真实Worker证据。`excel/rust/wasm/src/custom_formulas/tests.rs`新增3例文件真实入口测试（定义先于公式/保护恢复，旧字段缺省为空，重复/环/INDIRECT/source拒绝且原工作簿保持），由008统一跑WASM crate。

最终领域源码/测试指纹（上述所有业务新文件的`shasum -a256`行再hash；不含报告/docs）：`a0fc07b9df73fb648926fe785275224d6c28da6592e8130491a33f68b665b1e2`。Rust共享接线快照指纹（lib/NamedDefinition/两lookup/cycles/history entry/protection/registry trait共9文件）：`380eb4be9b966aac39b7c11fbbfe904c0bd41f6bd0bab40081c1f44b8102d6b6`。共享输入后续若变需008判断重验；无commit/push。

| 覆盖矩阵 | 已完成证据 | 未验证 |
| --- | --- | --- |
| U-01 | 原生9例、Core64例（本次新增5）、React DOM5例；空/正常/错误/reading/saving/取消/焦点齐全 | 真实Worker/WASM31个E2E运行、中英文实际截图/视觉lint |
| U-02 | Rust历史/保护/跨表/数组/定义JSON专项；持久文件与UI多语言用例已写 | WASM完整文件3例、原生下载/打开浏览器往返、seed/原demo回归及共享完整验收 |

## 持久 E2E 与 FEATURES 登记行

`actions.spec.ts` 每项均有1280与390变体；主登记只绑定1280一项。其他文件增加文件/历史/跨表/保护与中文变体。全部真实DOM操作，无浏览器写Core atom。

| ID | 具体操作 | 文件 | 完整主测试标题 |
| --- | --- | --- | --- |
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
| CUSTOM-015 | 接受自定义补全/参数帮助 | `custom-formulas/history-file.spec.ts` | custom completion accepts native definition and shows exact parameter help |
| CUSTOM-016 | 重复参数错误后重试 | `custom-formulas/history-file.spec.ts` | invalid custom expression stays retryable and missing arguments produce native error |
| CUSTOM-017 | 保护拒绝写入 | `custom-formulas/history-file.spec.ts` | protected worksheet rejects custom definition mutation without changing native callers |
| CUSTOM-018 | 跨工作表重算 | `custom-formulas/history-file.spec.ts` | custom expression replacement recalculates consumers in another worksheet |
| CUSTOM-019 | 非法文件拒绝 | `custom-formulas/history-file.spec.ts` | invalid custom formula file is rejected atomically and never executes source |
| CUSTOM-020 | 中文/切换语言 | `custom-formulas/localization.spec.ts` | Chinese custom formula editor preserves definitions after language change at 1280px |

共31个持久E2E（20 actions + 9 history-file + 2 localization）；首版交付时尚未执行，后续部分实跑与修复状态见R1/R2，当前整域未通过。截图路径由Playwright testInfo.outputPath生成：custom-formulas-1280.png、custom-formulas-390.png、custom-formulas-zh-1280.png、custom-formulas-zh-390.png；真实截图及视觉lint待008，未宣称已看图。

## 中英文合并清单（008负责共享翻译文件）

| English msgid | 简体中文 |
| --- | --- |
| Custom formulas | 自定义公式 |
| Define a formula once, then call it in any sheet. | 定义一次公式，即可在任意工作表中调用。 |
| Saved formula | 已保存的公式 |
| New formula | 新公式 |
| No custom formulas yet. | 还没有自定义公式。 |
| Function name | 函数名称 |
| Parameters, separated by commas | 参数，以逗号分隔 |
| Formula expression | 公式表达式 |
| Example: DOUBLE with parameter amount and expression =amount*2. Pass cells and ranges as arguments. Every parameter is required. | 示例：DOUBLE，参数为 amount，表达式为 =amount*2。请将单元格和区域作为实参传入。每个参数均为必填。 |
| Loading custom formulas… | 正在加载自定义公式… |
| Saving custom formula… | 正在保存自定义公式… |
| Register formula | 注册公式 |
| Replace formula | 替换公式 |
| Remove formula | 移除公式 |
| Register custom formula | 注册自定义公式 |
| Replace custom formula | 替换自定义公式 |
| Remove custom formula | 移除自定义公式 |
| Custom | 自定义 |
| Enter a custom formula name and expression. | 请输入自定义公式名称和表达式。 |
| The workbook changed. Reopen the custom formula editor. | 工作簿已更改，请重新打开自定义公式编辑器。 |
| Finish the current operation before changing a custom formula. | 请完成当前操作后再修改自定义公式。 |
| Rust returned a mismatched custom formula result. | Rust 返回的自定义公式结果不匹配。 |
| Rust returned an invalid custom formula directory. | Rust 返回的自定义公式目录无效。 |
| Rust custom formula editing is unavailable. | Rust 自定义公式编辑暂不可用。 |
| Invalid custom formula projection request. | 自定义公式投影请求无效。 |
| Invalid custom formula action. | 自定义公式操作无效。 |
| Use a formula name beginning with a letter or underscore, without cell references. | 公式名称须以字母或下划线开头，且不能是单元格地址。 |
| The custom formula name conflicts with a built-in function. | 自定义公式名称与内置函数冲突。 |
| Use at most 64 custom formula parameters. | 自定义公式最多支持64个参数。 |
| Custom formula parameters must be unique. | 自定义公式参数名称不可重复。 |
| Use at most 8192 characters in a custom formula expression. | 自定义公式表达式不能超过8192个字符。 |
| Enter a valid formula expression. | 请输入有效的公式表达式。 |
| Pass cell and range references as custom formula arguments. | 请将单元格和区域引用作为自定义公式实参传入。 |
| Enter a valid LET or LAMBDA expression. | 请输入有效的 LET 或 LAMBDA 表达式。 |
| Use valid local LET or LAMBDA parameter names. | 请使用有效的 LET 或 LAMBDA 局部参数名称。 |
| Use only declared parameters and local LET or LAMBDA names in custom formula expressions. | 自定义公式表达式只能使用已声明的参数及 LET 或 LAMBDA 局部名称。 |
| Call only built-in functions or registered custom formulas in custom formula expressions. | 自定义公式表达式只能调用内置函数或已注册的自定义公式。 |
| Custom formula definitions cannot contain a recursive call cycle. | 自定义公式定义不能包含递归调用环。 |
| The custom formula name is already in use. | 自定义公式名称已被使用。 |
| Too many custom formulas. | 自定义公式数量超过上限。 |
| Duplicate custom formula in workbook file. | 工作簿文件含有重复的自定义公式。 |
| Custom formulas must be restored into a fresh workbook. | 自定义公式必须恢复到新工作簿中。 |
| The custom formula changed outside history. | 自定义公式已在历史记录之外被更改。 |

Cancel、The worksheet no longer exists.、Another history command is pending.、保护错误沿现有共享翻译。

## 最短调用链与层职责

`CustomFormulaTools DOM → runCustomFormulaAtom → connection customFormula.read/change → Worker handler → WASM JSON API → WorkbookHistory/CustomFormulaChange → named registry/version root → 既有Rust Lambda求值 → 返回目录及可见投影 → Core hydrate/apply → React`。

React文件仅处理渲染与焦点；Core command只持有当前草稿/忙碌/错误，catalog只持有当前native投影；transport校验revision/sheet/projection；native change保证定义/历史原子性；callable_scope只限制名称来源，不引入计算后端；lambda_value构造既有原生AST以复用求值/错误/数组。无新生命周期或controller props、无eval/new Function、无主线程callback postMessage。
