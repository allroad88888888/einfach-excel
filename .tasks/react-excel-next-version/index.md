# React Excel 下一版：六项进阶能力

日期2026-10-21。用户明确授权按上一版方式实施、多agent、各功能独立目录，不是只交计划。基线b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb，main与origin/main一致、工作区干净；旧2474 E2E/955绑定及6264 Vitest仅基线，不当新增通过。

## 本版范围

1. 手动非连续多选：Ctrl/Command点击/拖拽追加区域，复用已有多区操作。
2. 跨表剪切：两端及依赖引用原子移动，一次Undo/Redo。
3. 参数填写表单：原生元数据驱动必填/可选/重复组，生成原公式编辑草稿。
4. 高级筛选：组内AND、组间OR；按搜索结果跨页全选。
5. 高级格式：通配符文字规则；按基础显示文本比较重复/唯一。
6. 真实异步公式：接现有Rust异步队列，以同源JSON扩展验证实际HTTP、成功/失败/重算/迟到结果和依赖传播。

## 全局约束

- root只编排/审阅/写本.tasks，不写产品。所有执行/独立审查均gpt-6.1-sol/xhigh、fork_turns=none，最多4位同时运行，子agent不得再派agent。
- 开工完整读excel/react-excel/SKILL.md、skills/react-excel-feature-wave/SKILL.md及/Users/dol/.codex/skills/one-file-one-thing/SKILL.md；UI另读/Users/dol/.codex/skills/frontend-design-codex/SKILL.md。learn-project继续暂停。
- 固定React DOM→UI Core command atom→Rust Worker/WASM→返回投影→React。Rust持有数据/公式/语义/事务/持久化；Core只UI草稿与命令状态；React只DOM/焦点/指针/滚动。仅@einfach/react useAtomValue/useSetAtom，不在React建atom/useState/useReducer/store getter/setter/sub/复杂controller props。不加backend/bridge/adapter/eventbus/通用生命周期/未来兼容层。
- 每功能按实际代码层使用独立功能目录，不只搬文件夹或造空包装，不复制运行层。普通源/测试≤300行，强内聚单算法≤500须解释；既有超大文件只必要接线。新增规则/边界有注释。样式仍cellStyle/rowStyle/columnStyle；高度只row、宽度只column，cell无尺寸，不引入时间戳或范围样式系统。
- 各owner只写自身files；共享barrel、Worker runtime/commands/WASM声明、Rust module/共用history/persistence注册、全局UI、Lingui PO/feedback、FEATURES及seed仅007写。先在报告发布准确接口/注册请求并发root转007，不能抢写。额外范围须root先授权。
- 普通owner只读自己任务/index及必要源码，写自身reports。007可额外读全部领域报告，独立reviewer可读全部任务报告但只写007-review报告。root管理任务/index状态。
- 原Sales Orders 66组合并、128列、Summary及旧种子保留，普通订单测试用e2e/fixtures/plain-sales-orders。新seed由007写page专属目录，不放主组件。使用现有Lingui，领域仅报告新消息，007统一extract/strict compile，禁止并发覆盖PO。
- 新具体用户操作每项稳定ID、独立主E2E文件/完整标题，保旧955绑定与行为，不以综合case替代、不skip/fixme/retry消红。Core/React单测不代替真实DOM/Worker/WASM。旧预期迁移必须先向root给真实失败/根因/最小差异。
- 领域仅必要专项Vitest/Rust；Cargo先向007预约窗口，避免争锁。浏览器、全仓门禁、WASM重建/API签名只由007执行。签名变更跑现有wasm_public_api_signatures_unchanged并审精确snapshot，不盲更新。
- 开发按影响集测；最终一个完整E2E过程，冻结source/test/WASM/config到自然结束，不因工具超时重启，不边跑边改，不拼接分段冒充完整通过。独立审查复用稳定证据，实际中英1280/390截图要逐张看；无.shared视觉工具不能谎称使用。
- 持久原始证据根 /Volumes/work/self/excel/.codex-artifacts/react-excel-next-version.11oYiO/，已gitignore，不依赖/tmp。记录版本/指纹/命令/真实结果。新增未跟踪文件也查空白；TSV空尾字段是数据，不裁Tab。产品/测试不为纯文档重跑。
- 不自动commit/push/发布、不改安全设置、不接付费/认证服务，不eval/执行文件脚本，不做自动保存、协作/版本/身份、Solid/Vue/介绍站。保存用户新改动，不reset/checkout/覆盖冲突。

## 覆盖矩阵

六域、集成交叉和原功能已由同一个最终完整过程闭环，不拼接诊断轮。以下DOM结果均来自证据根007-e2e-final.json，998主绑定由007-e2e-features-final.log逐项核验；独立代码/实际图审复用两份007-review报告，root已独立读取完整JSON及基线绑定。取消/错误/恢复、保护、历史/文件按适用边界验证；纯选区会话不伪称持久化。

| id | 表面/状态 | 精确入口/路径 | owner | 验证证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| M-01 | 修饰键点击/拖拽追加、重叠与退出 | workbook/selection/use-grid-pointer-selection；Core selection/multi-range/ | 001 | MRSEL-001..005；最终30/30含两宽overlap/Escape，独立风险R2关闭 | done |
| M-02 | 多区操作、编辑/合并/冻结/滚动 | 同上及现有selection/grid入口 | 001 | MRSEL-006..008及旧选区/填充在最终JSON全绿；Core109/React11及中英四图独审 | done |
| C-01 | 跨表cut/paste、引用、一条历史 | Core clipboard/cross-sheet-cut/；Rust cross_sheet_cut/ | 002 | XSCUT-001/002；最终13/13全域绿，原生44/Core86，独立风险R1关闭 | done |
| C-02 | 两端/依赖权限、验证/失败原子性 | 同上及原剪贴板状态DOM | 002 | XSCUT-003..008及named-range恢复在最终JSON绿；四图独审 | done |
| A-01 | 必填/可选/重复组/固定尾参 | workbook/formula-arguments/；Core formula-arguments/ | 003 | FARG-001..006/009/010；最终19/19全域绿，502元数据真实展开 | done |
| A-02 | 取消/错误/目标身份/原提交/双语两宽 | 同上及InsertFunctionTools | 003 | FARG-007/008/011/012及文件往返在最终JSON绿；Core17/React5及八图独审 | done |
| F-01 | AND/OR与搜索跨页全选 | workbook/advanced-filter/；Core advanced-filter/；Rust advanced_filter/ | 004 | AFILT-001..008；最终24/24全域绿，原生67/Core67/React15 | done |
| F-02 | 普通/Table/重应用/文件/保护 | 同上与原filter scope | 004 | 最终Table groups真实下载/清除/重开与另一Table隔离绿；八图独审，UI-DATA-01关闭 | done |
| S-01 | 通配符转义、显示文本比较 | workbook/advanced-formatting/；Core advanced-formatting/；Rust advanced_formatting/ | 005 | AFMT-001..005；最终22/22全域绿，原生32/Core6/React3 | done |
| S-02 | 基础格式失效/优先级/文件/两宽 | 同上与原条件格式面板 | 005 | 最终两宽lifecycle/原值/邻格/结构/Undo均绿；八图实际独审 | done |
| Q-01 | 真HTTP、BUSY/结果/错误/依赖 | 原formula bar；Core async-formulas/、rust-workbook/async-formulas/及Rust现有队列 | 006 | AFORM-001；最终28/28含lite/full wire，Core53/原生10，独立风险R2关闭 | done |
| Q-02 | 去重/重算/迟到/切换工作簿/恢复 | 同上及原Recalculate/file runtime入口 | 006 | AFORM-002及lifecycle/topology在最终JSON绿；BUSY/settled中英两宽八图独审 | done |
| X-01 | 六项入口及原955/原demo不退化 | 007 files | 007 | 最终2617/2617，143新增含7交叉全绿；998/998主绑定有实际结果，原955及旧E2E源码不变 | done |
| X-02 | 整体构建/原生/WASM/图审/覆盖 | React+Core+Rust | 007 | Vitest6425、原生双配置/core64/WASM205/Chrome7、types/build/lint/cycles/scripts/API/Lingui/docs通过；图审及4236输入审计关闭 | done |

## 状态表

| id | 可观察交付结果 | model | status | created | done |
| --- | --- | --- | --- | --- | --- |
| 001 | 手动建立并操作非连续选区 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |
| 002 | 跨表剪切数据及引用原子移动 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |
| 003 | 参数表单生成并保存原生公式 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |
| 004 | 高级筛选组合及全选搜索结果 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |
| 005 | 通配符及显示文本条件格式 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |
| 006 | 真I/O异步结算及原生依赖传播 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |
| 007 | 六项合流统一整体验收 | gpt-6.1-sol/xhigh | done | 2026-10-21 | 2026-10-21 |

## 决策与变更

- 用户授权实施，直接开工。按六个可独立验收功能分工，不把操作或技术层拆成叶子；007唯一共享接线者。首批001/002/006/007，003/004/005就绪且名额释放即补位；不是只做首批。
- “更多高级能力”本版具体落为AND/OR与搜索全选、通配符与显示文本比较，不承诺条件区域复制到区域、完整地区比较或全部Office能力。
- 参数表单复用原编辑草稿/Enter链；不另造实时结果预览工作簿，本版不承诺模态内网格拾取引用，地址可直接输入。
- 异步使用可信同源JSON扩展与现有native队列，不接未知付费/身份服务；扩展必须明确非Office内置，不执行文件内脚本。需必要通知/身份时先发布短方案给root审最小性。
- 事务/权限/异步及最终覆盖须独立review，root不亲改产品；修复按实际发现回owner、最多三轮，不因Minor无限反复。
- 裁决：001相同矩形追加激活已有区、不同部分重叠保留并复用union统计，Shift优先旧锚点扩展；避免悄悄切换取消原选择，代价是Ctrl+点同格不是toggle取消。
- 裁决：006原生队列加唯一挂起formula.awaitAsync RPC通过，不加轮询/eventbus；必须保留settlement latch防丢唤醒、结算推进现有revision、换实例终结旧I/O。Sheet重算不应无条件重置无关表失败memo，准确scope方案仍待006。
- 007追加两份最小共享接线：Core keyboard/index.ts的Escape取消pointer分支；Rust workbook_calculation.rs调用006重试API及对应注释，非整文件重构。
- 裁决：格式刷状态原样提取state.ts由007接线，index维持公开导出；新增pointer读取armed模式会与既有格式刷结束pointer形成实际循环，提取状态可消环且不新增atom事实。
- 006 sheet重试方案通过：所选公式inner与失败memo的既有Store反向依赖求交；只有实际相关失败重置为BUSY并沿原队列rearm，成功/inflight保持。跨表共享同key消费者随同恢复是缓存固有语义，无关表失败不重试，不新增owner索引/依赖图。
- 裁决：Escape取消选区拖动的自动滚动在grid/viewport调用方停止，通用use-grid-drag-autoscroll保持无选区耦合；FillHandle同样复用该hook，直接限制drag-selection会破坏填充。navigation非composing Escape可以结束pointer，即使当前仅一区；编辑/引用先按原入口处理。
- 007旧runtime mock迁移授权：原生preview专项4例初始化红证已审，新增真实Worker origin/async API前置条件导致旧stub缺接口。仅补直接安装runtime的既有测试前置stub，不改生产fallback、不放宽断言；准确路径追加007，实际修改/绿证由007列报告。
- 007新增跨表剪切3表fixture入口获准，纯工作簿seed仍在page功能目录，不改原Sales/合并demo或创建测试直写旁路。006补实际待处理IO总预算与异步异常收尾，防公式数量造成无界队列或永不结束的BUSY。
- 裁决：FETCHJSON成功结算使用现有resolveAsyncCustomCall的明确{json: JSON标量/矩形标量数组} envelope，WASM专用literal转换保留'#N/A'/'#BUSY!'等字符串，不改原string/array错误token契约、不新增export。已有{error}优先/无歧义，需真实WASM ISTEXT/ISERROR证据；这是当前数据保真所需wire，不建通用协议层。
- 004分组契约通过：两层AND/OR，8组/每组8/总32条件，旧rules与新groups互斥而非双事实；allMatches复用原export并明确50k predicate cells/1000独立值/1MiB预算，超额整次拒绝。007按实际8个DTO/Table/history/wire共享文件接线，不动未证实相关文件。
- 005核对原生style为Sheet普通map、当前无format atom；采用每条相关规则每个显示快照一次的稀疏format-input同步，derived统计复用value依赖，不迁移全部样式存储、不新增style镜像/时间戳规则。代价为每次投影规则内稀疏双扫描，禁止移入逐cell循环，新增输入atom与既有统计一起释放；此具体成本在交付列明。
- 005新增主绑定采用AFMT-001..005并同步尚未运行的新case标题；沿用既有registry格式，不为新前缀扩全局脚本。旧955绑定及旧标题不变。

## 验证账本

- 基线干净，当前没有新增功能passed声明。证据根已建；保留失败现场，后续由root据真实报告更新。
- 首组已实际派发：001=/root/next_multi_range；002=/root/next_cross_sheet_cut；006=/root/next_async_formulas；007=/root/next_integration。均为gpt-6.1-sol/xhigh、独立上下文；其余三域待执行名额释放接续。
- 001交付进入review（非done）：Core8文件109项、React2文件11项专项通过，30个真实鼠标E2E/图审/独立审查尚待007统一；复用其原始JSON，不重复专项。003随首个释放名额开工。
- 003已实际派发/root/next_formula_arguments，gpt-6.1-sol/xhigh。001执行agent已结束，仍待统一验收与独立审查；007继续占共享接线名额。
- 002交付进入review：新增原生22项及86相邻回归、Core85/React19专项通过，XSCUT-001..008准备完成但真实浏览器/图审待007。004随第二个释放名额开工；不累计重叠的专项次数为最终全仓结果。
- 004已实际派发/root/next_advanced_filter，gpt-6.1-sol/xhigh；005仍就绪待名额。当前四位执行为003/004/006/007。
- 006交付进入review：Core48、原生async10+既有重算6专项通过；28个真实WASM/HTTP及wire浏览器case已交007，未跑不签绿。005随第三个释放名额开工，至此六域均已实际启动。
- 005已实际派发/root/next_advanced_formatting，gpt-6.1-sol/xhigh；004曾遇模型capacity中断，已同agent续跑保留现场（非产品失败，不重复实现），当前003/004/005/007执行。
- 003交付进入review：Core17/React5专项通过，当前full artifact502真实签名展开覆盖；FARG-001..012及19真实E2E/8截图待007统一，不把表单静态展开冒充全部函数计算通过。其槽位释放后安排001/002/006独立风险审查。
- 001/002/006独立风险审查由next_review_risk（6.1-sol/xhigh）执行，实际发现异步早退未关闭HTTP响应与跨表剪切命名range静默错算；已暂停WASM build，按最小边界回原owner第1轮修复，不当成passed。
- 005进入review：原生新增12+旧20、Core6/React3通过；准确22真实E2E及8图待007（早期24误报不采信）。槽位用于002命名range原子拒绝修复。
- 007 React tsc实际红证已审：授权四个精确新测试文件删除无效getByRole exact选项或收窄cell literal，不动行为断言；自身fixture以satisfies准确收窄，不加any/fallback。原始红证保留，最终统一类型门禁验。
- 风险首轮报告007-review-risk.md已交（2 Important、0 Critical）；006 HTTP泄漏用真实本地流式HTTP证实，非仅mock推断，probe脚本/原始输出持久。006按第1轮修复入口续跑；审查未替代真实WASM/E2E验收。
- 004进入review：Core53/React15/原生67专项通过，24真实DOM案例及8图待007；其释放槽位安排003/004/005独立界面与数据规则审查。六域主体均已交付，但002/006审查修复及整体验收尚未完成。
- 002/006第1轮修复已交：002真实静默错算红→guard，Rust44/Core86绿；006真实流泄漏红→单一finally abort，Core53绿且原HTTP probe活动响应0。回原风险reviewer按精确delta关闭，不重复其它稳定专项。
- UI/数据review抓到004兼容性Important：新1MiB选择预算错误收紧旧flat list持久化/投影契约，root已对照旧代码核实；回004仅TS边界修复并补红绿，新搜索/选择预算保持。此项不改变Rust/WASM，可与统一native build并行。
- 原风险reviewer第1轮精确补审已关闭002/006两Important，未发现新增阻塞；真实DOM/WASM/截图仍待007。统一lite/full build已放行并记录native输入指纹；004兼容修复不修改该输入。
- lite/full统一build及React tsc已过；首个真实影响集177项自然max5结束，20pass/5fail/152未执行。保留完整红证，不当成全量结果。004新测试误算既有00123种子、其中窄屏还需核异步等待；005新测试误把范围末活动格当首格。回各owner最小前置/准确数据断言纠正，不改旧seed/GoTo语义、不放宽或删除验证。
- r2诊断已排除004/005目录，root批准两owner仅修改未纳r2、亦不被其import的clear-search.spec.ts/select-search.spec.ts/display-duplicates.spec.ts三个新spec；所有src/共享helpers/config/WASM和r2输入冻结。此为影响集精确隔离，不适用于最终完整E2E（最终仍全source/test/config/WASM冻结）。
- 004/005新测试纠正完成并冻结；004旧flat list兼容Important已由独立UI/data reviewer关闭，连同002/006风险两Important共三项均有真实红绿证据，不代表整版已绿。
- r2自然max8结束：80pass/8fail/43未跑，002全部13条实际通过、006其中24条实际通过。001真实DOM Escape未进入键盘白名单（Core单测不能代替DOM）；007在原共享授权范围只加Escape一行，r3验证。003 XLOOKUP字面数组违反已公开原生限制，回003只改新case为真实引用；006四处新测试需对齐空registry省略、公式规范化与窗口overscan事实，回006只改两新spec，行为断言保留。
- r3影响集117项已启动（004/005修正、001整域、自有交叉及旧滚动），仅003 native-calls与006 lifecycle/topology三份未纳r3、亦不被其import的新spec获准纠正；其余source/helpers/config/WASM及r3输入冻结。最终全量仍严格整体冻结、单一进程自然结束，不拼接诊断结果。
- 003仅三行XLOOKUP新case前置改既有Summary引用，严格空位/20/一条历史不变，已冻结指纹6cf4f4a1…；root与owner均核原生公开限制，未改产品/native。004全部24真实case在r3当前段通过（整轮仍运行不签整体），003005真实中英两宽16图交原UI/data reviewer实际补审。005新lifecycle插行红已定位既有满画布1048576行拒绝，待r3自然结束后修新测试真实DOM前置，未改原生限制或预期。
- 完整静态gate已实际运行：presentation/docs通过，cycles发现keyboard→pointer命令→formula-reference循环，lint报37项（原始007-cycles.log/007-lint-check.log）。root读源码批准r3自然结束后007仅用既有cancelPointer/resetAppend断环、精确纯格式收尾；006 IO闭包提取回owner保既有53项/真实HTTP收尾语义，不免规则或新增包装层。最终全量前关闭，不把静态红忽略。
- 007明确r3 PTY12236自然退出exit1：117项113pass/4fail/0skip/0flaky，全部00424及001 Escape、007七交叉、旧selection/fill回归已绿；四红为005插行容量前置两宽、001 overlap两宽。001/005按原叶定位/精确修，007共享断环/纯lint获准解冻；未将此诊断当最终全量。独立UI reviewer实际查看003005共16图，无新增阻断视觉问题，并核真实Table groups下载→清除→重开及另一Table独立保持case实际通过，原F-02该证据缺口补足。
- 005仅新lifecycle case新增真实末空行删除/尺寸观察与插入后原值、Undo范围加强断言，101行冻结adf06762…，未改src/support/seed；回review等007真实绿。001 trace已实证1280边缘滚动使首区A93:B97，390目标x453超视口致合法横滚；数字聚合3与几何11并不矛盾，回001局部新case可见安全点/稳定前置，不改产品/预期。UI reviewer16图+四测试delta补审完成无新增发现，006随释放槽启动IO lint最小结构收尾。
- 原生完整default自然exit0：282 result sections合计3711pass/0fail/10既有ignored，007-native-default-full.log无截断；lite完整串行继续。共享keyboard取消链断环已冻结7155e050…、cycles829/2444绿、Core55绿；006 IO五文件最小闭包/格式53专项及scopedlint绿待报告；mainline types与脚本17绿，非最终全量E2E声明。001新spec冻结待独立精确delta+代表性16图补审，007收尾build后跑必要r4。
- 风险reviewer精确delta+16图已完成，无新阻断；IO abort顺序/keyboard优先级/001稳定前置已核，原两Important保持关闭。完整root build及lint自然exit0、162新增文件≤300行无尾空白。r4自然90项87pass/3fail（005宽屏30s总timeout）/0skip/0flaky；001 overlap、003空位、006全部28和旧选区填充真绿，但未当全轮绿。
- 完整Vitest真实红464文件6425项=6363pass62fail：54纯超时，5明确新pending RPC stub或cwd路径问题，3React非timeout待无争用诊断。root读原始JSON和四文件，授权007仅三个旧Core stub/准确额外await请求及003一条路径迁移，业务断言不放宽。10核16GiB默认rustc10路与Vitest/浏览器并跑造成资源争用，本轮调度失当如实保红证；待lite自然退出后重门禁串行，CLI限worker不改timeout/config，所有失败仍须实际绿过程关闭。
- 无争用无改动React精确诊断4文件9项全绿（含page-key及原3非timeout），无需改产品/旧断言；lite完整3671pass/0fail/10既有ignored自然exit0。005三条原超时用例未修改、串行r5自然3/3绿（22.0/25.8/23.7s），保原红。四测试迁移影响集31项30pass1fail，仅003字面new URL被Vite改写http asset路径；允许node:url URL别名构造同一文件相对URL避静态改写，502签名断言保持，不扩大产品改动。
- 四测试迁移最终31/31通过；完整Vitest单worker/no-file-parallelism、无Cargo/build/浏览器并行，PTY47599自然exit0，464/464文件6425/6425项通过（201.12s），007-vitest-final.json。原62红及scheme红保留，未改超时/配置/断言。007继续串行补primitive core/WASM native/Chrome harness，随后最终单一完整E2E，稳定生产不重build；全部矩阵仍await-final直到该过程和998结果校验完成。
- primitive core64/64、WASM native205/205（1既有ignored）、真实Chrome harness7/7均自然exit0。最终完整E2E单一PTY68998已启动：2617项/362文件，workers1/retries0/forbidOnly，无maxfail、无并行重门禁；4236输入aggregate 4a3f88e5bc34e6571e78de98e1b2fd2035ea626b66383c9c5b8f4691835ba402、预核0 mismatch，source/test/config/WASM全冻结。955原绑定精确静态保留、998登记，实际结果与完整JSON尚待自然结束；矩阵未提前done。

## 最终签收（2026-10-21）

- 唯一最终PTY68998自然exit0，完整2617/2617（362文件），90分47.357秒；无失败、跳过、flaky、重试或报告错误。每项expectedStatus=passed、恰一次passed/retry0，workers1/forbidOnly=true/maxFailures0。root独立读取原始007-e2e-final.json复核，未将诊断轮拼接。
- 六域30/13/19/24/22/28项加7交叉，共143新增全部在该过程通过；正式998/998主绑定结果校验通过。root独立对照基线955绑定的file/title零变化；旧E2E源文件未修改，原demo保留。14矩阵覆盖与两份独立风险/UI数据审查闭环，无剩余阻断；七任务统一done，不延伸为整个Office计划完成。
- 完整Vitest464文件6425/6425；Rust default3711、lite3671各0失败/10既有ignored，primitive64、WASM205/0/1既有ignored、真实Chrome7通过。原生/WASM/API、类型、完整build、lint/cycles/presentation/docs/scripts/Lingui均有原始绿证，未新增忽略项。build仍有既有>500k chunk warning，不宣称零warning。
- 运行结束、任何文档编辑前4236输入逐文件零差异，审计007-final-result-audit.json。收尾仅4文档及报告；其中FEATURES仅引言变化、绑定行不变，另外4235输入一致，见007-final-documentation-audit.json。docs轻量复验与diff check通过，稳定产品未为文档重跑。
- 本版取舍：参数表单沿原草稿/Enter，无另一预览工作簿或模态选格；高级筛选为两层AND/OR而非全部Office条件区域；跨表命名范围重叠、合并/Table等不安全移动写前原子拒绝；FETCHJSON仅可信同源JSON、手填且不伪装原生元数据，不执行文件脚本。格式仍cell/row/column事实，不建新样式镜像。具体成本与边界见各领域文档及既有裁决。
- 5191测试服务已停止，无剩余执行session；未commit/push/发布。证据统一位于持久根及reports/007-report.md，两份独审原始发现和真实红绿均保留。
