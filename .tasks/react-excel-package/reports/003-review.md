# 003 独立高风险审查

当前结论（R1 修复复审）：APPROVED。原 4 项 Important 与 M1 均已关闭；本叶 Core/native 定向范围通过，真实 WASM、DOM/包消费和全仓门禁仍由 004 验收。下文保留首次 REJECTED 的发现与证据，最新逐项结论见文末。

审查基线：`08caefbce8cb4934ceea4f0c26115d910569a47c`。审查范围为 003 files 中 Core/Rust 的完整 tracked diff，并直接读取所有新增 host 源码、测试与文档；未改产品、任务或其他报告，未派 agent、commit、push、发布。

## Important

### R1：删表及其撤销/重做漏掉实际改写的跨表公式

位置：`excel/rust/excel-core/src/host/mutation.rs:51`；相关原生事实已经存在于 `workbook_sheet_archive.rs:185`、`:198`、`:132`。

`HistoryChange::Sheet` 只对 `Rename` 提取引用变化；`Presence` 最终只加入 `self.sheet_key`，返回该表 `ranges:[]`。实际删除会把其他表的公式源改成 `#REF!`，恢复又写回原公式。这是持久源码变化，不是计算缓存变化。

最小 native 探针：建立 Sheet1、Audit、Untouched，令 Audit!J30 为 `=Sheet1!A1`，删除 Sheet1，然后 undo/redo。复用作者已编译的 native 库，结果：

```text
Audit key = 2
delete read: input/formula = "=#REF!"
delete fact: sequence 1, changes [(1, [])]
undo   fact: sequence 2, changes [(1, [])]
redo   fact: sequence 3, changes [(1, [])]
```

因此按事件增量保存会保留 Audit!J30 的旧公式，PKG-08/结构修改闭环不成立。不是缺一项 DOM 测试，而是原生事实确实没有提供该位置。

最小修复方向：从已保留的 archive 引用、模板、规则/验证变化取得其稳定 sheet key 与真实坐标，并让 delete、undo、redo 都覆盖这些位置；不能把所有权限 affected_sheets 当作修改清单。特别注意恢复成功会取走 `archive`，不能因此丢失 undo 的位置事实。

### R2：候选换簿等待期间启用 readOnly/busy，仍会交换工作簿

位置：`excel/spreadsheet-ui-core/src/runtime/rust-workbook-runtime.ts:165`、`:189`、`:194`。

replace 只在开始检查 `workbook.openReplacement`。在候选 `openFile` / catalog / configure 等待期间，宿主可完成 `configureHostControlsAtom({readOnly:true,busy:true})`。`synchronizeHostControls` 会把新控制同步到候选，但交换前没有重新检查本次换簿是否仍被允许。

最小 Store 探针只延迟候选 openFile 的回复，等待 configure 完成后释放回复，输出：

```json
{"replaced":true,"controls":{"readOnly":true,"busy":true,"allowSheetStructure":true},"change":{"source":"import","kind":"workbook.open"}}
```

新控制已经生效却仍丢弃旧文档，违反 readOnly 拒绝所有持久修改、busy 拒绝用户操作的运行期策略。这不是初次初始化应被放行的问题。

最小修复方向：所有候选校验/同步完成、最后一个 await 之后，所有权交换之前，重新按 Store 当前 controls 检查 replacement；拒绝时释放候选并保旧连接/文档/事件。

### R3：条件格式事实只报告主范围，遗漏附加区域和旧作用域

位置：`excel/rust/excel-core/src/host/mutation.rs:73`；已有数据在 `workbook_history_conditional_format.rs:10`、`:175`、`:227`。

`ConditionalFormat` 落入通用 `_ => self.range`。新增、禁用、删除多区域规则只报告第一个区域；编辑规则作用域只报告新主范围，旧范围也不在事件中。undo/redo 复用同一不完整范围。

最小 native 探针建立主区域 A1:A2、附加区域 J30:J31 的规则，随后 disable、undo、将其移动到 A50:A51：

```text
create/disable/undo facts: 仅 A1:A2
move fact: 仅 A50:A51
遗漏 J30:J31；move 还遗漏旧 A1:A2
```

原生 history 已持有规则前后像，新增事实代码却退回主 range，违反“原生实际改写范围”的验收。文档建议格式/规则使用 export 保存，可以保护采用整簿导出的消费者，但不能使不完整的 `ranges` 变成准确事实。

最小修复方向：按实际变化的规则前后像合并其全部旧/新区域，允许有限矩形压缩；避免把所有未变化规则的范围也一起上报。无需新增通用层。

### R4：提交后事件组装失败可使当前请求无响应并永久毒化 Worker 队列

位置：`excel/spreadsheet-ui-core/src/host/worker.ts:88`、`:130`、`:154`；可到达的提交后接线顺序见 `rust-workbook/sheet-edit.ts:20` 至 `:29`。

`run` 的 catch 再次调用 `publish`，这次调用没有保护；队列也只有 `queue.then(() => run(message))`，没有恢复 rejected tail。若新增工作表已经原生提交，而随后的 metadata 读取/身份注册发生展示异常，fact 含新 sheet key，但当前/旧 sheets map 都没有这个 key，`publish` 会在 catch 中再次抛出。

最小 gateway 故障注入明确模拟上述边界：dispatch 提交 `sequence:1, sheetKey:'2'`，在 Core 仍只有 key 1 时抛出 `sheet_name failed after native add`，随后发送只读 `host.readRanges`。结果：

```json
{"dispatched":1,"responses":[],"failures":[{"id":1,"error":"Unknown native mutation sheet: 2"},{"id":2,"error":"Unknown native mutation sheet: 2"}]}
```

这项是提交后 metadata 故障注入，不声称正常的真实 WASM 会自行返回未知身份。它验证任务明确要求的异常恢复边界：第一次请求连 committed 诊断都没有，第二次独立只读请求也不能再服务，dispose 前在途 RPC 永远等待。现有“projection throws”用例提前提供所有 sheet key，覆盖不到这个分支。

最小修复方向：让错误响应/事件发布自身异常不逃出本消息边界，队列在失败后继续服务；保留真实提交与通知诊断，不能将事实映射失败当作原生回滚。新增表的稳定身份发布需要覆盖提交后失败窗口。

## Minor

### M1：全轴范围与逻辑画布读取边界需在宿主文档中明确

`host/snapshot_changes.rs:49` 至 `:60` 使用 Excel 全轴范围；`host/worker.ts:23` 却按定义的 rowCount/colCount 限制 typed read。小画布的行列格式/尺寸事件不能原样交给 readWorkbookRangesAtom，结果会是 INVALID_RANGE；即使在完整画布内也可能超过返回预算。

`docs/host/README.md:42` 的通用“按事件范围增量保存”说明应补充：值变更与格式/尺寸/规则等元数据不共享保存协议；非空 ranges 也可能是全轴元数据范围，应使用既有 export，或按逻辑画布及预算切分有实际需要的 typed 读取。现有第 73 行已提到元数据导出，所以此处定为文档清晰度问题，不单独否决。

## 六条验收逐项

| 验收 | 结论 | 证据与边界 |
|---|---|---|
| 1. typed/公式/稀疏多范围、原子失败、保护/预算、一次历史 | ✅ 本叶限量实现 | `host/mod.rs:79` sparse native 读取；WASM host 一次调用；`host/transaction.rs:18` 全体预检，`:54` 一次 begin_ranges，`:60` Store batch，`:80` finish/rollback，`:83` 失败后重新结算 spill。`host_data.rs:61` 保留 redo/失败序号不变；`:118` 验证源、本表 spill、跨表依赖和零候选通知。明确拒绝 Table、既有 spill/blocked anchor、合并非锚点，符合任务允许的限量原子边界。 |
| 2. UI 同源事件、跨表及结构真实位置 | ❌ | UI setInput/paste/clear/fill/format/history 接同一 gateway，cut/rename/插行已有 native 断言；但 R1 删表实际源码漏域，R3 多区域规则范围漏域。 |
| 3. 失败/noop/异步/source/门禁 | ❌ | sequence 不依赖 ACK/revision，noop 与异步缓存不进事实；api/refresh/import source 有测试。R2 在运行期生命周期入口绕过最新控制，R4 提交后失败既无事实通知也无响应。 |
| 4. 旧连接、换簿失败、重启、释放 | ❌ | binding 的 owns 检查、host read/write 回包检查、dispose 清监听/拒绝 pending、候选 open/config 失败保旧、restart controls 均有直接证据；但 R2 异步换簿控制竞态、R4 异常后无法继续服务未过。 |
| 5. 最小清晰设计/无镜像/无 JS 逐格伪原子 | ✅ | typed 值/事务/范围留在 Rust；Core atoms 做同 Store 命令，connection 做请求门禁，binding 持当前连接订阅，worker 做执行门禁/事实/串行命令，transport 仅通用 RPC/event。identity 用于当前真实旧连接风险。没有为未来消费者引入 backend/HostPort/第二份 workbook。 |
| 6. WASM 签名审查与验证分工 | ✅ 本叶定向 | 快照只新增 host_read_ranges、host_write_cells、host_mutation_state；扫描器补 host/mod.rs，差异可解释。真实 .wasm/glue 重建与消费不在本叶通过项。 |

## PKG-06～10

| 矩阵行 | 结论 | 证据 |
|---|---|---|
| PKG-06 | ✅ 本叶定向 | native host_data 6；Core typed/read/write + 一次多范围 native call；限量原子策略已实现并文档化。真实 WASM/千行多表消费者待 004。 |
| PKG-07 | ❌ | UI 输入/粘贴/清除/填充基础链成立；完整格式/元数据成功事实受 R3 阻断。DOM 入口仍待 004。 |
| PKG-08 | ❌ | cut 源/目的/第三表、undo/redo 和插行/rename 已测；R1 删表引用重写及其历史回放确定漏域。 |
| PKG-09 | ❌ | noop、异步、source 与旧 owner 基础路径有证据；R4 使提交后异常不再可观测，后续队列停止服务。 |
| PKG-10 | ❌ | Core/Worker readOnly/busy/structure、history structural 检查、发布后初始化入口封闭、原生保护均已核对；R2 换簿最终交换未使用最新控制。 |

## 最近 fact 是否丢失一条 Worker 命令内的多次提交

已从 dispatcher 追到当前 native history 入口，没有发现正常运行期持久命令存在多次 push 后只采最后一次的实现：

- cell.setInput 的普通、Table header、扩表、计算列分支均在一条记录后返回；paste 的普通/cut/Table expansion/列宽分支互斥，各一次 native transaction。
- clear、format selection/borders、replace、duplicates、textColumns 在 native 分组中一次 finish/push；fill、resize、旧完整格式在 withHistory 中一次 begin/finish，内部 raw writer 不额外推历史。
- sort、merge、filter、freeze、outline、visibility、validation、conditionalFormat、notes/comments/hyperlink、namedRange/customFormula、table、sheet structure/sheet edit 各调用一条对应 history 命令；protection 仅在 changed=true 时额外发一个 metadata fact；history.apply 一次 undo/redo。
- 初始化建立 Table/尺寸/outline 可包含多次提交，但在未发布连接中，初始化 import 生命周期不收 user fact，最后发布一次 Store import；运行期三种原始 initialize/openFile/importCells 在 configure 后封闭。

因此最近 fact 的有界方案对当前命令可以成立，不需要为了未来命令添加无限日志或通用事务层。R1/R3 是同一事务自身 footprint 提取不完整，与“只取最后一次”是不同问题。

## 证据复用与新增验证

已重算 43 个交付文件路径排序 SHA-256 的二次 hash，与作者报告完全一致：

```text
db42adf7e883c936daff12abd91c46e0c7b90ccd77653a7d2e647ef4645697e6
```

因此复用 `003-report.md` 的 53 files / 421 Core tests、11 native binaries / 105 tests、Core tsc、WASM cargo check、保护 2 项、API signature 1 项及 diff-check 成功证据；没有重复全仓测试、构建、浏览器或全量 E2E。

仅新增以下最小验证，均自然退出 0；预期输出揭示缺陷，不表示验收通过：

| 验证 | 执行方式 | 必要性 |
|---|---|---|
| R1 删除/undo/redo | `rustc --edition=2021 -L dependency=excel/rust/excel-core/target/debug/deps --extern einfach_excel_core=.../libeinfach_excel_core-3061481a5f242d81.rlib` 从 stdin 编译临时探针，直接读取 J30 与 last_mutation | 报告只有 cut/rename/插行范围断言，不能证明 Presence 分支。 |
| R3 多区域规则与移动作用域 | 同一现有 rlib，stdin 临时 native 探针，读取 create/disable/undo/move facts | 报告未覆盖此事实分支，源码 fallback 明确可疑，需要区分真实漏域与猜测。 |
| R2 候选迟到回复 | 仓内 Node v24 + TypeScript transpileModule 内存加载 Core，以受控 Worker 延迟 openFile | 既有换簿测试未在 await 期间改变控制，需实际验证竞态。 |
| R4 队列恢复 | 同一内存 TS 加载，仅安装 host gateway，注入提交后新增表 metadata 失败，再发一个只读消息 | 既有普通 projection throws 测试不能进入未知新 sheet key 的 catch 发布路径。 |

临时探针无仓内源文件写入；native 探针复用作者现成编译库，没有重新构建引擎，也没有冒充真实浏览器 WASM 验证。最后读取源码 fingerprint 仍与报告相同。

文件职责审查使用任务要求的 React 架构与 one-file-one-thing 规则：新增源文件最大 157 行，native 最大 126 行；存量 runtime 560 / commands 388 / wasm-types 316 为本次小范围接线或减少行数，未扩大为无关拆分。FEATURES、真实 DOM、WASM 重建、包消费者与全仓门禁明确交 004，未将这些未执行项判作本叶全过或误判为本叶新缺陷。

REJECTED — 跨表删除与规则修改事实漏域、换簿控制竞态、提交后异常毒化队列需要先修复。

## R1 修复复审（当前判定）

已重读任务 index、003-host-data、003-report 的完整 R1 节与首次审查；只审首次候选之后的 16 路径增量及其必要上下文。基线仍为 `08caefbce8cb4934ceea4f0c26115d910569a47c`，没有改产品、任务、作者报告或其他叶，没有派 agent、全量测试、构建、浏览器、commit。

当前 52 个交付文件的聚合 SHA-256 与作者 R1 报告完全一致：

```text
82c7277f08d8cd6f2ea8d6f04d478986f0ebf94a91243f26e9fb1eddcac66146
```

### 原问题关闭结论

| 原项 | 结论 | 修复证据与复审判断 |
|---|---|---|
| R1 / Important：删表跨表事实 | ✅ 关闭 | `host/sheet_presence.rs:5` 比较 archive 已保留的原公式源与删除后的真实源，用 `remaining_keys` 转换删除索引后的坐标；条件规则和 validation 从已有目录前后像提取变化区域，模板按稳定 key 报元数据。`workbook_sheet_history.rs:141` 保存独立 mutation；`:254` 重做删除时更新；恢复成功取走 archive 后仍保留 footprint；`:304` 纳入 retained bytes。`host/mutation.rs:53` 直接合并稳定 key 位置，不借用权限 affected_sheets。新增 `host_presence_facts` 的 2 项覆盖原 J30、规则附加区域、验证范围、未改规则/表排除，以及 template-only 只报元数据；undo/redo archive 被消费后的同范围断言有效。 |
| R2 / Important：换簿控制竞态 | ✅ 关闭 | `runtime/rust-workbook-runtime.ts:194` 在候选 open/catalog/configure 的全部 await 之后，按当前 Store controls 再检查；该检查到 owner 交换间没有 await。新增 6 项回归分别暂停三个等待点，收紧 readOnly/busy，断言 false、准确诊断、旧连接/事件保留和候选释放，覆盖首次复现条件。 |
| R3 / Important：条件格式旧/多区域漏报 | ✅ 关闭 | `host/rule_changes.rs:9` 按 id 比较实际变化的前后规则，再取所有 primary/additional ranges；`ConditionalFormatChange::mutation_ranges` 直接用已持有的前后像，`host/mutation.rs:75` 接入并去重。不是全目录无条件上报。`host_conditional_facts.rs:19` 精确检查 create/disable/scope move/delete 及每步 undo/redo 的完整新旧范围，同时排除 Z900:Z901 未改规则。 |
| R4 / Important：提交后身份/发布异常与队列 | ✅ 关闭 | `sheet-edit.ts:20` 在 native add 前生成宿主 id，`:23` 至 `:31` 在读取 name 前登记 native key 与身份；name 抛错仍能把 fact 映射为新 sheetId。`host/worker.ts:114` 独立判定 committed，事件发布另用 published；catch 内重试受保护，`:183` 最外层隔离异常，`:196` 对 fulfilled/rejected queue tail 均继续服务。新增 4 项保留了首次故障分支，验证 name 失败仍通知/诊断/推进 revision，未知身份明确整簿失效，通知失败保留 native fact 诊断，错误响应 post 自身失败后只读仍可服务。详见下方发布语义审查。 |
| M1 / Minor：全轴范围的 typed read 边界 | ✅ 关闭 | `docs/host/README.md:44` 明确非空 ranges 也可能是全轴元数据，可能超过逻辑画布/读取预算，不能直接保证 typed read；需要按需相交/切分，格式、规则、尺寸、保护应原生 export。`:84` 明确 committed-unmapped 是整簿失效，需 export/重同步，不是 noop。 |

### 提交、通知和队列的额外核对

`lastSequence` 的两处更新均以消息成功 post 为前提：正常事件在 `worker.ts:97` post 成功后才于 `:98` 更新；无法映射的失效通知也只在 `:158` 的 published=true 后更新。事实读取/映射/第一次通知 post 失败时不会提前消费序号。重试正常事件成功后，不再发送第二个失效事件。

稳定 sheetId 确实无法恢复时，`.committed-unmapped` + `changes:[]` 符合 index 中明确裁决，通知表示整簿失效，并保留 committed RPC 的 nativeMutation、notificationError、notificationPublished；没有猜 sheetId 或伪称回滚。正常可恢复身份的 name 失败仍发送原 kind 和精确 changes。若事件 post 持续失败，RPC 的未送达诊断要求宿主自行读回/export；这不是可靠事件日志，不承诺自动补发已错过的历史事实。`host.writeCells` 仍维持既定 ok/changed/revision + displayError 约定。

新增最小独立检查只补作者 4 项失败用例未直接覆盖的“首次事件 post 失败、catch 重试成功”分支：Node v24 + TypeScript transpileModule 从 stdin 内存加载当前 gateway，不写仓内测试源码；依次执行提交、noop、只读、下一次提交，断言只出现 `native-1`、`native-2`，4 个 RPC 均有响应，第一次明确 committed，后续只读可用。自然 exit 0，输出：

```json
{"events":["native-1","native-2"],"responses":[{"id":1,"ok":false,"code":"WORKBOOK_COMMITTED_PRESENTATION_FAILED","detail":{"committed":true}},{"id":2,"ok":true},{"id":3,"ok":true},{"id":4,"ok":true}],"sequence":2,"revision":9}
```

这项仅验证消息故障恢复，不冒充真实 WASM 集成。原生删表和规则范围的新分支已由作者与当前相同源码的精确 native 回归覆盖，没有再编译/重跑引擎。

### 当前验收与证据复用

六条本叶验收均为 ✅：1、5、6 保持首次审查的通过边界；2 由 R1/R3 关闭；3、4 由 R2/R4 关闭。PKG-06、07、08、09、10 当前均为 ✅ **本叶定向**；这不代表 004 的真实 WASM、DOM 用户入口、包消费者或全仓验证已经通过。

复用作者 R1 相同指纹的 Core 54 files / 431 tests、native 20 binaries / 189 tests、整理后的 host 2 files / 13 tests、Core tsc、WASM cargo check、API invariant 和 scoped diff-check；原子 transaction、typed 值协议、旧 owner/订阅释放、异步 noop 等未改实现沿用已通过证据。本次没有重复这些测试/构建或运行全量。

结构仍然最小：规则前后范围比较服务两个当前使用者，archive footprint 服务实际删除历史；没有新增 workbook mirror、通用 backend、未来生命周期或无限日志。新增源 23/29 行，gateway 199、sheet-edit 41 行；原 313 行 sheet history 为同一既有拓扑回放算法的小型修复，未引入凑行数分层。

当前未关闭的 Critical/Important/Minor：0。原报告中的复杂目标拒绝、事件只保留最近值、物理消息通道故障无法保证送达，以及 004 负责真实产物/消费者/DOM/全仓门禁的边界继续有效。

APPROVED — 原 4 项 Important 与 M1 已按精确分支修复并验证，本叶定向审查通过，最终产物验收交 004。

## R2 集成回修根审

本节由编排者作最小集成增量核对，不冒充R1原独立reviewer的又一次完整审查。此前13文件纯格式已用报告逆向规则核对修前SHA与parser-aware token，13/13一致；错误naive scanner方法与首次提取失败保留在index账本。

随后5路径逐项读取diff/新source-runtime文件并核对SHA，全与003-report最新表一致。initial-tables没有降低覆盖，反而延迟host.configure ACK验证ready之前必须配置完毕及内容/表/async顺序；原包边界扫描迁移到独立职责文件，26项中保留原扫描并新增5正例/20反例，不排除host目录。解析器依赖由004显式加devDependency，不压warning。其他公共边界测试未删。

唯一新增产品语义为commit-feedback的3个已知HOST_*词典key透传，未知错误仍fallback/detail，outcome-unknown优先级不变，没有放宽门禁或新增层。新增反馈测试先7失败复现，修后包含两输入源及readOnly/busy命令链；真实DOM多语言不在这些fake测试中冒认。复用当前指纹的12文件98项、Core noEmit和5路径零警告lint，不重复未改Rust/431项Core功能套件。

最新交付57文件聚合d5437f73580ba2e7b7a9cdf3f80558971d6adb5abf4c0b6e534231f9bb72bb5c；本叶done，004必须用新产物验证Vite/Rspack中英格内/公式栏明确反馈及未改值。R2本域无未关闭问题，不据此宣称整体可发布。
