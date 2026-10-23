# React Excel 独立组件包

创建：2026-10-22。基线：`08caefbce8cb4934ceea4f0c26115d910569a47c`。
用户授权：做规划并实施；2026-10-22后续明确授权分批本地commit，仍未授权push或npm发布。

## 结果与阶段

- 阶段一：外部项目能安装构建产物，嵌入完整 React 工作簿，不依赖本仓 demo、源码 alias 或 Vite 专用公共入口。
- 阶段二：宿主通过同一 Einfach Store 安全读写原始工作簿，收到成功修改通知；独立 Vite/Rspack 消费者完成真实 Worker/WASM 验收。
- 不做 DeepFOS 插件业务，不修改 `/Volumes/work/web/excel-plugin`；其契约仅作只读需求参考。

## 当前交接（本地完整验收通过；历史卡顿根因未解决）

- 最终签收：唯一同候选完整序列95.5457min自然exit0，2679/2679、同JSON1026/1026，均单次passed/retry0；真实包44与嵌入18也在该轮全部通过。开始/结束6276输入f31481b8…73efa零漂移，1439旧证据保全，自有进程/5191/5193已清理。作者报告577行起、独审337行起APPROVED_WITH_CONCERNS，无新增C/I/M；原I2按其完整门禁定义关闭，验收7/PKG-13和001–004本地交付均done。
- **用户要求的历史卡顿修复未被证实完成**：两挂点本次均通过，18份观测没有预设症状，watcher零触发、没有故障栈，根因仍unknown；没有据猜测改产品。完整通过不是历史root cause修复。M1字号差异保持已接受非阻断限制。
- 已按职责正常提交e64fcb5e、c1cac1be，最终文档/任务随收尾提交。本地签收时尚未推送；用户已授权push，根单独核对精确SHA远端CI，实时Git状态以提交/远端及最终交接为准。不npm发布、不应用工作区版本、不改excel-plugin。

以下交接按各阶段当时状态保留；旧“尚未通过”“未授权push”等不能覆盖上述最新签收与授权。

- 2026-10-23 最新用户明确要求“做完剩下的这三个”：授权定位并修复历史输入卡顿、最终完整回归、分批 commit 与 push；覆盖旧阶段禁止 full/commit/push 的限制，但不授权 npm 发布、应用工作区版本或修改 excel-plugin。原三处失败已定向修复，新包44/44已成立；从004末节的新收尾阶段续跑，不重复打包和未变原生验证。旧I2两轮定位未复现，按skill第三轮交新负责人，原独审者只读审查，最多一个浏览器过程。
- 收尾阶段已正常分批提交 `e64fcb5e`（候选证据隔离及真实包行头回归）、`c1cac1be`（CI完整Vitest前构建真实full WASM，修复远端39709168980干净环境缺full的问题）；两批docs/presentation/lint/mainline types均通过，changed Vitest无受影响文件，既有44结果复用。未push。新负责人和独审者均从原trace确认TABLE的fill底层已成功但after/before snapshot各约3秒无响应，Enter从未实际触发，不能归为提交业务；I2原因仍未知。只在忽略证据目录准备症状触发自有renderer原生采样，首次自有Node能力自检6秒无有效栈，事实保留，尚未启动新full。
- 唯一最终full于2026-10-23T05:48:33.854Z启动：session96300、controller15306、launcher15309、watcher15307，2679例/370文件、workers1/retries0/CI未设/原30s；新目录`final-closeout-r1`独立保留。输入6276项聚合`f31481b8c7515224189c67159f63fa38e9323e4368539add71477ec681373efa`，独审逐键确认相对新React18候选仅CI变化，其他6275字节一致。去掉-mayDie的不同条件自有Node sample1.431s自然0、真实75132字节栈，自检不是bug复现；watcher SHA14a3f571…f84f7已单列启动记录，最多2次症状触发×2自有renderer，非持续Profiler、页面映射未知。独审预检查无阻断，不预签full/I2；运行中冻结输入，只监测同一进程。
- 06:18Z守护进程重启后根先核实旧进程仍活、日志356通过/零失败，未重复启动full或Git操作；旧agent会话已失，按004末节交新恢复负责人接管同一15306/15310过程与独立证据目录。冻结仍有效，任何最终结论待原过程自然退出。
- 2026-10-23 用户确认“react 18 继续”：React 18.3 继续作为唯一声明基线，不升级 React 19、不改插件仓库整仓依赖。恢复004，授权当前已提交候选重新 build:lib、独立 pack/严格安装及 Vite/Rspack 包级定向验收；不自动启动第四次完整E2E，不提交/推送/应用工作区版本/发布。执行前保全旧实物索引及失败证据，新日志/manifest/freeze放独立目录；具体边界见004末节。
- 同日用户明确选择“暂时只完善表格库”：后续保持本仓范围，excel-plugin仅只读参考，不修改其引擎适配器或React/Einfach依赖；真实插件接入不计为本轮交付。
- React18新候选实物已整合并独审APPROVED_WITH_CONCERNS，无新增质量发现：build:lib/artifact与仓外strict-peer安装、类型、Vite/Rspack构建均自然通过；唯一包级JSON原42+行头身份/冻结回归2，共44/44、54.1725s、零失败/跳过/重试/flaky。新freeze6276项aca47bd9…f6761结束changed[]，新证据独立在react18-candidate-r1；8015旧对象SHA/mtime不变，89新证据索引及真实tarball经独立只读核对。旧包未含key修复这一缺口已消除；自有进程已退出，无后台验收。但总004/I2/最终完整门禁尚未关闭，不发布。
- 001/002/003实现与独审已完成，004真实包消费通过，但最终全量E2E未通过；不得标记本轮done或可发布。
- 旧候选全Vitest6496通过；真实包42项、嵌入18项在同次完整运行中通过。历史attempt2为2675通过/2超时，主绑定1024/1026，6268冻结输入结束零差异；最新完整attempt3与本轮定向结果见下文，不能混用候选。
- 两失败分别卡在名称框fill及公式栏Enter，尚未执行各自主功能；8+20+10+20次无改动串行诊断均通过，不能证明根因或替代完整结果。repeat-each每次新worker，不能当作长寿命浏览器等价证据。
- R1双时钟诊断54例通过但未复现；R2已取得预先启动的短CPU profile（受控1217.827ms、192命名栈samples），原两输入点各一次均在实际窗口内并通过，7条收尾单测通过。两轮诊断均独审APPROVED_WITH_CONCERNS，M2关闭；原I2未知，不能称产品已修。
- 用户授权的唯一attempt3已自然exit1，08:13:03.966Z起、96.8133min：2674通过/1超时/2断言失败，0跳过/中断/重试/flaky、errors[]；原两输入超时本轮均通过但根因仍未知。三新失败（格式重开390px总超时、向左填充390px范围错误、冻结带内插入边界未变）仍阻断验收7。6275输入47875ea8…d0b90结束零差异，548旧证据SHA/mtime不变、自有进程/端口已清理。主绑定1026/1026通过不能抵消主绑定外变体/交叉失败；作者报告和独审已落，独审REJECTED/I2仍开。
- 用户新“继续”授权这三项最小定位、修复和定向验证；已核对HEAD/工作区及5191/5193无旧监听，将004现场重置pending并按新末节复派原作者。先串行确认真实命中与数据，不假定产品或测试责任；首阶段浏览器预算10min、不跑第四full/不放宽超时。产品源码修改须先给根精确证据与文件范围，原报告/失败冻结保留。未commit/push/发布。
- 三项已完成定向收敛及独审APPROVED_WITH_CONCERNS，无新增Critical/Important/Minor，正式报告见004-report.md:495及004-review.md末节：冻结确有slot-key复用行头风险，已改真实行key并先红后绿；就近Vitest15/15、后置冻结E2E3/3。格式/填充仅收敛测试交互，前置final6/6；两阶段输入不同，不能合并全量成功。原package typecheck最终日志为typecheck-final.log退出0（较早verified.log保留exact参数错误），相关lint与1026登记静态检查通过。6275项恰7输入改变、548旧证据保持；dist/tarball尚不含key修复，本阶段未build/pack/full，整体仍不通过。当前无后台验收；下一必要工作是新候选实物整合与对应包验收，再考虑同候选最终完整门禁，不自动启动另一full。
- 保留M1：Rspack内部字号与Vite不同，已记非阻断样式一致性限制。本地分批commit执行记录见末节；未push/npm发布，未应用工作区Changesets。

## 全局约束

- 主线固定：React DOM → UI Core command atom → Rust Worker/WASM → atom 结果 → React；禁止 TS 引擎、backend/bridge、第二份 workbook、通用插件生命周期。
- 值、公式、事务、实际修改位置在 Rust；UI Core 负责框架中立命令、宿主控制和通知；React 只做装配、DOM、focus 和挂载。
- React 读写使用 `@einfach/react` 的 useAtomValue/useSetAtom；不新增 React 工作簿 atom/useState/useReducer/store.getter/setter/sub/controller props。
- 必须完整读 `excel/react-excel/SKILL.md`、`excel/react-excel/skills/react-excel-feature-wave/SKILL.md` 和 `/Users/dol/.codex/skills/one-file-one-thing/SKILL.md`。普通文件≤300行；复杂单一算法≤500行；存量巨型文件不得继续扩写，按真实职责拆，不为行数造假分层。
- 旧 `.project-lines` 描述已过时的 Solid backend、旧 hooks，不能作为新代码样板；复用当前源码的 Provider、Rust runtime、command atom。
- 不改暂停的 Solid/Vue/site，不删现有 demo、合并样例、E2E 或功能登记。
- 执行者只写本任务 files 与自己的报告；不得派 agent、commit、push、发布；不覆盖其他人的改动。
- 编排者只写任务账本、审阅和调度，不写产品代码。最大同时4个执行/审查 agent。相交范围顺序派发。
- 全量验证由004统一运行。实现者只跑相关测试；审查复用未变源码的证据。最多一个完整 E2E 进程；不把长进程超时当失败重启。
- 用户可见新增/变更需真实DOM主用例及 FEATURES.md 独立ID；001/002/003不同时改该表，先列新增行到报告，由004合并登记。
- 所有变更保留中文注释，写明关键权限、事务与资源所有权；不写显然重复代码的注释。

## 覆盖矩阵

| id | 表面/状态 | 精确入口/路径 | 归属 | 验证证据 | 状态 |
|---|---|---|---|---|---|
| PKG-01 | 外部安装/公开JS与声明 | react-excel/package.json、src/index.ts、src/Spreadsheet.tsx | 001 | reports/001-report.md、001-review.md、004-report.md | passed；真实安装与声明通过，最终完整2679通过 |
| PKG-02 | 默认Worker/自定义工厂/失败/销毁 | page/WorkbookRuntimeProvider.tsx、library build | 001 | reports/001-report.md、001-review.md、004-report.md | passed；同次真实包44及完整回归通过 |
| PKG-03 | 依赖闭包/无源码alias/无消费者宏 | react-excel library config、内部cells构建 | 001 | reports/001-report.md、001-review.md、004-report.md | passed；strict peer仓外安装与最终完整通过 |
| PKG-04 | 宿主样式/滚动/尺寸/多实例 | app/app.css、workbook/**/*.css、style.css | 002 | reports/002-report.md、002-review.md、004-report.md | passed；同次嵌入18通过；M1非阻断保留 |
| PKG-05 | 中英/独立语言/无URL存储副作用 | i18n、Provider、LanguageSelect | 002 | reports/002-report.md、002-review.md、004-report.md | passed；中英/Canvas及最终同次嵌入通过 |
| PKG-06 | 类型化多区域原始值/公式读写 | UI Core host/、Rust原生接口 | 003 | reports/003-report.md、003-review.md、004-review.md | passed；native与最终真包DOM通过 |
| PKG-07 | 用户输入/粘贴/清除/填充成功事件 | rust-workbook/runtime、Rust mutation facts | 003 | reports/003-report.md、003-review.md、004-review.md | passed；最终同次真包DOM通过 |
| PKG-08 | 撤销重做/跨表剪切/公式重定位事件 | history、cross_sheet_cut、native history facts | 003 | reports/003-report.md、003-review.md、004-review.md | passed；native与最终同次真包通过 |
| PKG-09 | 失败/noop/导入刷新/旧连接隔离 | host/、runtime/rust-workbook-runtime.ts | 003 | reports/003-report.md、003-review.md、004-review.md | passed；Core与最终同次真包通过 |
| PKG-10 | 原生保护/宿主交互锁/结构策略 | host/、mutation gateway、Worker dispatch | 003 | reports/003-report.md、003-review.md、004-review.md | passed；R2与最终真包中英DOM通过 |
| PKG-11 | 包级Vite/Rspack真实浏览器 | package-consumer fixtures、Playwright | 004 | reports/004-report.md、004-review.md | passed；最终完整同JSON44/44及独审通过 |
| PKG-12 | 千行多表→UI修改→增量读取闭环 | package-consumer scenarios | 004 | reports/004-report.md、004-review.md | passed；最终同候选双打包器44项通过 |
| PKG-13 | 构建/单测/原有E2E/发布准备 | 根scripts、CI、README、changeset | 004 | reports/004-report.md、004-review.md | passed（本地）；最终2679/2679及1026主绑定、独审通过；远端CI另核 |

## 任务树与状态

| id | 完整交付结果 | 依赖 | model | status |
|---|---|---|---|---|
| 001 | 外部项目可安装并嵌入完整工作簿 | 无 | gpt-6.1-sol xhigh | done |
| 002 | 嵌入工作簿不污染宿主页面及其他实例 | 001 | gpt-6.1-sol xhigh | done |
| 003 | 插件宿主安全读写并订阅真实成功修改 | 无 | gpt-6.1-sol xhigh | done |
| 004 | 打包产物通过独立消费者验收并具备发布条件 | 001,002,003 | gpt-6.1-sol xhigh | done（本地，卡顿根因另列遗留） |

001与003可并行：React/包构建与Core/Rust分别所有；002顺序消费001入口；004独立验收风险边界。
不是按文件拆叶：001交付可安装库，002交付宿主环境隔离，003交付插件数据闭环，004验证真实发布物。

## 决策与变更

- 三项交叉回归首轮独审已APPROVED_WITH_CONCERNS：独立核对旧DOM trace、七路径最小delta、红绿15项、分期6/3浏览器及全部6275输入/548旧证据/80新索引，无新增质量发现。原始失败历史不改写，I2/总004/验收7仍REJECTED/未完成，现无后台进程；新实物尚未整合行key修复，旧包42/18与6496不能替代新候选发行证明。未commit/push/应用版本/发布。
- 定向门禁发现正式React typecheck TS4058：R2观测器返回类型引用private ProfileResult。根已读原错误及源码，仅准在原profile模块export该既有interface解决类型可命名性，采样运行逻辑不变；必须原typecheck通过，不能用declaration=false替代。新SHA/delta另记，旧18采样证据不覆盖或重跑。
- 首轮实证与裁决：484旧trace和条件hold复现确认底边自动滚动，允许仅left拖前wheel离边界，right不推广；108仅3次非被测跳转用现有Name box减少累计开销，保留所有持久化断言及setup Go链。2187旧trace显示row2 DOM被slot-key重用成row5，插入前已A5:P5；扩004仅GridHeaders.tsx真实行key与header-selection.test.tsx身份回归，不只靠测试限定frozen规避。先等当前6例自然完，再旧key红/新key绿+必要冻结原DOM定向（额外阶段≤5min），不重跑未变format/fill。新注释中文，临时诊断代码最终撤下、原证据保留；不重建/全量/提交发布。
- 三失败首轮方案获准：原4测试/辅助按各自职责只加必要观测，优先test.info.attach、无常驻runner；先原case各一次/独立JSON，后续实验由证据驱动，总浏览器预算10min、单worker/retries0/默认关闭Profiler。三假设仅待证：108累计预算，484拖动时几何/命中，2187冻结行头选择/插入边界；若有产品确证先回精确路径，根裁决后才改，不靠等待/放宽断言掩盖。
- 三失败定向首轮就绪派发：001/002/003均done，004 pending→running，原004作者单独执行新末节；根只写账本/审阅，待稳定修复后复用原独审者，不并发重复浏览器验证。
- 裁决：用户本次“继续”承接三失败定向定位建议，允许有证据的最小修复，复用004而非新拆树 — 仍属PKG-13验收缺口且主要上下文相同 — 代价是定向闭合不替代最终完整门禁；全量/重建/发布不在本阶段。先单执行者串行真实浏览器，最大10min首阶段，产品修改先回根明确所有权，不预判三例都是测试问题。
- attempt3作者正式DONE_WITH_CONCERNS后原reviewer只读独审已追加004-review.md:225，最终REJECTED/未完成、I2/验收7/PKG-13仍开。逐份6275输入、548旧证据、2677单result/retry0、原trace与18profile均独立核对；无新Critical，既有Important I2继续阻断，M1非阻断保留。失败后Playwright自动换worker/browser，不能把同一CLI96.8min误称两输入点均在同寿命浏览器。17单导航146事件落命令边界，1跨reloadCPU覆盖UNKNOWN。后续需三失败最小定向证据，不自动修改产品/第四full；本次授权执行已收尾，无后台验收。
- attempt3自然结束，原同次JSON统计5808795.876ms（96.8133min）、2674 pass/1 timedOut/2 failed、0 skipped/interrupted/retry/flaky、errors[]。原统计2067和表格2486均通过，统计8/表格10及真包42/嵌入18全部同次通过；不能称原未知根因已修。09:50:51.407Z verify6275/47875ea8…d0b90/changed[]，548旧文件SHA+mtime及旧报告前缀保持，自有112 PID退出、5191/5193无监听。主绑定门禁同JSON exit0/1026通过，但三失败是额外变体/交叉回归，验收7仍不通过；作者正在仅追加18诊断窗口与最终报告，后续原reviewer只读独审，无新运行/产品修复。
- attempt3原2067统计case于09:32:38Z附近自然通过1.5s，统计全8项通过；该例profile实际1169.782ms、stopped/cleanupConfirmed=true，无诊断关闭页，输入窗口终态统一核。仅说明本轮未复现，原根因仍未知。后续2187 freeze-cross-features.spec.ts:66在插入后期望frozen-rows=4、13次实际3，5s断言失败、Undo未到；无pageerror/crash且非观测spec，根已读audit，不推断坐标/产品根因。截至09:37:58Z2267 pass/3 fail，原完整继续。
- attempt3第484项新增断言失败：fill-handle-horizontal.spec.ts:7的390px向左填充，Name box期望C71:D71、实际14次读取D71:D75，5s断言失败；原fill/Enter及鼠标序列已完成，不是原30s输入停顿。根已读failure-484-audit，定位/测试坐标根因仍未知，不修改冻结输入。第108 trace则是末尾go(A1)前后总30s耗尽，fill约154ms、下载重开与高亮断言先通过，不能称fill卡30s。至08:50:19Z原进程579 pass/2 fail，继续自然完成。
- attempt3执行中新失败：08:34:32Z根按完整日志确认107 pass/1 fail，第108项advanced-formatting/lifecycle.spec.ts:29的390px下载/重开用例35.4s超时；不是原STAT-019/TABLE-036，也不在18例取栈范围。已交原作者只读查trace实际挂点，未知原因不归因负载/产品；遵守授权继续原session自然完成、不改输入/新增重跑。执行中不能称全绿。
- attempt3已启动：08:12:54.712Z完成独立冻结，08:13:02Z附近启动session85947／launcher14480／Playwright14482。6275项aggregate47875ea8…d0b90及5源码SHA匹配；旧证据、consumer dist/tarball存在且自有旧PID/5191/5193清理已确认。直接默认Playwright2677项、workers1/retries0，无CI/无重建；同一进程自然运行，full-attempt3-results.json、full-attempt3-e2e.log、full-attempt3-results/独立保留。此为执行中记录，不代表通过。
- 用户已明确选择“再跑一次完整序列”：授权R2独审通过后追加唯一attempt3，预计约100min，保持当前6275输入冻结、不重建、不调30s/重试。OBSERVE/PROFILE仅两spec18例启用，其余2659例无观测；主动页销毁等诊断诱发失败必须与产品故障分开。新freeze/JSON/log/output各自独立，旧证据不覆盖；结果及同JSON1026门禁最终独审后才能裁决I2，历史根因未知仍须明说。
- R2独审已落盘APPROVED_WITH_CONCERNS，M2关闭，无新Critical/Important/Minor；原I2及总004仍未过。用户授权的attempt3前置已满足，已就绪派发原004作者按新末节核对/冻结/启动唯一完整；不另造runner，不重复局部测试。
- I2 R2恢复：用户“继续”授权上一轮已明确的取栈下一步，核对旧PID/5191无存活、HEAD仍08caefbc，004重置pending，复用原作者。边界是实际≤5s受控CPU取栈及迟到start确定收尾；先验证命中已知阻塞函数，再至多两个原失败case各1次/默认关闭1次，总浏览器预算5min。无full/重复54/产品修改/构建/发布；受控成功不等于I2关闭，旧证据和输入delta独立保留。
- I2 R2就绪派发：001/002/003均done，004 pending→running，原执行者单独写取栈改动；独审复用原reviewer并在报告后审，不重复执行验证。
- I2 R2方案获准：独立CDP短采样先enable/setSamplingInterval/start ack再做命名受控阻塞，以真实profile时间戳和命中样本验收；迟到start不再被资源gate跳过stop，期限内无法确认结束则只销毁自有target并报诊断失败。新增一个profile模块和一个就近失败路径测试，原spec/生产不改。原case短窗必须报告是否覆盖真实输入挂点，不能把load栈误称输入停顿证据；首次自检失败即停。
- I2 R2采样前根审：profile/单测/fixture/observer/runner共5路径SHA已与作者核对；7条协议单测覆盖自动窗停止、迟到start唯一stop、拒绝/never start、拒绝/never stop、销毁未确认，局部types/lint/node-check/diff均0。清理只在page.close后isClosed确认才记成功，默认关闭仍不创建observer。准许唯一300s有界runner，不重跑R1或全量；输入冻结后只读监测。
- I2 R2唯一采样已自然完成：07:58:48.258Z→07:59:00.272Z，12014.434ms、exit0，runner8480/browser8481，无超预算。受控实际profile窗1217.827ms，命中命名阻塞函数192个栈samples，stop/disable/detach并恢复输入；原统计/表格case各1/1及默认关闭1/1通过，关闭无观测。根已读取原profile/status核对。原长停顿未复现、I2仍开；此能力只证明预先启动的短阻塞恢复后可取栈，任意长协议无响应仍可能在绝对期限销毁时缺profile，不能宣称全面定位。待作者补原case窗口映射/delta/清理后独审，不追加运行。
- I2 R1恢复：用户“好的按照计划 下一步”授权继续有界定位。已核对原HEAD/现有改动及原验收无存活进程，004由running重置pending后重新就绪。范围仅原两失败入口的可选测试侧时序/心跳/主线程观测，采样最多10min，区分新浏览器与同一进程，观测自检不能当bug复现；不新增功能、不改断言/30s timeout/retries、不盲目第三full、不改生产链或发包。旧冻结仅证明旧候选，本轮诊断delta须独立记账。
- I2 R1就绪派发：依赖001/002/003均done，复用原004执行agent；pending→running，本轮仅一执行者写诊断，终审待报告后复用独审者，不同时重复验证。
- I2 R1实现中根审：五份诊断文件初稿共354行，原两spec仅fixture import变化。采样前发现主动Debugger.pause超时后resume可能被单在途保护跳过的自扰风险，已交原作者删除主动暂停，改短CPU Profiler尝试；此分支未运行过，不冒充复现真实停顿。
- I2 R1有界采样已于07:28:44.669Z启动唯一runner PID96919/session5540，600s总预算，无full/build/pack。default-off原case通过且无观测文件；受控2200ms自检后原case通过，页面gap2362.3ms而Node ELD max21.66ms，已区分两侧时钟。Profiler.enable约701.8ms超时，未start/stop且无profile，保留缺失事实，不声称取得200ms栈。fresh PID97021的18项及同browser PID97264首轮18项已过，第二轮同PID/连接继续，未声称未知原I2关闭。
- I2 R1采样自然完成：07:28:44.669Z→07:30:43.771Z，119102.580ms，runner exit0、budgetExceeded=false。真实用例三组18+18+18全部通过；默认关闭1例和受控停顿自检1例另计。复用组两轮确为同PID97264/同连接，但进程寿命仅约72.8s，不能外推原98min完整运行。原挂点未复现，I2仍开；两spec逆向import还原旧SHA、其余6266项及生产/实物/tarball不变，新增5诊断文件后清单6273项4852de93…73a5b，旧冻结和失败报告未覆盖。作者收尾后独审，不追加采样或完整运行。
- I2 R1独审已完成并追加004-review.md：核对5份JSON/55份JSONL、同browser实际PID、双时钟/Profiler缺失、旧10证据SHA/mtime及报告前缀，仅诊断APPROVED_WITH_CONCERNS；004总判定仍REJECTED、I2未关闭，无新增Critical/Important。潜在非阻断Minor M2：未来若Profiler.start迟到，stop可能被单在途保护跳过，应先设计明确清理；本轮enable即超时、start从未执行，不影响当前证据，不进入本轮修复/重跑。下一定位先验证能实际开始/结束的短取栈窗口及迟到请求收尾，不继续盲目扩大用例/超时。R1全部自有进程已退出，无后台验收继续，无commit/push/publish。
- 裁决：用户“规划开干”视为允许直接实施，不等待另一轮树确认 — 已给出两阶段范围 — 代价是目录/API仍需通过独立审查。
- 裁决：首版仅声明浏览器React18 ESM；不承诺SSR、React19或CJS — 当前维护基线 — 错了只扩兼容矩阵，不污染实现。
- 裁决：同一 Store 同时只属于一个工作簿；多个工作簿必须不同Store — 现有atom身份模型 — 同Store重复挂载需文档明确，不静默共享第二个runtime。
- 裁决：任意异步公式handler、Rust properties字典、业务接口均范围外 — 原任务只做独立发布及最小宿主能力 — 后续须单独验收。
- 裁决：在本轮所有门禁通过前保留发布保护，不触发npm发布；最终public/version/changeset调整由004统一准备 — 不把private=false当发包完成。
- 裁决：Core/Rust API只增加真实宿主需要的面；不导入插件HostPort、不重做其SDK — 避免业务耦合 — 插件后续自己适配。
- 已知宿主版本阻碍：插件当前core0.2.18/react绑定0.3.21/React19；本轮仅验证core/react绑定^0.4.0与React18，禁止虚报兼容、捆绑第二份core或替插件升级。已回传插件会话；跨版本联调需另定版本对齐方案。
- 003执行中边界：批量patch首版明确原子拒绝Table内容、现有spill、合并非锚点；原有UI功能不删除。需由003报告给出准确拒绝范围和测试，再独审是否足以满足宿主接口，不能仅记录为已完成。
- 001进度（未审查）：公开组件/Provider及workerFactory已实现，就近首轮12项通过；正在完成最终构建/13项/pack检查。002仍等待001独审。
- 003进度（未审查）：Rust typed读取/事务、独立原生mutation事实和Worker门禁已落代码，正在接公开atom和旧连接隔离测试。事件拟增加connectionId，operationId含连接身份。
- 裁决：新宿主read/write/configure命令统一显式status:'ok'|'error'结果 — 实测Einfach0.4.0 setter对返回Promise调用finally且丢弃派生reject，调用方catch仍触发unhandled；不以Promise实例覆写兼容或改外部依赖掩盖 — 代价是read成功多一个ranges包裹，确切签名以003任务为准。原生已提交后的投影失败不改报写失败。
- 裁决：保留当前pending changesets，不在工作区应用版本/消费旧计划；004在临时副本按真实release plan打模拟发行tarball — publish.yml无pending changeset时主分支push会直接发布，避免未来普通commit/push误触npm — 代价是正式版本仍需Version PR与另行发布授权，报告须明确未发布。

## 验证账本

| 范围 | 命令/场景 | 源码标识 | 结果/证据 |
|---|---|---|---|
| 基线 | git status/log | 08caefbc | 干净、已同步origin/main；本轮尚无测试结果 |
| 001候选 | 定向Vitest13项、package-test tsc、build:lib、npm pack dry-run | reports/001-report.md内SHA-256 | 本域通过；12文件/2,024,800 bytes，独立审查中；真实浏览器/完整demo待004 |
| 001独审 | 27项SHA-256核对、声明引用闭包、相对Worker资产检查 | reports/001-review.md | APPROVED，无Critical/Important；未重复构建/单测，复用未变证据 |
| 003候选 | Core定向53文件421项、native11 binaries105项、Core tsc、WASM cargo check/保护2项/API签名 | reports/003-report.md内43文件SHA-256 | 本域通过，事务/权限/范围独审中；WASM实物及包消费待004 |
| 002候选 | 定向Playwright18/18、Vitest59+35、词典编译/库构建、7张截图 | reports/002-report.md及acceptance-results.json | 本域通过，CSS/语言/宿主独审中；完整包消费待004 |
| 002 R1候选 | 新缺陷3/3先失败；修复后DOM8/8及路径最终10/10、编辑单测26、3新截图、tsc/lint/build | reports/002-report.md末节指纹 | 修复复审中；未把旧WASM当003新协议证据 |
| 003 R1候选 | Core54文件431项、native20 binaries189项、tsc/WASM check/API invariant | 52文件SHA82c7277f...cac66146；reports/003-report.md末节 | 4 Important/M1修复复审中；真实WASM/包消费仍待004 |
| 002 R1独审 | 28指纹/4份JSON/3新截图、可移植路径和语义delta | reports/002-review.md末节 | APPROVED，原2 Important关闭，PKG-04/05本叶done |
| 003 R1独审 | 52指纹/16路径delta、首次post失败重试成功最小探针 | reports/003-review.md末节 | APPROVED，原4 Important/M1关闭，PKG-06至10本叶定向done |
| 003 R2根审 | 13纯格式逆向证明、5追加路径指纹/delta、12文件98项/零警告lint/Core noEmit证据 | 57文件聚合d5437f73...b72bb5c；reports/003-report.md末节 | 本叶done；唯一语义delta为3个稳定反馈key，真实包中英DOM待004 |
| 004完整尝试1 | 默认2677项、session18668；确定fixture缺配置后授权SIGINT | frozen-attempt1-inputs/verification.json，6268项6a7f...7bcb0零差异 | 27.12min，270通过/4失败/1interrupted/2402未跑；full-attempt1-results.json，不算完整验收 |
| 004完整尝试2 | 默认2677项、session2803，98.1925min自然exit1 | full-attempt2-results.json SHA8403aaa1...5bc1e7f；结束6268/3696c4...1043 changed:[] | 2675通过/2timedOut/0skip/0retry/0flaky/errors[]；同JSON主绑定1024/1026，STAT-019与TABLE-036失败；未通过 |
| 004 I2 R1诊断 | 单次119.103s有界采样；fresh18、同browser18+18，关闭/受控另2项 | input-stall-r1-{status,delta,audit}.json；6273聚合4852de93…73a5b；004-review.md末节 | 54真实及2检查各通过；诊断独审APPROVED_WITH_CONCERNS，原失败未复现/Profiler未建立窗口；I2仍开，不替代完整验收 |
| 004 I2 R2取栈 | 7条诊断协议单测；唯一12.014s受控取栈+原两case各1次+默认关闭1次 | input-stall-r2-{status,delta,audit,static}.json；6275聚合47875ea8…d0b90；004-review.md末节 | 诊断APPROVED_WITH_CONCERNS/M2关闭；受控1217.827ms/192命名栈samples，三Playwright各1/1；实际窗口含两原输入点，I2未复现/仍开 |
| 004完整尝试3 | 用户授权唯一默认2677项，session85947；96.8133min自然exit1 | full-attempt3-results.json SHA9981a949…60bcfc27；6275/47875ea8…d0b90 changed[]、548旧证据未变；004-review.md:225 | 2674pass/1timedOut/2failed、0skip/retry/flaky/errors[]；主绑定1026/1026、包42/嵌入18通过；全量仍失败、独审REJECTED/I2开，原两停顿根因未知 |

## 遗留与发现

- 当前根发布构建只处理UI Core/TS core等现有库；React库链需要接入，不允许偷偷把TS引擎带入React产物。
- 旧完整回归证据属于08caefbc，不能用于声称本轮新增能力已通过。
- 未授权提交、推送、发布；完成本轮后保持可review的工作区。
- 001已收DONE_WITH_CONCERNS并派独立审查；源码/产物指纹见reports/001-report.md。原test:package曾因测试类型增补入口失败，随后仅修测试tsconfig且tsc通过；13项运行时源码未变，复用其成功证据，不把原组合命令虚报为退出0。
- 001独审通过，状态done；002已就绪派发。Minor：打包附带旧README仍说?worker，归004正式接入文档收尾。所有局部done不代表可发布。
- 003独审进行中发现Important并已最小探针复现：候选openFile等待期间宿主改成readOnly/busy，replace仅入口门禁、最终交换未重检，仍返回true发import。待完整003-review后统一R1原作者修复，003和004不能提前关闭。
- 003独审追加Important：删表Presence/undo/redo漏报被重写的跨表公式；条件格式多区域/改scope只报主range。还有可注入presentation/映射失败导致queue拒绝的恢复风险，等完整报告明确条件后统一R1，不提前断言关闭。
- 003独审已REJECTED（4 Important/1 Minor），正式进入R1原作者修复：真实修改范围、换簿最终门禁、提交后异常与队列恢复；依据003-review.md，不改变公开契约。004保持pending。
- 002独审真实DOM已复现双实例坐标派生编辑器ID/feedback冲突，第二实例aria-describedby可能解析到第一实例英文提示；待002-review.md完整报告统一回修，不提前关闭本叶。
- R1裁决：提交后若稳定sheet身份确实无法恢复，允许明确`*.committed-unmapped`、`changes:[]`整簿失效通知并保留committed RPC诊断 — 原生已提交不能伪报回滚/捏造sheetId或静默漏通知 — 代价是该异常分支需宿主export整簿，必须文档和回归说明，正常路径仍提供准确ranges。
- 002独审已REJECTED（2 Important），正式进入R1原作者修复：编辑器/反馈实例唯一身份与父容器resize浮层重新定位；PKG-05独审通过，PKG-04等待修复和持久DOM回归。
- 002/003 R1均已独审APPROVED，所有原Important关闭。依赖就绪，004立即运行真实WASM/pack/仓外消费者与全仓验收；此记录取代上述等待状态，不能把局部done当最终可发布。
- 004整合裁决：React ESM-only移除冗余`module`字段，保留`type:module`、`main`和`exports.import`，根构建显式`build:lib` — 旧Rollup以main+module+src/index启用多格式构建，会错误纳入React并清理dist — 代价是只承诺现代exports/ESM消费者，不加旧bundler兼容层或复制旧构建扫描；最终root build及Vite/Rspack必须证明产物未被覆盖。
- 004门禁裁决：允许精确WorkerLike类型引用及唯一发行Worker装配入口，扩files至presentation checker与就近测试 — 旧规则依赖已删除的Provider直接加载布局，误拒合法类型/Worker leaf — 代价是需正反回归证明Runtime RPC/任意视图导入仍被拒，禁止整目录豁免/关闭门禁，不修改已审产品来迁就旧路径。
- 004根lint发现003的13文件17项max-len，回原作者R2仅换行。已记录修前token hash，语义独审仍有效；004继续无相交消费者/门禁工作，最终冻结前003须重新done并刷新Core打包输入。原生default与lite/full WASM、仓外strict-peer/tsc/两构建作者已报通过，待004正式报告，不提前标全过。
- R2验证方法修正：根审naive TS scanner缺模板上下文，13项中5项会因纯换行伪变，不能用于验收。保留此失败方法记录，改用原文件SHA核验内存还原+parser-aware token/AST比较；不为迎合错误hash改产品，也不因此重跑语义未变的整套测试。
- 004完整Vitest首次6446/6463，明确两项Core旧测试由003在R2单独修：initial-tables fake漏回host.configure，package-boundary误拒纯类型WasmWorkbook。其余14超时/1草稿坐标差异由004无重负载定向复现后再定性，不先认作负载也不放宽超时掩盖。包targeted首次22/42，其余多为新fixture定位/导入sheetId需修正，真实Worker已能启动；最终结果待报告。
- 003 R2格式部分根审APPROVED：独立只读复核13/13修前SHA、parser-aware tokens和17个安全换行片段，定向lint通过。生产源已收敛，52文件聚合01bd341f...d9db9b；只待两项旧Core测试修正后重新done。未为格式重新跑功能套件。
- 004实物发现PKG-10反馈缺陷回003 R2：readOnly拒写确实生效，但共用editing反馈把HOST_READ_ONLY吞成通用错误，中英UI均不明确。最小修Core共用反馈，复用React已有HOST_*词典，保持unknown/detail/提交未知语义；最终必须重pack并中英DOM验证，不能调低断言。前条“生产源已收敛”已撤销至该修复完成。
- R2依赖裁决：source-runtime边界正反例测试使用TypeScript parser，必须在Core devDependencies显式声明typescript（沿用根^5.7.2与当前5.8.3解析），由拥有metadata/lock的004落地；003只改测试。禁止eslint-disable或退回脆弱regex绕开依赖声明；不新增运行时依赖或升级编译器。
- 003 R2编辑反馈候选已落地：仅保留3个已知HOST_*稳定词典key，unknown及outcome-unknown语义不变；作者相关12文件98项通过。根已检查最小delta及初始化顺序、边界AST正反例，最终定向lint/报告待metadata，包实物中英cell与formula-bar反馈仍归004验证。
- 003 R2收尾根审通过，本叶重新done：最终source-runtime 26项（含原扫描）、feedback 14项，净增33；12文件98项、Core noEmit、5路径零警告lint通过，根核对5个新指纹与完整delta。最终57文件聚合d5437f73...b72bb5c，唯一新增生产语义为反馈映射，不改权限/事务；004已重pack，最终DOM结果未到，不提前宣称通过。
- 004作者已报最终定向包R4 42/42及全Vitest473文件6496/6496自然通过；初轮失败保留。最后repack/types/artifact之后冻结单次完整E2E。已复用001独立reviewer作004只读最终审查，可先检查metadata/fixtures/门禁/文档，最终判定等同一完整JSON自然退出与结束指纹，状态仍running。
- 004最终完整E2E已于2026-10-22T04:40:37.853Z启动，唯一session18668/launcher PID33569。冻结6268输入聚合6a7f3f207281b639dd61aba29402f21b1c588315b0f2dde2f60b40a707b7bcb0（frozen-inputs.json）；覆盖Rust源码/Cargo锁、React/Core实际产物、lite/full WASM、tarball及仓外生产页面。直接exec默认playwright配置（两server），无CI、retries0，避免e2e脚本再次prepare改输入。日志full-e2e.log、同次full-results.json均在.codex-artifacts/react-excel-package-004；只许监测/只读审查与报告，不改冻结输入，不把尚未退出视为通过。
- 004只读性能对比：前版007完整2617项90.789min，同前8项旧134.295s、本轮约126s，初段未见新性能回退，不能据此宣称整轮性能结论。新增CI browser timeout90预算不足（还未含构建）。裁决自然完成后先原冻结verify零差异，再单独改CI一行90→180并静态检查，登记前后hash/post-run delta，不重跑无关语义、不冒认最终全字节等于原freeze或远端CI已跑；执行中仍不改该yaml。
- 完整首轮223/224发现确定fixture遗漏：comments/localization等待中文名称框，而plain-sales-orders侧栏zh/workbooken，两个旧fixture未显式注入demoPresentation。裁决停止此已知失败输入的继续验收，由004保存主动终止部分JSON与原freezeverify后再解除冻结；这不是因工具timeout重启，feature-wave允许失败后定向修复再下一次完整且最多一个active。回002 R2仅迁移两个fixture，库默认en/dom保持；修前失败证据保留，相关中文/Canvas/跨表定向通过后才能重新冻结。此前完整运行不算自然完成/通过。
- 首轮已于SIGINT后退出：session18668 exit1（子进程130），端口5191/5193无监听；27.12min，270通过/4失败/1interrupted/2402未跑，零flaky。证据另存full-attempt1-results.json/full-attempt1-e2e.log、frozen-attempt1-inputs/verification.json，原6268输入6a7f...7bcb0 changed:[]。根已显式解除冻结，002仅修2fixture并定向，004仅改CI预算；下一次新冻结同时覆盖这些已知delta，取消成功full后才改CI的旧时序，不重跑不变Rust/6496单测/build。
- 修后新冻结预核对恰3输入改变（两fixture显式demoPresentation、CI预算90→180），其余6265输入含所有React/Core/WASM/consumer dist和tarball不变。CI逐行/YAML/门禁保留静态检查通过；002相关12项已报通过、Canvas smoke及最终本域报告待到，尚未开始下一完整。
- 002 R2报告已完整到达，本叶重新done：12项原中文/跨表DOM全部通过，2个中文Canvas实际绘制/编辑/撤销smoke通过，本域lint/type零诊断，浏览器及端口已清理。根已审最小2 import+2 spread，004独审者已核对逆向还原原hash与12项JSON；CI I1已关闭。新冻结6268项3696c4d353bcd6197313b3ac7f692ee296ec13ab6800957c239a3760377e1043，恰3delta，其余产物不变；依赖再次就绪，004可立即启唯一下一完整。
- attempt2已于2026-10-22T05:12:32Z附近启动，唯一session2803/launcher38311/Playwright38312，默认2677项workers1/retries0、无CI；full-attempt2-results.json / full-attempt2-e2e.log / full-attempt2-results目录，原attempt1不动。新冻结3696c4...1043覆盖全部6268输入及CI180预算，未build/pack。当前只监测/只读审查/文档收尾，最终以此同次自然结果+feature门禁+结束hash裁决，不拼接前轮。
- attempt2已自然经过原四个中文失败点：223/224 comments、272/273 custom-formulas均通过（约1.3–1.6s），当前已执行299项无失败。fixture修复在完整路径得到确认，但剩余未跑/未退出，不提前作全量成功结论。
- attempt2后续已同次通过notes中文两宽、package-embedding18/18与package-host42/42，约75min时前2003项零失败。002迁移与PKG真实包闭环已有同次执行证据，仍有原有选区/工作簿回归未完成；独审继续核对本次新Vite/Rspack截图，最终等待完整2677自然退出、1026同JSON门禁及结束冻结验证。
- 终审M1裁决：根与独审均实际查看attempt2的Vite/Rspack包截图，Rspack内部工具栏/语言控件字号偏大，静态推断与CSS reset的前缀选择器优先级有关；无入口缺失、文案裁断或功能阻断证据，列为非阻断样式一致性Minor — 按task-tree规则不进入本轮修复循环，不改冻结输入或中断唯一完整进程 — 代价是首版不宣称两个打包器像素一致，发行文档与最终报告必须明确此限制。
- 004执行agent发生模型容量错误时，原Playwright PID38312仍自然运行（约80min、前2147项通过/零失败）；已复用原agent续接监测，不重启、不增开测试、不重建。最终仍以原attempt2完整JSON和结束冻结证明裁决。
- 更正执行中统计：上述“2147项通过/零失败”来自只看日志tail，不能代表全日志。004接续后发现第2067项`selection/statistics-actions.spec.ts:93`实际35.2s超时，卡在用例首个`select('A93')`的名称框fill，尚未触发Cut/统计复制；根已明确向用户更正。当前不归因为负载或降低断言，004只读审查trace、保留38312自然运行，待本次完整终态后再处理；attempt2已有失败，不得提前宣称全绿或把定向重跑拼进完整JSON。
- attempt2第2486项`workbook/table-dialog.spec.ts`的1280宽Open Tables用例亦35.2s超时，卡前置公式栏`press('Enter')`、尚未打开表格弹窗；静态trace无disabled/readonly/pageerror/crash但后续动作无响应，根因未定。裁决原38312自然跑完，先结束freezeverify和同JSON门禁，再无改动串行运行统计/表格两整文件及各失败原case20次，分别保留JSON，不重建、不调超时、不并行浏览器、不启动盲目第三次full。任何定向通过都不能改写本次完整失败事实。
- attempt2已于2026-10-22T06:50:44.268Z自然exit1，98.1925min，完整执行2677项：2675 pass/2 timedOut/0 skipped/0 retry/0 flaky/report errors[]。06:51:09.711Z结束verify仍6268、3696c4...1043、changed:[]，根已读原JSON与verify确认；同JSON门禁exit1，仅STAT-019/TABLE-036缺成功证据。允许004在不改输入的前提下开始已授权四组串行诊断，输出各自独立，不开启第三次full、不拼接2677全绿；004保持running、不可声称发布验收完成。
- 004终审最终REJECTED/未完成：验收1–6、8通过，验收7/PKG-13未过，Important I2保留；独审逐个重hash6268内容零差异，解析原2677单次result/retry0及1024/1026门禁，核对四组58/58诊断和最终audit。诊断后再次零差异、所有suite/server退出；repeat-each各新worker，不代表长寿命浏览器复现。根按未知根因交接，不以猜测改产品或无依据重复98min全套；001/002/003保留done，004交付未完成（running、不等于后台仍跑）。M1明确非阻断已知限制，无发布授权或外部写入。

## 用户授权分批本地提交（2026-10-22）

用户最新“分批commit”覆盖此前各实施/诊断阶段的未commit边界，仅允许本地Git提交；不扩大为push、版本应用、打包、完整E2E或发布。按职责拆分现有改动，没有修改生产源码或测试来迁就提交检查：

| 批次 | 提交 | 范围 |
| --- | --- | --- |
| 1 | b34478bc | Core/Rust typed宿主接口、修改事实/通知及就近测试；锁文件仅Core importer同步 |
| 2 | 7f8b83cc | React公开组件、Worker、实例展现隔离、样式、构建与依赖/锁文件 |
| 3 | 988a24da | 仓外Vite/Rspack消费者、包与嵌入E2E、28项登记及CI |
| 4 | 71c57d3c | 有界输入停顿诊断、收尾单测、格式/填充测试交互收敛 |
| 5 | 256a9295 | 真实行key、DOM身份回归、冻结交叉E2E和既有功能说明 |
| 6 | 本节随文档提交 | Changeset、FEATURE_PROGRESS最新状态、任务与独审记录 |

全部使用正常提交钩子，未使用no-verify/HUSKY跳过。首批6504/6504通过；第二批首试6503通过/1例5000ms超时（paste-special-panel的width-only取消用例），未据此猜测根因；同源定向整文件6/6、原提交钩子重试6504/6504通过。第三批6504/6504、第四批156/156、第五批149/149通过；对应文档/展现层边界/lint/主线类型检查均通过，首批另有WASM签名快照通过。超时历史不改写为一次全绿，不改变测试预算或配置。

第六批仅同步进度与提交授权。作者与独审原始报告保持字节不变；FEATURE_PROGRESS由旧attempt2检查点同步为最新attempt3及定向修复状态，因此此前七路径delta/8b32cfb3聚合只属于当时的定向候选，不再宣称当前全部输入仍等于它。生产源码/测试在本次提交过程中未改；未运行新build/pack或完整Playwright，忽略目录内失败trace/profile/产物不提交。总004/I2/验收7仍未完成，提交不代表可发布。
