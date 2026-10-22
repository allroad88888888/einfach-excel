---
id: '004'
title: 打包产物通过独立消费者验收并具备发布条件
kind: leaf
parent: null
depends_on: ['001','002','003']
model: gpt-6.1-sol
status: running
created: 2026-10-22
done: null
base: 08caefbce8cb4934ceea4f0c26115d910569a47c
files:
  - excel/react-excel/package.json
  - excel/react-excel/README.md
  - excel/react-excel/LICENSE
  - excel/react-excel/NOTICE
  - excel/react-excel/FEATURE_PROGRESS.md
  - excel/react-excel/docs/package/**
  - excel/react-excel/e2e/FEATURES.md
  - excel/react-excel/e2e/package-host/**
  - excel/react-excel/package-consumers/**
  - excel/react-excel/scripts/**
  - excel/react-excel/playwright.package.config.ts
  - excel/react-excel/playwright.config.ts
  - excel/react-excel/playwright.input-stall.config.ts
  - excel/react-excel/e2e/support/input-stall*
  - excel/react-excel/e2e/selection/statistics-actions.spec.ts
  - excel/react-excel/e2e/workbook/table-dialog.spec.ts
  - excel/react-excel/e2e/advanced-formatting/lifecycle.spec.ts
  - excel/react-excel/e2e/advanced-formatting/support.ts
  - excel/react-excel/e2e/editing/fill-handle-horizontal.spec.ts
  - excel/react-excel/e2e/workbook/freeze-cross-features.spec.ts
  - excel/react-excel/src/workbook/grid/viewport/GridHeaders.tsx
  - excel/react-excel/test/workbook/selection/header-selection.test.tsx
  - excel/react-excel/test/package/**
  - excel/spreadsheet-ui-core/package.json
  - excel/spreadsheet-ui-styles/package.json
  - excel/excel-core-ts/package.json
  - excel/excel-wasm/package.json
  - excel/**/CHANGELOG.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - .changeset/**
  - .github/workflows/ci.yml
  - .github/workflows/publish.yml
  - .gitignore
  - scripts/*package*.mjs
  - scripts/check-react-e2e-features.mjs
  - scripts/check-presentation-boundary.mjs
  - scripts/check-presentation-boundary.test.mjs
---

# 打包产物通过独立消费者验收并具备发布条件

## 目标与交付边界

独立于实现的风险验收：真实pack→仓库外临时消费者安装→Vite/Rspack构建→真实Worker/WASM Playwright操作；同时闭合发布构建、依赖版本/声明/资源/文档，不实际发布。
不得在消费测试中用源码alias/link来绕过发行产物；发现001/002/003缺陷交回原作者，不悄悄替换实现或绕过测试。

## 上下文与接口

- 必须读取本树reports/001-report.md、001-review.md、002-report.md（尤其R1末节）、002-review.md（当前R1判定）、003-report.md（尤其R1末节）、003-review.md。001/002/003均已独审APPROVED，当前候选全在工作区、HEAD仍为base；不要重做已审实现或复跑未变叶的定向验证。原证据只验证旧WASM或native，不能当本任务产物闭环。
- 消费001公开Spreadsheet/Providers/style.css和worker工厂；消费002 locale/I18n/renderer与隔离；消费003 readWorkbookRangesAtom/writeWorkbookCellsAtom/workbookChangeAtom/hostControlsAtom/configureHostControlsAtom。
- 根 `build:publish` 当前只编译Core/TS core并rollup；`release:publish` 为pnpm递归发布（正确重写workspace依赖）；已有Changesets+publish workflow，不再造发布系统。
- 发行版本必须一致：当前React候选peer Core^0.1.0仅对应基线，不能宣称旧0.1.0已有本轮host API。现有两份未应用changeset已要求Core/styles minor，且四包fixed；不要覆盖旧changeset或随意把Core写成0.1.1。读取现有发布计划，准备本轮changeset，检查React最小peer包含真正提供新契约的发行版；真实tarball测试按同一预期版本staging（可在临时副本运行既有version流程，报告清楚源码与模拟发行元数据的区别）。不得以legacy-peer-deps/关闭peer检查掩盖版本不匹配。
- 发布保护：publish.yml已确认主分支有pending changeset时只开Version PR，无pending时会直接publish。不得在当前工作区消费旧changesets或批量应用版本，避免未来一次普通push变成未经批准发布。React可准备public配置/新changeset，但保留既有待发计划；最终明确版本PR/合并与真正npm发布尚待另行授权。安装验证完成不等于已经发布。
- Core已存在 `scripts/verify-package-artifact.mjs`，只验证Core tarball布局，不证明React消费闭环。
- 原功能登记门禁只识别 `ABC-001` 形式ID（不要直接使用001报告建议的多段PKG-EMBED-01），并从默认Playwright config采集 `e2e/` 全部spec。新增消费者测试须在正式完整运行中可执行；不得让默认采集找到、实际运行却因专属server/config缺失失败，也不得把两个半份报告合成一次全绿。需要调整验证脚本/配置时先明确真实运行和包级独立命令的分工，保留原998项可执行。
- JS/声明/CSS/Worker/WASM以实际打包列表为准，不把dist存在视为成功。
- 真正导入任意业务表格式不是本轮职责：消费者使用RustWorkbookDefinition和既有.einfach.json内存文本，插件后续转换业务格式。
- 仓库根package/license及根LICENSE已为MIT；当前React tarball无LICENSE且package未声明license。004沿用既有仓库授权、随包提供原许可证，保留被内联依赖的必要第三方声明；不自行选择新许可证。

## 覆盖矩阵行

PKG-11、PKG-12、PKG-13；独立核验PKG-01至PKG-10已有证据，不直接依据实现者自报done。

## 验收标准

1. pnpm pack相关发行包，临时目录必须mktemp创建，安装的是tarball/真实registry依赖；不能依赖工作区node_modules、源码alias或私有未发布包。消费者不安装Rust工具链/本仓宏插件。
2. Vite、Rspack各有可续跑最小消费fixture与命令，真实浏览器零模块/Worker/WASM加载错误，编辑/切表/卸载工作；自定义workerFactory入口实际调用。
3. 千行多Sheet初始装载→UI编辑/外部粘贴/清除/填充/撤销重做→事件实际范围→typed增量读取正确（不受数字显示格式影响）；跨表剪切包括源、目标与重写公式位置。失败/noop/import/refresh/重算不误记dirty。
4. busy/readOnly/结构策略通过实际键盘、粘贴、工具栏入口证明被拒；native允许区仍按原规则生效。测试不是只手动调用Core命令。
5. 同页两实例不同Store/不同语言，宿主样式滚动不受影响；卸载与失败恢复不泄漏Worker，旧结果不污染新簿。
6. 汇总新用户行为到原FEATURES表，不删除旧998登记操作及已有E2E；包消费者E2E可独立登记自己的宿主契约，不冒充原演示站入口。
7. 根静态门禁、完整Vitest、build、Core/React类型通过；受Rust变更影响的default/lite/WASM/API检查通过；按feature-wave技能跑最终单次完整React E2E及新包场景，冻结源码，记录自然退出结果，不合并多次报告冒充全绿。
8. 首版browser React18 ESM兼容范围、安装/样式/worker/Store/locale/原始值与事件说明、限制、升级策略、licenses与发布清单明确。准备Changeset/预览版本，不运行publish/commit/push。

## 验证成本与产物

- 执行者负责一次最终整体检查，保存原始日志/Playwright JSON/截图到忽略目录`.codex-artifacts/`；报告记录命令、起止、总数、失败与输入hash，不能只给口头结果。
- 完整E2E较长，先完成新包/相关域定向失败修复，再冻结输入跑一次全量。运行期间持续报告状态，禁止边改源码边统计测试。
- 冻结代码开始最后完整E2E时立即回短消息给编排者，附冻结指纹/产物与日志路径；独立最终审查可在只读静态范围并行，不改变运行输入。当前库JS/CSS/旧Worker均可被本任务最终重建替代，旧dist不是发行证据。
- 不能用failOnMissing=false、跳过用例、test.only、隐藏错误、伪造native替身让消费验收变绿。
- npm发布需要用户另行授权；CI本地配置通过不代表远端workflow已成功，禁止替用户推送验证。

## 执行记录

- 2026-10-22：001、002 R1、003 R1均独审APPROVED，依赖已done，立即派发；消费当前已修工作区。Core host真实产物未建、版本保护/原pending changesets须保留。禁止commit/push/npm发布；本叶须实际验收后才能宣告具备发布条件。
- 整合发现：旧Rollup自动把有main+module+src/index的React当成多格式库并清理dist。裁决在本叶metadata范围移除ESM-only React冗余module，保留type/main/exports，根build:publish显式build:lib，不扩rollup配置/复制扫描。最终root build和真实consumer验证该边界。
- 整合发现：旧presentation门禁把仅类型WorkerLike导入和新发行Worker装配入口误报为React越层。扩大本叶files仅至该门禁及其就近测试；精确允许Provider/默认工厂的WorkerLike类型引用、src/worker/workbook.worker.ts的Core rust-runtime纯装配，保留React运行时RPC、连接atom/Store直读写禁令。必须补正反测试（纯类型可过、运行时传输仍拒、其他视图import runtime仍拒），不能整目录排除或关闭门禁；不因此改已审产品。
- 收尾发现：build:demo新输出dist-demo未被原dist规则覆盖。扩files至.gitignore，只忽略/excel/react-excel/dist-demo/生成目录；源码/测试/文档与发行白名单仍可见，不把产物混入待提交改动。
- 2026-10-22终审：reports/004-review.md最终REJECTED/未完成，验收1–6、8成立，验收7及PKG-13未过。attempt2自然运行2675通过/2超时，同JSON主绑定1024/1026；结束及诊断后6268冻结输入均零差异。统计8+20、表格10+20次串行诊断全过，但原失败根因未知，不能拼接或标done。I1预算关闭，M1非阻断记录；I2保持未关闭。本叶仍running（交付未完成；所有进程已退出）。下一次恢复先取前置输入停顿时序/主线程证据，不盲目第三次full、扩大repeat、调超时或猜测修改产品；没有commit/push/npm发布。

## I2 回修 R1：输入停顿的有界观测与原因定位

用户已明确“好的按照计划 下一步”，授权继续既定定位；本轮不新增Excel功能、不修非阻断M1、不commit/push/publish。
现场核对原HEAD仍08caefbc、未完成候选完整保留；原浏览器验收进程已退出，pending后复派。

必须先读本任务报告/审查的终态及I2节（不是只看历史成功数字），保留所有attempt1/2及58次诊断JSON/log/trace。
已知失败入口为统计文件第94行`select('A93')`的名称框fill，以及表格文件第15行公式栏press Enter。
原30s超时不变；静态snapshot均无disabled/readOnly/hidden，没有足够停顿栈证据，不能直接归产品/浏览器/负载。

### 本轮交付边界

1. 先列最小诊断文件及一句话职责，再实现测试侧可选观测；不得给React/UI Core/Rust生产链路添加状态、hook、原子或通用监控层。
2. 记录独立Node时钟/事件循环、页面心跳、focus/input/keydown/selectionchange时序、pageerror/crash、浏览器/renderer身份与资源事实。观测默认关闭，不收集工作区外页面，不读取敏感系统信息。
3. 在有停顿时尽力捕获CDP性能/主线程调用栈；记录采样的失败/缺失本身，不能以无frame推断根因，也不能让无界心跳RPC积压。正常交互只做低频观测；重profile限于短窗口/触发时。
4. 为观测做最小自检（可控短暂停顿与恢复），证明时间线确实记录到了停顿；这是假设验证，不得当作复现产品缺陷。
5. 原两份spec仅允许测试fixture/观测接线，不改测试标题、DOM行为、断言、数据、超时、retries或FEATURES。优先只加专用diagnostics config/runner；若需要额外确切路径，报告给根补范围，不随意编辑公共test fixture。
6. 本轮只做有界诊断，采样执行合计最多10分钟、workers1/retries0、仅这两个真实文件/原失败case；严禁第三次完整/全仓build/pack/6496单测。区分fresh-browser与同一browser进程两种条件，记录真实PID/连接身份，不能把repeat-each的新worker冒充同浏览器寿命。一次只运行一个浏览器诊断。
7. 有确切根因再给最小修复建议与证据；若指向生产源码，先交根回对应001/002/003原作者，不越界先改。若仍未复现，交付本轮新增观测证据、哪些假设已被排除/仍未知，保留I2与未完成状态；不再自行扩大重复/超时或盲跑全量。

普通诊断脚本可落`excel/react-excel/scripts/`，页面观测/fixture仅上述input-stall命名范围、单一职责≤300行，不新建诊断框架/依赖。
所有结果用新前缀`input-stall-r1-*`保存在忽略目录`.codex-artifacts/react-excel-package-004/`；不能覆盖已有freeze/JSON。
R1会改变诊断测试输入，旧6268零差异只属于旧候选；报告必须列本轮具体delta并核对生产源码/实物不变，不能声称所有新字节仍等于旧freeze。
只运行本轮诊断代码所需的局部类型/lint、自检及两域定向验证，报告命令/起止/进程/退出/观测开销与缺失，保持未变证据复用。
完整报告仅追加reports/004-report.md的I2 R1节；不得修改004-review.md。本轮先回DONE_WITH_CONCERNS或NEEDS_CONTEXT并明确I2是否有证据关闭。

### R1 执行回写

- 作者已回DONE_WITH_CONCERNS，正式报告仅追加004-report.md末节。单次有界runner于07:28:44.669Z→07:30:43.771Z自然exit0，119.103s；真实三组54/54通过，关闭检查1例/受控停顿自检1例另计，零skip/retry/flaky。复用两组同browser PID97264及同连接，但仅约72.8s寿命，不能等同原98min前序条件。
- 受控2200ms页面停顿记录2362.3ms页面gap与21.66ms Node ELD，时钟分离自检成立；Profiler.enable约701.8ms超时，无start/stop/profile，未建立停顿栈窗口。原两挂点未复现，未识别根因，不改产品或关闭I2，不运行第三full/重复采样。
- 输入核对恰两原spec import变化、5新测试诊断文件；其余旧6266项及全部生产源码/实物/tarball未变，新6273聚合4852de93…73a5b。原attempt1/2 JSON/log/freeze均保留。最终局部types/lint/node-check/diff均通过；额外config-lint首轮exit2及临时tsconfig下原规则exit0分别保留。自有runner/browser退出，5191/5193无监听。
- 已复用原004独审者，只读核验本轮边界/证据，不重跑或重建。004-review.md末节判本轮诊断APPROVED_WITH_CONCERNS，无新增Critical/Important；M2迟到Profiler.start收尾列潜在非阻断，不进入本轮修复循环。004整体与PKG-13仍REJECTED/未完成、I2未关闭，非发布通过；本轮已无执行进程，下一定位须先验证实际短取栈及失败收尾，再决定原失败条件捕获，不盲目扩重复/超时/full。

## I2 定位 R2：实际短取栈与确定收尾

用户“继续”授权执行上一轮明确的下一步。现场HEAD仍08caefbc、R1改动/证据保留；旧自有PID及5191监听均已消失，004重置pending后复派原作者。不是新功能叶，也不是因Minor单独开启修复循环：本轮交付是消除I2原因定位所缺的实际取栈能力，M2与其同一内聚失败路径一起验证。

### 已知缺口与读取范围

- 先读004-report.md的I2 R1末节及004-review.md的I2 R1复审，不重做001–003或旧完整验收。
- R1触发时Profiler.enable约701.8ms超时，没有start/stop/profile。不能靠再跑54项证明栈能力；要用已知同步阻塞的受控页验证。
- M2：若start迟到，stop可能被共享one-in-flight跳过，导致采样直到页面销毁；本轮必须证明实际结束/断开收尾，不把超时当取消。

### 实现与验收边界

1. 开工先回最小文件清单/一句话职责，以及短采样和迟到请求收尾的具体方案。优先改既有测试文件，最多按实际职责补一个取栈模块及一个就近测试，不造通用RPC/重试/监控框架或新依赖。普通文件≤300行。
2. 只允许excel/react-excel/e2e/support/input-stall*、scripts/input-stall*、playwright.input-stall.config.ts及test/package/input-stall*.test.ts；原两spec最多保留已有fixture接线，不改原动作/数据/标题/断言/30s超时/重试/FEATURES。不改生产、WASM、dist、消费者、metadata、构建或其他演示。
3. 用本地现有协议类型/实现和必要时官方协议资料确认方案。实际验证一段命名的已知同步JS阻塞，持久化可解析CPU profile/trace，明确实际开始/结束时间和采样栈（必须命中该已知函数，不仅是gap或非空文件）。该验证绝不是产品缺陷复现。
4. 受控单次采样窗口目标≤5s，明确CPU采样在阻塞前何时启动、为什么不依赖卡住后才处理的enable请求；默认关闭仍无观测/采样。避免主动Debugger.pause/resume，不悄悄对原用例全程持续高频profile或改变UI行为。
5. 为成功、迟到start、start拒绝、未返回/销毁等实际适用路径补最小测试侧单测，证明不会漏停/无界RPC积压、不会遗留暂停/采样影响后续输入。测试替身只限诊断协议单测，不替代真实浏览器取栈和Rust功能验证。
6. 修改后先局部类型/lint/诊断单测，再一次受控浏览器自检；所有本轮浏览器执行合计最多5min、单浏览器串行、retries0。若实际取栈自检成功，可在同一预算内只各运行两个原失败case一次（另默认关闭检查至多1例），记录清楚每例是否实际profiling及窗口；不再重复两整文件/54项，不启动完整E2E/build/pack/6496单测。
7. 如果简单方案经自检仍无法实际取栈，保留第一失败和限制，给明确的下一必要证据/是否需要更高成本，不自行多方案反复试验、扩大次数/超时或宣称原缺陷修好。有原失败且能明确归生产，再回根交原所有者，不能猜测改产品。
8. 所有证据用新input-stall-r2-*前缀，保留原attempt1/2和R1原始记录及旧报告前缀。先记录R1候选6273输入，结束逐键列R2 delta、旧6268中两import的原约束和生产/实物不变；源码变后不能复用旧诊断SHA冒称已验新逻辑。
9. 只追加004-report.md的I2 R2节，记录确切命令/UTC/自然退出/进程清理、profile命中和失败收尾证据、验证成本及仍未知；不修改审查报告。返回DONE_WITH_CONCERNS或NEEDS_CONTEXT。总004和I2不得因受控取栈成功关闭；仍须真正定位原挂点及最终验收。

本轮仍不commit/push/publish、不应用版本或触碰项目外代码。不改非阻断M1；学习项目继续暂停。

### R2 方案裁决

- 作者最小清单获准：新增support/input-stall-profile.ts（一次短CPU采样确定收尾）与test/package/input-stall-profile.test.ts（同一诊断路径的失败分支验证）；只改既有observer/fixture/诊断runner必要接线，页面探针和原两spec不改。
- 先在独立CDP会话enable→setSamplingInterval(5000us)→start得到ack，再执行命名受控阻塞，避免等待卡住后的enable；用stop返回的真实profile时间戳/样本命中断言，不以Node计时或文件非空替代。profile收尾不复用资源RPC的one-in-flight gate，迟到start必须唯一stop；绝对期限仍无法确认结束则只销毁自有诊断target并记诊断失败，不能算产品crash/通过，不继续下一case。
- 原两case短窗口必须明确相对导航/实际挂点是否覆盖；若只捕获load或跨导航重置，保留限制，不为对准造新层或改变原动作。自检第一次失败即保留退出，不换方案继续试。

### R2 独审交接要求

作者收尾后复用原004-reviewer，先读本节、004-report.md的R2追加和R1的M2原发现，再只审R2范围delta与input-stall-r2-*证据。复用作者局部验证，不亲验重跑/重建/取栈。逐条核对：实际profile时间窗及命名阻塞函数被sample命中；迟到/拒绝/未返回/销毁路径与唯一停止；默认关闭/原spec不变；真实case窗口对输入点的实际覆盖及缺失；旧证据保护/生产实物不变/自有进程清理。只追加004-review.md的R2复审，分清R2诊断交付和总004/I2的判定；没有原失败归因和最终完整成功证据，不得关闭I2或标可发布。

### R2 执行回写

- 作者DONE_WITH_CONCERNS，004-report.md已追加R2，旧27871字节前缀保持。原5文件静态稳定后唯一runner于07:58:48.258Z→07:59:00.272Z自然exit0，12.014s、未触300s预算；受控profile1217.827ms命中命名阻塞函数192栈样本并恢复输入。
- 原两个失败case各1/1通过，实际profile窗1460.523/1755.133ms；独立默认关闭1例通过且无观测/采样。页面原始timeOrigin+pageMs映射，统计第二Name box input53.063Z、表格公式栏Enter56.267Z均落在start ack→stop发出区间；同机epoch/传输误差限制已说明，不以batch到达时间替代。
- 7项诊断单测及局部types/lint/node-check/diff均通过。R1候选6273→6275，恰3诊断接线文件改动+2新增；聚合47875ea8…d0b90，原6268仍仅R1两import、其余6266及生产/实物不变。107份R1/10份旧验收证据不变，运行5源码SHA零变化；08:00:45自有PID/端口已清理。
- 受控短阻塞恢复后可取栈，不代表任意30s协议停顿都可取栈；stop未响应到期限仍可能销毁target并缺profile，保留盲区。原I2未复现/未关闭，总004未完成。原独审者已复用，只读审R2与M2收尾，不再运行任何浏览器或构建。
- R2独审已正式追加004-review.md末节：APPROVED_WITH_CONCERNS，M2关闭、无新增Critical/Important/Minor，原I2/总004仍未过。已核对命名samples、两输入落窗的同机时钟限制、旧证据与新聚合；满足用户授权attempt3的内部前置，不重做局部验证。

## 用户授权完整序列 attempt3

用户已回答“再跑一次完整序列”，明确接受预计约100min及长协议停顿仍可能缺栈的限制。此授权只追加一次带当前诊断的完整默认序列，不是授权修产品/加重试/放宽验收/commit/push/publish。本阶段复用004执行者；R2独审报告正式落盘且无新Critical/Important后即可开始，不再请示。

1. 先只读核对R2最终6275项、5源码SHA及旧证据、仓外consumers manifest/产物仍存在可用；所有原自有测试进程已退、5191/5193无监听，不动其他任务进程。若缺消费者文件/新不明变更先报根，不自行build/pack或重建输入。
2. 以当前默认playwright.config.ts执行全部2677项、workers1/retries0、原30s超时，开启INPUT_STALL_OBSERVE=1和INPUT_STALL_PROFILE=1；当前只有原统计/表格两spec共18例接线，其余2659例仍不观测。不得修改诊断代码/原测试，不为缩到2例增加新环境分支，不新增准备/构建/单测/定向重跑。
3. 取证代价明确：18例各在首次DOMContentLoaded后尽力采≤4s，4500ms未确认停止会主动关闭自有页并以Diagnostic profile cleanup报错；该失败不能归为产品crash/原30s超时，不宣称与attempt2同观测环境或零扰动。窗外/销毁缺栈仍未知，若发生必须报告缺失而非猜测归因。
4. 新冻结使用独立frozen-attempt3-inputs.json；新输出full-attempt3-results.json、full-attempt3-e2e.log、full-attempt3-results/，不得覆盖attempt1/2/R1/R2、frozen-inputs.json或旧verification。完整前核对新聚合47875ea8…d0b90；开始后禁止改输入（源码/测试/配置/实物/consumer），仅允许.tasks账本及追加报告。
5. 不走会prepare的e2e脚本，直接默认Playwright CLI、list/json reporter和独立output；只启动这一完整进程。记录确切命令/环境/UTC/launcher/Playwright PID/tool session、冻结aggregate及日志路径，立即回根。无需新建通用runner或观察进程。工具yield只用于同进程续读，不因工具超时重启。
6. 自然运行到结束，即使某例失败也保留原进程继续；不改失败用例、不追加重试/定向或第五份完整。若明确诊断本身导致持续资源危险/不可收尾，先报根裁决，不能悄悄终止改跑。保持约60s可汇报进度，正确累计全日志失败而非仅tail零失败。
7. 只读记录本轮自有worker/browser身份及长运行事实；可按已知自有PID采集ps的elapsed/CPU/RSS，不能扫外部页面/敏感数据或干预其他任务。不宣称18例心跳等于全2677观测或在无同机原始事件时推断输入覆盖。
8. 自然退出后先核对结束6275输入零差异、原证据保护/自有进程清理，再解析同一JSON的pass/timedOut/failed/skipped/interrupted/retry/flaky/errors与1026主绑定门禁。诊断诱发与原功能错误分别归类；不能把两份JSON合成全绿或把历史失败改成功。
9. 只有本次全部验收真实通过才提请独审关闭验收7/I2；历史两次超时根因若仍未知必须保留该事实，不能宣称修复了产品缺陷。若本次仍失败，交回原失败时序/profile/缺失及明确最小原因，不自行再开另一完整或猜测改产品。
10. 只追加004-report.md的attempt3节，回DONE_WITH_CONCERNS及原始证据。独审继续复用原reviewer、只读核验本次冻结和同次结果，不亲跑完整。发布/版本/外部项目边界不变。

### attempt3 收尾回写

- 唯一完整于08:13:03.966Z开始，5808795.876ms（96.8133min）后自然exit1：2674 passed / 1 timedOut / 2 failed，0 skipped/interrupted/retry/flaky、errors[]。旧两挂点与包42/嵌入18本次通过，不代表历史根因已修。
- 三新失败原始trace及实际挂点见004-report.md末节、004-review.md:239：390px格式重开末尾耗尽总预算；390px向左填充范围D71:D75而非C71:D71；冻结带内插入后rows仍3而非4。三例均未接诊断，不能归为主动页销毁，确切原因未定。
- 同JSON主绑定1026/1026不能抵消变体/交叉失败。结束6275输入47875ea8…d0b90零差异，548旧证据SHA/mtime和旧报告前缀不变，112自有PID退出、5191/5193无监听。18采样均正常停止；1跨reload CPU覆盖UNKNOWN，不声称全输入均有栈。
- 原作者DONE_WITH_CONCERNS、独审REJECTED/未完成，Important I2/验收7继续开放；001/002/003保持done，004整体未完成（不是后台仍跑）。本次授权重跑及证据交付已结束，不自动再跑完整或修产品；后续先确定三处最小定向证据。未commit/push/应用版本/npm发布。

## 用户“继续”：三项交叉回归定向收敛（首轮）

用户在attempt3汇报后要求继续，授权对上述三失败做有证据的最小定位、修复与相关定向验证，不授权第四次全量、放宽原有验收、commit/push/版本应用/发布。HEAD已核对仍为base；当前5191/5193无监听，工作区保留原所有改动。原running现场已核清并重置pending，依赖001/002/003均done，复用004原作者顺序执行这三个失败，避免多个浏览器互相影响。

### 精确读取与结果

只需恢复本节、index当前交接、004-report.md的attempt3及004-review.md:225起独审；不重读001–003全部历史。主要文件：

1. `e2e/advanced-formatting/lifecycle.spec.ts:29`及`support.ts`：390px下载/重开用例末尾`go(A1)`耗尽整例30s，先用原trace逐步累计定位耗时。下载/重开与先行高亮已过，不把收尾context关闭后的断言当产品格式错误。
2. `e2e/editing/fill-handle-horizontal.spec.ts:7`：390px left，预期`C71:D71`但实际`D71:D75`。先查鼠标按下后`target.scrollIntoViewIfNeeded()`、实际box、scroll事件/命中与fill-preview范围；旧trace未存box返回值，不能推测补写。
3. `e2e/workbook/freeze-cross-features.spec.ts:66`：冻结C4后点row2再insert-rows，预期frozen rows4实为3。先查点击后实际选区、冻结行头坐标/命中、插入范围与原生返回，不以末态row5 pressed直接判因。

最终交付应分别明确“已证产品原因 / 已证测试交互原因 / 仍未知”，并给对应最小修复或未解决证据。单次定向通过不算已找到根因，不拼接成2677全绿。

### 执行边界

- 先只读旧trace、相关测试及真实React→Core→Rust调用链，再回根最小文件清单和三个验证假设。每个新增/改文件写一句职责；不得新造常驻诊断框架、通用runner、重试层或新的产品状态。
- 可改本节列出的4个测试/辅助文件及本任务已有scripts目录中的必要一次性取证脚本；优先现有Playwright trace/test.info.attach，保留原标题/关键业务断言，不能用sleep/force click/dispatchEvent/直接Core命令跳过真实用户入口。不改原30s、expect预算或retries，不skip/fixme/only，不把失败缩为菜单能打开。
- 若证据指向产品，先给根确切源码路径、最短调用链、复现事实和最小修复建议；根裁决扩所有权或交原所有者后再改，禁止顺手改React/Core/Rust/样式。先允许测试侧收敛，不等于预判三个都是测试问题。
- 原用例未改状态各运行一次并保存独立JSON/trace；随后只做由前一证据驱动的最小实验，不大批repeat。首阶段浏览器总预算10min、单worker/单浏览器串行、retries0，默认关闭OBSERVE/PROFILE（它们未接这三spec）。首次复现与修后结果分别保留；预算内仍未知就交回证据和下一必要条件，不盲目扩轮次/完整运行。
- 使用默认Playwright配置的精确file/grep执行，不走会prepare/build的e2e脚本；现有真实Worker/WASM与consumer实物可复用，禁止自行重建/pack/改metadata/配置/锁。若环境缺文件/服务启动失败先报，不修仓外项目或误杀其他进程。
- 所有新输出用`.codex-artifacts/react-excel-package-004/cross-regression-r1-*`前缀，旧attempt1/2/3与R1/R2结果、冻结/证据只读，不能覆盖。记录修前精确源码SHA、命令/UTC/进程/自然结果；最终给相对6275候选的实际delta，不将旧freeze冒称覆盖新源码。
- 稳定的UI修复须保留真实DOM回归，按feature-wave同步对应FEATURES行（既有功能不新增虚假ID），既有主绑定不删不改弱；单纯诊断不需要新用户功能登记。相关types/lint/test按最终改动范围验证，未变全仓6496及生产构建/Rust证据复用；本阶段不跑完整E2E。
- 首轮报告仅追加004-report.md的本节，先回根可执行方案/事实，再实施允许范围；结束给三问题状态/首败与修后证据/限制/资源清理，交原reviewer只读复审。总004/I2继续未完成，不因定向通过关闭最终完整门禁。

### 首轮证据与最小产品范围裁决

- 格式累计耗时已由旧trace及原样26.1s基线确认。允许仅该持久化case的3次非被测引用跳转复用已有Name box真实DOM入口，setup/numberFormat仍走Go to，保留全部文件内容/格式/原值/General/邻格断言。support共用入口不改，不调预算或拆弱测试。
- 原填充trace已确认scrollTop1481→1491→1551→1591、预览横向227×28变纵向120×128，条件等待滚动>84的单次实验也复现；这是纯横向测试混入底边自动滚动。允许拖前真实wheel移到安全行高位置，仅对确有证据的left分支处理；right原动作保留。首版误将预定位推广right造成390px超时须保留，不能改写为产品问题。最终不保留临时观测imports/env分支/脚本，原始JSON/附件保留。
- 冻结旧trace确认旧locator row2的同一DOM在freeze切窗后被normal header复用为row5，插入前Name box已经A5:P5。根裁决这是应消除的产品身份风险，不能仅靠限定frozen selector掩盖。仅扩004所有权至`src/workbook/grid/viewport/GridHeaders.tsx`：普通行key从窗口slot `index`改为真实行`rowStart+index`，中文注释解释避免切窗点击命中另一行；不改Core/Rust/其他抽象。`test/workbook/selection/header-selection.test.tsx`追加就近DOM身份回归：切rowStart后已离窗的row2节点须断开，重叠row5保持同一节点且label不变；先旧实现红、后新实现绿。若在该文件无法内聚≤300行，先回根，不自行扩散测试文件。
- 当前6例定向若仍运行，先让其自然退出、保留精确输入/结果再改产品，不边跑边改。其后允许一个明确补充阶段（浏览器预算≤5min，不累计扩大重复）：只验证新增产品key对应的冻结原DOM入口（不依赖frozen selector来证明key修复）及必要相邻header/冻结场景；format/fill未变的已完成结果复用。相关Vitest+类型/lint/FEATURES就近检查可以运行，不做build/pack/full/6496或改旧证据。产品key只有该行及中文注释，任何更大问题再报。
- 根审发现正式package typecheck的TS4058来自R2 `input-stall-observer.ts`推断返回类型引用了未导出的`ProfileResult`，不属于新测试语义但仍阻断当前正式类型门禁；不能以关闭declaration的检查冒称通过。批准仅在现有`e2e/support/input-stall-profile.ts`将该interface加`export`，只改类型可命名性、不改采样运行代码；记录SHA/delta，重跑原`pnpm --filter @einfach/react-excel typecheck`及该路径lint。未变取栈逻辑复用R2/attempt3证据，不重跑18例或CPU采样。

### 交叉回归首轮独审交接

作者正式报告追加后，复用004原独审者。只读本节、报告的cross-regression-r1追加、七路径实际delta和对应原始证据；不重跑任何浏览器、单测、构建或打包。审查只追加reports/004-review.md，不改实现或作者报告。

- 冻结：旧2187 trace的row2→normal row5 DOM身份与插入前A5:P5是否确凿；最终产品是否仅真实行key，旧key红/新key绿身份断言是否有效。最终E2E须保留全局row2真实入口，不能以冻结专用selector替代产品修复。核对后置key-browser 3/3与Vitest15/15。
- 填充：旧484与单次edge实验是否足以说明底边自动滚动；最终仅left拖前真实wheel定位，关键原值/样式/邻格/Undo/Redo断言、right原动作和原预算不弱化。保留首版推广right造成的超时，不冒称全程无失败。
- 格式：三次非被测定位改用既有Name box，持久化/原值/native格式/General清理/邻格断言不丢，原30s不变。final六例发生在key修复前；其中format/fill源最终未再变，冻结最终须以上述后置三例为准，不能拼成一次全量成功。
- 类型：ProfileResult仅export、诊断运行token不变，正式原package typecheck退出0才算门禁；declaration=false检查只属诊断。核对就近lint/1026登记检查的实际结果，不把登记检查当1026个浏览器通过。
- 边界：6275恰七输入改变、无新增；548旧证据SHA/mtime、attempt3索引与旧报告前缀保护，自有进程及5191/5193清理。所有生产实物未刷新，React dist/tarball仍不含本次行key修复；历史包42/18和全量6496证据不能冒充新产物验收。

本轮定向修复可以APPROVED_WITH_CONCERNS，但总004/I2/验收7仍未完成：当前源码还没有同一候选完整成功及更新后包验收。不准自动第四full、build/pack/发布；原两30s挂点根因也不因本轮通过而关闭。若有Critical/Important交回根再定最小范围，不为Minor再开循环。

### 交叉回归首轮作者收尾

作者正式DONE_WITH_CONCERNS，报告从004-report.md:495起。根已读原始final六例与后置key-browser三例JSON、header-final 15项及6275 delta：恰7路径变化，无新增；新聚合8b32cfb30ebd2ea5c8a6ead27a51e19e838f1ca5e05eb583ef5a7192b15fad07。两E2E阶段输入不同，未相加冒充同一全量结果。首轮8分6.715秒、补充浏览器7.444秒，均在各自预算内。

正式原typecheck成功对应cross-regression-r1-typecheck-final.log/tool session27640 exit0；根曾读到较早误名verified.log的Testing Library exact参数错误，作者确认该首败保留，已用等价锚定name正则修复并最终Vitest15/15复验。另有原TS4058及declaration=false诊断保留，不拿后者充门禁。lint-complete、1026登记检查与diff检查通过。临时观测源码撤净，1964实物保持旧hash/尚未包含产品key修复，自有进程和端口清理。现已复用原独审者只读复核，不再启动测试或构建。

### 交叉回归首轮独审收尾

原独审者已追加004-review.md末节：本轮APPROVED_WITH_CONCERNS，无新增Critical/Important/Minor。直接解码原DOM增量trace确认row2→normal row5与插入前A5:P5，核对最小真实行key及先红后绿；复核格式/填充关键断言、真实用户操作及原预算未弱化。独立解析九份JSON与红绿证据、逐键6275输入和548旧证据，80本轮索引及报告前缀一致；两阶段6/3结果分开，未把登记门禁或旧包验收充为新候选全量通过。仅追加审查，未运行任何验证。

本阶段实现/审查交付已结束，原作者与独审均已退出，无后台完整测试。总004/I2/验收7/PKG-13保持未完成；原两输入长停顿根因未知，当前新key源码没有对应新发行实物与同候选完整成功。下一必要交付为当前候选实物整合及相关包验收，再决定最终完整回归，不自动启动第四full或发布。未commit/push/应用版本/npm发布。

## 后续用户授权：分批commit

用户明确授权分批本地提交现有改动，覆盖前述阶段的未commit限制；仅改变Git记录，不授权push、应用版本或npm发布。实施/审查报告及失败原证据不改写，批次和提交钩子的真实通过/一次超时记录见index末节。正常钩子最终通过后才产生相应commit，没有放宽测试、no-verify或跳过钩子。FEATURE_PROGRESS同步最新验收状态，其文档字节变化另计；本次无生产/测试源码修改、新build/pack或完整E2E，总004/I2/验收7继续未完成。
