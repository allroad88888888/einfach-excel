# 004 独立审查：真实包消费者与发行准备

状态：`REJECTED / 未完成`。静态交付与真实包消费场景通过，但attempt2完整运行自然exit1，2675/2677通过，同JSON主绑定1024/1026；验收第7项未完成，Important I2未关闭。后续无改动串行诊断58/58未复现，不能抵消完整失败。CI预算I1已关闭，6268项开始/结束/诊断后指纹一致；M1是已接受非阻断限制。004不得标done或宣称已具备发布条件。

基线 HEAD：`08caefbce8cb4934ceea4f0c26115d910569a47c`。日期：2026-10-22。只写本 review；未修改产品、配置、其他任务或报告，未派 agent，未运行测试、构建、pack、安装或浏览器，未 commit / push / publish。

## 审查范围与方法

已完整读取 index、004 任务及 004-report 草稿，读取 001–003 的交付与最新修复/独审记录；沿用本会话已完整读取的 task-tree、React 架构、feature-wave、one-file-one-thing 规则。learn-project 维持暂停。001–003 已审通过的产品架构不重复审判，本次重点核对其交付能否进入真实发行包和宿主消费链。

对 004 frontmatter files 按基线取 tracked diff，并直接读取 untracked 新脚本、fixtures、包浏览器用例、许可证与接入文档；额外只读关联 Rollup 发现条件、依赖及发行实物。未通过重复运行未变套件来获得“亲验”证据。

已读原始账本/日志：最终 473 files / 6496 Vitest tests、R4 包浏览器 42/42、脚本22项、presentation、类型、根/发布构建、artifact、Rust/WASM、仓外 install/tsc/build，以及attempt1/attempt2原始完整报告、同JSON门禁和四份独立诊断。最终004-report、FEATURE_PROGRESS、发行文档与final-attempt2-audit.json已同步真实未通过状态；中途草稿旧pending/计数不单列缺陷。

新增/大改脚本与测试按职责内聚，当前逐文件行数均≤300：presentation checker260；consumer准备91；许可39；冻结55；host app132；包spec最大controls209。没有为了简单验证引入额外运行时架构。

## 静态交付与已完成证据

| 验收条目 | 当前判定 | 证据与实际边界 |
|---|---|---|
| 1. 真正 pack、仓外 strict-peer 安装及依赖闭包 | ✅ | `prepare-react-package-consumers.mjs` 用系统 mkdtemp，复制 manifest/在途changesets到独立临时release副本，运行既有 version/lock流程后 pnpm pack 五个包；消费者只用 React/UI Core/WASM 三个 tarball和registry依赖。npm install明确 strict-peer-deps/ignore-scripts，没有legacy-peer-deps。两份安装树日志problems为空，实际安装目录不是symlink；未出现react-cells/canvas-cells/canvas/excel-core-ts。两消费者独立 tsc 与生产build日志均exit0，tsconfig为skipLibCheck:false，未安装宏插件或Rust。 |
| 2. Vite/Rspack真实 Worker/WASM及生命周期 | ✅ 同次完整中的包场景通过 | 两fixture没有源码alias；Vite8.3.4和Rspack2.2.9分别产出生产页面，由独立静态server提供。host app真实import已安装包与显式CSS；默认Worker与自定义Core发行Worker都走真实原生runtime，只包装Worker计数，不伪造消息。R4 JSON42expected，attempt2同次package-host42项亦全通过，覆盖两打包器初始化、切表、编辑、unmount和失败恢复。 |
| 3. 千行多表、真实DOM修改及 typed增量事件 | ✅ 同次完整中的包场景通过 | fixture有1000行输入、三表、百分比原值0.125、公式和第三表依赖。mutations/host-api spec实际双击、键盘外贴/Delete/Ctrl+D、工具栏undo/redo及跨表剪切，断言原生typed读取、精确范围正反例、邻格和兄弟保留；API批量事务一次撤销。refresh/import与失败/noop/重算分别验证source和dirty排除；导入后通过公开目录读取新sheetId，没有写死旧身份绕过。 |
| 4. 宿主锁及原生保护 | ✅ 同次完整中的包场景通过 | controls spec以真实cell editor/公式栏Enter、clipboard键盘粘贴、新建表按钮、插行toolbar触发拒绝；两打包器×中英均断言明确HOST_*文案、值/事件未变。原生保护通过真实菜单建立允许区，允许区可编辑、其他格拒绝，host readOnly再拒绝允许区；没有只调用Core命令冒充UI入口。003反馈修复未被降低断言掩盖。 |
| 5. 双Store/双语言、宿主隔离、卸载/失败恢复 | ✅ 同次完整中的包场景通过 | 原生两个Store独立、en/zh受控；读取宿主body/button计算样式前后相等并实际wheel滚动文档。Worker计数证明默认+自定义两实例，卸载一实例后另一实例继续编辑，remount恢复原初始簿；factory和初始化失败均释放对应资源。attempt2中package-embedding18项/package-host42项均通过，含002/003独审所保留的实例ARIA、父容器resize、旧结果隔离持久spec。 |
| 6. 原998功能登记与新主绑定 | ✅ 静态保留与可执行采集；结果1024/1026 | 本次独立从git基线逐行比较FEATURES表，998旧行缺失/变化为0；当前1026，新增11 EMBED+17 PKG。映射使用合法ABC-001形式、精确file/title；PKG以Vite为主用例，Rspack/其他locale为对应回归。同attempt2 JSON仅TABLE-036/STAT-019无成功证据，新增28项全部通过；登记完整不等于原有功能全绿。 |
| 7. 静态/类型/构建/Vitest/Rust/WASM/唯一完整E2E | ❌ 未完成，I2 | 已有最终6496/6496 Vitest、匹配WASM、root与build:publish、Core/React/package types及artifact的自然通过证据。presentation/scripts/cycles/docs/i18n已读；完整lint日志曾有已识别TypeScript声明warning，Core后续显式devDependency及零warning定向证据不可被误写成旧全量日志本身零warning。attempt2完整2677项自然exit1：2675passed/2timedOut，同JSON主绑定1024/1026，不能用后续诊断拼接关闭。 |
| 8. 兼容、文档、许可与发行保护 | ✅ 静态交付及真实边界说明 | public配置与changeset已准备，源码仍React0.0.0/Core0.1.0，不在工作区消费旧计划；模拟发行React0.1.0、fixed组0.2.0及React peer Core^0.2.0一致。README/host-data/release明确React18 ESM、同Store身份、locale/renderer、标准Worker、typed读写/真实范围/失效通知、预算/复杂目标限制、未验证SSR/React19/CSP/CDN。最终报告/进度/发行文档明示完整门禁未通过及M1，不把文档准备当可发布。MIT与内联依赖声明见下文。没有实际发布。 |

## 发行版本、依赖与保护

独立核对原有 `.changeset/excel-web-chrome-skin.md` 和 `lucky-pandas-clap.md` 与基线字节一致，新changeset只增加本轮计划。临时Changesets release plan对固定组得到0.2.0、React得到0.1.0；React最低UI Core peer为^0.2.0，没有把旧0.1.0当作拥有新host API。相关暂停/私有包在临时计划中被依赖传播计算版本，不会因此进入React安装树，也没有修改其工作区产品。

五个tarball SHA与consumers.json全部匹配；实际React包manifest为0.1.0、Core为0.2.0、Core的workspace WASM依赖已重写为0.2.0。两消费者均解析React/react-dom18.3.1、Einfach core/react0.4.0和UI Core0.2.0，各自只有一个版本，npm依赖树无problems。React主入口保留ESM type/main/exports.import而移除冗余module，现有Rollup仅发现main+module+src/index，故不会再次清理React库dist；根build与build:publish明确调用专属build:lib。

源码React private:false只准备metadata，pending changesets保留。发布workflow原有语义仍是有pending开Version PR、无pending走publish；没有绕过保护或在本轮执行该workflow。创建/合并Version PR、推送和实际npm发布仍需用户另行授权。

## 许可与文档

只读tar成员及包manifest：React有19项，包含LICENSE、NOTICE、dist/THIRD_PARTY_NOTICES.txt，无src/test/e2e/consumer源码泄漏；Core1921项和WASM15项也无此类源码路径。React LICENSE与仓库根MIT逐字一致。生成的第三方文件735275bytes、81段License声明，含实际MIT/Apache正文；NOTICE说明三个内联renderer归仓库许可，外部React/Einfach/Lingui保留其各包许可。

许可生成器按实际WASM目标normal依赖树取正文，缺正文只允许同上游/同声明许可的真实发布文本兜底，否则构建失败；生成脚本不进入消费者安装流程。当前包检验脚本强制三份许可资产存在。此处核对发行资产与实现逻辑，不把本地检查表述为第三方法律意见。

001留下的旧README `?worker` Minor已修：现README描述标准模块URL和公开入口，链接到完整包文档。文档明确导入会产生新sheetId、事件不是可靠日志、全轴元数据范围不可无条件typed read、committed-unmapped需export重同步、unknown提交不可盲重试，保留003边界而不扩大承诺。

## CI与门禁强度

CI新增独立browser job：匹配lite/full WASM → build:publish →真实tarball消费者准备→默认完整Playwright→同一JSON的check:e2e-features；同时启动原demo和生产consumer server。原998spec仍在默认testDir，未添加testIgnore/skip/only/expected failure或放宽测试timeout；package独立配置明确workers1/retries0。完整本地进程亦未设置CI，retries0。CI原有重试配置不等于能吞flaky，结果门禁仍检查实际JSON。job原90分钟总预算不足，已在首轮结束及旧冻结零差异核验后精确改为180，见I1关闭记录；没有在运行中改冻结输入。

presentation checker仅对Provider/默认factory的一个WorkerLike纯类型binding及唯一单side-effect Worker叶给予例外，未豁免整个目录。纯类型、alias正例与value/mixed/其他类型/namespace反例，额外语句、错误入口、普通视图、dynamic runtime/transport、connection atom、atom创建器和Store直调用反例均保留，加入root test:scripts；现有原始脚本日志22/22通过。没有修改已审产品来迁就旧路径规则。

根/发布构建、CI配置与本地自然通过是不同证据：目前只审查远端配置，未声称GitHub workflow已经执行或npm已发布。

## 冻结与完整终态

首轮冻结开始：2026-10-22T04:40:37.853Z；6268项，聚合SHA-256（仅对应已失败/中断的attempt1，不是后续最终输入）：

```text
6a7f3f207281b639dd61aba29402f21b1c588315b0f2dde2f60b40a707b7bcb0
```

本次独立重算清单aggregate与其声明一致，含1163份Rust `.rs`、Cargo锁、所有非普通文档输入、FEATURES/changesets、实际Core发行JS/声明、WASM/React dist、两consumer生产dist和五个tarball。早期扩展名白名单漏Rust的问题已在最终冻结前改为git全集，当前关闭，不作为遗留缺陷。

最终核心tarball：React `e9b8a442c7b4c384139777a1336bf480832a7f12235a5f5845580b7ba7384969`；Core `de578c9c8450c6ec8d47a3e03b4d87fcd432d95001e37a507808956bfe637a12`。均已独立重算匹配。完整运行直接使用已准备生产输入，没有冻结后再次prepare。

attempt2于2026-10-22T05:10:56.981Z重新冻结6268项，新aggregate如下。本次独立重算清单、比较其与attempt1所有路径：恰好CI预算及两份fixture三项SHA变化，无新增/删除；`attempt2-freeze-delta.json`与清单相符。React/Core/WASM发行产物、五个tarball、consumer生产dist及manifest均未重建或替换。

```text
3696c4d353bcd6197313b3ac7f692ee296ec13ab6800957c239a3760377e1043
```

本次独立读取`full-attempt2-results.json`与`full-attempt2-e2e.log`，JSON SHA-256为`8403aaa10bc418b0cc3eef4e7c09a77f99f82d68c7f00ff0fd56100765bc1e7f`。开始2026-10-22T05:12:32.718Z，耗时5891550.529ms（98.1925min），06:50:44.268Z自然exit1；2677项均实际执行且各有一个result/retry0，其中2675passed、2timedOut、0skipped/flaky，report errors=[]。不得用中途tail漏掉失败的旧进度覆盖此终态。

对该同一JSON直接调用门禁的纯`checkFeatureCoverage(..., true)`函数重新核算（不启动Playwright），与`features-attempt2-result-gate.log`一致：1026绑定中仅TABLE-036和STAT-019失败，故1024成功。package-embedding18项、package-host42项及新增28主绑定同次全部通过；这证明包场景与迁移进入完整路径，但不消除两项既有回归失败。

结束`frozen-attempt2-verification.json`于06:51:09.711Z记录count6268、aggregate3696c4…1043、changed:[]。本次不仅重算开始清单aggregate，还重新读取清单全部6268份当前文件的SHA，逐项零变化，包含发行实物和配置。完整失败不是已发现的运行中输入漂移；没有由此推断根因是负载、产品或Playwright。

已授权四组无改动串行诊断已自然结束，详见I2。诊断后06:55:10.680Z再次verify仍为6268项、同aggregate、changed:[]；根与作者记录所有suite/server退出，端口5191/5193无监听。本审查不为亲验再启动未变输入的测试或重做冻结命令。最终004-report、FEATURE_PROGRESS和release文档均已明示完整2675/2、1024/1026门禁失败、根因未知和未发布；未把58次独立诊断并入全量，没有第三次full、断言弱化或产品修复。

## Critical

当前无。

## Important

**I1：CI browser job时间预算不足——✅ 已关闭。** 原 `timeout-minutes: 90` 小于旧2617项完整实跑90.789分钟，且job另含构建/安装/打包。首轮停止并完成旧6268项零差异核验后，作者仅把90改为180。本次独立读取ci-budget-adjustment.json、解析当前YAML，并将当前文本唯一一行逆向替换为90后重算SHA，恰好恢复原冻结CI hash；没有其他隐含配置变化。同一JSON功能门禁、always artifact上传和publish React artifact guard均保持。

CI旧SHA：`835b9e631908cf0552a0fc6587af587be175cc616794d1f4a871fee945d68f0e`；当前SHA：`70c2c00600910b1390bd80b0101e6f4beacf5bbe62eedc11205620594ab16cad`。新预算已纳入attempt2冻结，不需重复产品语义套件，不冒称远端CI已经执行。

**I2：最终单次完整E2E及同JSON功能结果门禁未通过——❌ 未关闭。** 验收第7项要求最终完整回归通过，实际attempt2自然exit1，两项均超出原30s而timedOut：

- `e2e/selection/statistics-actions.spec.ts:93`，`copying a statistic never creates a cut token or clears the source on paste`（STAT-019）：首个`select('A93')`在第8行名称框fill挂起，尚未执行本用例Cut或统计复制；result35170ms。
- `e2e/workbook/table-dialog.spec.ts:5`，`Open Tables preserves native tables cell styles and redo at 1280px`（TABLE-036）：前置第15行公式栏`press('Enter')`挂起，尚未打开表格弹窗；result35165ms。

原JSON、完整日志、各自error-context.md和trace.zip均保留在attempt2独立目录，没有期望失败/skip/retry包装。静态trace未发现disabled/readonly/hidden或pageerror/crash，不足以证明是哪一层导致actionability无响应；目前不定性业务值/剪贴板/表格功能已经失效，也不把其称为已证实负载抖动。

根授权的原整文件及两个失败case各20次无改动诊断已完成。本次直接解析四份JSON并核对`diagnostic-serial-status.json`：2026-10-22T06:52:32.576Z至06:54:47.462Z严格顺序运行，workers1/retries0，各组自然exit0/signal:null；无prepare/build/pack/输入修改。所有58项均各有一个passed/retry0结果，零skip/unexpected/flaky/report errors，原case标题精确匹配，没有以其他用例替代：

| 独立诊断JSON | passed | 耗时ms | SHA-256 |
|---|---|---|---|
| diagnostic-statistics-file.json | 8 | 27816.443 | d6bbaf33c20b058eb53f340a48f21c92bb17c71b4eb3e2751d3b04f999547b5d |
| diagnostic-statistics-repeat20.json | 20 | 42146.447 | 24d8f12b79fec8abeb45612fbfb621a8b2bb29f1be7d79c4bb0543f51302dda7 |
| diagnostic-table-file.json | 10 | 18755.450 | d4b78d18e531957f43c0fb6eaa9c11caaa4515536e91b266c3e39370197db0ad |
| diagnostic-table-repeat20.json | 20 | 42732.539 | 9043aaf25ea6690e2198f02fefcf081b2a7c8e6c57666b429c775a682109a7ed |

诊断未复现只说明这些独立执行成功，不证明根因已知或“已证明负载/偶发”，也不能替换失败的完整报告或关闭验收7。完整日志SHA为`f86ef41e4065a671c3743856849519088dc66422a7b41a8a2c2cd280de65c869`，`final-attempt2-audit.json`逐项与原JSON、门禁及诊断账本一致。004/PKG-13保持未完成，当前不具备“所有验收通过”的发布条件；后续原因定位、风险接受或再次完整验收由根/用户另行裁决，审查不擅自改测试或继续盲跑。

## 首轮失败与fixture最小迁移增量审查

原始证据已保留为full-attempt1-results.json / full-attempt1-e2e.log。本次直接解析JSON：270 passed、4 timedOut、1 interrupted、2402无执行结果，report errors为空，无flaky或retry；JSON统计中的skipped2403包含被中断的1项，不能误称2403都从未执行。日志明确exit130，耗时1627029.247ms（27.12分钟），不是完整通过。四项失败为comments/localization与custom-formulas/localization的1280/390中文场景，首个中文输入入口超时，不是末尾语言切换。修前provider缺少demo展现配置，而公开Provider已按002契约默认独立英文，根因与错误上下文一致。

frozen-attempt1-verification.json已记录旧6268项、原aggregate、changed:[]；因此该失败不是运行中输入变更所致。仅允许一个active full的约束没有被打破：先停止明确失败的attempt1并保存结果，再修复、定向验证和准备后续完整运行，不因工具timeout重启，也不拼接两次结果。

两个修正路径为 `e2e/fixtures/plain-sales-orders/main.tsx` 和 `e2e/fixtures/cross-sheet-cut/main.tsx`。各自只新增已有demo-presentation的具名import，再向原Provider spread `demoPresentation()`；直接复用demo的URL/浏览器语言及renderer选择，不给公开库重新加URL/存储副作用。独立在内存移除这两处新增文本后，SHA精确恢复旧冻结指纹，证明无其他产品、definition、spec标题或断言变化：

| 路径 | 原冻结SHA | 修后SHA |
|---|---|---|
| plain-sales-orders/main.tsx | dfdfde57a6eab43b6400750251373ea5b69599a0ebf57545c074cbdf16c68380 | d64c8369777191c21d0e83d4d46ae24c0ec3669e689d8b9ae24bf2c9048955c1 |
| cross-sheet-cut/main.tsx | 19f43e53ac09110371449f3ea0eb3fdb037d2b134fe7f7570cec5e4107869b80 | c5082bdd3896888202cd44377cc53d4206d3485598b415cc4aa1f94683186cbd |

已独立解析002的r2-fixture-results.json：12/12 expected，每项只有1次passed/retry0，0skipped/unexpected/flaky/report errors。包括原四个失败中文场景、notes中文两宽及跨表中英布局四项+键盘/toolbar实际剪切两项；没有降断言或调大测试timeout。

002 R2最终报告已收尾并由根关闭：两fixture scoped ESLint自然exit0无输出，原tsconfig选项下的两入口真实类型闭包diagnostics0；随后原作者顺序运行的中文Canvas smoke覆盖plain1280/A2/SO-10001及cross390/A1/4，核验Canvas可见/真实fillText、DOM td=0、名称框/F2编辑提交/Undo原值、每页一个真实Worker且pageerror=[]。浏览器finally关闭，自有Vite关闭并检查5191/5193无残留。未重建或替换匹配WASM。

已读取四张截图的实际目视记录及相应Canvas/中文弹窗边界，没有虚报共享visual-runtime。独立对R2列出的demoPresentation、五份spec、当前WASM两文件、原JSON和四张截图共13项重算SHA，全部匹配。此处复用002已经自然通过的证据，不重跑其套件，也不把12+2定向扩称完整2677通过；整体仍必须由attempt2的单份完整JSON关闭。

## attempt2真实包截图目视

已用view_image实际打开两张1280×720包消费者截图，而非仅核对路径存在：

| 路径（前缀 `.codex-artifacts/react-excel-package-004/full-attempt2-results/`） | SHA-256 |
|---|---|
| package-host-mutations-ins-3488a-and-typed-thousand-row-data/installed-vite.png | 4f9f51e631dbf00fb552ba5f9daaabd8f2f09995ef396d8c5c71710eca801fde |
| package-host-mutations-ins-496c3-and-typed-thousand-row-data/installed-rspack.png | 679bce2e97af2ea9834e3e0e2dae5af92a8c1826057c38e31a90baafa0b6cae6 |

两张均有同一宿主的标题/控件及独立中英工作簿，ribbon、公式栏、网格、sheet页签、状态区完整，宿主衬线/底色仍保留；网格中的1、Order 1、12.5%、2可见，没有发现功能入口缺失或阻塞性重叠。Rspack控件字体明显大于Vite、状态区多一行，记M1。目视不替代DOM/原生数据与事件断言，不把这两图当作完整2677通过证据。

## Minor

**M1：Rspack与Vite的内部控件字号不一致——非阻断，待后续收敛。** 上述同场景实际截图中，Rspack语言选择/ribbon明显大于Vite，状态区因此多行；没有发现不可用控件、文案裁断或宿主样式污染。源样式的`.ribbon-tab`为11px、`.language-select`为12px，根reset较后为`:where(.einfach-spreadsheet) :is(button, input, table, select, textarea) { font: inherit; }`。

只读生产CSS定位：Vite保留`:is(...)`；Rspack在相同较后位置额外生成`:-webkit-any(...)`与`:-moz-any(...)`前缀规则。前缀伪类的优先级与原type-only `:is`不同，因此reset覆盖内部组件字号是与截图一致的静态原因推断，未冒称新增computed-style测量。建议后续让根reset在两打包器下保持明确的低优先级，并保留真实包截图/字体断言；不在冻结中的本轮临时改产品、fixture或降低断言。

根已实际查看两图并接受非阻断triage，当前作为已知bundler样式一致性限制，首版不宣称pixel parity。没有缺失、截断或操作失败证据，不因此进入本轮修复循环或重建；发行兼容文档已同步该限制，当前冻结tarball仍是打包时旧文档，未发布，未来授权发行准备需一并更新文档。

早期冻结遗漏已关闭；001 README旧断言已关闭。pnpm-lock额外平台元数据/完整性记录重写已读取，没有发现本轮版本升级或消费者依赖闭包失配，不把无实证问题扩大为发布阻断。

最终判定：`REJECTED / 未完成`。验收1–6、8的交付及所列证据成立，验收7因两项完整E2E超时和同JSON功能门禁失败仍未满足（I2）；四组诊断不抵消失败。无Critical；I1已关闭，M1非阻断。仅有本地结果与配置审查，没有远端CI执行、commit/push或实际npm发布证据。

## I2 R1 独立复审：有界输入停顿观测

本轮诊断交付判定：`APPROVED_WITH_CONCERNS`。这不是总004验收通过：**总004仍为REJECTED / 未完成，I2保持未关闭**，attempt2的2675/2677、同JSON1024/1026原结论不变。R1没有取得原失败时的栈或确定根因，不能据54项短时定向未复现宣称负载问题、产品已修或已具备发布条件。

已完整读取任务I2 R1边界、index相应裁决、作者最终R1报告、五份新源码、两原spec接线及status/delta/audit/static原始记录；复用前述已审证据和根的七路径当前SHA核对。不运行任何测试、自检、采样、build、pack或进程操作，不派agent、不修改产品。仅在本review末尾追加本节；learn-project继续暂停。按既有React/feature-wave/one-file-one-thing规则检查测试侧职责与门禁边界，五新文件124/28/26/108/63行，均≤300，没有引入生产监控层或依赖。

### R1逐条验收

| R1条目 | 判定 | 源码与原始证据 |
|---|---|---|
| 1. 最小测试侧文件，不改生产链 | ✅ | runner只管理本轮子进程/browser server；专用config只选原两文件；fixture装配观测；observer记录Node/协议；page保存页面时间线。React/UI Core/Rust、发行物、宿主API均无新状态/hook/atom；原DOM→Core→真实Worker/WASM链未替换。 |
| 2. 默认关闭、独立时钟/事件/身份/资源 | ✅ | fixture仅在`INPUT_STALL_OBSERVE === '1'`调用observer；关闭分支直接`await use()`，不创建CDP/ELD/心跳。原始关闭组1/1且0份JSONL/0观测记录。启用时页面performance.now/timeOrigin与Node performance.now/ELD分别记录；目标只含tag/role/label/id及Enter/Tab/Escape，不读输入值/剪贴板；只接受自身mainFrame批次。 |
| 3. 尽力取栈、失败如实、有界低频 | ✅ 有缺失/Minor M2 | 页面250ms beat、1000ms批次、128条缓冲且至多一个deliver在途；所有观测`session.send`共享rpcPending，700ms观察期限超时不清除尚在执行的RPC，后续显式skip。不主动Debugger.pause/resume。正常三组没有Profiler调用；受控缺口仅Profiler.enable超时，原始记录无start/stop/profile，未虚称取得200ms窗口。迟到start分支尚有M2，未影响本次样本。 |
| 4. 已知短停顿与恢复自检分列 | ✅ | about:blank明确执行2200ms同步循环；原JSONL记录页面gap2362.3ms、Node ELD21.66ms，observer结束无pending，随后原真实统计case成功。仅证明能记录该已知页面停顿并区分两侧时钟，不是产品缺陷复现。 |
| 5. 两原spec只接线，原30s/行为/断言不变 | ✅ | delta仅两份spec首行由`@playwright/test`改为input-stall-fixture，后者原样导出expect/Page；逆替换逐字节恢复原冻结SHA。专用config显式30_000、workers1/retries0；原标题/DOM操作/数据/断言/FEATURES/默认配置未改。 |
| 6. ≤10min、真实fresh/same身份、自有资源 | ✅ 本次实测有界 | status记录07:28:44.669Z至07:30:43.771Z自然exit0、119102.580ms，budget600000/budgetExceeded:false，五组顺序无并行。runner有预算watchdog与finally，仅关闭自有child/server，日志wx及status已存在即拒绝重跑。同browser两轮的独立JSONL中CDP实际browser PID均97264，连接SHA亦相同，不靠repeat-each假称寿命；fresh实际PID97021。清理记录只剩ps表头、端口无输出。本次未触发600s watchdog，不声称验证了极端清理失败时的硬退出。 |
| 7. 有因才修；未知则保留I2、不扩大采样 | ✅ 交付流程；I2仍❌ | 真实三组18+18+18均过，但原30s挂点未复现，作者未给猜测性生产修复、未归咎负载，未追加repeat/第三full/build/pack。same browser仅约72.8s且每例新context/renderer/Worker，不等于原98min与前序套件条件。报告正确返回DONE_WITH_CONCERNS及i2Closed:false。 |

### 原始结果与证据保护

直接解析五份Playwright JSON和55份input-stall.jsonl（54真实用例+1自检，关闭组没有JSONL），不是仅信任audit汇总：五组各项均只有一个passed/retry0结果，0skip/unexpected/flaky、errors=[]。**54真实定向与默认关闭/受控自检2项分开计数**，不称56项全量验收。

| 分组 | passed | JSON SHA-256 |
|---|---|---|
| default-off | 1（关闭检查） | 9b21fcfd77d43bbbb35df254930b1e16e49911a28427ef3ebc363cdfaef76b90 |
| self-check | 1（受控自检） | ecdaaec4c983f3dfcc9bac70448de610d260fecf4706fb44d56897da1f13c1d4 |
| fresh | 18 | 240916ae153cb1ce6ea896c9478edf00d9e5588ccc5cf4a9ae0edb673fa55675 |
| same-browser-1 | 18 | 1c75d16645f8bbd50ab2bb80a39201abde2766912d8ecb547071db15309be8ee |
| same-browser-2 | 18 | f4f02ae55daa363671a069f9db939cedd742905709d346b32f4a362e8d344f93 |

真实三组各18份JSONL均有start/end，CDP SystemInfo实际PID与runner记录一致。每组144次观测RPC，Node tick130/132/118、page batch41/40/38；最大页面beat gap448.3/484.0/475.1ms、缓冲drop0，无pageerror/crash，结束rpcStillPending:false。不同例有不同renderer PID，不能把各例端点heap最大值拼成同一堆增长或泄漏；没有随机A/B，不宣称零扰动或量化因果开销。

受控组原始RPC记录精确为Profiler.enable耗时701.783ms/result:null，接着SystemInfo与Performance两次one-in-flight skip；没有Profiler.start/stop，也没有profile。结束pending:false只说明最终不再在途，不能把700ms超时解释为底层命令已取消，更不能补写不存在的栈。

delta与根的逐文件SHA审查相符：旧6268项恰2个spec import变化、其余6266不变，新增5个诊断文件；生产源码、Cargo/pnpm锁、lite/full WASM、Core/React dist、五tarball及consumer生产页面不变。新6273项aggregate为`4852de937a736891b6c9929a76920fe08b4ecd6c777daa00da0c3cfea5973a5b`，不是旧6268 freeze。两spec还原SHA分别为`ec3469c10c6620a216040fa13189fadfd621fa73730d70701d5a10c864f54965`、`e04afb838d2f4a5e944a46e1fefd2519a302a6d0c7ef1ca085b3a80e07563807`。

独立重算audit列出的10份旧freeze/attempt1/attempt2证据SHA并核对mtime，全数匹配；attempt2 JSON/log仍为前节原SHA。作者004-report原18625字节前缀SHA仍为`52fddbd2c71f5053ad01fed8ae9fd3fe67427f88f9123a27e34f2bc5b9ee6e86`，确为追加。未覆盖旧冻结验证或把新delta误报旧freeze零差异。

局部types、两spec/support原项目ESLint、runner node-check、diff-check证据exit0；新增config不在原tsconfig范围，首次project:null ESLint退出2保留在static.json，没有当成功。最终`input-stall-r1-config-lint-project.json`明确使用忽略目录临时tsconfig将config纳入原完整规则，exit0，没有禁规则/改仓库tsconfig。此处局部tsc带skipLibCheck仅作为诊断文件检查，不替代之前真实包skipLibCheck:false的类型证据。

### R1质量发现与关闭条件

Critical：无新增。Important：无新增；**原I2未关闭**，缺原失败时刻的栈/协议事实和满足验收7的完整成功证据。

**M2：Profiler迟到start的收尾不保证短窗口——潜在非阻断Minor。** observer的capture在enable成功后await rpc(Profiler.start)，不核验start成功；若将来start超过700ms仍在途，200ms后stop会被同一rpcPending规则skip，迟到start可能在其后生效而没有对应stop，直到页面/会话销毁。该分支并未在R1进入（实际enable已超时、没有start），因此不是本次证据已被干扰或已修复的事实，也不影响观测默认关闭。

根已接受M2为非阻断，不进入当前修复/重跑循环。若另行授权复用取栈，先用最小受控自检验证实际Profiler开始/停止与迟到命令收尾，使失败分支能确定结束采样；不主动暂停页面、不用额外架构处理简单诊断。随后才决定如何在原输入条件捕获主线程/Node/协议证据；不因54项未复现直接扩大repeat、改30s timeout或盲跑第三full。

R1最终回执：`APPROVED_WITH_CONCERNS`（有界观测交付完成，取栈缺失与M2保留）；**总004最终仍`REJECTED / 未完成`，I2 open**。未对001–003重新立项，未宣称根因、修复、完整门禁或发布条件通过。

## I2 R2 独立复审：实际短取栈与M2收尾

R2诊断交付：`APPROVED_WITH_CONCERNS`；**M2已关闭，总004仍REJECTED / 未完成、I2 open**。已完整读取任务R2及独审交接要求、index裁决、作者R2末节，检查5路径源码与原始profile/JSONL/JSON、static/status/delta/audit；只追加本节，没有运行测试/浏览器/构建/pack或修改产品。继续按既有架构、feature-wave、单一职责规则审测试侧边界；profile模块127行、单测108行，原fixture/observer/runner为53/106/209行，未增加生产层或依赖。

| R2验收 | 判定与证据 |
|---|---|
| 1–2. 最小范围与原行为 | ✅ 仅修改fixture、observer、旧runner，新增profile模块/就近测试；page探针、诊断config、两原spec本轮不变。默认关闭分支仍直接use，不创建观测/采样；原30s/动作/断言/数据/FEATURES不变。 |
| 3–4. 真实命名取栈与短窗口 | ✅ 受控命名阻塞前已收到start ack；解析真实cpuprofile得start/end107679109328/107680327155μs，1217.827ms，199 samples全部引用有效node，其中192命中`inputStallKnownSynchronousBlock`节点7。events为enable→setSamplingInterval5000μs→start ack→stop→disable→finished；随后input fill恢复。没有主动pause/resume，不以gap或非空文件冒充取栈。 |
| 5. 迟到/失败确定收尾 | ✅ M2关闭：专用session不共享资源rpcPending，finishTask唯一且等待原startCompletion；迟到成功接唯一stop，不把700ms观察期限当取消。4500ms绝对期限无法确认时仅关闭自有page；await close/isClosed确认后才记destroyed，另500ms确认限后记unconfirmed。fixture对非stopped/未确认及start不ready报诊断失败，不继续下一组。7项原单测JSON全部passed，覆盖自动停、迟到唯一stop、拒绝/never start、拒绝/never stop、销毁未确认；真实浏览器本次仅验证正常stop/disable/detach，不冒称真实故障注入。 |
| 6–7. 唯一有界执行、失败不扩跑 | ✅ runner8480/browser8481，07:58:48.258Z→07:59:00.272Z自然exit0，共12014.434ms，未触发300s预算。受控自检成功后才各跑原统计/表格case一次，再默认关闭1例；三JSON各1passed/retry0，0skip/unexpected/flaky、errors=[]，无额外采样/重复/full。受控页独立计，不当第四条功能用例。 |
| 8. 输入与旧证据保护 | ✅ 重算R1开始6273清单aggregate吻合；逐项读取当前内容仅3份允许文件变化，新增2份后6275聚合47875ea…d0b90。采样前5源码SHA与当前全部吻合。107份R1和10份旧验收证据SHA/mtime均未变化；原6268中仍仅两spec的R1 import差异，其余6266含生产/实物不变。 |
| 9. 追加报告、保留I2 | ✅ 原报告27871字节前缀SHA仍c68a110a265d35348667b23ca3d2cbafcf40e0037e4b9450be0a21002cd8100a；R2仅追加。audit的acceptancePassed/i2Closed均false，未用受控取栈或短case成功覆盖原完整失败。 |

受控profile SHA为`997c06d49088260c6a2f20bbad4ddb88b74fc9d336356f78a81c6046a50420e9`。原统计profile1460.523ms/447 samples，表格1755.133ms/464 samples；两份均有stop/disable/finished确认，没有实际销毁、超时或pageerror/crash。关闭组没有JSONL/profile。

独立从原始page-batch的timeOrigin+pageMs映射epoch并对照Node命令时刻，确认本次不是只采load：统计start ack07:58:52.011Z至stop发出53.405Z，按未改spec顺序第二个Name box input（A93 fill）为53.063Z；表格start ack55.423Z至stop发出57.111Z，公式栏input56.236Z/Enter56.267Z均在区间内。这个覆盖结论仍是含wall-clock分辨率、timeOrigin基准及传输误差的同机映射，不是CPU样本与单次DOM事件的精确因果对齐；两case没有原30s停顿，不能据其栈归因I2。

新6275 aggregate：`47875ea8a03292ff73169391d9a1a848fd8022553cdb3a16fb5fac60224d0b90`。局部strict types/ESLint、7项协议单测、runner node-check/diff自然exit0，验证发生在采样前；首检记录仍保留。清理账本08:00:45.600Z的PID仅表头、5191/5193无监听，未对工作区外进程操作。

质量发现：无新增Critical/Important/Minor；M2由独立收尾路径、7项协议单测及真实正常取栈关闭。保留的能力限制不是原缺陷已修：这里只证明阻塞前已启动、短同步阻塞恢复后能stop取栈；若长时间协议不响应，绝对期限销毁会丢profile，销毁未确认也不会报成功。该盲区和原98min前序条件均未被本轮排除，M1既有非阻断限制不变。

后续完整运行若显式启用OBSERVE/PROFILE，现有接线将作用于两spec全部18例，每例首次DOMContentLoaded后≤4s，而非只原两个失败case。期限兜底可能主动关闭诊断页并产生Diagnostic profile cleanup失败，须与产品crash/原30s超时分开归档，不宣称零扰动或与attempt2环境完全相同；逐例记录实际输入是否落窗，窗外无栈不能排除挂点。此为交接风险说明，本审查未追加运行或更改方案。

R2最终回执：`APPROVED_WITH_CONCERNS`（短取栈能力成立，M2关闭）；**总004仍`REJECTED / 未完成`，I2未关闭**。仍需原挂点的真实原因证据及最终完整门禁，不能宣称修复/可发布；后续已获授权的完整序列另按同次自然结果独审，不拼接短测。

## 用户授权完整序列attempt3独立终审

最终判定：`REJECTED / 未完成`。本次授权执行与证据交付已完成，但完整2677项仍有3项失败，验收7/PKG-13及I2不能关闭；1026主绑定、原两个失败case或包场景通过均不能抵消。已读任务/index的attempt3授权及作者正式末节，只核对本次原JSON、日志、冻结、保护、trace与18例诊断实物；未运行任何测试/构建/pack、修改输入或作者报告，仅追加本节并保留旧前缀。

### 同次完整结果、冻结与保护

唯一CLI为session85947、launcher14480/Playwright14482，直接默认config，workers1/retries0/原30s、无CI；显式OBSERVE/PROFILE只接入原两spec共18例，其余2659例无观测，未走prepare/build。原JSON开始08:13:03.966Z、耗时5808795.876ms（96.8133min），约09:49:52.762Z自然结束，完整日志明确exit1。

独立解析2677项，每项恰一个result/retry0：**2674 passed、1 timedOut、2 failed；0 skipped/interrupted/flaky，report errors=[]**。JSON SHA为`9981a94931cc133937efcb231b374a3d8dbfc2cb93c4d54537d865da60bcfc27`；完整log为`c39d6110b34a1ffc5655754201912bae6f3992280541d1b893a64057ff8ffbd2`。直接调用纯checkFeatureCoverage读取同一JSON，1026/1026无错误，与feature-gate.log一致。三失败的file/title都不是1026条精确主绑定；例如FILL-036绑定1280px，失败的是390px变体。门禁职责不同，不是三失败被忽略成成功或全2677已过。

本次package-host42/42、package-embedding18/18、统计8/8、表格10/10同次通过，没有拼接短测或重试。Playwright在unexpected failure后自动更换worker/browser，parallelIndex仍0：统计实际worker27706/browser27709，表格48167/48168。CLI持续96.8min不等于两个输入点均经历96.8min同一browser/renderer，不能据此证明排除了attempt2的寿命/前序条件。

冻结08:12:54.712Z与结束09:50:51.407Z均6275项、aggregate `47875ea8a03292ff73169391d9a1a848fd8022553cdb3a16fb5fac60224d0b90`、changed:[]。独立重算开始aggregate、逐份读取当前6275内容，零变化；preflight所列548份历史文件SHA/mtime也逐项全匹配，原报告34659字节前缀保持。旧attempt1/2/R1/R2未覆盖。preservation记录监测到的112个自有PID全部退出，5191/5193无监听；process-audit是自有进程周期快照，不冒充每次renderer创建的完整记录，没有干预外部进程。

### Important I2：完整门禁仍失败，三项原因尚未确定

以下均直接读取原trace.zip的test.trace及浏览器API轨迹，与独立failure审计/原JSON一致；三个spec都未接诊断、没有观测文件/profile，没有Diagnostic profile cleanup或自有页销毁证据。不能把它们归为本次诊断兜底关闭，也不能排除运行环境扰动后直接宣称产品根因。

| 本次失败 | 原始事实与不能越过的结论 |
|---|---|
| 108：advanced-formatting/lifecycle.spec.ts:29，390px wildcard/display-text下载重开 | timedOut，35353ms。下载/重开、三格高亮及Undo disabled已成功，末尾go(A1)碰整例30s期限；Reference fill底层112.316ms/测试层153.510ms，不能称fill卡30s。After Hooks先于后续Go/断言收尾开始，context关闭后toHaveCount收到undefined，不是已证格式持久化错误或已确定负载原因。 |
| 484：editing/fill-handle-horizontal.spec.ts:7，390px向左填充 | failed，6751ms；Name box约5.044s、14次为D71:D75而非C71:D71。hover/down、scrollIntoView、取box、move(204,720)、preview、up均完成；后续值/underline/Undo断言未到。trace没有序列化box返回值，不能虚称已有该几何实测，也不能仅凭坐标判定测试或产品责任。 |
| 2187：workbook/freeze-cross-features.spec.ts:66，冻结带内插入 | failed，5974ms。Freeze selection、Select row2 click、insert-rows均返回，最后selectOption8.394ms；冻结rows期望4却13次为3，5.006s断言失败，Undo未到。末态row5 pressed不足以证明中间选择如何改变或哪层错误；需要实际选区/插入范围事实。 |

这是原I2验收7阻断的本次新事实，不因1026主绑定全过降为Minor。没有确切证据把三失败归为已证生产缺陷、已证测试坐标问题或已证负载；也未把attempt2原两处短期未复现写成修复。无新增Critical，I2仍为未关闭Important；I1已关闭、M2已关闭，M1仍为已接受非阻断样式限制。

### 18例诊断、原输入覆盖与缺失

直接解析18份cpuprofile、result JSON及原JSONL：全部stopped/cleanupConfirmed、每例唯一stop，samples/timeDeltas长度一致且sample node有效，各profile SHA与profiles-audit匹配；实际CPU窗口995.806–1898.156ms，没有deadline/destroy/page-close/pageerror/crash，observer无遗留RPC、drop0。没有直接诊断诱发失败记录，不等于零扰动或长停顿必能取栈。

| 原attempt2挂点在本次的证据 | STAT-019 case首个A93 fill | TABLE-036公式栏Enter |
|---|---|---|
| 同次结果 / CPU profile | passed1541ms；1169.782ms/377 samples | passed1629ms；1257.089ms/351 samples |
| start ack→stop发出UTC | 09:32:37.701→38.810 | 09:44:05.135→06.326 |
| 原页面事件映射UTC | 第二个Name box input为38.525 | input05.732、Enter05.757 |
| 边界余量 | ack后824.2ms，stop前284.8ms | Enter在ack后622.3ms，stop前568.7ms |

映射依据页面原始timeOrigin+pageMs，不是Node批次到达时刻；统计入口对应第二次Name box input是按未改beforeEach/case顺序推断，未读取内容。17个单导航例的146个input/Enter均落ack→stop边界；仍含同机时钟、分辨率与传输不确定性，不是逐CPU样本因果对齐。

统计show/hide例有两个timeOrigin/reload，命令wall区间2833ms但CPU窗仅995.806ms。其9个旧文档事件虽落wall边界，**CPU覆盖仍为UNKNOWN**，不能称18例所有输入都有栈；作者已在profile-window-limitations及最终报告明确保留。原两个挂点各单导航，不受此reload限制，但本次没有原30s停顿，历史根因仍未知。

### 最小下一必要证据（仅交接，不执行）

先分别利用现有三份trace定位缺口，再由根明确授权最小定向，不能先改断言、放宽30s或盲跑第四full：108需要累计动作时间与Node/协议/收尾分界，区分预算耗尽和具体步骤迟滞；484需要拖拽时真实box、滚动前后几何及move命中位置，当前未序列化的box不能靠猜测补写；2187需要row2点击后实际选区、insert-rows实际范围/原生结果与冻结边界前后事实，区分命中、命令与投影。若证据指向生产再交原所有者，不由独审猜测修产品。

attempt3最终回执：`REJECTED / 未完成`，I2/验收7/PKG-13仍开。授权执行与证据收尾完成不等于产品验收完成；没有commit/push、应用版本、远端CI执行或npm发布，不能宣称具备发布条件。

## 三项交叉回归首轮独审

本轮定向收敛：`APPROVED_WITH_CONCERNS`；**总004仍`REJECTED / 未完成`，I2/验收7/PKG-13未关闭**。已读任务末节、index裁决及作者495行起正式追加，按base范围diff与6275候选实际delta审查七路径；只读解析原JSON/log/trace/附件及指纹，没有运行测试、浏览器、构建或pack。继续应用React/feature-wave与one-file-one-thing规则，learn-project保持暂停。六份源/测试文件106/50/122/80/112/127行，各自职责内聚且均≤300；未增加框架、依赖或生产状态。

### 逐条核对

| 交接项 | 判定与独立证据 |
|---|---|
| 冻结：真实错误身份与最小产品修复 | ✅ 直接解码attempt3 #2187原trace的增量DOM快照，不仅采信末态：locator日志先解析`Select row 2`；4955853.637的action target已是普通`.row-headers`内row5，另一个冻结row2没有target标记；4955909.998插入前Name box为A5:P5。GridHeading按当前index发selectGridHeaderAtom，结构命令读取range.rowStart；at4不小于冻结带3时Rust保持3符合原规则，无需改Core/Rust。产品仅普通行key由slot index改真实rowStart+index及中文解释。 |
| 冻结：有效红绿与原DOM入口 | ✅ 旧key单测4过/1败，失败恰为离窗row2仍isConnected；新key最终两文件15/15，断言同时要求row2断开、重叠row5仍为同节点且label不变，不是只查新文案。最终E2E仍用原全局`getByRole('button', {name:'Select row 2', exact:true})`，新增A2:P2后保留rows4、Undo回3及原值；没有冻结专用selector绕过。后置key-browser自然3/3，trace内spec SHA与当前源码完全一致。 |
| 填充：边缘条件事实与未弱化断言 | ✅ 原#484 trace显示scrollTop1481→1491→1551→1591，preview横227×28转纵120×128，最终D71:D75。新原动作附件实测目标中心y720、滚动区bottom734，仅14px，处于现有48px自动滚动区；短成功样本也滚动10px。单次条件实验真实按住，仅等待scrollTop增长>84，最终D71:D81失败；不是sleep或伪造Core结果。最终仅left在按下前用真实wheel(0,168)移离底边并断言距离>48，right保留原动作。原范围、目标/源值、underline、邻格、Undo/Redo断言全保留，30s/expect/retry未放宽。 |
| 格式：只收敛非被测定位 | ✅ 直接读#108旧trace确认新簿等待3842.570ms、重开2587.459ms及多次Go/保存累计，末尾Go约在整例30042ms发出，不能当单次fill卡30s或已证格式丢失。仅持久化case的A1:A2、A3、A1三次跳转换既有Name box DOM helper；start/numberFormat仍走Go to，共用support.ts未变。下载规则、无format_input、重开高亮、Undo disabled、原值0.5、General清理与邻格断言不丢。原样case26059ms、收敛后22686ms，仅为本次结果，不是性能基准或慢因已解。 |
| 类型与登记门禁 | ✅ ProfileResult逆向移除唯一`export`后SHA精确恢复R2原文件ba2660a…e18a2，采样运行逻辑不变。正式原package typecheck最终自然exit0见`cross-regression-r1-typecheck-final.log`/final-audit session27640；较早typecheck-verified.log实际exact参数exit2和declaration=false诊断没有冒充门禁。最终锚定name正则语义相同且15项复验通过。七路径原规则lint退出0；1026登记检查退出0，仅FREEZE-003说明更新，ID及精确主绑定未改，不等于1026次浏览器通过。 |

### 有界运行、失败保留与输入分期

独立解析9份Playwright JSON：各结果恰一次、retry0、workers1、timeout30000，0skip/flaky、report errors=[]；并核对自然日志终态。三个baseline trace内原spec内容SHA均与preflight/旧冻结一致，确为先按原样各执行一次。observed两组通过只补现场，不拿未复现代替原因证据。

| 阶段 | 原始结果与用途 |
|---|---|
| baseline-format/fill/freeze | 各1/1；格式原样26.059s，另外两项未在短基线复现。 |
| observed-fill/freeze | 各1/1；DOM附件分别记录边缘滚动及正确A2:P2→rows4。 |
| edge-fill | 0/1、D71:D81；受控条件实验失败独立保留，不算产品回归通过。 |
| fixed-fill-freeze | 4过/1超时；首版错误推广预定位到right390导致handle hover超时，原JSON/trace保留，未改写成产品问题。 |
| final（key修复前） | 6/6，32.718s；格式390、填充四变体、冻结插入。最终格式/填充与trace内源副本仅中文注释/换行/尾逗号差异，人工diff及parser结构审计一致，复用本次行为证据。 |
| key-browser（key修复后） | 3/3，7.444s；全局row2冻结插入、桌面/窄屏冻结、FREEZE-003键盘与Undo。它才是新产品key的浏览器证据。 |

首阶段从10:07:53.783Z至final结束共486.715s，补充阶段7.444s，分别低于600s/300s授权；九组执行时长合计126.087s、相邻时间不重叠。两阶段输入不同，不能拼成一次全量成功。资源账本列明已知自有PID退出、5191/5193无监听；其余launcher未逐个实时记录的限制如实保留，未虚造PID或操作外部进程。

独立重读6275份冻结清单对应内容：恰七项改变、其他6268项不变，当前aggregate为`8b32cfb30ebd2ea5c8a6ead27a51e19e838f1ca5e05eb583ef5a7192b15fad07`，与delta精确一致，不称旧freeze仍零差异。七项为上述三spec、GridHeaders、header-selection.test、FEATURES、ProfileResult导出；没有新Git输入或遗留临时观测接线。548份旧证据SHA/ISO mtime逐项不变，attempt3索引71项及本轮final-audit的80项SHA全部匹配。作者旧43439字节前缀仍为`a02f8c8aaf689fff32b5aba1df04df9672ba53cbfe6e35fda281ba603a181e4d`，正式报告仅追加；本review旧前缀亦保留。

### 质量发现与剩余门禁

Critical：无新增。Important：无新增实现缺陷；**既有I2继续开放**。本轮确认并局部修复了行头身份风险，明确了填充测试混入自动滚动与格式累计预算耗尽，但不是历史两处30s输入停顿的产品归因。Minor：无新增；M1既有打包器样式一致性限制不变，不进当前修复循环。

❌ 总004/验收7/PKG-13仍缺当前候选的完整成功与更新后的发行物验收。React dist、五tarball、消费者生产页面等实物仍保持旧hash，**不含本次行key修复**；旧包42/18、完整6496及旧构建只能代表此前输入，不能冒充新源码发行证明。attempt3原2674/2677失败记录及历史挂点未知事实不变。下一步若根另行授权，应先安排当前候选实物整合与相应验收，再按同一冻结候选的自然完整结果裁决；本轮审查不启动新build/pack/full、不放宽预算、不自动发布。

本轮回执：`APPROVED_WITH_CONCERNS`（三项定向收敛成立）；总004仍`REJECTED / 未完成`，I2 open。无commit/push/应用版本、远端CI成功或npm发布声明。

## React 18 当前候选实物整合独审（2026-10-23）

本轮包级交付：`APPROVED_WITH_CONCERNS`；**总004仍`REJECTED / 未完成`，I2/验收7/PKG-13保持开放**。已读当前index、任务末节及作者551行起正式报告，使用本轮base `dcc7ebc3b1c92614f30e522893f8393bd4f54eb6`审范围diff与新增文件，只读核对新目录`react18-candidate-r1/`的原始证据；未运行测试、浏览器、构建、pack或修改作者报告，仅追加本节。复用已审001–003及未变原生证据，不重审历史架构/非阻断M1；按既有React、feature-wave、one-file-one-thing规则检查本轮边界，learn-project继续暂停。

| 本轮验收 | 判定与证据 |
|---|---|
| 1–3. 最小范围与新证据目录 | ✅ 三脚本仅将evidence统一改为仓库根下`path.resolve(root, env || default)`，prepare日志/manifest、serve读取及freeze写入均使用该变量；未设置或空值保留原默认。新30行测试通过TypeScript AST取得三个脚本**实际initializer**再在VM执行，非复制选择逻辑，覆盖undefined/空值/相对/绝对目录；原始scripts-test.log为3/3。三脚本93/23/57行，lifecycle105行，未引入框架、依赖或产品逻辑。 |
| 4. 已修源码进入真实发行物 | ✅ 重新build:lib/artifact检查自然exit0。直接读取新tar中的index.js，普通row map的index与React key均为`e+n`，不再是slot `n`；所有非package.json的tar内容均与当前发行白名单文件逐字节一致，包括声明、CSS、Worker、许可证/NOTICE和发行说明。两份仓外安装JS也与tar逐字节一致，不只看root dist或汇总JSON。 |
| 4–5. 版本、严格安装与闭包 | ✅ mktemp `react-excel-packed-0Z3FTK`的既有Changesets staging产生React0.1.0与Core/styles/TS core/WASM0.2.0，工作区版本及pending计划未改。两份原始install日志均为`--strict-peer-deps`自然exit0；实际package-lock各只有React/ReactDOM18.3.1、Einfach core/react0.4.0，无link/私有cells/TS引擎回退。React的peer Core^0.2.0与真实包匹配。仓外配置无源码alias或消费侧宏插件配置，strict类型skipLibCheck:false与两种生产构建均过；Lingui传递依赖存在宏相关包不等于宿主需要宏构建插件。 |
| 5–6. 能区分旧key的真包DOM回归 | ✅ 新两例先保留row2/row5真实ElementHandle，冻结后要求row2断开、row5保持同节点及label，再用所属工作簿的全局row2入口点击，断言A2:T2、冻结带4/Undo回3、原值/邻实例/Worker live2及零错误。旧slot key会保留原row2节点并更改其行号，身份断言能明确拒绝它；没有force、Core dispatch或冻结专用selector。两份真实trace中的spec内容SHA与当前文件完全相同、无trace error。 |
| 6. 原42项与新2项同次成功 | ✅ 直接解析package-results.json并比较历史包场景精确标题：原42项无缺失，仅新增Vite/Rspack各一例；base diff也没有删改旧动作/断言。44项各恰一条passed/retry0，0skip/unexpected/flaky、errors=[]；单worker、原30s、global600s，OBSERVE/PROFILE关闭。独立执行54.173s，不混入旧嵌入18项或demo结果。 |
| 7. 静态、构件复用与保护 | ✅ 原package typecheck、artifact检查、相关原规则lint、脚本node-check/3项单测及diff检查exit0证据齐。独立检查1930份Core/WASM复用构件SHA/mtime不变；另外四个新tar的实际SHA与旧包相同。保护记录覆盖8015个旧文件/链接、旧consumer/tarball，changed[]；抽核其中18份关键原始失败JSON/log/freeze、旧manifest/tarball的SHA/mtime均吻合，不再执行旧套件。 |
| 8. 报告、说明与最终边界 | ✅ 报告仅追加，原52680字节前缀SHA保持42f02cb5…672a2d。pack前发行说明同步历史attempt3、后续定向及本地提交/未push发布；包内“正在包验收”是生成时保守状态，没有冒称最终成功。结束后FEATURE_PROGRESS仅追加当前44/44及总门禁未过，后置docs-only delta明确不在freeze/包内，已打包release.md未变。没有新完整序列或外部插件改动。 |

### 同候选指纹与自然终态

新React tarball SHA为`ba1f2bbe664144295cdd417e4546caa0c80de2ba7c7e9111321b3f1343068438`；独立重算五个tar SHA均吻合manifest。React tar与旧e9b8a442…84969不同，真实行key缺口已闭合，不能再沿用上一节“新实物尚无修复”的当前状态；该旧节仍是当时事实。

唯一包级session44817于02:25:17.192Z开始，54172.546ms后自然exit0，原log明确44 passed；JSON SHA为`94780a6a3450d2e8b43dba6f417a27b52b93c5977f844e1e1810f484b71c3400`。开始02:25:05.057Z与结束02:26:29.053Z均6276项、aggregate `aca47bd9297b96dafe25c9893d84f48dae686d103017eefcdae04844526f6761`、changed[]；独立读取当前全部6276内容重算同值，六项运行源码/说明快照也相符。新manifest明确指向新mktemp消费者，未误读旧consumers.json。

正式final-audit索引89份本轮文件，逐项SHA全部匹配；作者报告完整SHA及旧前缀与索引一致。cleanup记录本轮自有launcher77466、Playwright77474、server77509、worker77510、browser77511均退出，5191/5193无监听；未操作其他任务进程。命令时间按日志边界与内层真实UTC分开记录，不伪造精确退出时刻。

质量发现：无新增Critical/Important/Minor。原Important I2仍未关闭：本轮仅证明当前React18发行物及44项包级闭环，**没有当前候选最终单次完整成功**，不抵消attempt3的三项失败，也不解释历史两处30s输入挂点。既有M1保持接受的样式一致性限制，不宣称pixel parity。历史原生/构建/单测与源demo证据按未变范围复用，不混成新包全量证明。

本轮回执：`APPROVED_WITH_CONCERNS`（当前实物整合/包级验收通过）；总004/I2/验收7仍未完成、不可发布。此前本地分批提交事实不变，本轮未commit/push、应用工作区版本、执行远端CI或npm发布；下一完整门禁仍须根明确安排，独审未自动启动。

## 最终同候选完整门禁独审（2026-10-23）

本轮回执：`APPROVED_WITH_CONCERNS`。**当前候选的最终完整E2E及同JSON功能门禁通过，原Important I2按其“最终单次完整E2E及同JSON功能结果门禁未通过”的定义关闭，验收7/PKG-13的本地完整回归缺口关闭。历史两处输入长停顿根因仍unknown，用户要求的卡顿定位修复未被证实完成。** 两个结论分别成立，不能把本轮未复现、无触发或全绿写成历史原因已修，也不能据此宣称用户三个收尾目标全部完成。

已读恢复独审边界、index当前交接、作者577行起正式收尾及原I2定义；静态核对已提交`e64fcb5e`、`c1cac1be`与未提交文档，复用已审React18实物及未变原生证据。全过程未启动测试、浏览器、构建、打包或采样，未改产品、作者报告或任务状态，仅在原56044字节审查前缀后追加本节。该前缀SHA仍为`9e77a640f3da4e227b3438fb3ef15b9043c36684bad9bb0131dcfebf3af94318`。

### 原过程、完整结果与逐项功能证据

唯一完整过程为controller15306、launcher15309/Playwright15310、watcher15307；`full-start.json`记录05:48:33.854Z启动，`full-status.json`记录07:24:07.145Z自然code0/signal null、watcher code0。恢复记录延续同PID/PGID及原日志，没有因agent服务重启另开完整过程。实际CLI使用默认config、workers1、retries0、repeatEach1、原30000ms，CI未设；没有grep、shard、skip或放宽预算。

独立解析原`final-closeout-r1/full-results.json`，并将启动`full-list.log`的文件、行列与完整嵌套标题逐项按重数比较：**2679项/370文件完全一致，无遗漏或替换；每项恰一个passed result/retry0，expectedStatus均passed，0失败/跳过/interrupted/flaky，report errors=[]**。JSON开始05:48:34.273Z、耗时5732742.036ms（95.5457min）。实际先后workerIndex0/1，单一CLI不能外推为全部用例同一寿命浏览器。

- JSON SHA256：`c764bc2a5d89bdd6f02ebb7e770b7f3f25720e17d3542aa5c5b22907d050d8e1`；完整日志SHA256：`28bfb53612b7df7c8c5e6ff28d3b396cafbea6c2b0c6b6ea58019392125842c3`，日志自然终态为2679 passed。
- 按当前FEATURES逐行独立匹配该JSON的精确file/title：1026个唯一ID、1026个唯一主绑定，各恰一个匹配且单次成功，和原`features-result-gate.log`的1026/1026一致；不是只读取总数或把登记检查当浏览器结果。
- 真实包44项与源demo嵌入18项均在该次完整JSON中通过。按包配置的相对根补齐`package-host/`后，新候选原44个精确标题全部匹配，没有拿此前54.173s包级运行或旧18项相加替代完整序列。
- 历史attempt3的390px格式下载重开、向左填充、冻结带内插入，在本次分别单次passed22194ms、1418ms、1081ms。STAT-019与TABLE-036分别单次passed1507ms、1675ms；历史失败JSON/log/trace仍保留，没有改写旧结论。

### 同候选实物、冻结与证据保护

启动冻结05:45:15.527Z与结束verify07:24:28.950Z均为6276项、aggregate `f31481b8c7515224189c67159f63fa38e9323e4368539add71477ec681373efa`，结束changed[]。独立重算清单aggregate并在终态后逐份读取全部6276内容，均匹配；相对已审React18候选6276项，唯一SHA变化是CI显式full WASM构建，其他6275项一致。`e64fcb5e`仅收录既审目录隔离与真实包行头回归；`c1cac1be`仅在两个Node矩阵Vitest前新增既有full构建命令，502签名断言和真实full导入未弱化。原`core-layout-results.json`为5/5，属于完整启动前的既有本地证据；远端clean CI是否通过须以后续push的精确SHA结果为准。

本轮复制manifest与`react18-candidate-r1/consumers.json`逐字节相同，五份真实tarball逐份SHA匹配冻结；React tgz仍为`ba1f2bbe664144295cdd417e4546caa0c80de2ba7c7e9111321b3f1343068438`。Vite/Rspack安装的实际JS均与tar内dist/index.js逐字节相同，SHA为`513ad7da10929e057177956fbb991c6e9d686dc4384d779669014fb9420a15d4`；两份安装锁均为React/ReactDOM18.3.1、Einfach core/react0.4.0。最新真实行key仍在同一发行物中，没有新产品输入或外部插件改动。

独立读取1439个旧证据对象（352406207字节），SHA、大小及mtime与preflight一致；旧作者报告57124字节前缀SHA保持`170446d94725389cfd808b61c23f9dff74ede111f9b193a843fd3a8891bb63d5`。初版派生审计的e2e路径前缀造成空组、秒转毫秒造成浮点假差异，均非原始结果/证据变化；初版已另存且SHA匹配，修正后的审计为真实44/18、preservation.changed[]，与本次直接解析一致。

### 卡顿结论与观测边界

直接重读attempt2原trace：STAT的A93 fill停在visible/enabled/editable等待，无底层after；TABLE的底层fill34.636ms成功，外层约3008.8ms后才收尾，后续press底层开始至首个locator等待又约3011.9ms，未见locator成功解析或Enter实际键动作。该事实收窄了旧挂点，但不能归因为表格提交业务、特定renderer/Worker循环或已证环境负载；本轮没有有证据的历史卡顿产品修复。

一次性watcher的实际SHA与启动记录一致（`14a3f571fe3442c32aab4e3ef3adb6b3468f3ed4700cef64659b1f48731f84f7`），仅针对原两症状目录；有明确worker→browser→renderer所有权检查，最多2次触发×2个renderer、单sample期限15s/每触发20s，页面到renderer映射明确unknown且可能含spare。最终事件只有watch-start/watch-end、triggers0，本轮没有症状采样栈。首次自有Node能力检查6s无有效栈与后续去掉-mayDie的不同条件1.431s/75132字节成功自检均保留；两者都不是产品复现。

独立解析18份原observer JSONL：各start/end单次、rpcStillPending=false，无pageerror/crash/page-close或Profiler动作；最大Node gap286.600ms、页面454.8ms、到达1114.080ms。原两case均drop0，记录的node15366/browser15367一致。PROFILE=0，原18项之外2661项没有该观测；没有诊断失败记录不证明零扰动。无预设症状触发及两case通过只说明本轮未复现，**历史卡顿根因与修复仍未证实，是用户第一项要求的真实遗留**。

### 文档、清理与最终边界

作者终态资源证据为PGID15306无存活、5191/5193均lsof exit1/空输出，watcher自然退出且18份observer均已收尾，没有后台验收或误停他人过程。终态后两份普通Markdown状态更新与`docs-postrun-delta.json`一致，明确排除在执行freeze之外；React tar内release.md仍是打包时4056字节/SHA `e515f0b815f3d6946fe8a61a7b6df4c028b54cb0c879809a0107ed7691ebafae`，未包含新状态文字。当前说明与包内快照的边界已明示，未为docs-only变化重建或冒称包内文档已刷新。

质量发现：无新增Critical/Important/Minor；原I2的完整门禁阻断关闭，M1工具栏字号差异仍是已接受非阻断限制。**本地004候选完整验收通过；用户历史卡顿定位修复尚未完成，根的提交推送及精确SHA远端CI仍须按各自真实结果收尾。** 根在完整前已有e64fcb5e/c1cac1be两批正常提交；本审查及执行者未提交/推送。未应用工作区Changesets、未发布npm、未修改外部excel-plugin，不作所有用户目标已完成或已发布声明。
