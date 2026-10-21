# 008 独立审查报告

状态：**RUNNING / 待最终证据**。2026-10-20。审查基线 HEAD `1c47e6439657ee18d66db1d194d61dfa44bdf103`，当前为多人仍在实施的 dirty 工作区；本报告不是 008 实现者自审，也不声明整体通过。

## 审查边界

- 完整阅读本树 index、008-integration 的独立终审契约，以及项目 React/feature-wave 两份 skill；按 one-file-one-thing 检查新增领域文件组织。本次线程DOM续审额外完整阅读 frontend-design-codex，按其规则只做静态焦点/布局检查，未以源码替代桌面/移动截图质量证明。
- 已读取 001–008 任务边界与稳定领域报告，实际枚举并读取相关未跟踪产品文件；没有仅凭 `git diff` 判断新功能不存在。
- 只读产品代码，唯一写入是本报告；没有代修、测试重跑、浏览器/WASM 构建、全量检查、子 agent、commit 或 push。
- 已查看 `/tmp/react-excel-seven-features.QjzUox/tracked-before.patch` 的原修改清单与 `untracked-before.tgz` 目录清单。原先已有的 E2E 重排、fill 及共享文件修改不作为本轮新增缺陷；下面发现均关联本目标新保护/目录/seed 的交叉行为。
- 已审 001/002/003/005/006/007 的原生状态、传输、真实 UI 入口及持久测试；007冻结领域及004/008的R5/R6/R8真实候选结算增量已完成静态复核。本次再次派发仅审稳定R9/R10与CF/006测试准备迁移，复用现有证据；不审008当前完整JS门禁后的机械修复WIP，不签最终整体。

## Important 发现与修复复核

### R1：边框权限误检查未写入的选区内部（已修，专项证据已回）

原发现：`excel/rust/excel-core/src/workbook_history_borders.rs` 原第31行在已有实际 `border_plan_ranges` 后仍检查整个选择矩形。保护表仅允许 B1:D2，对 B2:D4 应用 Top，本次只写 B1:D2，却被锁定 B3:D4 误拒。Outside 同样会误检查未写中心。

当前复核：`workbook_history_borders.rs:29` 的历史 targets 与 `:31` 的预检均按实际 border keys；已移除原矩形权限检查。`excel/rust/excel-core/tests/seven_feature_integration.rs:105` 新增 Top/Outside 锁定未写内部格的真实写入、Undo/Redo 回归，`:74` 保留稀疏十字与锁定角格回归，没有删旧拒绝覆盖。

根 agent 转交 008 实测：`border_history` 4/4、`protection` 18/18、`seven_feature_integration` 4/4，合计26项 exit0。前轮 import 编译失败为0项，不计通过。本 reviewer 不重复执行。**本发现静态与专项层面可关闭；完整候选与真实 DOM 验收仍待共享门禁。**

### R2：尺寸 Undo/Redo 可借允许单格回放整列元数据（已修，专项证据已回）

定位：`excel/spreadsheet-ui-core/src/rust-workbook/resize-io.ts:14` 用 `withHistory(input.range, false)` 记录尺寸；`excel/rust/excel-core/src/history_snapshot.rs:50` 捕获该列宽度；`excel/rust/excel-core/src/protection/history.rs:9` 的 Cells 分支只验证 snapshot.range；`excel/rust/excel-core/src/workbook_history_restore.rs:83` 随后直接清除/恢复整列宽。

复现条件：先选 B2 调整 B 列宽，再只将 B2 设置为允许编辑并 Protect，点击 Undo。历史快照 B2 可编辑，保护检查放行，但回放修改整列宽，绕过尺寸属于 sheet metadata、保护下即使允许区也须拒绝的既定规则。Redo 同理。保护设置不进入内容 history，因此这是实际用户操作顺序。

最小修复/证据要求：尺寸历史保留真实轴权限语义；针对“resize → 仅允许 B2 → Protect → Undo/Redo”补一例原子拒绝、尺寸不变、cursor不变回归。不能把所有单格内容/备注历史都改为整表拒绝。

首轮修复在 `protection/history.rs` 比较目标快照与真实列宽/行高，尺寸将变化则sheet guard，覆盖原漏洞但产生新不一致：`workbook_history_format.rs:77`允许保护内可编辑B2改字体，`sheet_format_write.rs:60`自动写真实行高；`sheet_write_value.rs:218`的多行文字也自动增高。原操作合法，Undo却被尺寸比较误拒。已回原owner修复，27/27旧尺寸专项不能代表最终语义。

最终修复已复核：`workbook_history_dimensions.rs:23`从同一次前后像提取真正axis delta，显式权限仅来自Sheet两个内存writer generation；`sheet_format_write.rs:109`的字体/多行派生行高不走显式setter。`:77`在任何回放前核真实端点并对explicit要求sheet权限，`:99`以当前尺寸为基准仅合入本次delta，普通note/content不会覆盖无关外部新尺寸。generation分row/column，validation失败恢复即使触及列宽writer，也不会将没有列宽delta的事务或自动行高误分类；失败history不push。没有Weak活动事务、新尺寸权威或持久来源标记。

根agent转交008实际exit0：seven_feature_integration8/8、protection18/18、border_history4/4；8例包含显式resize/autoFit/reset保护Undo/Redo原子拒绝、B2允许font36/多行Undo/Redo成功、notes Undo保留外部新尺寸、真正axis端点冲突拒绝。**本发现静态及必要专项层面可关闭，最终候选/DOM仍待。** 本reviewer未重跑。

### R3：每次滚动重建整个自定义目录与全内置帮助（已修，专项证据已回）

原发现链：`readVisibleProjection` 每次 `read_custom_formulas` → Rust克隆/JSON序列化 → JSON.parse/validate；投影校验再次 validate；hydrate 再 validate/复制并无相同目录跳过；引用变化触发 custom specs，继而重建/排序全部499/502内置帮助。原生允许256定义、每表达式8192字符，滚动热路径工作量随整个目录增长，违背本目标最小投影/不重复计算约束。没有实测延迟，未称已测到卡顿。

当前复核：`excel/spreadsheet-ui-core/src/rust-workbook/visible-projection.ts:13` 新 WeakMap 只复用同原生实例与已有 revision 的只读目录，不建立可写registry；`excel/spreadsheet-ui-core/src/custom-formulas/expression-catalog.ts:29` 相同连接/相同内容不发布；`excel/spreadsheet-ui-core/src/formula-functions/native-catalog.ts:32` 将内置帮助派生从自定义依赖拆开，`:54` 仅合并已有 specs。这些修改对原发现的重复原生读与无谓帮助重建方向正确。

根 agent 转交 008 实测：目录性能/seed/旧命令必要专项12文件94/94 exit0，覆盖同实例/revision多窗口只一次原生目录读、revision变化/Undo/新文件实例失效、相同hydrate保持目录与组合catalog引用、自定义变更复用内置spec对象。**重复原生读/重复发布/重建内置帮助的发现可在代码与专项层面关闭。** Worker postMessage 仍会克隆每个投影携带的目录；不能把 WeakMap 视为已证明大目录滚动体量已完全消除，最终性能结论保留此残余边界，无须为此引入新版本服务或registry。

### R4：默认 ORDER_NET 种子与全目录 DOM 测试严格数量冲突（代码已修，浏览器待）

原发现：`excel/react-excel/e2e/formula-help/catalog.spec.ts` 原53–55行断言picker恰为内置499项；`excel/react-excel/src/page/demo/sales-orders/sales-orders-workbook.ts:24` 已配置 ORDER_NET，公开目录追加custom specs，实际应500项。

当前复核：`catalog.spec.ts:53` 严格断言内置数+1，`:55` 严格名称集合=内置+ORDER_NET；`:56` 保留每个内置函数真实 DOM 遍历；`:68` 另断言ORDER_NET原生参数签名与表达式。没有放宽为“至少499”或删遍历。**代码修复通过静态复核，实际浏览器结果待 008。**

### R5：验证候选反复重算同一公式格，恒真规则可被误拒（已修，专项证据已回）

定位：`excel/rust/excel-core/src/advanced_validation/formula.rs:74` 对每次公式格读取重新parse/eval；`:78` 的visiting只防当前递归，没有单次求值结果复用。`excel/rust/excel-core/src/eval_statistics_descriptive_extended.rs:3` 的 RAND 每次调用产生新随机数。

实际可达条件：B1 为 `=RAND()`，A1 的自定义验证为 `=$B$1=$B$1`。提交 A1 时，两次引用同一原生公式格被 CandidateProvider 各重算一次，原应恒真的相等条件几乎必为假，Stop误拒合法输入，Warning/Information也会弹出错误确认。既有宿主自定义函数还可能被多次执行。普通原生 provider 经Sheet/reactive缓存读同格值，并不采用这种每次引用重算语义；`workbook_input.rs:88` 也明确要求不得用另算 RAND/自定义函数的结果替代已安装结果。

候选值覆盖与跨表/数组依赖的重新求值确有必要；按(sheet,address)缓存完整结果可以修复重复执行，但仍需确保无候选依赖的volatile公式与原生真实缓存一致，不能把单memo回归当完整语义证明。`clipboard_paste_values.rs:20` 已对custom literal采用整批安装后验证；单格formula也已有安装/回滚，是否复用该事务由原所有者决定，不引入第二计算/依赖/spill登记系统。已立即回报根 agent，需补重复引用、跨表及spill结果一致性专项。本 reviewer 未运行复现测试，不将源码推导冒称运行证据。

续审代码：004已删除整个CandidateProvider（visiting/memo/虚拟spill均删除），`advanced_validation/formula.rs:23`仅使用WorkbookEvalProvider。原formula安装/快照/observer/Table row回滚提取至 `advanced_validation/input_transaction.rs:6` 的apply_validated_input；`workbook_input.rs:46`的literal和`:64`的格式化数字也走真实安装后验证。原所有者回报确定性NEXTVALUE回调三例先实际0/3红复现，临时memo26/26只代表已废弃中间态。

续审实际证据：真实安装首轮33例为26过7败，exit非零，定位为外层Store.batch尚未结算依赖/spill；没有据“Provider已删”提前关闭。最终冻结增量已复核：`advanced_validation/input_transaction.rs:8`从真实源range收集现有Store反向依赖数组，再flush→recompute_array_formula_groups→flush；`:27`在第一写前暂停所有Sheet地址订阅，直到接受或完整恢复再resume。没有全表失效、第二缓存、候选provider或虚拟spill布局；无关volatile没有另算路径。

共享接线已核对：普通literal/格式化数字/formula走同一个真实安装事务；hyperlink显示文本沿该事务，Table表头沿原TableDefinitionChange正/反apply；clipboard仅在延后验证的写入中暂停全部Sheet，fill及inferred-fill共用原事务；计算列/扩行/resize/append/结构继承沿各自已暂停全部Sheet的事务，在完整候选验证前及失败恢复后调用同一结算hook。原生数组重投仍使用既有依赖顺序算法与实际缓存，不从公式文本另建依赖图。

004报告及根agent转交最终实测：2026-10-20 19:59 CST `cargo test --test advanced_validation` **38 passed / 0 failed / 0 ignored / 0 filtered，exit0**，原23例全部保留；前一轮测试helper编译错0项另列。`repeated_references.rs`覆盖同格、跨表、spill锚点/成员的NEXTVALUE计数不增加及原生RAND精确缓存；`candidate_observers.rs`覆盖literal/percent/formula/paste/两种fill扩大和缩小，拒绝本跨表0通知、接受最终1次。领域聚合hash `5349d5cb4d3db6d54d30886469181a4c20eaa78885bb12a6340dfd3dd8e1899c`不包含008共享文件，非整体验收指纹。**R5在代码与必要专项层面可关闭；本reviewer未重跑，WASM/DOM仍待。**

### R6：候选改变溢出形状时，新成员仍被当成原空白（已修，专项证据已回）

定位：`advanced_validation/formula.rs:64` 仅按原生当前已安装的 `spill_anchor_for(addr)` 追溯锚点；`:74` 无当前公式源码就直接返回旧值。`sheet_spill.rs:84` 的该索引只表示已安装spill成员，不能表示尚未写入候选将新生成的地址。

确定性条件：A1初值1，C1为 `=SEQUENCE(A1,1,1)`，C2当前为空；A1自定义验证 `=C2=2`，再输入2。literal的预写验证看到C2无旧anchor、无源码，返回Null并拒绝；但写入后的真实C2应为2。`tests/advanced_validation/formulas.rs:4` 现有动态数组专项固定 `SEQUENCE(2,1,A1)`，只改变成员值而不改变形状，因此不能证明这一场景。区域聚合也只枚举旧稀疏地址（`formula.rs:100`），同一新成员边界需一并验证。

已立即回报根 agent，由004原所有者选择复用现有候选事务的最小修复；需新增shape扩展时新成员直接引用及区域聚合的接受/拒绝原子回归，不由review另造第二spill登记系统。本 reviewer未运行复现测试，结论为上述真实预写路径的源码推导。

最终修复同R5，已删除旧provider而非修补旧spill索引。原生真实安装后，在所有Sheet订阅暂停期结算现有依赖与spill，再由WorkbookEvalProvider读取实际成员与稀疏范围。`candidate_shape.rs`新增literal/200%扩形新成员直接读取及Undo/Redo、跨表SUM包含新成员、缩形清理旧成员、扩/缩拒绝回滚保留邻格，以及Table表头与hyperlink显示文本的真实spill读取；`candidate_observers.rs`另覆盖paste/两种fill形状及本跨表原子发布。上述用例均包含在最终38/38 exit0中，保留首轮33例7败记录，不将固定shape旧用例当作新shape证明。**R6在代码与必要专项层面可关闭；最终文件/Worker/DOM仍待。**

### R7：既有 WASM API 快照门禁未覆盖新增功能入口（已修，门禁证据已回）

定位：`excel/rust/excel-core/tests/architecture_invariants.rs:62` 的 `wasm_family_sources` 仅收顶层 `wasm_*.rs`，并在 `:65` 手动追加 hyperlink/mod.rs。`excel/rust/wasm/src/lib.rs:114` 的notes/comments/protection/custom_formulas目录及`:157`的advanced_validation/confirmed_input.rs均不在collector内；fixture也未出现read_note/change_note/read_custom_formulas等实际新增公开方法。

因此现有 `wasm_public_api_signatures_unchanged` 即使exit0，也不能证明本目标公开签名已经显式审查。当前fixture相对HEAD只有find_fill_down_end，属于原dirty基线已有变更，不是新七项API证据。已回报根 agent，建议008获得精确授权后扩展既有collector覆盖真实公开入口、人工审查新增签名、最小更新fixture并运行原门禁；不能盲目再生或把目录内测试/私有辅助方法当公开API。此为验收完整性Important，不声称已发生运行时API破坏。

最终修复已复核：collector精确追加notes/mod.rs、comments/mod.rs、protection/mod.rs、custom_formulas/mod.rs与advanced_validation/confirmed_input.rs，不扫测试或私有persistence辅助；fixture仅加10个新增真实公开签名（四对read/change及getLastValidationFailure/setCellInputConfirmed），未删改旧签名，保留旧dirty的find_fill_down_end。根agent转交008 architecture实际10passed/1既有snapshot generator ignored、exit0，包含该API门禁。**本发现可在代码与门禁层面关闭；不把有意ignored生成器混作完整E2E零跳过证明。**

### R8：Table 新记录的 custom literal 仍早于同行继承公式验证（已修，专项证据已回）

定位：`workbook_table_input.rs:225` 的deferred_formula只处理显式公式；`:285` 的literal/格式化数字先走set_cell_input及apply_validated_input，`:311`之后才安装同行继承公式并在`:349`最终全行验证。prepare_resize只准备几何/新表头/汇总，并未提前安装新行计算列；首次空Table记录也走同一顺序。

实际条件：Table的B列计算模板 `=A3*2`，新增记录A3输入literal 2；A3的custom验证 `=B3=A3*2`。完整记录应为A3=2/B3=4并通过，但输入分支在B3尚空时提前验证并拒绝。现既有Table回归对“显式公式等同行继承后验证”有覆盖，普通数字验证不读取同行，不能替代本custom literal场景。

已回报根agent，由004/008按当前文件所有权协调最小修复，复用既有整行安装/验证/回滚，不新增通用bypass或第二成功链。必要专项：普通新行及空Table首行的literal/格式化数字接受、真正失败的全行/几何/redo原子回滚。未运行复现测试，当前源码推导不冒称运行结果。

最终复核：`workbook_table_input.rs:219`只在既有inherited_row路径按输入类型分别保留formula/parsed literal；`:286`用同一模块的`install_parsed_input`安装literal/格式化数字，不先调用单格验证；`:343`完整安装本行全部继承公式，`:349`先真实结算，再逐个changed地址统一验证。错误分支恢复原输入范围与Table定义并在订阅恢复前重新结算；成功仍收进原Table单条历史，没有全局关闭验证或另起成功链。普通非继承输入仍沿原单格路径。

`table_candidate_rows.rs`覆盖普通新行与空Table首行各literal/percent接受，实际同行B3结果及跨表Table聚合、两轮Undo/Redo；真正失败覆盖整行内容/几何/本跨表订阅0及既有redo保留。全部包含于最终38/38 exit0。**R8在代码与必要专项层面可关闭，完整候选/真实DOM仍待。**

### R9：原生参数帮助的None形态使Core拒绝整目录（已修，wire与真实构件证据已回）

原实际故障：Core validator仅接受`repeat===null`，真实WASM非重复帮助为`repeat`自有键、值`undefined`，JSON往返后才省略，因而拒绝整个目录并使页面启动失败。前轮“原始对象省略键”的简称不精确，此处按005实际观察纠正。首次目标256项仅1 failed、255未运行，现场`/tmp/react-excel-seven-targeted.HG52iT/report.json`仍保留，不计为通过。

冻结修复已复核：`formula-functions/help/validate.ts:19`只将无组形态改为nullish接受，仍要求全部args.repeats=false；`:21`起保留非空组整数/长度/边界/min_groups及参数标记一致性验证。`types.ts`精确标记可选/nullable；`test/formula-help/catalog.test.ts:22`分别检查省略、显式undefined、null可接受，三种形态均拒绝重复参数，并保留缺帮助/错组/空组/越界/错误min_groups等拒绝覆盖。没有fallback、放宽v2其余字段或改原生目录数据。

CI迁移合理：普通Core测试移除依赖gitignored full构件的两例与fs/path/url载入，保留全部纯wire回归；根转交实际3文件25/25 exit0，先前含真实构件27/27仅作历史补充，不冒作当前CI全绿。`e2e/formula-help/catalog.spec.ts:13`沿既有HELP-001对当前lite/full原始对象与JSON往返对象各调用同一Core validateFunctionCatalog，未复制validator、skip缺构件或修改CI；完整499/502、唯一名称及逐帮助字段断言仍保留。

本reviewer亲读既有`/tmp/react-excel-seven-cf-diagnostic.h1YpJk/report.json`：HELP-001 lite/full两个精确标题均一次passed、retry0，整轮3/3且skipped/unexpected/flaky均0；其中第三例是CF诊断，不归到帮助通过数。**R9在代码、纯wire专项及真实构件传输层可关闭；HELP-001仍是技术补充，不代替真实用户DOM主入口。R4全picker的HELP-002浏览器绿证据仍待。**

### R10：Core历史对protected整表短路，合法允许区Undo未到原生（已修，专项与真实DOM证据已回）

008七域smoke实际复现：允许区E2写入与G2依赖重算已成功，Undo却被`history/rust-history-command.ts`旧整表protected判断拦截，未发送history.apply。这不是原生按真实写入范围拒绝，而是Core重复权限语义不支持新允许区。

冻结diff仅移除sheetProtection/getSheetProtection引用及该整表权限分支；`rust-history-command.ts:50`的编辑/表变更/clipboard/结构/merge/Table忙碌守卫、`:65`的sheet key/index身份检查与`:73`受影响表存在检查仍在；后续ACK的身份/投影/geometry校验和失败零发布路径未变。真实cell/metadata/dimension权限继续由Rust既有原子守卫决定，没有按label/kind另造TS权限表，也没有改成假native成功。

`test/rust-history-command.test.ts:125`起原拒绝场景改为真正发送一次native且收到拒绝，检查原projection、尺寸及history cursor不变；跨表cut拒绝覆盖保留，新增protected editable-range接受Undo/Redo ACK。根转交Core23/23 exit0。本reviewer亲读`/tmp/react-excel-protection-history.Q2Fwr9/report.json`：原allow-selection主场景1280/390各一次passed、retry0，2/2且skipped/unexpected/flaky均0。`e2e/protection/protection.spec.ts:30`仍真实允许E2→Protect→写2/G2=158、F2写100被拒保79、Undo恢复E2=1/G2=79且E3=2；未删除锁定邻格或历史断言。**R10可在修复、Core及该真实DOM场景层关闭；这两例不是全部保护入口/跨域或最终完整E2E证明。**

Critical：本轮未发现已确认项。以上分级均为 Important，未发现不等于全范围已证明无缺陷。

## 本次稳定测试迁移审查

- **CF准备迁移可接受，未弱化功能验收。** `advanced-conditional-format/support.ts:23`仍从真实File→New blank开始，仅将五次逐格输入准备替换为系统Clipboard TSV→真实Paste按钮→Pasted cells状态及原生投影ACK；`:37`严格核对3×3九格（五个原非空值及四空格），最后恢复原A1:A3选区。没有Core atom/Worker/native直接写值。全部CF正文/阈值/图标/隐藏/合并/冻结/邻居/文件断言及后续write helper保留；Undo/Redo按最近功能动作相对回放，不依赖旧准备历史条数，两处Undo-disabled仍对应未调用start的seed或文件重开。
- 原30秒首败发生在teardown，不能归为数据丢失；延长诊断的原场景33.227秒passed只作定位。之后原30秒预算`/tmp/react-excel-seven-cf-fixture.OrRZo1/report.json`的hidden1280、hidden390与icon-number1280均一次passed/retry0，3/3无skip/fail/flaky，分别16.350/15.672/12.684秒；本reviewer已读精确标题和result。当前helper SHA-256 `342df89f85b186374ca5ae7f32246fbf37efac4cbcbb4d141d9eda193a5eb573`与003冻结报告一致。仍不能用三例替代70项/35主操作及截图。
- **006数学与虚拟化准备迁移静态可接受，当前R2浏览器待。** unchanged import-seed的E2=1、E3=2；`custom-formulas/fixtures.ts:8`统一为`=DOUBLE(E3)`，`:11`先真实Name box定位并严格见2，然后仍由公式栏输入K3。4→6、#NAME?、#VALUE!、跨表10→15、Undo/Redo、文件定义/公式原文/重开、保护/非法文件不变等原断言全部保留，未把期待4改成实际2或修改产品/原数据。
- `fixtures.ts:39`依次真实Name box定位A2/A3/G2，等待目标可见与data-projection-retained=false，再严格检查SO-10001/SO-10002/79；这避免窄屏虚拟卸载假设，不绕过真实DOM。邻居核验末尾停G2不写内容/history；所有焦点/焦点循环断言在此前，调用者通常随后结束；注册用例在`actions.spec.ts:30`后明确重新定位K3并核原日期2026-09-04，与注册前相同。其余目标结果在neighbors前验证，文件/跨表恢复已有显式定位，未依赖已滚离目标。
- 已只读核对006四文件聚合SHA为`f7807fc090311b3ecfd61eacbdf650245a6bef01fba81f2bddb977cafc536ac3`，与冻结报告一致。31例list仅采集；既有`/tmp/react-excel-seven-smoke-repair.8zNSXd/report.json`实际4 passed/3 failed/10未运行不能写成绿灯，三项窄屏虽然先过4/6结果，仍在旧neighbors失败；新R2 helper尚无重跑通过结果。

本轮没有新增Important/Critical。008完整JS门禁首轮Core3517passed/4failed（3521项）、React608passed/2failed（610项）及相关编译失败仍是未绿证据，当前机械修复不在本轮范围；不因上述具体修复关闭而签整体。WASM文件13/13与lite/full构建exit0是008已报专项证据，也不代替最终256/完整E2E/955绑定逐项结果、截图和全量gate。

## 稳定领域的静态结论

| 检查项 | 静态结论与定位 | 运行证据边界 |
| --- | --- | --- |
| 备注原生所有权/空格投影 | ✅ `notes/mod.rs:24` 为 Sheet 独立稀疏正文，`notes/history.rs:37` 沿既有历史，WASM `notes/persistence.rs:46` 合并空白格marker；React `notes/NoteTools.tsx` → Core `notes/command.ts:121` → runtime notes.change，不是UI镜像 | 报告Rust4/Core9/React5，008文件WASM3/3；仅多行note smoke已过，全部26项与截图待最终 |
| 备注取消/错误/结构 | ✅ 草稿与提交分离，Cancel在loading可取消、saving拒绝；`notes/mod.rs:74` 插入越界拒绝、删除带清理，原生history结构专项保留正文 | 仍需原生文件/合并/冻结/同格线程实测 |
| 保护原生预检/历史 | ✅ `protection/coverage.rs:4` 用矩形并集覆盖而非扫描整表；`protection/history.rs:9`跨表Cells预检；history cursor在apply成功后移动。R2真实axis delta/显式writer权限保持autoheight可撤销；R10删除重复TS整表拒绝 | R1/R2专项、R10 Core23/23及允许区DOM两宽2/2、008文件WASM2/2；不代表所有最终DOM/写入面 |
| 高级条件格式 | ✅ `advanced_conditional_format/threshold.rs:24` 使用完整稀疏原生数字域；公式以规则origin求值；`icon_set.rs:68` 原生给索引/反向/showValue。显示投影不写基础样式，renderer只绘制；真实Paste准备未弱化断言 | 报告原生新增12/既有24，Core37/React21；原30秒窄验3/3，全部70项/35主操作和截图待 |
| 参数帮助语义 | ✅ 重复组/固定尾参通过 `formula-functions/help/signature.ts:4` 定位，整个调用（含光标右侧）词法扫描见 `parse.ts:80`；LET未完成value、MAP尾lambda、SUMIFS成对参数与零参均有专项。限制双语显式记录，未将TSV条数当语义证明 | 报告full/lite各4、Core52及LET10、React12；HELP真实新入口002/003/004/008逐ID登记，001仅内部构件补充，005/007沿旧CALC主ID扩展、006只读文件补充；全部真实DOM实测仍待最终 |
| 自定义表达式 | ✅ `custom_formulas/change.rs:17` 原生先守卫再改唯一named_values，使用既有LAMBDA与name依赖失效；`validation.rs` 拒名称/参数/引用/递归；`callable_scope.rs:26` 防已移除依赖落入宿主callback；fresh文件先定义后公式 | 报告原生9/Core64/React5，008文件WASM3/3；旧R1四个桌面passed，新R2定位后31项仍待；R3专项已回 |
| 高级验证 | ✅ 不可变批量确认、同revision/session见证及原命令收尾复用；R5/R6/R8已按真实安装/依赖/spill结算增量关闭专项层面，无新provider/缓存/布局系统。004新领域hash `5349d5cb…899c`不冒作共享最终指纹 | 最终Rust38/38 exit0，保留中间33例26过7败；Core11/React5复用旧证据、008文件WASM2/2及创建rule smoke已过；34持久E2E/17主操作待 |
| 线程原生/状态/历史 | ✅ `comments/mod.rs:12`独立Sheet map，`comments/types.rs:61`验证可达事件状态/作者/正文/本机日期；`comments/history.rs:7`先权限及合并锚点预检、每动作同一content=false历史，时间回拨夹紧不重造Undo时间；`comments/structure.rs:5`结构边界/迁移与预算已接 | 007冻结hash `60746cac80216ca5faa8a68b00077e771bb8dab420e82fa520a58989f8873ba7`，Rust8/Core44/React5 exit0；不替代共享候选与DOM |
| 线程文件/投影/同格共存 | ✅ WASM `comments/persistence.rs:23`在fresh候选恢复并拒重复/坏线程；`:36`只枚举标记地址，notes相邻append互补同格空白标记。`wasm_bulk_wire.rs:161`显式camelCase，`cell-io.ts:39`/projection clone保留；frozen复用普通窗口，React与Canvas独立绘制note和comment而不复制正文 | 008文件WASM3/3与新建线程Undo/Redo smoke已过；全部51持久E2E、同格共存、最终截图仍待 |
| 线程Core/DOM/主登记 | ✅ `comments/native/command.ts:76`丢弃旧连接/表/revision响应，`:138`验证原事件前缀与唯一新增动作；CommentTools草稿Core、React只焦点与DOM，Close在loading可取消而saving禁关；CommentTimeline文本节点显示作者/正文并明确非认证身份。FEATURES COMMENT-001至028逐行精确标题，宽度变体不是第二primary | 28主登记、51采集仅静态/编译证据；1280/390英中焦点/布局截图、原生文件/merged/frozen/Canvas实际结果待008 |
| renderer职责 | ✅ react-cells/canvas-cells自身绘制metadata，不倒依赖应用；React用opacity隐藏值保留文本，原始复制仍经native；普通格避开merged覆盖，空格metadata由WASM补入 | 既有最小renderer单测非真实Canvas/冻结/合并视觉证据；截图待 |
| 文件组织 | ✅ 本轮枚举的新增稳定产品文件均≤300行（TSV数据豁免）；未见借独立目录重复创建计算后端、生命周期或controller props | 共享存量大文件只按必要注册审查，最终line/presentation/cycles gate待 |

上述✅仅表示已审源码与现有专项对该子项支持，不能替代整个功能行验收。

保护能力边界：本目标保证受支持的React→Worker→WasmWorkbook/Workbook语义用户命令在原生Workbook守卫内原子执行；当前未确认维护Worker可绕过该守卫的链路。尺寸入口 `wasm_workbook_viewport_persistence.rs:14`先检查sheet权限，格式入口在 `wasm_workbook_autofill_format.rs:94`或WorkbookHistory实际计划守卫内。任意native宿主经公开sheet_mut拿到&mut Sheet后调用set_format/set_row_height，属于既有低层原始存储API，不是保护安全隔离边界；不据此扩scope要求Sheet复制保护map，也不声称所有原始Sheet写入都强制保护。独立WasmSheet（`wasm/src/lib.rs:49`）自持另一Sheet，并非当前Worker的受保护workbook句柄。

007指纹备注：根agent确认comments/history.rs仅被模块递归rustfmt纯格式触及，语义未变；007报告的60746cac…ba7为格式前领域指纹，最终共享冻结后需重取，不能将旧hash冒作最终字节一致证据。

## 覆盖矩阵逐项验收

| 矩阵 | 当前结论 | 收口所需 |
| --- | --- | --- |
| N-01 | 待证据（原生/UI静态✅） | 实际React主E2E全部passed、错误/焦点结果 |
| N-02 | 待证据 | 文件WASM/原生最终候选、1280/390英中截图、与线程共存及合并冻结/Canvas |
| P-01 | 待证据（R2专项、R10具体DOM发现已关闭） | 最终候选尺寸/保护与全部主入口实际结果；当前允许区两宽2/2不代表整域 |
| P-02 | 待证据 | 当前候选跨模块/跨表/历史/原生文件与多语言窄屏 |
| C-01 | 待证据（原生/UI静态✅，窄验3/3） | 全部35主操作真实DOM结果，保留原30秒预算 |
| C-02 | 待证据 | 文件、隐藏/合并/冻结、icon-only复制与截图 |
| V-01 | 待证据（R5/R6/R8代码+38项专项已关闭） | 最终Stop/Warning/Information真实写入与恢复DOM、文件 |
| V-02 | 待证据（R5/R6/R8专项已关闭） | 不可变批量确认、同批依赖/跨表/数组/Table/取消/revision变化、原命令收尾与文件 |
| H-01 | 待证据（R9 wire/真实构件已关闭） | HELP-001技术补充不可替代每ID唯一DOM主E2E；格内/公式栏分别覆盖及R4全picker |
| H-02 | 待证据 | 英中/1280/390、只读不改文件/history与最终catalog对应构件 |
| U-01 | 待证据（原生/UI静态✅，R2准备静态通过） | 新R2 Name box定位后实际两宽调用/替换/移除/错误及完整31项结果，R3专项已回 |
| U-02 | 待证据 | 当前WASM文件、依赖重算/保护/history/语言/窄屏结果 |
| T-01 | 待证据（007冻结域静态✅） | 28主操作实际原生线程/作者显示名/回复/解决/重开真实入口结果 |
| T-02 | 待证据（原生/UI静态✅，文件WASM3/3） | 51持久E2E、同格note独立共存与空格/结构/history/文件/合并冻结/Canvas及英中截图 |
| X-01 | 整体待证据（具体R9/R10已关闭） | 七项最终挂接/原生跨域、所有新增实际操作的唯一主E2E实测；不得以代表smoke替代256及完整E2E |
| X-02 | 待证据（R7门禁已关闭，完整JS仍未绿） | 最终候选指纹、全量门禁、零失败/跳过/重试的完整E2E与955绑定--results逐项核对；collector/API旧缺口已修 |

根 agent 已将全部 Important 交回原所有者；最终共享接线与最终日志到齐后，本 reviewer 只复核修复/新增范围及证据，不重复全量。

## 2026-10-21 新最终窗口：冻结 E2E 准备增量静态复核

本轮为新 reviewer 接手后的增量，不改写上述 R1–R10 的历史结论。已完整阅读新版 `008-review.md` 派发说明、index、008 任务及本报告，读取 001/002/004/006/007 本轮交付和 008 验收交接记录；按仓库 React Excel / feature-wave 技能核对真实入口、邻居及原生链路。本轮只读产品、只追加本报告，没有运行任何测试、浏览器、cargo、build、WASM 重建或门禁，没有派 agent、commit/push。

机器重启后旧 `/tmp` 原始日志、JSON、trace、截图和初始 dirty 备份已丢失。上文“本 reviewer 亲读”的旧路径描述属于旧 reviewer 当时的历史记录，本轮没有重新读取这些已丢失产物，不把历史总数当作新最终候选的可复核证据。新最终原始产物以 `.codex-artifacts/react-excel-seven-features/acceptance-20261021.LeIzkC/` 为准，仍由 008 唯一执行与提供。本轮没有读取未完成门禁的中间结果并签收整体。

本轮已枚举相关未跟踪 E2E 并实际读取以下冻结源码；没有只凭 `git diff` 审查。只读 SHA256 核对全部匹配交付报告：001 actions=`bad92700…f85d6`、persistence=`20c48c38…f36a5`；002 persistence=`9bcec60f…a9952`；004 support=`6803de08…05fb78`、batch=`f139667e…cb3cf`；006 history-file=`fd41fd13…6ee40`；007 boundaries=`24248177…359f`。这些是文件身份核对，不是浏览器通过证据。

- **001 准备静态可接受，未见弱化。** `e2e/notes/actions.spec.ts:101` 先由真实 Name box 选择 K3，严格检查原日期 `2026-09-04`，再通过真实公式栏清空/Enter并等待空值与非 retained 投影；`:107` 起仍检查 G2 公式 `=E2*F2` / 结果79、K3空白格备注的创建/读取/marker、Undo只移除备注且内容仍空、G2备注和原邻居。`e2e/notes/persistence.spec.ts:56` 真实读取 B2 非空且不同于自建备注的种子原文；`:69` 删除 A 列后严格检查 Acme Co.及原 B2 种子备注移至 A2，Undo后检查 A2/B2 原值、各自 marker和两篇不同原文恢复。没有把幸存 seed marker误删或仅删除失败断言。
- **002 严格文件预期静态可接受。** `e2e/protection/persistence.spec.ts:18` 仍用完整数组 `toEqual`，精确要求 sheet0 protected/E2唯一范围及 sheet1 open/Summary A71:A73唯一范围，约束完整对象、顺序及长度。该 Summary 范围确来自 `sales-orders-workbook.ts:51`，没有为测试另改 seed。`:24` 后仍实际 Unprotect→打开下载文件→读取恢复状态，并保留 E2可写、F2拒绝保79、Escape及Undo恢复E2=1的断言。
- **004 权限与控件迁移静态可接受。** `e2e/advanced-validation/support.ts:10` 在当前真实 browser context授予clipboard-read/write，后续仍走原 Copy/Paste DOM和系统剪贴板；没有mock。`batch-input.spec.ts:40` 的实际 `Fill selected range` combobox/down与 `FillTools.tsx:18` 的真实 select及同一 fillSelectionAtom一致。三个两宽case仍严格检查确认前整批零写、Continue原范围写入、Cancel后目标不变、单次Undo整批回退、source与邻格保留；取消case还验证下一次Undo才移除既有源编辑及规则历史。新增权限不替代任何业务断言。
- **006 R3 静态可接受，缺参和数学预期未放宽。** `e2e/custom-formulas/history-file.spec.ts:68` 在成功 Register 后等待对话框消失，才重新通过真实 Name box定位K3、检查原日期，再输入 `=DOUBLE()` 并严格要求 `#VALUE!`，避免旧准备响应覆盖目标；没有依靠 sleep。`:93` 改用真实可见空格H11（10:7）并先严格验空，仍要求原生10→替换后15，随后查Summary B11=20并返回订单核验A2/A3/G2。原 `SUMMARY_VISIBILITY` 仅隐藏row9/col6，outline未折叠；H11不在原隐藏行列、合并或验证范围。R1/R2的E3=2、4→6、目录/文件/历史和逐格真实邻居定位仍保留。
- **007 空白与合并准备静态可接受。** `e2e/comments/boundaries.spec.ts:54` 验K3原日期并经真实 Clear contents清空/等待投影及按钮可用；`:63` 第一Undo只删线程且K3仍空，第二Undo才恢复日期，G2线程/公式/79均重新核验。`:78` 先验L3原Express，再用真实 Merge cells入口并明确确认 `Merge these cells?`；合并后严格要求原锚点日期、一个merged marker、普通marker消失、L3清空及原线程，Undo恢复日期/Express/普通marker和原线程。结束前真实选回A2核验邻居，没有用绕过确认的原生直调替代DOM。

**本增量没有新增 Important/Critical，也未发现通过放松预期、删除整批历史或邻居断言消掉真实缺陷。** 以上仅关闭准备迁移的静态疑问；001的3个直接影响case、002两宽文件case、004的6个直接影响case及完整34项、006两项R3及完整领域、007的4个直接影响case及完整领域仍须由008提供本轮真实结果。`--list` 只采集，原184 passed/12 failed/60未运行及旧3525/611报告都不是最终新证据。

本轮明确排除仍在实施的59文件机械lint、CommentTools首次焦点及其回归、legacy native `data_validation_paste.rs`旧普通paste契约；root另转交的 `e2e/editing/data-validation.spec.ts` 对应旧普通All case同样待冻结后仅审实际diff与新证据，不对WIP下结论。R1–R10原有关闭范围与16行覆盖矩阵均维持原边界；全量门禁、单次完整E2E、955主绑定逐结果、最终源/测试/WASM候选指纹与1280/390英中截图仍待，整体状态继续 **RUNNING / 待最终证据**。

## 2026-10-21 冻结增量：焦点、机械格式、旧粘贴契约与 filter 错误分类

按 root 本轮 followup 仅复核下述冻结 delta。已读取007顶部R2报告、008新增持久验收记录和实际源码；为焦点审查完整读取 frontend-design-codex 技能，仅作静态行为判断，不用源码替代截图或真实浏览器。本轮仍只有本报告写入，没有执行测试、检查、浏览器或重建；没有派 agent/commit/push。

- **007 R2首次焦点静态可接受。** `CommentTools.tsx:29` 的就绪/保存收尾 effect只依赖open/loaded/phase，`:33` 从当前作者input的DOM value选择作者或可编辑正文，不读取遗漏依赖的state.author，也不新增状态或ref缓存。受控input仍由Core草稿提供真实值；DOM读取仅用于焦点。作者逐字输入不会重新触发effect，空作者初次loaded仍聚焦作者，保留作者重开/保存失败或成功收尾仍可聚焦正文。已读冻结产品 `b8a39797…3cc` 与测试 `b530b30d…ce60` 所对应源码；`comments.test.tsx:25` 新增延迟read、A/Alice持续作者焦点、关闭工具焦点、重开正文焦点，`:72` 保留校验/重试并新增延迟拒绝后的草稿与正文焦点，`:109` 保留取消慢读/saving禁重复及Escape并新增成功后正文焦点。原线程/身份/纯文本/时间/取消断言未删。007只提供定向eslint exit0；新增6项候选尚未执行，不能复用旧5/5冒称当前通过。
- **59文件机械窗口按root审阅结果接受，关键非格式改动已独立核对。** 已读取持久最终 `format-semantic-equivalence-verified.log` 的实际59/59结论及配套脚本；脚本只为显式return-await和局部draftError改名调整前像后比较编译JS AST，保留的旧13/59日志不作绿证据。root已审此机械范围及Formulah JSX原“ · ”恢复，本reviewer未重复逐59文件重审或重跑脚本。已从 `lint-inputs-before.tar` 读取clipboard前像并对照当前：`system-clipboard-command.ts:236` 只在原try内增加await，原catch继续发布拒绝反馈并返回false；`:299` 后resume链仍只对明确Continue rethrow原error，其余拒绝返回false，未删除失败路径或再造成功链。`comments/native/command.ts:179` 仅将同一validateCommentDraft结果局部改名draftError，原fail分支及后续真实命令不变。等价日志不代替完整JS/类型/lint结果。
- **旧native普通All契约迁移可接受。** `tests/data_validation_paste.rs:190` 先用合法A1=4/B1=9和默认Stop规则，严格要求普通All与带history的20粘贴都返回DATA_VALIDATION_FAILED，保持值/邻居/规则/空undo-redo/无pending；仍验证随后21单格被拒。合法6的All粘贴成功且恰一条history，Undo回4、Redo回6、邻居及规则仍不变。没有生产bypass或删旧其余五例。该case不是把真实新语义改回绕过验证。
- **对应DOM迁移静态可接受，浏览器结果仍待。** `e2e/editing/data-validation.spec.ts:95` 仍经真实Go to、系统Clipboard及Values/Paste按钮：7和2的两格输入对Values与普通All均拒绝、H45/H46保5/0.5且Undo disabled；之后7/0.75的合法All严格写入两格、Undo恢复两格、Redo再次恢复合法值，H47原Ready邻居仍验。没有直接Core/WASM写值、放宽为部分成功或删除历史断言；root确认旧标题无FEATURES绑定，不将改标题误计为操作登记通过。
- **filter三入口错误分类修复静态可接受。** `workbook_filter_engine.rs:11`、`workbook_filter_rules.rs:96`、`workbook_filter_range.rs:35` 均保留custom-call优先，再明确检查sheet存在、调用真实sheet保护，最后才scan或commit。无效sheet因此返回InvalidSheet，真实保护仍在第一写前拒绝；没有用改测试容忍ProtectedWorksheet掩盖unknown误分类。`tests/engine_owned_filter.rs:722` 原apply/reapply/clear unknown断言保留，新增apply_filter_range unknown断言。已实际读取持久 `native-filter-validation-targeted.log`：data_validation_paste6、engine_owned_filter25、filter_range5、protection18，四段均0failed/0ignored，共54 passed；root转交该过程exit0。该证据只覆盖本批专项，不代替完整default/lite。

**本批没有新增 Important/Critical，未见断言弱化或保护权限旁路。** 焦点新测试、对应DOM和完整门禁尚待。本次filter是真实Rust产品变化，旧lite/full WASM hash不能继续声称与新源码一致；008须唯一重建两构件并让后续DOM证据绑定新hash。完整default→lite唯一过程session62380仍由008持有，本reviewer未读取未完成中间结果作通过判断。R1–R10和16行覆盖矩阵仍保留各自历史证据边界，整体继续 **RUNNING / 待最终证据**，等待最终源/测试/WASM指纹、单次完整E2E、955逐结果绑定与英中两宽截图。

## R11（Important）：拒绝后公式栏同草稿焦点更新使配置 Stop 提示立即失效（代码/Core专项已修，真实DOM待）

这是008本轮真实浏览器发现编号，不是第11轮修复。已只读复核此 delta、相关主链和持久红绿证据，没有重跑检查或重复审全部七域。

实际失败证据：本轮持久 `targeted-169.xKSZKP/status.tsv` exit1，`audit.json` 为14 passed /3 failed /152未运行、flaky0；三失败分别是custom-formula的Stop配置文案1280/390和blank-policy的1280。配置提示精确 `Enter a positive quantity.` 不可见，仍能看到通用editing拒绝；零写/保草稿不等于配置提示已正常显示。未运行152项不是验收skip通过。已读 `stop-native-diagnostic.log`，刚构建lite返回精确DATA_VALIDATION_FAILED，detail的stop/title/message完整，问题不在原生丢失文案。

根因链已核对：`FormulaBar.tsx:146` pending禁用输入，`:98` rejected后恢复焦点；`:52` onFocus针对已有源调用同一draft/source的editingDraftAtom。原 `updateEditingDraftState` 每次分配新冻结session，而 `confirmation-state.ts:59` 正确要求单格提示的session引用仍一致，故同内容的无语义更新把刚保存的提示见证立即作废。`commit-cell-editing.ts:174` 原生拒绝时确实先offer带详情提示，未见原生写入或JS假成功绕过。

冻结修复仅 `editing/session-domain.ts:62` 新增3行：只有原状态drafting、source非null、draft与有效source均不变才返回原state。`EditingDraftInput` 只含draft及可选source，不含可被guard误忽略的目标坐标；有效source为空缺时仍取原source。真正draft变化或source切换继续生成冻结新快照；`startEditingSessionState` 仍无条件创建新session，cancel后重开不会复用旧身份。原idle no-op、提交ticket锁、原selector的连接/session严格守卫、commit成功/失败收尾和全部E2E断言均未更改，没有放宽旧提示跨会话有效性，也没有复制确认状态或增加生命周期。

`test/seven-feature-integration/validation-editing.test.ts:13` 从真实commitCellEditingAtom收到带原生detail的拒绝并检查request一次、lifecycle rejected；`:27` 同draft/source及省略source的更新均严格保持同一个session和同一个完整Stop提示，且不重发请求。`:43` 三种反例保留真实draft变化/source切换/cancel+同内容重开，要求新session且旧提示null、仍只发一次request。已实际读取持久 `stop-session-regression-red-feedback.log`：该保持提示case先1 failed，另外3 passed，失败确为selector返回null；`stop-session-regression-green.log` 修后13 files /83 passed。测试通过不是通过改selector或放宽E2E文案得到。

**R11修复在代码与Core专项层面可接受，无新增 Important/Critical。** 真实原3失败加390 blank共4例尚待008重跑，后续剩余151及最终单次full仍待；不据83项Core绿灯关闭真实DOM缺口。Rust/WASM本次未变，继续使用本轮filter修复后新lite `105b6798…1eedd` /full `4ecb0ab5…dec34a`，不重复重建。008唯一完整JS/types/build/lint过程21255正在重证，本reviewer未将其未完成结果记绿。整体及16行矩阵继续 **RUNNING / 待最终证据**。

## 2026-10-21 五域20张真实PNG与R11 DOM增量审查

本轮已阅读派发说明最新顶部与index增量，复用既有稳定代码审查；按frontend-design-codex的真实截图要求，亲自逐张以`view_image`原图打开`remaining-151.QjsCkJ/visual-20-manifest.txt`全部20张，而非只核对文件存在。另补看当前持久`targeted-169.xKSZKP`已有的输入提示两宽PNG以确认问题。仍只读产品与测试、只追加本报告，没有开浏览器、跑测试/门禁/重建或修改产品，没有派agent/commit/push。下表路径均由该manifest精确定位，文件名相同的两种宽度没有混计。

### 逐图结果

| manifest序号 | 已实际查看的PNG | 当前画面结论 |
| --- | --- | --- |
| 1 | validation-warning-1280.png | 配置标题/完整消息、Cancel/Continue均可见，焦点轮廓清楚，确认框未溢出。 |
| 2 | validation-warning-390.png | 窄屏确认框与双按钮在视口内，消息正常换行，未见裁字。 |
| 3 | validation-chinese-390.png | 字段单列顺序正常、中文和原输入原文完整；截图停在顶部，底部操作按钮在滚动区下方，不能称此图已展示全部按钮。 |
| 4 | validation-chinese-1280.png | 桌面公式帮助后标签/控件错列，见R13；背后输入提示为逐字竖条，见R12。底部清除/取消/应用可见。 |
| 5 | comments-en-390.png | 作者说明、线程、回复框完整，英文动作自然换行，焦点可见，未见裁切。 |
| 6 | comments-zh-390.png | 中文身份边界说明、正文/时间/回复与操作均可读，未见水平溢出。 |
| 7 | comments-en-1280.png | 作者、线程与回复分组清楚，完整操作按钮在面板内。 |
| 8 | comments-zh-1280.png | 双语切换后原线程内容保留，中文动作和作者说明完整，未见遮挡。 |
| 9 | custom-formulas-390.png | 标签/参数/表达式及帮助顺序清楚，按钮全部可见；空白新定义的Remove disabled与状态相符。 |
| 10 | custom-formulas-1280.png | 桌面字段、限制帮助与底部操作完整，焦点轮廓可见。 |
| 11 | custom-formulas-zh-390.png | 中文字段正常换行，GREETING定义与表达式保留，按钮未裁切。 |
| 12 | custom-formulas-zh-1280.png | 中文帮助、参数、定义和动作均完整，未见溢出。 |
| 13 | notes-1280.png | 多行中英正文、字符计数与帮助清楚，Delete/Cancel/Save完整可见。 |
| 14 | notes-390.png | 窄屏正文编辑区、计数和三个动作在视口内，焦点轮廓未裁掉。 |
| 15 | notes-zh-390.png | 中文帮助、原多行正文、计数与底部操作完整。 |
| 16 | notes-zh-1280.png | 中文编辑对话框布局完整，未见文字或按钮遮挡。 |
| 17 | protection-1280.png | 保护能力边界说明、状态与范围列表/操作完整，未见裁切。 |
| 18 | protection-390.png | 长说明正常换行，底部操作换行后完整显示，未见水平溢出。 |
| 19 | protection-zh-390.png | 中文说明与E2允许范围可读，窄屏操作仍在面板内。 |
| 20 | protection-zh-1280.png | 中文状态、允许范围与保护操作完整，未见遮挡。 |

本表仅证明这些已捕获状态的实际画面，不由静态PNG推断键盘交互已经通过，也不把验证的英文Warning确认框当成英文完整配置表单截图。003条件格式/005帮助的八张仍待最终full提供；当前不签五域或七域视觉全部无缺陷。

### R12（Important，新增待修）：活动格输入提示被挤成约40px逐字竖条

`validation-chinese-1280.png`背后提示已经明显异常。为排除modal遮罩/截图滚动位置误判，额外亲自查看`targeted-169.xKSZKP/artifacts/advanced-validation-custom-1063a-ut-native-history-at-1280px/validation-input-message-1280.png`与`advanced-validation-custom-22dfa-out-native-history-at-390px/validation-input-message-390.png`：无modal时，`Quantity`与`Use a positive number. 请输入正数。`仍被挤在约40px宽的高竖条内逐字换行，覆盖左侧行头；390图顶部标题还滚出可见区域。输入提示是本项明确交付的用户功能，存在完整DOM文本不等于实际可读。

源码一致：`WorkbookGrid.tsx:210`将`ValidationInputMessage`直接放入两列CSS grid；父`grid.css:49–55`定义行头窄列和正文列，其他格子/头部有布局定位。`ValidationInputMessage.tsx:12`的aside及`advanced-validation.css:1–17`只有sticky/fit-content/max-width，没有明确grid位置或脱离自动排格；max-width只设上限，不能阻止被窄轨道压缩。该提示作为普通grid item参与自动布局，截图与此路径相符。当前最小复现为Summary D45:D46配置custom公式、启用输入提示后关闭对话框并选D45，两宽已有真实PNG，无需reviewer另跑。

已立即回报root，由原所有者决定最小布局修复与实际补证；reviewer不改产品。需保证提示在当前可见网格内具有可读宽度、不挤占行头/正文轨道，并保留只读提示不写值/不造历史的原链路。`validation-stop-message`也在同文件采用类似sticky布局，应由owner在授权范围检查是否受同一定位问题影响；本轮没有其独立PNG，不冒称已确认相同Stop视觉故障。**R12当前未关闭，V-01/V-02/X-02不能据文字断言通过签视觉验收。**

### R13（Minor，新增待修）：桌面自定义验证表单的帮助段落打断标签/控件配对

实际`validation-chinese-1280.png`中，“选中时显示输入提示”在公式帮助的右边，checkbox却到了下一行左边；`Quantity`右边是“输入提示内容”，消息textarea右边是“错误提示”，information select右边是“错误标题”，后续继续错一格。`AdvancedValidationFields.tsx:26–31`的帮助p是fieldset的单个直接grid item，`data-validation-panel.css:10–12`两列自动排格没有令帮助跨整行；后续原本label/input偶数配对遂偏移一格。`:106–109`的继续/取消说明也同为未定位p。390单列截图没有该配对错位。

htmlFor/id仍正确，当前证据不显示实际保存字段互换，故分级Minor而非宣称原生值错误；但用户会从相邻标签误认字段，不能标此图视觉通过。最小方向是让解释性块保持完整行且不影响响应式字段配对，由owner在允许窗口处理并补桌面图。390图底部按钮未入镜另作证据限制：`data-validation-panel.css:3`明确max-height/overflow:auto，`persistence-language.spec.ts:49`同个已通过case随后真实点击“取消”，证明Cancel能被滚动到而非永久不可达；本轮不把顶部截图缺少footer误报为按钮不可用。

### R11及两项测试准备的真实增量闭环

- 已亲读`stop-4.TDX5Oo/report.json`：配置Stop精确标题的1280/390各一次passed、retry0；该过程整体仍是2 passed/2 failed/exit1，两个failed为blank-policy，不能写4/4。结合前轮代码/Core红绿证据，**R11可在本次原Stop两宽真实DOM层关闭**，不代表新R12视觉问题关闭。
- 已亲读`blank-trace-modal-evidence.log`与`blank-trace-actions.log`：Apply结束6437.221ms和紧接fill之前6438.733ms仍有modal；fill请求虽为空，随后Enter时实际textarea仍为kept，确为操作尚未ACK的测试准备竞态，不是空值被原生错误接受。`edge-input.spec.ts:15–19`新增等待dialog消失、bar enabled/原kept和非retained投影，再明确验fill为空；`:23–24`等Undo的Redo-enabled ACK后再清空。原Stop精确消息/拒绝零写、Undo后允许空值及D46邻格断言未删，也未加sleep或时间预算。`blank-2.njwDMw/report.json`两宽各一次passed/retry0、2/2、skipped/flaky/unexpected均0，status exit0；迁移可接受。
- 已亲读`remaining-151.QjsCkJ/audit.json`与原失败上下文：150 passed/1 failed/0未运行，唯一失败为notes该case最后helper读取未挂载A2；正文/公式/空白marker与Undo并非失败点。当前`notes/actions.spec.ts:117`只在原G2 marker断言后经真实Name box select A2，再执行不变的完整`expectNeighbors`，仍验SO-10001/SO-10002、A2 bold与G2=79；未删邻格或改seed。`notes-2.EtyEBV/report.json`两宽各一次passed/retry0，2/2且skipped/flaky/unexpected均0、exit0，迁移可接受。

原169按原file+title分段的唯一场景现均已有通过记录，不把它写成某次单轮169/169；以上精确补验也不替代唯一完整2474。root已通知最终完整过程30226正在`full-2474.7FixJZ`运行，输入冻结指纹清单2579文件、聚合`5b8832163224d264e8912701a489202309fbd9427d4ee6ad5b6c735aae7673b3`；此处仅记录交接身份，不冒称已经独立复验全部指纹或完整full通过。最终完整JSON、955主绑定逐结果、CF/help八图及本轮新视觉发现的处理仍待。整体和16行矩阵继续 **RUNNING / 待最终证据**；本轮新增R12 Important、R13 Minor，Critical未见新增确认项。

追加交接：root已亲看两份异常PNG并确认R12/R13，要求008精确终止其30226过程、保留现场后再修复，不是因观察超时重启；上述full路径不再作为预期能完成的最终绿证据。Stop非模态aside同为直接grid child与sticky/fit-content，已纳入R12同根因检查范围；本轮只确认其源码结构风险，没有把未截到的Stop竖条声称为视觉实证。后续仅审获准CSS/WorkbookGrid及既有两份几何回归的修复delta与新PNG，不重复全20图或原生/Core审查，原生/WASM不变无需重建。

## 2026-10-21 R12/R13修复、10张新PNG及模态点击补验

本轮只读最新顶部派发说明、三产品文件与两份既有E2E增量及持久红绿证据，没有重看旧20图、没有跑测试/门禁/browser/重建，没有产品写入或派agent。原生/Core/文案与WASM均不在本轮修改范围。按frontend-design-codex的实际截图复核要求，已亲自逐张以`view_image`原图打开`layout-green-r2-6.f0i68N/png-manifest.txt`全部10张新图；以下结论不只依赖几何断言。

### 修复代码与断言强度

- **R12布局最小修复可接受。** `WorkbookGrid.tsx:213–216`仅将原`ValidationInputMessage`与`ValidationErrorAlert`移出巨大的`sheet-grid-frame`，放进同一个`worksheet-panel`内的反馈容器；原组件仍消费同一Core状态/命令，没有镜像数据、第二套确认状态、额外生命周期或JS坐标缓存。父worksheet-panel原有relative定位，`advanced-validation.css:1–10`用absolute的inline/bottom inset锚定当前面板，并以grid顺序和gap分隔输入/Stop提示，不再进入行头/正文两列自动排格，也不随工作表大内容滚出视口。输入提示320px、Stop360px并以100%约束到容器，border-box包括内边距；两提示各自文字正常换行。容器/输入提示不拦截网格指针，Stop自身relative只给原dismiss按钮定位，按钮显式pointer-events:auto；原点击cancel命令未改。
- **R13布局最小修复可接受。** `data-validation-panel.css:14`仅让fieldset内解释性p跨`1 / -1`整行，恢复后续原label/control偶数配对；390单列仍使用原media规则。没有改htmlFor/id、草稿字段、保存/取消链路或语言文案。`grid.css`本轮没有最终增量，不要求为审查重新移动样式。
- **E2E增强没有弱化原验收。** `custom-formula.spec.ts:5–20`新增实际可见/宽≥240px/高<180px、四边在视口内及无内部水平溢出；`:22–34`滚动真实sheet-scroll并等待scrollTop增加、核验两提示仍可读、scrollWidth/Height保持，随后恢复原滚动位置。该DOM滚动没有写Core/原生数据。input场景仍先选无规则E45确认无提示、回D45验原Quantity/中文，再Undo只移除规则/提示且历史归零、D45/D46仍空；Stop场景只额外启用同规则的input提示以覆盖共存，仍验精确配置错误、没有Continue、拒绝零写、草稿-1保留、Escape与Undo归零及D46邻格不变。原其他创建/取消/清除场景保留。
- `persistence-language.spec.ts:48–70`依据每个真实label.htmlFor取得关联control的DOM几何，1280要求同行相交且label在control左，390要求标签先于控件，并要求解释段宽度等于fieldset；没有靠预设nth顺序将错配掩盖。原公式/级别原值、无水平溢出、取消/切回英文/Undo归零/目标仍空断言与所有标题仍保留；文件往返、真实Continue、Undo/邻格场景未改。

### 红绿证据与逐图结论

已亲读原始JSON/status/log：`layout-red-6.sSfcVv`实际5 failed/1 passed、retry0，四个input/共存场景均实测宽41.890625而非≥240，中文桌面关联checkbox top407.75不在label bottom371.25之前；390原单列通过。`layout-green-6.or8nfH`首修仍为3 failed/3未运行，宽190.96875未达原门槛，原断言没有降低。最终`layout-green-r2-6.f0i68N`六个精确标题各一次passed、retry0，expected6/skipped0/unexpected0/flaky0/errors空，status exit0、9.95秒；不把首修未运行计作通过。

下表序号对应该10张manifest，均实际查看：

| 序号 | PNG | 当前画面结论 |
| --- | --- | --- |
| 1 | validation-stop-message-390.png | 输入/Stop两张卡片完整可读、按顺序分开，配置错误消息与关闭按钮完整；上方原编辑拒绝提示仍保留。 |
| 2 | validation-stop-scrolled-390.png | 已滚动网格内容变化，双提示仍留在可见面板内，文字与关闭按钮无裁切、无相互遮挡。 |
| 3 | validation-input-message-1280.png | Quantity/英文及中文内容恢复横向正常阅读，不再挤进行头窄列。 |
| 4 | validation-input-scrolled-1280.png | 滚动后提示完整保留在面板底部，网格轨道和行头正常。 |
| 5 | validation-input-message-390.png | 窄屏提示保持约316px可读宽度，内容正常换行并处于面板/视口内。 |
| 6 | validation-input-scrolled-390.png | 水平/垂直滚动后的正文已变化，提示没有随大内容滚出或重新压成竖条。 |
| 7 | validation-stop-message-1280.png | 两提示按顺序留有间距，标题/完整消息/关闭按钮均可见；Stop草稿-1仍在公式栏。 |
| 8 | validation-stop-scrolled-1280.png | 滚动后两提示完整可读且互不重叠，原编辑拒绝栏未被替换。 |
| 9 | validation-chinese-390.png | 原单列字段顺序与内容保持，说明正常换行；截图仍在顶部、footer在下方滚动区，沿用上轮Cancel可达的证据边界。 |
| 10 | validation-chinese-1280.png | 公式说明和继续/取消说明均独占整行；所有标签/控件恢复正确同行配对，checkbox及三个底部动作可见，背后提示也不再为竖条。 |

这些图仅覆盖当前固定850px高度与指定两宽的实际状态；不由PNG推断未执行交互或所有可能长文案/尺寸已经验证。

### 容器继承pointer-events造成的模态点击回归已单独红绿闭环

root指出的风险已由008真实复现，不再只是静态疑虑。已亲读`layout-modal-red-1.04GsfT/report.json`：既有`continue warning submits the native draft exactly once at 1280px`为一次timedOut、retry0、原30000ms预算；`pointer-interception.log`中Continue点击开始后反复`html intercepts pointer events`。原因是新容器的pointer-events:none被内部modal继承，虽然dialog进入top layer，指针可命中性仍未恢复。

13606结束后唯一新增产品行是`advanced-validation.css:26`的`.validation-error-alert { pointer-events: auto; }`，本reviewer已在root冻结通知后读到最终行；不改变容器其余非交互提示的透传、不放开Stop背景、不改命令/原生/焦点处理。既有`error-levels.spec.ts`当前SHA256 `bcd1edfe63c1b6ebb1a841aabed5d46826786ffbc2079b87e003c81822976123`与布局前`source-final.sha256`完全一致，未改测试绕过点击。Continue仍检查确认前零写/保草稿、点击后仅目标-1/邻格空、Undo/Redo及最终Undo归零；Cancel仍保草稿/零写，随后合法2可提交并逐步Undo归零。

已亲读`layout-modal-green-8.q7OFiT/report.json`与status：Warning/Information ×1280/390 ×Continue/Cancel八个精确标题全部一次passed、retry0，expected8/skipped0/unexpected0/flaky0/errors空、workers1、exit0、13.82秒。该行的真实补验闭环成立；不把前面的六例布局绿灯冒称曾覆盖modal点击，也不把超时红证删除或改写为通过。

**R12与R13现可在最小修复代码、红绿定向回归、这10张实际PNG及新增模态点击回归层面关闭。** 本轮未确认新增Important/Critical；该结论不是七项整体验收。原中止`full-2474.7FixJZ`仍是保留现场，不是最终全绿；最终重新冻结后的唯一完整2474、955逐结果绑定、CF/help八图及最终源/测试/WASM指纹一致性仍待。当前36755由008只执行静态/React完整612/build，本reviewer未将未完成中间结果计为通过；原生/Core/WASM不变不重建，整体与16行矩阵继续 **RUNNING / 待最终证据**。

## 2026-10-21 最终完整轮CF四张新图增量审查

已阅读派发说明最新顶部，亲自逐张以`view_image`原图打开`full-2474-layout.bx8BMj/visual-cf-4-manifest.txt`全部四张；没有重复旧30图，没有运行测试/browser/检查或改动冻结输入，只追加本报告。按frontend-design-codex的实际截图要求判断当前可见状态，不用文件存在或完整轮进行中的计数代替视觉审查。

| manifest序号 | 实际查看的PNG | 画面结论 |
| --- | --- | --- |
| 1 | advanced-en-1280.png | 规则列表、Edit/Copy/Disable/排序/Delete/New rule、图标样式和上下阈值字段均完整；长阈值说明正常换行，Cancel/Save rule可见，对话框在视口内。背景A1:A3的箭头与数值均能辨认。 |
| 2 | advanced-zh-1280.png | 中文规则/阈值标签与关联控件保持配对，长说明完整换行，取消/添加规则完整；应用范围焦点轮廓未裁掉，未见溢出或文字遮挡。 |
| 3 | advanced-en-390.png | 英文长阈值标签自然换成两行，规则动作、checkbox、完整说明及Cancel/Save rule都在窄屏面板内，没有水平裁切或按钮掉出视口。 |
| 4 | advanced-zh-390.png | 中文标题、规则列表、字段与说明均可读；焦点环、取消/添加规则完整，按钮/文本未相互遮挡，未见水平溢出。 |

**这四张CF图的当前可见布局与文案可接受，未见新增视觉Important/Critical。** 仅结论此四个捕获状态，不从PNG推断所有阈值语义/键盘交互或全部条件格式case均已通过。root交接的当前候选`source-layout-fixed.sha256`为2579文件、聚合`2ed8c67a9f404be41a06b6c23f41818cf202d1e646a566a130c354beb7464dd0`；本段只记录交接身份，没有重做全候选指纹校验。唯一完整轮仍在运行，交接时40 passed/0 failed不是2474完成证据；955逐结果绑定及帮助四张图仍待，16行矩阵和整体继续 **RUNNING / 待最终证据**。

## R14（Important）：异步读取验证规则后初始焦点未到表单（局部闭环已修）

本轮已读派发说明最新顶部与008对应交付，只读`DataValidationTools.tsx`及既有`advanced-validation.test.tsx`新增deferred回归，读取持久红绿日志和四例真实JSON；没有运行测试/browser/检查、没有重新审原生或旧图，没有改产品，只追加本报告。

根因与root确认一致：原modal effect只在`open`切换时尝试focus首input，而真实validation.read未完成时fieldset因busy禁用，focus不生效；读完后open仍true，effect不再触发。完整轮的三例焦点失败不能解释成溢出失败，也不能改legacy的初始焦点期待解决。

**两个effect的最小拆分可接受。** `DataValidationTools.tsx:21`仅从原phase派生reading布尔，没有新增React/Core状态或ref缓存。`:29–36`原modal effect仍只依赖open，原showModal/fallback、cleanup关闭及回原trigger焦点链保留；不因reading/字段/saving/error转换反复关闭再打开。`:37–39`独立focus effect只有open/reading依赖，open且非reading才定位同一个首input。异步read完成true→false会在fieldset可用后补初始焦点；字段输入、kind或errorTitle变化均不改变这两个布尔，saving→error同样维持open=true/reading=false，因此不会抢回range或重跑modal生命周期。Cancel使open=false后focus guard不动作，晚到原生响应仍由原Core身份守卫丢弃，本修复没有放松该守卫或另建请求生命周期。

新增`advanced-validation.test.tsx:104–134`真实deferred read结束后要求Applies to获焦，再手动聚焦formula并修改公式/错误标题，严格要求formula焦点保持。deferred save拒绝后要求同一个dialog仍open、原Native save failed错误及`=B2>2`草稿保留、range没有重新获焦，并监测fallback没有再次setAttribute(open)；Cancel仍回工具trigger。原`:89–102`reading时Cancel可用、晚到成功不复活dialog的测试保留并补trigger焦点，`:136`后saving禁重复/禁取消/失败保草稿及Stop/Warning/Information原断言均未删。产品116行、测试180行，未扩展职责。

已亲读`validation-focus-red.log`：新deferred焦点例1 failed、其余5 passed，真实失败在read完成后的toHaveFocus，收到body而非已启用的Applies to；不是只推导出的风险。`validation-focus-green.log`修后两既有React文件21/21 passed，记录完整保留，reviewer没有重跑。

**原legacy E2E没有改期望/标题/预算。** 已只读核对当前`data-validation-comparison.spec.ts` SHA256=`6b8621e3e345eabb8fab08677c806269f9af964bea335a0ec3328cec169323f3`、`data-validation.spec.ts`=`1ef948dc9eca65ed0c6b04fe29138e4b7b6759e2406a4e27064863162ef954e7`，均与修复前`source-layout-fixed.sha256`一致。仍要求Applies to初始focus、原比较说明/Condition变更后的Value与Maximum控件、列表原值`Ready/On hold/001/=1+2`、无水平溢出、Cancel和pageerror空，未以等待新helper或删除焦点消红。

已亲读`validation-focus-4.CP6JZz/report.json`及status：comparison form fits1280/390、validation form fits1280/390四个原精确标题各一次passed、retry0，expected4/skipped0/unexpected0/flaky0/errors空，exit0、6.94秒。它包含原三失败及此前未跑同类390；**R14在源码、React红绿及这四个真实legacy DOM场景层可关闭，本轮未确认新增Important/Critical。**

root交接当前源/测冻结为2579文件、聚合`93750d1e71411a4b0fd367bbef4c01c5f8c4e6f002e9331e0f781d657b72a32c`；此处仅记录交接身份，没有重复全候选指纹审计。原完整轮真实304 passed/3 failed/2167未跑仍是保留的红证，不能由四例专项改写为完整通过。当前84333的React完整613/types/build/静态尚按008流程重证，本reviewer不读取未完成中间结果冒作绿灯；后段2166诊断不代替后续最终单一full2474/955。CF四图不受此焦点delta影响可复用，帮助四图仍待；整体与16行矩阵继续 **RUNNING / 待最终证据**。

## 2026-10-21 HELP picker四张真实PNG只读增量审查

已读派发说明最新顶部，亲自逐张以`view_image`原图打开`remaining-1811.ztC8A2/visual-help-4-manifest.txt`的四条绝对路径。按frontend-design-codex要求仅判断实际截图可见状态，没有重复原34图或稳定原生、没有开browser/跑测试/门禁、没有改产品/测试/WASM，只追加本报告。

| manifest序号 | 实际查看的PNG | 可见区域与边界 |
| --- | --- | --- |
| 1 | help-catalog-1280.png | 英文LET终态：搜索/分类/函数列表、签名与概要、name/value的Required及Repeating group标记完整可读；calculation名称/必填可见，描述向下超出当前捕获范围。焦点环完整，无水平裁切或重叠。底部动作未入镜。 |
| 2 | help-catalog-390.png | 窄屏LET签名、重复组说明和name/value/calculation参数可读；标记在参数名旁自然排布，长说明正常换行，无相互遮挡。画面到Examples标题为止，示例正文及底部动作未入镜。 |
| 3 | help-chinese-1280.png | 中文TRANSLATE终态：搜索/分类、三参数签名、概要、text/from_characters/to_characters的必填与说明可读，示例公式可见；搜索焦点环完整。实现限制正文和底部动作在当前捕获范围之外。 |
| 4 | help-chinese-390.png | TRANSLATE长签名在逗号后换成两行，参数名/必填标记与中文描述无重叠，示例公式完整可读；底部仅见“实现限制”标题，限制正文与插入/取消动作未入镜。 |

**这四图当前可见区域的布局/文案/重复组标记可接受，未据此确认新增Important/Critical。** 但不能把它们描述为“完整实现限制及所有动作已亲看无裁切”：四张都没有捕获底部Insert/Cancel，中文限制正文也没有被实际展示。该结论是PNG覆盖范围限制，不声称下方内容永久不可达或新增产品故障，也不由静态图证明焦点循环、插入、取消、目录逐项操作已经通过。若最终视觉验收要覆盖限制正文与底部动作，仍需对应实际显示状态的证据。

root交接该轮六个catalog场景已passed且冻结候选仍为`93750d1e71411a4b0fd367bbef4c01c5f8c4e6f002e9331e0f781d657b72a32c`；本轮没有把正在运行的诊断中间结果审计为完整绿灯。17849唯一browser尚在`remaining-1811.ztC8A2`运行且已有真实失败；R15是FormulaAssist只读参数浮层遮网格指针，与这四张picker面板分开，本图审不关闭R15。完整2474/955、最终指纹与上述未入镜可见状态仍待，16行矩阵及整体继续 **RUNNING / 待最终证据**。

## 2026-10-21 R15/R16、四旧E2E与HELP底部捕获的冻结增量审查

本轮已读最新顶部派发说明、008根因交付与实际文件，逐一读取`pre-r15-r16-files.tgz`十三个成员并和当前对应文件作只读diff，不用HEAD混入已审hunks。十三项实际变化与`r15-r16-changed-files.json`一致：FormulaAssist/CSS两项、两份既有React编辑测试、五份既有E2E、feedback descriptor/反馈测试/en/zh PO四项；原2579文件仍为2579，没有借此增加模块/状态系统。没有运行任何测试/browser/门禁/build/重建，没有重看原38图或稳定原生，只追加本报告。

### R15：只读参数帮助遮挡引用点击/反向拖选（本批局部闭环可关闭）

已读持久`remaining-2166.wcMjF1/third-sheet-pointer-evidence.log`：真实B1 `td[data-cell="0:1"]`点击明确被`formula-help-active`所在`formula-assist`子树连续拦截。`backwards-drag-pointer-evidence-expanded.log`保留鼠标481,278→481,238的原反拖动作；root/008已亲看原帧确认帮助覆盖目标。本reviewer本轮只读这段日志，没有冒称另看过原帧。它与只读portal浮层仍接收pointer的源码路径相符，不是原生重算或原预期公式错误。

`FormulaAssist.tsx:86`只复用原`suggestions.length > 0`分支条件：有建议时仍为原`formula-assist`，无建议、正在渲染signature时才加`formula-assist-signature`。`formula-assist.css:22–23`仅对此只读分支添加pointer-events:none与规则注释，子帮助继承透传，原网格可收到下面的点击/拖选。原portal、DOM定位effect、onPointerDown/onMouseDown、建议按钮onClick、flushSync接受建议及恢复输入焦点全部没改；建议分支不带透传class，因此没有将可点击建议列表一起禁用，也没有改变公式/会话/Core状态。

两既有React编辑测试仅增强分支断言：补全前建议容器无只读class，真实mouseDown/click接受ROUND后signature有class，原焦点/活动参数/IME/Escape保持；原跨表拒绝correctable草稿场景也明确只读class，原错误/表选择/Escape断言不变。该class单测本身不证明CSS实际命中，后述未改E2E的真实点击/反拖绿证才补足该边界。

已只读核对原`e2e/editing/formula-cross-sheet.spec.ts` SHA256=`41c762aaed40dccda6bab1b619e6d86443b78e74b0dc752d6520f5e196549794`与`formula-completion.spec.ts`=`b60fe6ff6e4c4c281e1032376a35af6ea645c55c6816a6282d1e63fd522e2c04`，均与修复前`source-validation-focus-fixed.sha256`一致。原坐标/公式/重算/历史/错误期待无修改；建议鼠标回归仍是completion既有case的真实ROUND `option.click()`，不是只用Tab或Core直接接受替代。

### R16：中文分类Custom/Linked content缺翻译（本批局部闭环可关闭）

`feedback-messages.ts:315–316`只追加这两个既有category原值对应的Lingui descriptor；en/zh PO只增加Custom→Custom/自定义、Linked content→Linked content/链接内容四个翻译值，没有改category value、Rust目录、已知/未知反馈fallback或用户数据。`feedback.test.ts:14–15`新增两组既有参数表项，仍分别切中文严格等于对应中文、切英文严格回原source。

已亲读完整PO增量和`r15-r16-po-preservation.log`：原条目changed数组均为空，只新增上述两msgid；日志1406→1408包含PO头项，对应原1405非空消息→1407，不能误读为删改旧消息。原中文/英文1405条内容都保留。既有advanced-localization插入函数分支新增真实`option[value="Custom"]`/`option[value="Linked content"]`精确中文label，原Math & statistics value及中文label验证保留，不以中文改原category值。

### 四个旧case迁移与HELP补图增量

- **Copy snapshot case没有弱化。** `directional-fill.spec.ts:152–154`从包含条件格式箭头的整td改为原`.cell-content`可见且精确2，并新增公式栏原值2；真实Copy→Fill→Paste、B/C/D邻格及最后A71源2保持。没有改renderer、clipboard/helper或产品值来掩盖图标文字。
- **旧“无参数帮助”期待按新真能力精确迁移。** `insert-function.spec.ts:119–130`要求完整XLOOKUP六参签名、活动lookup_value及完整原生描述实际可见、Undo disabled零写；原XLO→Tab、Escape保Acme及TEXTBEFORE真实求值hello全保留，不用宽泛存在替代帮助内容。
- **Quick formula只恢复无近邻数字准备。** `quick-formula.spec.ts:99–101`定位H81而非已邻接新H75:H79数字seed的H80，并严格验当前空及Undo disabled；原“immediately below or right”错误、A100:B100合法草稿/Escape、A99/A100输入及no room/目标2断言全部不变。没有改原生扫描语义或新seed。
- **中文SUM预期绑定原生帮助来源。** `advanced-localization.spec.ts`仅原插入函数分支，将旧UI摘要改为`[data-formula-help="SUM"] .formula-help-summary`精确原生中文“求数字参数及区域中数字单元格的和。”，同时新增R16两category精确label。其余控件、关闭/焦点/数据及标题原样保留，不把所有帮助文本放宽匹配。
- **HELP补图仅增加捕获状态，尚未产生新图绿证。** `catalog.spec.ts:84–87/113–120`在原顶部图后真实scrollIntoViewIfNeeded，再严格要求底部两动作或限制区100%在视口内并分别截图；原每个native entry完整遍历、ORDER_NET、LET终态、XLOOKUP中文/可选及TRANSLATE限制、旧四图、Escape/trigger焦点/邻格/空history和标题仍保留，原timeout不变，没有skip/sleep。该改动静态上补足上轮未入镜状态，当前没有以代码或截图路径代替真正新图审阅，须最终full产出后另交。

### 实际红绿与最终专项

已亲读`r15-r16-react-red.log`：真实4 failed/26 passed，分别是Custom/Linked content中文仍为英文，以及两signature缺class；`r15-r16-react-green.log`修后三既有React文件30/30 passed。这里的React绿灯仅为分支/语言必要专项，不代替浏览器或完整门禁。

已等18055权威结束后才读取`r15-r16-21.ESu2FA/report.json`、audit与status：原cross-sheet全11、completion全6、上述四旧case共21个精确标题均各一次passed、retry0，expected21/skipped0/unexpected0/flaky0/errors空、workers1、exit0、41.82秒。包括原backwards drag、第三表点击、native rejection与真实ROUND鼠标选择，因此R15穿透与建议仍可点击均有实际DOM闭环；R16的中文两category及SUM精确来源也已在该原Chinese场景实际通过。没有把先前17/0中间计数先签绿，所有原失败现场仍保留。

**本批R15/R16可在最小代码、必要React红绿及上述21个真实DOM专项层关闭，四旧case与HELP捕获迁移静态可接受，未见断言弱化或新增Important/Critical。** 当前冻结2579文件聚合`b6cc7df901c0eec140cab844dad5ffc934aaefd86036f16d072a672af3c00b3a`仅记录本批交接身份，最终仍需统一指纹审计。Core/Rust/WASM未改不重建；008唯一88828正在完整React615/types/build/Lingui及静态门禁，未完成结果不计绿。HELP底部/限制新图、最终单次完整2474与955逐结果仍待，不拼接历次分段成完整通过；整体与16行矩阵继续 **RUNNING / 待最终证据**。

追加交接：root随后通知88828已权威exit0，React615/615及其余门禁均0、源/WASM/config逐文件核对均0，008已启动唯一91445、目录`full-2474-r15-r16.GWt4iv`，同一b6cc7df…输入冻结；本轮不重复门禁审计，保留最终整体证据阶段复核。该过程刚开始不代表2474/955完成；HELP新增底部六图待该轮实际产生后独立实看，本批局部结论不因此扩大。

## 2026-10-21 HELP新增六张底部/限制图实看增量

已读派发说明最新顶部，亲自逐张以`view_image`原图打开`full-2474-r15-r16.GWt4iv/visual-help-bottom-6-manifest.txt`全部六个绝对路径。按frontend-design-codex只复核实际可见状态，没有重复原38图、R15/R16或稳定原生，没有开browser/跑测试或门禁、没有改冻结输入，只追加本报告。

| manifest序号 | 实际查看的PNG | 当前可见结论 |
| --- | --- | --- |
| 1 | help-catalog-footer-1280.png | LET三个参数、成组重复说明、calculation完整描述、示例与完整实现限制均可读；Cancel/Insert draft完整入镜，未见遮挡或水平裁切。 |
| 2 | help-catalog-footer-390.png | 窄屏参数名/必填/重复组标记无重叠，示例及限制长句自然换行；Cancel/Insert draft均在面板内，文字和按钮完整。 |
| 3 | help-chinese-limits-1280.png | TRANSLATE三参数及示例正常，限制“仅替换字符，不提供语言翻译。”完整入镜；搜索焦点轮廓完整可见。此图以限制为目标，footer在下方，另由下一张覆盖。 |
| 4 | help-chinese-footer-1280.png | 完整中文限制正文及取消/插入公式草稿同时可见；参数/示例/动作未相互遮挡，搜索焦点轮廓未裁掉。 |
| 5 | help-chinese-limits-390.png | 长签名换为两行，参数/必填标记、描述和示例完整可读；底部限制正文全部入镜，未出现逐字窄条或水平溢出，搜索焦点环完整。 |
| 6 | help-chinese-footer-390.png | 限制标题/完整正文、取消/插入公式草稿都完整可见，窄屏按钮未挤出或遮字，搜索焦点环保持完整。 |

这些图为真实滚动后的底部状态，顶部标题/说明部分滚出视口与捕获目标一致，不据此误报永久裁切。**上轮HELP四图未入镜的英文footer、中文限制正文及中文footer视觉证据缺口已由这六张实图补齐；当前六图未见新增视觉Important/Critical。** 结论仅覆盖这些两宽固定高度的捕获状态，不由PNG推断点击、键盘循环、所有函数语义或完整回归已经通过。

root交接原HELP002/003四case及HELP16全组已实际passed；本轮只执行六图独立视觉审阅，没有重复运行或审计活过程JSON。唯一91445在同一`b6cc7df…`输入上运行，交接时1613 passed/0 failed仍是中间结果，不是完整2474/955。最终原始结果、主绑定逐结果、统一指纹与16行矩阵待另交，整体继续 **RUNNING / 待最终证据**。

## 2026-10-21 最终独立总审与签核

**结论：001备注、002原生保护、003高级条件格式、004高级验证、005完整参数帮助、006自定义表达式、007本地线程批注逐项均 ✅ 可签收；008共享合流与本轮七项整体 ✅ 可签收。N/P/C/V/H/U/T/X共16行均有实际证据，未留本目标内未关闭的Important/Critical。** root可据此将001–008及index状态收口；本reviewer只追加本报告，不修改任务状态、产品、测试或执行输入。

本轮按最终派发及008最后docs-only冻结通知，只读原始结果、既有核验日志、16行矩阵和最终文档精确增量。复用此前已完成的源码/R1–R16、稳定native/Core/JS和逐张视觉审查，没有重跑测试、browser、门禁或构件重建，没有派agent、commit/push。以下E统一指持久根`acceptance-20261021.LeIzkC/full-2474-r15-r16.GWt4iv/`，不是此前失败、主动中止或诊断分段的拼接。

### 唯一完整轮、主绑定与输入身份

已亲读E的`report.json`，并只读展开每个spec/test/result：2474个test全部`expectedStatus=passed`、`status=expected`，各恰一条`result.status=passed/retry=0`，不符合者为空。原始stats为expected2474/skipped0/unexpected0/flaky0，errors空；`audit.json`的total/exactPass同为2474，problems/reportErrors空，与独立展开一致。配置`forbidOnly=true/workers=1/retries=0/repeatEach=1/testIgnore=[]`，实际maxFailures3；`run.log`从Running2474到自然结束2474passed，`status.tsv`为0，`.last-run.json`失败列表空。运行始于`2026-10-21T04:58:10.737Z`、4868791.78ms（81.15分钟），不是只采集或重试后计绿。

E的`features-955-results.log`明确955登记均有这份报告成功证据，`final-audit-status.tsv`的audit/features/source/wasm/configs五项均0。已读`check-react-e2e-features.mjs`的results分支：按同文件+完整标题恰一spec核对，拒绝重复ID/主绑定、skip/fixme/预期失败、缺结果或多次结果；不是用`--list`证明成功。完整报告内七域实际一次成功为备注26、保护26、高级条件格式70、高级验证34、帮助16、自定义公式31、批注51，共254，另同格备注/批注共存2；256项均属于这同一2474轮，不独立替代整体结果。955是唯一登记操作数，不把两宽及交叉变体的2474当功能数。

运行执行快照为`source-r15-r16-fixed.sha256`，2579项聚合`b6cc7df901c0eec140cab844dad5ffc934aaefd86036f16d072a672af3c00b3a`。已读运行前后source/WASM/configs既有逐文件check日志，均仅OK，对应权威status0；12个发布文件与21个执行配置均保持同一输入。lite二进制仍为`105b67983b4f7f6d30d6a511c47fb92343373b596ea1849ea4d0ad9383d1eedd`，full仍为`4ecb0ab565fc48d8fa42a490c4e7520edc74d4089fb337b4f1efb43f82dec34a`。未将旧重启丢失的`/tmp`原始日志当本轮可读证据。

### 七项与16行矩阵逐行结论

下列入口沿此前已审React→Core command→Worker→Rust真实链路；此轮只将其与最终原始case结果、已审修复/视觉证据对齐，不重新全仓审查。表内E2E路径相对`excel/react-excel/e2e/`。

| 矩阵 | 最终证据及结论 |
| --- | --- |
| N-01 | ✅ `notes/actions.spec.ts`真实增读改删、空/长输入纠正、取消及焦点，原生值/公式/空白格独立性与Undo/Redo实际passed；备注域26/26。 |
| N-02 | ✅ `notes/persistence.spec.ts`结构移位、文件/旧文件/坏文件、普通输入独立；`localization.spec.ts`两宽中英切换与共存2例passed，五域原图中未受后续布局修复影响的备注状态已实看。 |
| P-01 | ✅ `protection/protection.spec.ts`锁格拒绝零写、允许区成功/Undo、解除与范围移除；`native.spec.ts`实际lite/full原生写入及history防旁路passed，保护域26/26；稀疏边框与显式/派生尺寸边界复用已审原生回归。 |
| P-02 | ✅ `protection/dialog.spec.ts`两宽焦点循环/关闭保redo/语言、`persistence.spec.ts`保护与允许区文件往返及seed无启动历史均passed；保护中英图已实看。保护配置不纳入内容Undo的既定边界没有被改写。 |
| C-01 | ✅ `advanced-conditional-format/{thresholds,icons,boundaries}.spec.ts`真实六类阈值、三类图标、反转/隐藏原值、隐藏/合并/冻结与格式刷边界passed，域70/70。 |
| C-02 | ✅ `advanced-conditional-format/lifecycle.spec.ts`文件、语言、优先级/stop、纠错与焦点passed；CF中英×两宽四图已实看，后续变更未动该布局，复用范围明确。 |
| V-01 | ✅ `advanced-validation/{custom-formula,edge-input,batch-input,error-levels}.spec.ts`公式/相对引用、配置Stop消息、blank/array/跨表、Warning/Information显式确认及整批取消/提交passed，域34/34；真实候选安装/结算/回滚与observer边界复用已审R5/R6/R8。 |
| V-02 | ✅ `advanced-validation/persistence-language.spec.ts`文件/中文及原legacy两宽表单、全部error-levelspassed；R11同草稿失焦身份、R12/R13布局及modal指针继承、R14异步首焦点均闭环。修后10图覆盖提示/Stop同显、滚动及中文字段配对，不拿原缺陷图作修后视觉通过。 |
| H-01 | ✅ `formula-help/catalog.spec.ts`实际lite499/full502原始与JSON往返校验，以及每个真实picker内置entry+ORDER_NET帮助遍历passed；`editing.spec.ts`活动参数组/尾参及真实插入草稿→原生提交→一步historypassed，帮助域16/16。内部构件检查不冒充用户主入口。 |
| H-02 | ✅ `formula-help/read-only.spec.ts`浏览不改文件/前史、搜索恢复/分类/取消passed；中英顶部四图及最终底部六图已实看，英文footer、中文限制完整正文/动作证据缺口已补齐。R15只读帮助透传与建议仍可点、R16分类中文均有原case真实结果。 |
| U-01 | ✅ `custom-formulas/actions.spec.ts`目录读、新建/选已有/注册/替换/调用/移除、取消和焦点passed，定义及求值由Rust持有而非JS执行，域31/31。 |
| U-02 | ✅ `custom-formulas/history-file.spec.ts`跨表重算、缺参纠正、Undo/Redo、目录补全/帮助、文件恢复顺序及坏文件原子拒绝passed；`localization.spec.ts`与五域中英图闭环。单元格引用经参数传入，不扩称任意宿主脚本能力。 |
| T-01 | ✅ `comments/{actions,input,boundaries}.spec.ts`显示名/本机时间、新线程/回复/解决/重开、输入纠正、保护/普通输入、空白/合并/冻结/切表及结构historypassed，批注域51/51。 |
| T-02 | ✅ `comments/{persistence,localization,seed}.spec.ts`完整线程/旧文件/坏文件、语言及无启动historypassed；`seven-feature-integration/notes-comments.spec.ts`两宽同格独立共存passed，中英批注图已实看。显示名不被当认证身份。 |
| X-01 | ✅ 七域254+共存2在唯一完整JSON全部一次passed；真实Ribbon入口、共用原生历史/文件/投影/保护写入面与R1–R16关闭结论相符，未以目录存在、mock成功或泛化综合单例替代各操作。 |
| X-02 | ✅ 全部既有与新增2474实际passed、955唯一主绑定results通过，执行期source/发布WASM/configs一致；根门禁、双语两宽/原demo回归、最终docs-only身份差异均有明确证据及边界。 |

### 稳定门禁与既有发现的最终收口

复用此前已审且输入未变的持久证据：原生Core64；excel-core默认3646/lite3606（各10项既有ignored）、WASM205（1项既有bench ignored）及真实Chrome harness7；bench编译、scripts17。这些既有ignored不被计入通过，也不是本轮浏览器skip。Core修复后的根六project438物理文件/6261项含UI Core3529/React612，之后仅受影响React继续完整复证至最终113物理文件/615项；不虚构最后又跑了一次根全量6264。已亲读`r15-r16-gates-status.tsv`九项0及`r15-r16-react-audit.json`的615passed/failed0/pending0，156 reportedSuites含describe嵌套，不能写成156物理文件。types/build/full lint/cycles/presentation/docs、Lingui1407 strict compile等最终必要门禁均已落盘通过。

R1–R16此前分层静态/专项关闭现可由同候选完整回归与必要视觉证据收口；此前失败、主动中止和诊断分段仍原样保留，不改记为绿。已亲看44张受派发图（五域20、修后布局10、CF4、HELP顶部4+底部6），原20图暴露的R12/R13以修后10图替换相关缺陷状态，其余稳定布局复用；不宣称本轮重新看过所有图或所有2474截图。R3只读目录复用消除重复原生读/发布/内置帮助重建，但Worker投影仍克隆所携目录，未做大目录滚动性能基准，不把代码优化签成所有性能问题已测完。

### 最后docs-only冻结及交付边界

已完整亲读E的`final-docs-r2.patch`三文档精确增量及最终`008-report.md`顶部：`current-capabilities.md`校准完整原生帮助、Rust自定义表达式、七项能力及定向填充实际目标允许区；`FEATURE_PROGRESS.md`仅当前#09/#21–22/#24–26/#34–35/#40及紧邻CF边界；README本次未再改。未删除参数填写表单、全部引用着色、其它高级比较、宿主脚本/异步、网络协作/认证/通知/服务端持久化/加密等未实现边界，也不宣称整个41项或Office全兼容完成。

本reviewer发现的`FEATURES.md:9`“新候选尚待运行”旧引言已按root授权校准为最终2474/955实际结果。已读`features-docs-only-r2-proof.json`及精确patch：**只改第9行，其余行逐字相同，955登记行/文件/完整标题全部不变**。已读`source-docs-only-r2-delta.json`、两个manifest首项及最终check日志：执行manifest b6cc未覆写；最终docs-only `source-docs-only-r2.sha256`聚合`c79ca2f7706624d9bb1c993028896fcb1a73a7c16286e71747ae371301d24aaf`，2579项中仅FEATURES文件从`9a4b7a8…`变`830e960…`，其余2578同执行快照，无产品/spec变化。发布WASM12和配置21仍全同。旧`source-after-docs-check.log`全同仅证明本次引言追加前状态，不能充作最终2579全同。

`final-docs-r2-status.tsv`的source-delta/docs/source-docs-only/wasm/configs五项0；features-prose-only-proof=0位于`final-docs-r2-diff-status.tsv`，合计六个不同检查均0。`final-docs-r2.log`为450份活文档零死链、4272文件无失效路径。`final-docs-r2-diff-status.tsv`的diff0；report-no-index-check1是新增报告存在差异状态，已亲读对应check日志并核实与diff日志均0字节，不冒称全status0，也没有空白错误诊断。最终四份文档及008报告身份以`final-delivery-docs-r2.sha256`记录，008报告SHA为`0a06e8b00ce73d102808259847ae9fea3be72a5b7f0a85930d9a9307c480be5a`。最后变更纯说明且绑定不变，不需重跑未变的产品/测试/WASM。

**最终签核：七项逐项PASS，16行矩阵PASS，本轮七项整体PASS，可交root标记001–008 DONE。** 此签核只覆盖明确委托的本地React Excel七项及其既有入口回归；不扩为远程协作、认证/加密、服务端持久化、自动保存、任意脚本、Office全兼容或整份41项计划完成。没有新增未授权产品范围或待补验收项。
