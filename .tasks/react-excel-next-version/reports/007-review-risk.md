# 007 独立风险审查：001 / 002 / 006

2026-10-21 17:21 CST。结论：**2 Important，0 Critical，0 Minor**。002 命名区域遗漏及 006 HTTP 提前失败后的响应泄漏尚未关闭，不能签三域完成；001 当前源审及稳定专项未发现新增阻塞。所有真实浏览器、WASM wire、两语言两宽截图及整版门禁仍待 007。

## 身份、范围与证据边界

- 基线及当前 HEAD 均为 `b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb`；这是未提交工作树候选审查，不是最终冻结版本。
- 完整读取 index、001/002/006/007 任务及对应报告，使用 `react-excel/SKILL.md`、feature-wave、one-file-one-thing、frontend-design-codex。复用原始专项结果，不重跑稳定专项。
- 审阅证据根 `.codex-artifacts/react-excel-next-version.11oYiO/` 的 `007-review-{001,002,006}-{manifest.txt,tracked.patch,new-files.patch}` 及 `007-review-shared-registries-and-runtime-mocks-{manifest.txt,patch}`。按 manifest 阅读全部领域新增源、专项测试、E2E、fixture、说明，并审相关共享 hunk。
- 只执行只读源码/指纹/行数/证据核对及两个最小 Node 探针。没有执行 Cargo、WASM、浏览器、全量、构建或源码修复，没有派 agent，没有 commit/push。临时 localhost HTTP server、定时器及连接均已关闭。
- 原任务唯一报告写入为本文件。root 后续明确要求持久原始探针，额外授权证据根两个纯文本文件：`007-review-risk-stream-probe-command.txt`、`007-review-risk-stream-probe.log`；无产品写入。

初次逐文件 SHA-256 核对：三域所有产品、单测、E2E 与包中指纹一致；只有共享 `next-version-feedback.ts`、`FEATURES.md` 已有后续增量。收尾再次核对发现下列精确 delta，已逐个补审：

| 文件 | 相对包快照的精确增量 | 收尾 SHA-256 |
| --- | --- | --- |
| `react-excel/src/i18n/next-version-feedback.ts` | 追加003必填/重复组两条消息及005通配符转义一条消息；001/002原三条不变 | `0c999023756047f4c0c4f93d6d2e25ae728a2dcacfc655104d8b988457a263ee` |
| `react-excel/e2e/FEATURES.md` | 追加 FARG-009..012、AFMT-001..005 九行；001/002/006现有十八行及原955行不变 | `9d623f05ff6e86f8b080c813c04f754ee8363a64735aa66b922bf59195df4de2` |
| `spreadsheet-ui-core/src/rust-workbook/runtime.ts` | initialize 内 createAsyncFormulaIo 调用换行；无 token/身份/调用顺序改变 | `9bbc2b727a73b72c63fde857c44c8c02911acebe6eb7e05125cefb14ba5489d0` |
| `react-excel/src/page/demo/async-formulas/async-formulas-workbook.ts` | colWidths 单行换两行；数值不变 | `067fef960134dcd4f76aa8593e9c4a666ef9d54da45362e7bcdc385e22cd3da9` |
| `spreadsheet-ui-core/test/next-version-integration/async-candidate-ownership.test.ts` | 类成员组间追加三个空行；测试断言不变 | `37634f1357f213031e3ad37fc2802d79aa26c93a3fe1c2a87b414ba057e69fda` |

表中路径均相对 `excel/`。其余 manifest 指纹仍一致。后续原 owner 修复是新的语义 delta，须按准确 diff 补审；本结论不覆盖尚未出现的修复。

## Important RISK-002-01：跨表剪切没有处理指向源区的命名区域

位置：`excel/rust/excel-core/src/cross_sheet_cut/rewrite.rs:176`、`:234`，`cross_sheet_cut/mod.rs:90`、`apply.rs:29`。

触发：源表 A1=4，原生命名区域 Sales 指向源表 A1，第三表 A1=`=SUM(Sales)`；Cut 源 A1，再 Paste 到另一表 C4。现有跨表计划成功、清源并写目标，但 Sales 仍指向源表 A1。第三表从4变0，名称定义没有随动，也没有原子拒绝。完整包含与部分相交的名称定义都存在这个遗漏。

这是源码链路确认，**本 reviewer 没有运行新的原生 repro**：

1. `formula/ast.rs:215` 的 `Expr::Name` 同时用于工作簿名称和 LET/LAMBDA 变量。当前 rewrite 对它落入默认 `_ => {}`；dependent_writes 只扫描 formula AST，名称本身不产生改写计划。
2. `workbook_named_ranges.rs:73`、`:93` 将范围保存在 `NamedDefinition::Range { sheet_key, range }`；`sheet_workbook_sync_context.rs:166` 继续按这一稳定源表身份解析。`eval_core_runtime_ref_expr.rs:15` 明确让非 LET 局部名称解析到该范围。
3. `cross_sheet_cut/apply.rs:28` 的 bulk_load 只清源、写目标及改写公式，之后只处理链接/格式/边框；没有更新名称定义。Cells history 也没有增加名称事务。
4. 已有 `tests/named_range_reactivity.rs:11` 的原生测试说明并断言名称引用跟随源地址实时重算，而不是冻结创建时值。因此源被清空会改变 SUM，不能由 memo 自动保住原值。

风险：成功反馈下产生静默计算变化，破坏“跨表剪切及依赖原子移动”的现有验收；当前说明虽限定 A1 重写，没有明确排除此原生已支持的引用形式。不是要求新增 Office 功能。

最小建议：在原生历史开始前，按已存在的命名区域定义检查与源区是否相交，无法在同一历史内正确随动时整次拒绝并保留源、目标、依赖、redo、cut token。**不要拒绝所有 Expr::Name**，否则会误伤 LET/LAMBDA 局部变量或无关常量。补原生红绿：完整/部分相交拒绝，名称及三表 before-image/redo 不变，同快照纠正重试；无关名称、LET/LAMBDA 仍允许。真实 DOM 入口边界交 007。

## Important RISK-006-01：HTTP 提前失败后响应脱离并发、超时和释放预算

位置：`excel/spreadsheet-ui-core/src/rust-workbook/async-formulas/fetch-json.ts:71`、`:75`、`:122`，`io.ts:74`。

触发：同源 HTTP 返回403等失败状态，或200但 Content-Type 非JSON，或 Content-Length 超1MiB；服务器发送头后保持流式响应。provider 在取得 reader 前直接返回错误，body 未取消。IO finally 清5秒 timer 并从 running 删除 controller，也没有 abort。后续请求继续启动，旧响应既不受4并发约束，也不受超时或 owner dispose 管理。

已实际验证两层，不把 Node 当 Worker/WASM 浏览器通过：

- 原样 `fetchJsonFormula` + 真实 ReadableStream：403、非JSON、声明超长三支分别返回 NA/VALUE，但全部 `bodyCancelled=false`、`requestAborted=false`。
- 原样 `createAsyncFormulaIo` + 真实临时 localhost HTTP server + Node原生fetch：6个不同调用全部结算为原生错误时，6条真实 HTTP 响应仍同时存活；等待5.2秒并 io.dispose 后仍未关闭。只把 native queue/resolve 边界 stub，HTTP 不是 mock。

原始已执行命令和输出分别持久在证据根：`007-review-risk-stream-probe-command.txt`、`007-review-risk-stream-probe.log`。原始 stdout：

```json
{"phase":"all-six-native-errors-settled","settled":6,"activeHttpResponses":6,"maxConcurrentHttpResponses":6,"anyRequestAborted":false}
{"phase":"after-5s-and-io-dispose","activeHttpResponses":6,"anyRequestAborted":false}
```

风险：具有明确错误结果的请求仍占连接及持续网络资源，多个失败调用可突破文档承诺的4并发/5秒边界；工作簿 owner 释放也无法终止这些已从 running 移除的请求。

最小建议：IO finally 在删除 running/清理计时器前 abort 当前 controller，使包括所有早退在内的网络请求结束；也可在 provider 所有取得响应后的出口统一 cancel body。保留既有 NA/VALUE 映射，不新增调度层。补三条早退流关闭专项，确认下一批启动前旧流关闭、5秒后无遗留、dispose能收尾；保留成功/超时/迟到/失败scope现有专项证据，007再走受影响真实网络入口。

## 按原验收逐条核对

✅ 表示源码与已有专项证据支持该层边界，**不代表真实浏览器已通过**。每个尚未运行的用户入口均另列“待真实浏览器”。

| 验收点 | 结论与依据 | 用户链路状态 |
| --- | --- | --- |
| 001 Ctrl/Command点击、modifier拖矩形、普通点击回单区 | ✅ 复用selection authority；append只持witness/count/身份，不缓存regions | 待真实浏览器 MRSEL-001..004 |
| 001 相同矩形激活/结束合并、部分重叠、union计数、预算反馈 | ✅ manual-pointer/cancel-and-limit专项覆盖；预算拒绝不capture，保留原区 | 待真实浏览器及统计/间隙断言 |
| 001 Shift原锚点、公式引用、格式刷与链接优先级 | ✅ Core优先分支及DOM modifier专项；format-painter state为原样提取消环 | 待真实浏览器 interaction-priority |
| 001 Escape、pointercancel、切表/ABA/结构/选区身份变化与晚到move | ✅ receipt current guard；keyboard navigation非composing Escape先endPointer；DOM释放capture | 待真实浏览器按住鼠标Escape |
| 001 自动滚动、填充、冻结、合并 | ✅ 取消仅在grid调用方stop其selection hook实例，通用hook无改动；FillHandle复用不受新增selection条件约束 | 待真实浏览器边缘滚动/填充既有回归/两宽截图 |
| 001 多区格式/清除、一次Undo、gap不变 | ✅ 继续原生多区命令，未新增TS workbook镜像；E2E实际鼠标入口准备 | 待真实浏览器 MRSEL-006..008及两宽 |
| 001 持久化/历史边界 | ✅ 选区是会话态，不声称文件保存或selection Undo | 按此边界验，不制造持久化要求 |
| 002 值/公式/有效格式/链接/空白payload、两端一条history | ✅ 原生单store.batch、multi-range Cells history；原生references/metadata专项 | 待真实浏览器 XSCUT-001/002 |
| 002 静态A1整格/整范围、混合绝对、引号表名、未移动本地引用 | ✅ rewrite保持身份及$；第三表及同坐标异表原生专项 | 待真实浏览器三表formula bar |
| 002 名称定义指向源区 | ❌ Important RISK-002-01 | 待原owner修复及准确delta补审 |
| 002 partial/dynamic/OFFSET、隐式/ThisRow Table、merge/Table拒绝 | ✅ 原子预检；INDIRECT文本保持旧语义；无关动态范围允许 | 待真实浏览器拒绝/纠正/恢复 |
| 002 源/目标/实际改写依赖/边框邻格当前权限 | ✅ preflight每一实际写点；目的unlockedRanges不会套源坐标；原生保护/border专项 | 待真实浏览器 XSCUT-007及现有保护回归 |
| 002 Stop/Warning、失败before-image、无宿主history、redo/token | ✅ 验证候选在batch内，finish(false)回滚；原生通知数0、三表/redo、Warning重试专项；runtime失败不consume token | 待真实浏览器 XSCUT-003..006 |
| 002 切表保cut、内容/结构变化身份、浏览器clipboard失败 | ✅ 切表projection不推进cut身份；原生input/格式/link复检；capture commit=false保旧copy | 待真实浏览器 XSCUT-008及旧copy/paste modes |
| 006 真HTTP到native结算/依赖/跨表/array | ✅ Worker drain/fetch/resolve接既有原生memo及Store传播，非TS结果cache | 待真实浏览器 AFORM-001及array |
| 006 URL同源/协议/userinfo/redirect/credentials、Pointer own属性 | ✅ fetch-json专项；不eval；拒继承路径；允许JSON本身own __proto__标量 | 待真实Worker拒绝/坏JSON/预算入口 |
| 006 单waiter/settlement latch、current-window、连接替换 | ✅ io/watch/runtime-binding专项；初次microtask避outer-writer派生缓存；旧连接不可发布 | 待真实浏览器切表滚动/openFile late settle |
| 006 并发/队列/大小/深度/节点/超时 | ❌ 纯成功与超时路径预算有专项，但早退资源所有权被 RISK-006-01 打破 | 待owner修复/流关闭专项/真实网络 |
| 006 drain/resolve fatal恢复 | ✅ IO拒waiter并abort；Core发布runtime错误后dispose，无第二事件系统 | 待007实际runtime错误/恢复边界，不以mock签网络通过 |
| 006 失败重算sheet范围、共享memo、success/inflight去重 | ✅ 现有Store reverse_dependents与selected formula inner求交；原生10项含scope和shared | 待真实浏览器 AFORM-002 |
| 006 参数/覆盖/UndoRedo/rename/delete/openFile迟到、焦点/保护 | ✅ native generation及IO disposed guard，settle仅推revision不内容Undo；候选冲突free且保旧book专项 | 待真实浏览器 lifecycle/topology/protected/focus |
| 006 JSON错误样文本wire、名称冲突、文件不执行provider | ✅ own json envelope/error优先源码；原生名称冲突及候选生命周期专项；wire专属62行 | 待lite/full WASM wire、ISTEXT/ISERROR、真实文件重开 |

## 复用的实际专项证据

以下原始文件已读取真实结果，不累计成一个全仓总数：

- `001/core-vitest.json`：success=true，8文件109通过/0失败；`001/react-vitest.json`：2文件11通过/0失败。
- `002-rust-clipboard-regression.log`：7+21+6+8+18=60通过；`002-rust-cross-sheet-cut-final.log`：22通过；`002-rust-clipboard-lib.log`：47通过。22替代本域21，不相加冒充新增数。
- `002-core-clipboard-regression-r2.log`：6文件85通过；`002-react-clipboard-regression.log`：2文件19通过。
- `006-core-async-formulas.log`：4文件48通过；`006-cargo-async-formulas.log`：首轮9+原manual6；最终 `006-cargo-async-formulas-name-conflict.log`：10通过。10替代9，不累计。
- `007-runtime-mock-migration.log`：29文件212通过；28个旧runtime mock的patch只加origin/空async接口基类，没有改断言。`007-async-candidate-ownership.log`：1通过。后续三处纯排版delta不改变其语义输入。

新增清单65个去重路径均核行数，最大普通源/测试为 `cross_sheet_cut/rewrite.rs` 252行；其余均≤300，没有为目录造React包装。存量超限 `selection/index.ts`1304、`system-clipboard-command.ts`311、Worker `runtime.ts`575 仅本次必要共享接线，本轮不扩大重构。

## 交付给 root / 007 的剩余边界

root 已接受两项 Important，修复回原owner；reviewer没有抢改产品。只需原owner针对这两个新风险补红绿并提供精确diff/指纹，再独立补审，不重复其余未变稳定专项。当前候选不签done。

007仍需执行001的30个、002的12个（含四张双语两宽图）、006的28个已准备浏览器case，真实Worker/WASM/HTTP、所有十八个新primary绑定、原955绑定、lite/full字面量wire、全仓门禁及一次完整冻结E2E。001现有新截图用例主要是英文两宽，整版要求的中文两宽需007实际补证；006也没有本reviewer看到的双语两宽截图通过证据。实际截图必须逐张查看；本reviewer未看截图，也不声称无`.shared`工具时跑过视觉工具。

本报告只覆盖001/002/006和相关共享接线，004/005并行业务与整版14行矩阵最终总审不在本次签署范围。服务状态仅指本次临时探针已关闭；未替007宣布全项目服务已停。报告/证据完成后释放审查槽位。

## R1 精确 delta 补审：两项 Important 关闭

2026-10-21 17:34 CST。**本轮最新状态：0 未关闭 Critical / Important / Minor；RISK-002-01、RISK-006-01 均关闭。** 上文首次审查的两项发现及原始红证保留为历史记录。本轮没有新增阻塞；这不是整版 done，也不是尚未执行的真实浏览器、WASM 或门禁通过。

重新读取更新后的 index、007 风险入口及002/006报告追加段，只审本轮冻结修复、专项和对应契约。004并行TS兼容修复不在本轮范围。只读源码、原始日志与指纹，不执行任何新测试、Cargo、构建、WASM、浏览器或HTTP探针，不重跑稳定专项；唯一写入是本报告追加。

### RISK-002-01：关闭

- `cross_sheet_cut/mod.rs:49` 用既有 `snapshot_named_ranges()` 查询当前有效 `Range` 定义，按解析后的稳定表身份与源区相交拒绝；位于任何写入和历史开始之前。查询本身纯元数据读取，不求值或物化cell。失效范围的 `target=None` 不误绑同名重建表；常量、表达式和LET/LAMBDA局部名称不进入该查询，没有以 `Expr::Name` 一刀切拒绝。
- 新原生143行专项实际覆盖静默SUM复现、完整/部分相交、无宿主history、三表及名称before-image、redo及pending不变、修正定义后的同快照重试、rename/reorder稳定身份、删除后同名重建、不相关名称/常量/表达式/LET/LAMBDA放行，以及capture后才注册名称的paste时复检。未增加名称迁移事务或新导出。
- 原始 `002-risk1-named-ranges-red.log` 的6项为4失败/2通过，明确打印旧实现成功清源及Audit从4变0；修复后 `002-risk1-named-ranges-green.log` 为28+9+7=44/44通过。`002-risk1-core-clipboard.log` 为6文件86/86通过，包含新增错误映射。以上为原owner真实结果，reviewer只复核日志，不另跑Cargo。
- Core消息明确指引Name manager修正，承诺未移动；契约同步写明有效命名范围相交时原子拒绝。React DOM单测相对原包仅移除3个Testing Library不支持的 `exact:true` 选项，断言及产品行为不变。
- 新74行 `e2e/cross-sheet-cut/named-range-recovery.spec.ts` 经源码审阅：真实Name manager创建CutSales、第三表SUM、造redo、拒绝及数据保留、Name manager改指F1、不重capture后重试及Undo，并准备 `named-range-rejection.png`。**该case尚未运行或审图**，仍由007真实验收；002由12增为13个准备case，不新增primary ID或改旧绑定。

冻结输入逐项 `shasum -a 256 -c 002-risk1-source-fingerprint.txt` 全部匹配。清单自身SHA-256为 `1a9b798a351a56f747b950fc58e450e2ebff11a5f51b9cd74df53c7782dd063d`；修复入口为 `670606cdc4e3bd7b2bb12ec7490e56cc7fdb9ee7fe54f98611976acc32c984a0`。原生入口163行、新专项143行，未触发文件拆分边界。

### RISK-006-01：关闭

- 唯一产品语义delta是 `async-formulas/io.ts:77` 的 `controller.abort()`，在同一finally内先于清timeout、移除running和继续drain/pump。HTTP状态、MIME、声明超长三条早退和读体/原生结算异常都共用该收尾；成功结果已完整读完再收尾，不改既有错误映射、结算次数或owner身份。没有新增RPC、WASM导出、调度层或结果缓存。
- 新133行专项使用真实localhost HTTP server及Node原生fetch，仅native queue/resolve边界stub；服务器持续写流，不是伪Response。覆盖三早退、真实读体断连、dispose及迟到不结算，检查4并发上界、六个唯一call各结算一次、signal终结、服务端active归零、后续真实success42和finally关服务。
- 已读 `006-r1-http-lifetime-red.log`：5项中4失败/1通过，三早退均为 `active=6, maximum=6, abortedRequests=0`；对应green为5/5。`006-r1-core-async-formulas-green.log` 为5文件53/53通过，替代旧48，不累加；三早退的实际active均0、maximum分别3/4/3、aborted均6，既有timeout、失败映射、fatal恢复和连接身份专项保留绿。
- owner原样重放reviewer持久命令的 `006-r1-review-stream-probe-green.log` 与保留红证对照：六个native错误结算后，真实HTTP active从6变0、最大并发从6变3，signal已abort；等待5200ms并dispose后仍active0。原脚本SHA校验匹配，原始红日志未覆盖，临时服务/定时器/连接由脚本finally关闭。

```json
{"phase":"all-six-native-errors-settled","settled":6,"activeHttpResponses":0,"maxConcurrentHttpResponses":3,"anyRequestAborted":true}
{"phase":"after-5s-and-io-dispose","activeHttpResponses":0,"anyRequestAborted":true}
```

逐项校验 `006-r1-files.sha256` 全部匹配；清单自身SHA-256为 `b25e7ab67eb8863018144db01696043fc502a3125d6da296d262f6cf4ec4e7c5`。产品io.ts为 `04c6c695b563718060243d7d4ac645ecabeb5935cad1c4b1643c4e71fb21defe`，130行。所有本节证据文件均位于 `.codex-artifacts/react-excel-next-version.11oYiO/`。

### 移交007的剩余执行边界

先前验收表中“名称定义指向源区”与“提前失败资源预算”两处缺口现已由原生/Core红绿及本次源码补审关闭，其余未变专项不重复。仍须由007执行真实Worker/WASM/HTTP、002新增名称拒绝与同快照恢复DOM及截图、001/002/006全部浏览器case（分别30/13/28）、双语两宽及逐图审阅、lite/full字面量wire、整版14行矩阵和最终冻结全量门禁。本轮没有实际浏览器/截图结果，Node真实HTTP不冒充Worker通过。已完成本轮独立补审，释放槽位供007构建。

## R2 冻结精确 delta 与16张真实图补审

2026-10-21 18:09 CST。**本次授权范围内新增0 Critical / 0 Important / 0 Minor；两项既有Important保持关闭。** 完整重读index、新增风险入口及001/006/007最新报告；按react-excel最短链、feature-wave稳定证据复用、one-file-one-thing及frontend-design-codex执行。只读源码、准确diff、指纹、原始日志/JSON和现存PNG，唯一写本报告；未启动测试、HTTP probe、浏览器、Cargo、WASM或构建，未派agent。当前r4整体冻结只观察已有证据，不改其输入，也不等待r4/full或签整体done。

### 精确变化及证据结论

| 本轮变化 | 源码审查结论 | 实际证据 / 边界 |
| --- | --- | --- |
| Core keyboard断环 | navigation且非composing的Escape先直接cancel既有pointer，再reset追加receipt/反馈，随后仍由原intent清非primary；不经过pointer-selection→formula-reference回环。editing/formula-reference模式不进入新增分支，原编辑/引用intent保持；没有第二状态或新公共命令。 | `007-r3-shared-escape-delta.patch`、`007-escape-cycle-core.log/.json`实际2文件55/55、success=true；`007-cycles-green.log`实际829模块/2444依赖无环。未重跑。 |
| grid DOM Escape白名单 | 只在F2/Backspace/Delete同一无Ctrl/Meta/Alt分支放行Escape，composing入口仍先拒绝，input/textarea、编辑会话及painter既有优先路径不变。已审稳定的pointer/autoscroll共享接线不重复。 | r3原始JSON实际001为28通过/2 overlap失败，原Escape三条在通过段；不能以Core绿替代DOM。断环后的最终整体浏览器仍待007。 |
| 006同owner start(call)闭包 | 原pump每次call的controller/timeout/provider/then/finally/catch内聚提取为同函数内start参数，没有复制owner状态；仍先shift→queuedIds.delete→同步start。严格保留accepted native resolve才publish、disposed阻断旧owner结算、finally abort→clearTimeout→running.delete→未disposed时drain/pump、末端catch(fail)，单waiter/latch及native generation契约未变。其余四文件及waiter类型仅brace/断行。 | `006-lint-owner-delta.patch`逐hunk已读；`006-lint-core-async-formulas.log`实际5文件53/53，三条真实HTTP早退active均0、max分别3/3/4、abort均6；成功继续、读体异常、dispose、超时/预算、fatal和身份绿。scoped eslint命令退出0且日志空，非全仓lint声明。 |
| 001 overlap前置 | 相对首审原文准确diff只将通用中心拖拽换为本spec局部DOM滚动居中、相邻格边界±12px真实鼠标点；两点距各边≥56px且两rAF几何稳定，append footer resize后再取终点。没有注入selection/数据、固定sleep、出屏目标或改产品。全部B93:C93、A/B/C选中、D不选、count3/sum6/avg2、union3、D93=20断言保留，新增首拖A93:B93。 | owner用r3原始trace证实边缘自动滚动前置错误；76行新spec冻结，r4尚未作为本报告绿证。不是删除自动滚动覆盖，旧专属回归仍独立存在。 |
| 006四处新测试契约 | 空registry精确检查属性省略，冲突文件显式造数组后仍验原子拒绝/旧工作簿；rename精确括号匹配既有BinOp renderer；以实际sheet/namebox/formula和结算前后严格scrollTop替换overscan DOM不存在假设，保留BUSY→11。安全/迟到/文件不执行provider等断言不削弱。 | 已与首审原文逐行diff，并核既有`wasm_bulk_wire.rs:202`省略空Vec与`shift/render.rs:92`括号规则；lifecycle/topology产品与测试指纹匹配，实际纠正case结果仍交007。 |

另对001/002本轮纯格式测试与首审新增原文做准确diff：DOM provider/mock对象/长断言仅断行、001 kind仅此前获准的`as const`、002 TestingLibrary移除三项无效exact选项已在R1审过。没有调宽断言或增加fallback。007共享15路径manifest逐项均匹配；其中004其它业务只核冻结身份，不重审其已由另一reviewer覆盖的稳定语义。manifest末尾空白行导致shasum一条格式警告，不是任一路径指纹失败。

冻结指纹（均实际核对）：

- `spreadsheet-ui-core/src/keyboard/index.ts`：`7155e050d3f955c6a965c3666796e9909cdf07f13db45582e933fc83b725b83f`。
- `react-excel/src/workbook/grid/viewport/use-workbook-grid-events.ts`：`1e3a966c30544a7bec00d98ea9de92f37c0b8101491b84c190be149d2d2ba105`。
- `react-excel/e2e/multi-range-selection/overlap-statistics.spec.ts`：`8d9732aea95837cbf778be58c78ed7dfb2ffce9739d1e7e76f2bb2093ab1c145`。
- `spreadsheet-ui-core/src/rust-workbook/async-formulas/io.ts`：`f7e04e18ea02ec8285ec3f3e2d64f46f21a82e65f818f82b57a80f301a7eae9c`；`006-lint-files.sha256`五文件、报告、patch、命令和两日志共10项全部匹配。
- `006-r2-test-contract-files.sha256`的lifecycle/topology两spec仍匹配。该旧清单包含的006报告因后续lint追加段发生预期变化，由上述最新清单覆盖，不误报为产品漂移。

路径相对`excel/`，证据名相对既有证据根。当前IO136行，五文件22/137/136/135/139行，grid271、overlap76；没有新增文件或无意义包装。存量keyboard401行仅本次必要小接线，不借审查扩重构。

### 已独立实际打开的16张PNG

下列每张均由本reviewer调用view_image原图逐张查看，非照抄007结论、非只查文件名，未使用或声称运行`.shared`视觉工具。路径相对 `.codex-artifacts/react-excel-next-version.11oYiO/`：

| 域 / 画面 | 精确PNG |
| --- | --- |
| 001 en1280 Control | `007-e2e-impact-r3/multi-range-selection-modi-7c041-he-gap-unselected-at-1280px/modifier-click-Control-1280.png` |
| 001 en390 Control | `007-e2e-impact-r3/multi-range-selection-modi-c3d80-the-gap-unselected-at-390px/modifier-click-Control-390.png` |
| 001 zh1280 正常多区 | `007-e2e-impact-r3/next-version-integration-s-d192e-adable-in-Chinese-at-1280px/multi-range-zh-1280.png` |
| 001 zh390 正常多区 | `007-e2e-impact-r3/next-version-integration-s-a6354-eadable-in-Chinese-at-390px/multi-range-zh-390.png` |
| 002 en1280 拒绝 | `007-e2e-impact-r2/cross-sheet-cut-language-l-0caa6-ys-readable-in-en-at-1280px/cross-sheet-cut-en-1280.png` |
| 002 en390 拒绝 | `007-e2e-impact-r2/cross-sheet-cut-language-l-9f3cc-ays-readable-in-en-at-390px/cross-sheet-cut-en-390.png` |
| 002 zh1280 拒绝 | `007-e2e-impact-r2/cross-sheet-cut-language-l-e8e71-ys-readable-in-zh-at-1280px/cross-sheet-cut-zh-1280.png` |
| 002 zh390 拒绝 | `007-e2e-impact-r2/cross-sheet-cut-language-l-29b16-ays-readable-in-zh-at-390px/cross-sheet-cut-zh-390.png` |
| 006 en1280 BUSY | `007-e2e-impact-r3/next-version-integration-a-d18cf-tled-views-fit-en-at-1280px/async-formulas-en-1280-pending.png` |
| 006 en1280 settled | `007-e2e-impact-r3/next-version-integration-a-d18cf-tled-views-fit-en-at-1280px/async-formulas-en-1280-settled.png` |
| 006 en390 BUSY | `007-e2e-impact-r3/next-version-integration-a-42f4d-ttled-views-fit-en-at-390px/async-formulas-en-390-pending.png` |
| 006 en390 settled | `007-e2e-impact-r3/next-version-integration-a-42f4d-ttled-views-fit-en-at-390px/async-formulas-en-390-settled.png` |
| 006 zh1280 BUSY | `007-e2e-impact-r3/next-version-integration-a-d98fb-tled-views-fit-zh-at-1280px/async-formulas-zh-1280-pending.png` |
| 006 zh1280 settled | `007-e2e-impact-r3/next-version-integration-a-d98fb-tled-views-fit-zh-at-1280px/async-formulas-zh-1280-settled.png` |
| 006 zh390 BUSY | `007-e2e-impact-r3/next-version-integration-a-d8b03-ttled-views-fit-zh-at-390px/async-formulas-zh-390-pending.png` |
| 006 zh390 settled | `007-e2e-impact-r3/next-version-integration-a-d8b03-ttled-views-fit-zh-at-390px/async-formulas-zh-390-settled.png` |

观察：001两个非相邻选框与未选间隙可辨，中英390底部多区说明完整换行，统计与页签仍可达；002桌面及390合并拒绝红字完整可读，明确先取消合并且未移动，窄屏页签带可滚动不要求三表同时显示；006中英两宽B3由BUSY变7，桌面C3由BUSY变14，底部计数/平均/最值正常。窄屏真实横滚到B列，A列说明被左侧裁掉、C3在屏外，长公式输入显示水平滚动后的尾段且末括号换行，这是所拍视口事实，不将其当完整公式或依赖同时可见的证明。四组图未发现新增遮挡、动作不可达或反馈截断的阻断视觉问题；图片不能证明全操作链已通过。

### 最新已补证与剩余边界

实际读取r2/r3原始JSON：r2为80 pass/8 fail/43 max-failures后未执行，002全部13条expected（包括名称修正后同快照重试）；r3为113 pass/4 fail/0skip/0flaky，00128/30及007交叉7项expected。故R1所列002真实DOM缺口已有这一诊断轮证据，001/006代表性双语两宽图也已由本次独立实看补足；不把不同轮次拼成最终全量通过。

仍待007当前冻结r4及最终单一完整E2E/coverage、完整lint/类型/Vitest/build/native与lite/full wire等最终门禁。root已通报完整Vitest有旧`page-key-navigation.test.tsx`一红，须待自然结束后据完整失败诊断；本轮没有忽略它、将其归因为本delta或替root关闭。已审稳定部分不再循环重跑；后续总审只复用最终单一完整JSON和对应冻结指纹。本轮已完成，释放审查槽位。
