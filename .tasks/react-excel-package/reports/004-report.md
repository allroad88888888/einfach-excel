# 004 打包消费者与发行准备报告

状态：运行中，attempt2 自然结束2项超时失败，不能宣布完整通过或可发布。
基线 HEAD `08caefbce8cb4934ceea4f0c26115d910569a47c`。
全部证据位于 `.codex-artifacts/react-excel-package-004/`；本轮没有 commit、push、npm publish，
未在工作区应用 Changesets，未修改插件项目。

## 已交付范围

- 真实 pnpm pack 五个关联发行包；系统 mktemp 副本使用既有 Changesets version/lockfile 流程。
  源码版本不动，模拟发行 React 0.1.0、Core/styles/TS core/WASM fixed 组 0.2.0。
  React peer Core `^0.2.0` 不误称旧 0.1.0 已提供新 API；旧两份 pending changeset 保留。
- 仓外 Vite 8.3.4 / Rspack 2.2.9 fixtures 严格安装 tarball 和 registry 依赖，独立 tsc/生产构建；
  只安装 React、UI Core、WASM 三份 tarball，无私有 cells/canvas、TS 引擎、source alias、workspace link、
  Lingui 宏插件或消费者 Rust。`consumers.json` 留存路径、版本、SHA 和发行计划。
- 42 个真实浏览器包场景：双 Store/双语言、千行多表、默认及自定义真实 Worker、编辑/外贴/清除/填充、
  undo/redo、跨表剪切及第三表公式改写、typed 增量读取、宿主锁/原生保护、文件替换、卸载/失败恢复。
  默认完整 Playwright 同时启动原 demo 与仓外生产 server；独立 package 配置用于定向复现。
- FEATURES 新增 28 行（11 EMBED、17 PKG），原 998 行 file/title/ID 原样保留，当前 1026 个主绑定。
  `features-preservation.json` 与采集门禁均确认，不把采集成功当运行通过。
- 包沿用仓库 MIT，补 LICENSE/NOTICE，实际 Rust/WASM 正常依赖许可证正文在构建时进入 dist。
  README/接入、Store 数据、兼容/发行文档明确 React18 ESM、Node22.19+、限制及未发布状态。
- CI 增加真实包浏览器任务及同一 JSON 功能结果门禁；发布 workflow 增补 React artifact 检查。
  只修改配置，未声称远端 workflow 已执行。

## 架构整合差异

React 是 ESM-only，移除冗余 `module`，保留 `type:module`、`main`、`exports.import`。
旧 Rollup 的 main+module+src/index 发现器不再误把 React 纳入 CJS+ESM 库、清理其 dist；
根 build 与 build:publish 显式走专用 build:lib，不复制扫描逻辑、不扩 rollup.config 范围。

presentation checker 精确允许 Provider/默认 factory 的 WorkerLike 纯类型引用，以及唯一
`src/worker/workbook.worker.ts` 的 Core rust-runtime 单一 side-effect 装配；其他视图、运行时
transport/dynamic runtime 导入、connection atom、Store 直调用仍拒绝，正反回归接 test:scripts。
没有改已审产品来迎合旧路径门禁，也没有整目录白名单。

新增测试使用唯一 `.workbook[data-runtime-state="ready"]`，避免把公开 Spreadsheet 外层根与
内部 WorkbookView 误判为两个实例。独立 bridge 类型不反向导入 host/app，从而 clean build
不会在库声明尚未生成时解析包自身。仓外 app 仍真实导入已安装公开包，不加源码 alias。

## 定向与失败历史（保留原始证据）

1. 原始 package targeted 自然结束 22 passed / 20 failed，3.3m。
   18 项是双根/textarea 错定位；2 项是原生文件导入后继续查询旧 sheetId。
   按公开 workbookDocumentAtom 获取新目录作 RPC 屏障，保留无事件/邻格/原生读取断言，文档说明 ID 不持久。
2. R2 package targeted 自然结束 32 passed / 10 failed，1.6m。
   4 项是计入 ribbon 的 tab 数量，改为 sheet-tab-list；6 项证明 readOnly 拒写但丢失具体中英诊断，
   显示通用未保存提示。已回原 003 作者修复，未降测试断言；最终门禁等待新输入。
   R3 40/42 通过，两个新增滚轮返顶用例因指针已落入网格失败；将鼠标移到 18px 宿主边距内的
   (5,5)，不减真实 wheel/scrollY 断言。R4 完整 42/42 通过、37.5s、零重试。
   Vite/Rspack × 中英均通过格内 Enter 与清草稿后公式栏 Enter 的明确已译只读提示、typed 值/事件不变。
3. 首次全 Vitest 自然结束 457/472 文件通过、6446/6463 项通过，142.72s。
   initial-tables 启动序列漏 host.configure、package-boundary 误报 host Worker 纯类型协议引用，回原作者补门禁。
   其余 13 个 React 文件以相同源码 maxWorkers=1 定向 63/63 通过（31.56s），不调大超时、不将首轮说成成功。
4. 首次 root build 因本叶测试类型经 host/app 导入未生成的自包声明失败；已抽纯类型 bridge。
   修后 root build 与 build:publish 均自然 exit0。生产反馈修复后还需重建并刷新最终包。
   最终 R3 根双构建已消费反馈 SHA `500684b76853f69015a30024d048fb4f3976b648540e6e5f92bfb6613ffa72c3`，
   类型/声明/包内容均通过；最终新 tarball 与仓外页面已再次刷新，未以旧包作最终证据。
5. 原始 notices 生成暴露 nalgebra-macros 发布包遗漏正文；生成器只在同上游仓库、相同声明/正文许可证时
   复用真实发布文本，否则失败。未略过声明。最终包清单必须包含许可证文件。

## 当前验证账本

| 范围 | 命令/证据文件 | 当前结果 |
|---|---|---|
| Rust default | cargo test --locked --manifest-path excel/rust/excel-core/Cargo.toml；rust-default.log | 3726 pass/10既有ignored，exit0，含 API 快照 |
| Rust lite | 同上 --no-default-features；rust-lite.log | 3686 pass/10既有ignored，exit0 |
| 底层 Core | cargo test --locked --manifest-path excel/rust/core/Cargo.toml；rust-core.log | exit0 |
| WASM native | cargo test --locked --manifest-path excel/rust/wasm/Cargo.toml；rust-wasm-native.log | 205 pass，1 既有 ignored，exit0 |
| WASM browser | wasm-pack test --chrome --headless --chromedriver 配套155驱动；wasm-browser.log | 7 pass（1单测+6web），exit0 |
| bench API | cargo bench --locked --manifest-path excel/rust/excel-core/Cargo.toml --no-run；rust-bench.log | 3 harness compile，exit0 |
| WASM 实物 | pnpm --filter @einfach/excel-wasm build:wasm:both；wasm-build.log | lite/full exit0，非旧 Worker |
| presentation/scripts | presentation-final.log、scripts-final.log | exit0，22 scripts |
| cycles/lint/docs/i18n | *-final.log | exit0，488 活文档/4507文件，严格词典编译 |
| 主绑定采集/保留 | features-collection-final.log、features-preservation.json | 1026可执行，原998未变 |
| root build/publish | root-build-r3.log、publish-build-r3.log | exit0，最终反馈源码已消费 |
| Core/React/package types | types-final.log、package-types-final.log | exit0 |
| artifact 与 pnpm pack | react/core-artifact-final.log、pack-*.log | exit0，最终包刷新完成 |
| 仓外 install/tsc/build | install/typecheck/build-vite/rspack.log | 两打包器均 exit0，严格peer |
| fixtures/types ESLint | fixture-lint-final.log | exit0，源码/测试最大209行 |
| 最终完整 Vitest | pnpm exec vitest run --maxWorkers=2；vitest-final.log | 473文件/6496项全过，118.97s，自然exit0 |
| 第一冻结全 E2E（失败候选） | full-attempt1-e2e.log、full-attempt1-results.json | 270 pass/4 fail，确认夹具遗漏后经裁决 SIGINT；非完整通过 |
| 第二冻结完整 E2E | full-attempt2-e2e.log、full-attempt2-results.json | 2675 pass/2 timedOut，98.1925min，自然exit1，零skip/retry/flaky |
| 同次1026主绑定结果 | features-attempt2-result-gate.log | exit1：TABLE-036、STAT-019缺少本次成功证据 |
| 结束冻结 | frozen-attempt2-verification.json | 6268，3696c4d3…e1043，changed=[] |

## 第一冻结与失败候选结果

冻结时间 `2026-10-22T04:40:37.853Z`，6268 输入；聚合 SHA-256：
`6a7f3f207281b639dd61aba29402f21b1c588315b0f2dde2f60b40a707b7bcb0`。
清单 `frozen-inputs.json` 包含 1163 个 Rust .rs、6 个 Cargo.toml/lock、lite/full 12 文件、
Core esm/cjs/@types 1918 文件、React dist、5 tarball、仓外 dist 17 文件及源码/测试/配置/FEATURES。
`scripts/freeze-react-package-inputs.mjs --verify` 在结束后检查新增/删除/修改并落验证 JSON。
任务账本/普通 Markdown 报告不在冻结范围，允许独审和文档收尾；不改产品输入。

最终消费者根为系统临时目录 `react-excel-packed-fGqSi7`，完整绝对路径见 consumers.json。
React 0.1.0 tarball SHA `e9b8a442c7b4c384139777a1336bf480832a7f12235a5f5845580b7ba7384969`；
Core 0.2.0 SHA `de578c9c8450c6ec8d47a3e03b4d87fcd432d95001e37a507808956bfe637a12`。
另三份 SHA、实际安装依赖树、各命令 UTC 起止/自然 exit 均在 consumers.json 与 pack/install/build 日志。

唯一完整进程 tool session 18668 / launcher PID 33569，默认配置 worker1/retries0；
直接调用 Playwright，避免冻结后再由 e2e 脚本重复 prepare。命令：

```sh
PLAYWRIGHT_JSON_OUTPUT_FILE=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-004/full-results.json \
pnpm --filter @einfach/react-excel exec playwright test --config playwright.config.ts --reporter=list,json \
  --output=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-004/full-results \
  > .codex-artifacts/react-excel-package-004/full-e2e.log 2>&1
```

实际开始 `2026-10-22T04:40:45.900Z`，1627029.247ms 后于约 `05:07:52.929Z` 中断。
首次失败 223 并非语言切换功能失败：`comments/localization` 最初等待中文名称框即超时，
快照为侧栏中文、工作簿 `Interface language=English`；随后 custom-formulas 同样停在初始中文入口。
只读审计确认 e2e 两个 fixture Provider 均未传 demoPresentation，遗漏 002 演示层 URL/偏好/renderer 配置迁移；
真实 PageSalesOrders 已正确注入，公开组件默认英文符合契约，不改产品默认值或降低定位断言。

编排者在确定失败输入后授权中断（非超时重启）。向唯一 Playwright PID 33570 发 SIGINT，
pnpm launcher 33569 退出（子命令130、工具 session18668 exit1），无第二浏览器/并发完整进程。
原始 JSON：270 passed、4 failed（comments/custom-formulas 两宽）、1 interrupted、2402 did not run、0 flaky；
不能作为完整验收或同一 JSON 主绑定全绿。JSON stats 的 skipped=2403 包含 interrupted，不冒充产品 skip。
`full-attempt1-results.json`、`full-attempt1-e2e.log` 和原结果目录保留失败现场。
中断后先执行原清单 verify：6268、SHA 不变、changed=[]，原清单与验证另存
`frozen-attempt1-inputs.json`、`frozen-attempt1-verification.json`。随后才解除冻结准备修复与下一候选。

只读性能对照 `performance-baseline-comparison.json`：上一轮 2617 项总 90.789min，
本轮前 8 个相同用例控制台约 126.0s，对照旧 JSON 134.295s，未见初段新增回退。
这些用例沿既有真实 demo→File 新簿→外贴 setup；不把 14–18s 既有耗时误判挂起。
新 CI browser job 的 90min 未计安装/WASM，预算不足。原裁决为成功 run 后单改预算；
本次已因确定夹具失败中断，编排者改判：先 verify 原 6268 零差异，再将 timeout 单行改180，
与两个 fixture 最小迁移一起纳入下一轮新 freeze。旧 CI SHA
`835b9e631908cf0552a0fc6587af587be175cc616794d1f4a871fee945d68f0e`，新 SHA
`70c2c00600910b1390bd80b0101e6f4beacf5bbe62eedc11205620594ab16cad`。
js-yaml 解析 ci/publish 均通过，逐行对照确认仅第73行90→180；Rust预算30、同JSON主绑定门禁、
always上传与发布artifact检查均保留；git diff --check 通过。
第一冻结证据不被覆盖为成功；配置修改也不代表远端 CI 已运行。

## 第二冻结候选（自然结束，未通过）

002 最小迁移两 fixture 后，中文/跨表相关定向 12/12 通过，另两 fixture 中文 Canvas smoke 2/2，
由原作者验证真实绘制/编辑/Undo/单 Worker/无 pageerror，并完成 scoped lint/TS。
未改变库产品默认值、用例断言或 FEATURES。此次第一失败候选同 JSON 主绑定检查有904条缺失成功证据，
明确不作为通过；也不与后续定向结果拼接。

新冻结 `2026-10-22T05:10:56.981Z`，仍6268项，SHA-256
`3696c4d353bcd6197313b3ac7f692ee296ec13ab6800957c239a3760377e1043`。
`attempt2-freeze-delta.json` 逐键检查无新增/删除，仅两个 fixture main.tsx 与 CI timeout 三项 hash 变化；
React/Core/lite/full WASM实际产物、五 tarball、仓外17文件及 consumers.json 均不变。
复用其42项包定向、6496项Vitest、根构建/声明/许可验证，不重建或重新准备消费页面。
第二次完整输出将使用独立 `full-attempt2-results.json` 和 `full-attempt2-results/`，不覆盖第一轮失败现场。
002 R2经根审/独审关闭后于约 `2026-10-22T05:12:32Z` 启动唯一完整进程：
tool session2803 / pnpm launcher38311 / Playwright38312，默认 worker1/retries0，无 CI。
命令与首轮相同，仅三处输出目标换为 `full-attempt2-results.json`、`full-attempt2-results/`、
`full-attempt2-e2e.log`；期间不build/pack、不改冻结输入。

实际 `2026-10-22T05:12:32.718Z` → `06:50:44.268Z`，5891550.529ms（98.1925min），
tool session2803 / pnpm/Playwright 均自然exit1，端口5191/5193已释放。
2677项全部执行：2675 passed、2 timedOut、零skip/retry/flaky，report.errors=[]。
同一JSON主绑定门禁exit1：TABLE-036与STAT-019缺成功证据，不能以其余1024或包场景通过冒充完整通过。
JSON SHA `8403aaa10bc418b0cc3eef4e7c09a77f99f82d68c7f00ff0fd56100765bc1e7f`；
log SHA `f86ef41e4065a671c3743856849519088dc66422a7b41a8a2c2cd280de65c869`。
结束verify在 `06:51:09.711Z` 通过：6268、聚合不变、changed=[]；清单/验证另存frozen-attempt2-*。

本次 package-embedding18/18、package-host42/42 均已同次通过，不能代替完整结果。
第2067 `selection/statistics-actions.spec.ts:93` 的统计复制不清源用例35.2s失败：
beforeEach 约2.63s完成实际Summary选择与Sum26；随后第94行 select A93 的名称框 fill 停住，
尚未执行Cut或统计复制。trace最后action snapshot有可见86×27名称框（x173/y128），mode idle、
无disabled/readOnly/hidden，根ready；最后actionability日志后没有继续frame/console事件。
30s用例超时加约5.1s teardown，不是已经证明的剪贴板值差异，也没有足够证据定性根因。
保留error-context/trace及抽出的最后录屏帧；录屏帧早于Sum26断言，不能拿其Calculating状态推断最终挂点。
遵裁决继续同一进程自然结束，结束后释放冻结再定向原用例，不归咎负载、不调大超时或降低断言。

第二失败第2486 `workbook/table-dialog.spec.ts` Open Tables…1280px，35165ms。
前置goto/切Summary/定位H94/公式栏fill均完成；第15行bar.press Enter等待locator至用例超时，
尚未点击Tables。底层fill约32ms完成，之后测试层约3s才返回并发出press，另约3s后才记locator等待；
最后snapshot为可见962×27 textarea（x301/y128），无disabled/readOnly，根ready，无pageerror/crash。
后续没有frame/console/截图响应，静态仍无法定因；不是已证表格弹窗数据/历史错误。

经根授权、结束零差异后启动四组串行诊断（session68221）：statistics-actions整文件、失败原case20次，
table-dialog整文件、失败原case20次；workers1/retries0、各自JSON/log/output独立，未改源码/测试/timeout、
不prepare/build/pack，不启第三次完整；定向通过不改写本轮完整失败及根因未知。

四组于 `06:52:32.576Z` → `06:54:47.462Z` 串行自然exit0，结果如下；命令全量参数、UTC起止、
退出码见 `diagnostic-serial-status.json`，四JSON均零skip/retry/flaky。

| 独立诊断 | 结果 | Playwright耗时 | JSON |
|---|---|---|---|
| statistics-actions整文件 | 8/8 | 27.816s | diagnostic-statistics-file.json |
| 2067原case repeat-each=20 | 20/20 | 42.146s | diagnostic-statistics-repeat20.json |
| table-dialog整文件 | 10/10 | 18.755s | diagnostic-table-file.json |
| 2486原case repeat-each=20 | 20/20 | 42.733s | diagnostic-table-repeat20.json |

没有复现不等于根因已知或“已证明负载/偶发”，也不能把58次定向并入attempt2宣称2677全绿。
诊断后再次verify零差异（6268、同聚合）；所有测试/server已退出、端口5191/5193无监听。
当前结论：功能、原生/静态/包定向证据完备，但本次完整与同JSON主绑定门未过，004保持running，
交独审/根裁决已知风险与后续，不擅自done，不再启动第三次完整或修改产品。

下一步最小定位建议（仅计划，未执行新一轮）：保留这两个真实输入前置序列与原30s超时，
另行授权后只增加focus/input/selectionchange与页面心跳的时序观测，并在响应停止时采集
renderer主线程调用栈/性能时间线、进程身份与内存事实，区分同步JS/布局阻塞和浏览器/通信异常。
当前trace缺乏停顿期间的调用栈，不能用“无frame”直接推出任一原因。
两组repeat20的JSON workerIndex均为0…19，实际每次新worker，不能当作复现长寿命浏览器的等价证据；
若需区分寿命因素，应保持同一browser/真实Worker并控制上下文复用作为单一变量，而非盲目扩大repeat。
先取得有依据的可复现定位与相应修复/验证，再由根裁决是否重开最终完整，不主动执行或回写现有结果。

## 已知非阻断 Minor M1

本轮完整包截图中Rspack工具栏/语言控件字号大于Vite，状态区多行；入口与宿主样式仍完整。
静态CSS显示Rspack为较后font reset增加webkit-any/moz-any前缀，优先级变化是与截图一致的原因推断，
未冒称新增computed-style测量。根与独审裁决为非阻断样式一致性Minor，不在本轮修复。
发行兼容文档已明确不承诺两打包器像素一致；该普通Markdown收尾不改运行输入或已冻结tarball，
当前tarball中保留打包时旧文档，尚未发布，下一次授权发行准备需将此文档一并打包。

## 发布边界

安装验收不等于 npm 发布。pending changesets 原样留存；本地临时版本预览不是源版本更新。
现有主分支 workflow 有 pending 时开 Version PR、无 pending 时直接发布，故后续 Version PR、
版本合并与真正发布仍需分别授权。只承诺本轮实际验证的浏览器 React18 ESM 与同版本 Store；
不宣称 React19/SSR/CJS/严格CSP/CDN跨域/旧Store或业务文件格式兼容。

## I2 R1：输入停顿的有界观测与原因定位

本轮交付 `DONE_WITH_CONCERNS`：观测自检成立，54项真实定向均通过，但原两次30s输入停顿未复现、根因未知，
**I2仍未关闭，004仍未验收通过/不可宣称可发布**。未重开第三次完整、未加repeat、未build/pack/6496单测，
未改产品或M1、未commit/push/publish；原attempt1中断失败、attempt2的2675通过/2超时及1024/1026结论不变。
HEAD仍 `08caefbce8cb4934ceea4f0c26115d910569a47c`。按React架构与one-file-one-thing技能，诊断只在测试侧，
没有给React/Core/Rust增加状态、hook、atom或监控层；真实DOM→Core→Rust Worker/WASM路径不变。

### 最小文件与默认关闭

开工前已向根列清单获准，最终新增5文件（物理行数均≤300）：

| 文件（前缀 `excel/react-excel/`） | 单一职责 | 行数 |
|---|---|---|
| playwright.input-stall.config.ts | 限定原两文件的独立诊断执行配置 | 28 |
| e2e/support/input-stall-page.ts | 保存页面自身performance时钟的有界事件缓冲 | 63 |
| e2e/support/input-stall-observer.ts | 记录测试Node与页面之间的双时钟观测证据 | 108 |
| e2e/support/input-stall-fixture.ts | 按环境开关接入每页观测生命周期 | 26 |
| scripts/input-stall-r1.mjs | 串行管理有界诊断实验的自有浏览器进程 | 124 |

两份原spec仅把首行`@playwright/test`换为上述fixture，expect/Page仍原样导出。内存逆替换后逐字节SHA恢复旧冻结值，
证明标题、DOM行为、数据、断言、30s timeout及FEATURES均未变。`INPUT_STALL_OBSERVE`默认非1时不调用observer，
故不创建心跳、ELD、CDP session或额外进程；关闭组原统计case实际1/1通过，观测文件/记录/RPC均为0。
runner启动浏览器只是本次显式诊断执行方式，不是默认fixture的额外进程。配置workers1/retries0，原retain-on-failure trace保留。

页面每250ms记录performance.now/timeOrigin心跳，每1s批量送达，128条环形缓冲、最多1批在途；恢复后以页面自身gap
而非Node到达时间判断页面节奏。记录focus/input/keydown/selectionchange、visibilityState/hasFocus、longtask及丢失计数，
不读输入值、剪贴板或非本任务页面。Node每250ms记录独立单调时钟/ELD/自身CPU与内存；CDP串行取自有browser/renderer
PID、CPU time及JS heap等资源事实，pageerror/crash独立落盘。不主动Debugger.pause/resume；采样前根指出迟到pause可能
自造停顿，已删除该初稿路径，尚未启动浏览器时即改用缺口触发的短CPU Profiler尝试。

### 命令、预算与真实进程身份

唯一采样命令（完整子命令、UTC、输出路径及exit见`input-stall-r1-status.json`）：

```sh
node excel/react-excel/scripts/input-stall-r1.mjs \
  > .codex-artifacts/react-excel-package-004/input-stall-r1-runner.log 2>&1
```

tool session5540 / runner PID96919，`2026-10-22T07:28:44.669Z`→`07:30:43.771Z`自然exit0，
119102.580ms（1.985min，含关闭组、自检及所有浏览器启动/清理），未触及600000ms总采样硬上限。
每组Playwright JSON/log/results独立以`input-stall-r1-`开头；没有覆盖旧结果或拼接完整报告。

| 分组 | 原始JSON | 通过 | Playwright耗时 | 浏览器PID / connection SHA前缀 |
|---|---|---|---|---|
| 默认关闭检查 | input-stall-r1-default-off.json | 1/1 | 3.402s | 96920 / 40c9ae4b3621 |
| 受控停顿自检 | input-stall-r1-self-check.json | 1/1 | 5.203s | 96920 / 40c9ae4b3621 |
| fresh-browser两整文件 | input-stall-r1-fresh.json | 18/18 | 36.667s | 97021 / a343b06ce84f |
| same-browser第1轮两整文件 | input-stall-r1-same-browser-1.json | 18/18 | 37.872s | 97264 / 229aeb597ecb |
| same-browser第2轮两整文件 | input-stall-r1-same-browser-2.json | 18/18 | 34.303s | 97264 / 229aeb597ecb |

**真实工作簿定向为54项，另有关闭检查/受控自检2项，不称56项全量验收。** 五JSON均0skip/retry/flaky/unexpected、errors[]。
不同分组之间没有并行浏览器。两same组确为同一真实PID/连接，并由CDP SystemInfo再次确认PID97264，
不是repeat-each的新worker冒充浏览器寿命。该browser从07:29:30.999Z到结束仅约72.8s，context/renderer/真实Worker
仍按原测试每例新建/销毁，不能当作98min浏览器、长寿命renderer/Worker或完整套件前序等价证据。

### 双时钟结果、开销与缺失

受控自检仅在about:blank执行已知2200ms同步循环，再执行原真实统计case；页面gap2362.3ms，
Node tick最大265.2ms、ELD最大21.66ms、批次到达gap2633.0ms，恢复后页面心跳与真实输入均继续成功，
说明能区分该已知页面同步停顿与Node事件循环延迟。这是假设验证，不是复现产品缺陷。

该缺口触发的`Profiler.enable`在701.783ms观测期限返回timeout；底层RPC未完成期间，单在途规则阻止了后续两次资源RPC，
之后恢复时最终RPC已无在途。**没有取得Profiler.start/stop或任何CPU profile/停顿栈，实际采样窗口为“未建立”，
不能声称已成功取得200ms窗口**；700ms是观测等待上限，不是底层命令已经取消。所有timeout/skipped原始记录保留。
没有主动暂停API，因此不存在本探针遗留Debugger paused状态；自检后原输入case成功也证明页面已恢复。

| 真实分组 | 页面自身最大beat gap | Node最大tick gap / ELD | 最大批次到达gap | CDP超时/错误 |
|---|---|---|---|---|
| fresh | 448.3ms | 272.3 / 58.56ms | 1218.9ms | 0/0 |
| same-1 | 484.0ms | 336.2 / 115.02ms | 1242.7ms | 0/0 |
| same-2 | 475.1ms | 269.7 / 50.59ms | 1227.8ms | 0/0 |

三真实组均无pageerror/crash、缓冲丢失0；正常未触发重profile，每组18例共144次观测CDP RPC（每例8次首尾身份/资源/收尾），
Node tick分别130/132/118条、页面批次41/40/38，输入/焦点事件与原时间戳保存在各例input-stall.jsonl。
各组端点所见renderer JS heap used最大122856984/138486072/153183024 bytes；不同例renderer PID不同，
这些不是同一堆的连续增长测量，不据此认定泄漏。browser/renderer PID全集、CPU time、heap及Node资源均在原始记录/audit。
开销只报告上述频率、RPC数与实际耗时：没有同条件随机A/B，不能把与旧定向耗时的差异换算成因果开销或宣称零扰动。

### 输入delta、旧证据保护与静态验证

`input-stall-r1-before.json`记录07:24:02.053Z开工前旧6268项、aggregate3696c4…e1043、changed=[]。
结束`input-stall-r1-delta.json`逐键重hash旧全部输入：恰两原spec首行import变化、其余6266项不变，另5个上述新文件。
涵盖React/Core/Rust源码、Cargo.toml/lock、pnpm锁、真实lite/full WASM、Core/React dist、五tarball、consumer manifest及
仓外生产页面，全部未改。新诊断输入共6273项，aggregate
`4852de937a736891b6c9929a76920fe08b4ecd6c777daa00da0c3cfea5973a5b`；它不是旧6268 freeze，不能声称新字节全等旧freeze。
旧frozen-inputs、attempt1/2清单/验证及旧JSON/log未写入；audit另存其SHA/mtime，attempt2 JSON仍8403aaa1…5bc1e7f、
完整log仍f86ef41e…65c869。`input-stall-r1-audit.json`保存完整分组解析、时钟/资源摘要与delta，acceptancePassed/i2Closed均false。

局部strict tsc（诊断config/3个support文件及其fixture引用）、两spec与support的真实项目ESLint、runner `node --check`、
`git diff --check`均exit0；完整命令/UTC/exit在`input-stall-r1-static.json`。初次types/lint两类型/1长行错误已在采样前修复，
保留首检log。新增config不在原tsconfig include，额外config lint首次无project调用exit2（return-await需要parserServices），
未关规则；改用忽略目录内明确files的临时诊断tsconfig，原完整ESLint规则exit0，命令见`input-stall-r1-config-lint-project.json`。
未因此改仓库tsconfig/规则或扩大类型/测试范围。07:32后确认runner/96920/97021/97264均无存活PID，5191/5193无监听，
finally只关闭本轮自有browser server与Playwright所启动的demo server，没有干预其他任务进程。

### 结论与最小后续建议（仅计划）

新增证据排除的只是：本探针不能识别已知页面同步短停顿、默认开关会必然启动观测、两原前置序列在短时fresh/同browser
条件下一定失败。未复现不能排除原运行中的同步JS/布局、renderer或CDP/Playwright通信、Node/runner延迟、资源压力、
98min进程寿命/套件前序等假设；尤其原公式栏底层fill32ms但测试层延迟约3s，仍须保留runner侧解释可能。
当前没有原失败发生时的栈，无法给生产修复建议，也不回原叶猜测改产品。

若根/用户另行授权下一定位，最小有据方向是先修正“已知同步停顿时触发Profiler.enable仍取不到栈”的观测盲区，
通过一次更小的受控自检验证短CPU采样能否实际开始/结束，再决定如何在原失败输入条件捕获Node/浏览器协议时间线；
仍不主动暂停页面、不扩大repeat/timeout、不以54定向替代完整结果，不自动启动新一轮或第三次full。

## I2 R2：实际短取栈与确定收尾

`DONE_WITH_CONCERNS`：已取得可解析CPU profile并命中受控命名阻塞函数；原两失败case各一次通过、未复现原停顿。
**I2仍open，004仍未完成/不可称可发布**。本轮不重做旧验证、不运行full/54项/build/pack，不改产品、原spec行为、
30s超时、重试或FEATURES；没有commit/push/publish。全部新证据前缀`input-stall-r2-`，原证据/报告前缀保留。

### 实现、协议依据与失败收尾

按React架构与one-file-one-thing技能，先报清单获根批准，只改测试侧三文件：observer去掉缺口后才enable的旧路径，
fixture显式接导航后短窗口，既有runner新增`--r2`的单浏览器/300s分支；新增`input-stall-profile.ts`（127行，
一次短CPU采样的确定收尾）、就近`input-stall-profile.test.ts`（108行，诊断协议收尾单测）。fixture/observer/runner分别
53/106/209行；config、page探针、两原spec没有本轮改动。最短产品链仍DOM→Core atom→真实Rust Worker/WASM，未加生产层。

读取本地Playwright1.64的protocol.d.ts Profiler定义及coreBundle CDPSession实现：setSamplingInterval在start前，
stop返回nodes/samples/startTime/endTime（微秒）；send走无内建取消期限通道，detach通过父session断开并拒绝未决回调。
不假定700ms观察超时会取消协议命令。专用profile session顺序enable→请求5000μs interval→start，**收到start ack才执行
受控阻塞**；正常窗口最多4000ms或测试结束即唯一finish。finish不共享资源采集rpcPending：观察超时先等待原start结果，
迟到成功后必须唯一stop，再disable/detach；拒绝则释放session。4500ms绝对期限仍未确认收尾时只关闭自有page，
await close且isClosed才确认销毁；另500ms确认限后仍未知则返回unconfirmed并判诊断失败，不继续下组。不用Debugger.pause/resume。

局部协议单测7/7通过：自动窗口到期停止、迟到start后唯一stop、start拒绝、start永不返回、stop拒绝、stop永不返回、
销毁未确认。替身仅用于诊断协议单测；真实取栈不靠替身。局部strict tsc/原项目ESLint/node-check/diff最终均exit0，
确切命令/UTC/exit见`input-stall-r2-static.json`（07:57:05.610Z→07:57:23.737Z）。首检类型/格式错误及三份7项单测JSON
均保留，修正全部发生在浏览器执行前；未关规则或改生产类型配置。根检查稳定5文件SHA后才启动唯一自检。

### 唯一有界执行与实际取栈

命令：`node excel/react-excel/scripts/input-stall-r1.mjs --r2 > .codex-artifacts/react-excel-package-004/input-stall-r2-runner.log 2>&1`。
session92416 / runner8480 / browser8481；`07:58:48.258Z`→`07:59:00.272Z`自然exit0，12014.434ms，
300000ms总预算未触发。浏览器连接SHA `a22187c34c4aaeaf5a836ef2984160b45a5492ffea8cc716d49f7dc736d180eb`。
只有一个浏览器，受控页先单独自检，成功后统计/表格原case各一次，再默认关闭检查一次；没有重试或追加采样。

| 分组 | 实际结果/CPU窗口 | 原始证据（统一input-stall-r2-前缀） |
|---|---|---|
| 受控about:blank命名1200ms同步循环 | stopped，1217.827ms，命名节点7及其后代栈192 samples；随后input fill恢复 | controlled.cpuprofile、controlled-events.jsonl、status.json |
| 原统计case | 1/1，0retry，实际profile1460.523ms/447 samples | statistics-case.json及对应results目录 |
| 原Open Tables1280 case | 1/1，0retry，实际profile1755.133ms/464 samples | table-case.json及对应results目录 |
| 默认关闭检查 | 1/1，0retry；0观测文件/0profile | default-off.json及对应results目录 |

三份Playwright JSON均0skip/unexpected/flaky、errors[]；受控自检是独立浏览器API实验，不冒充第四份Playwright功能用例。
受控profile startTime/endTime为107679109328/107680327155μs，SHA
`997c06d49088260c6a2f20bbad4ddb88b74fc9d336356f78a81c6046a50420e9`，节点名确为`inputStallKnownSynchronousBlock`，
不是仅看gap/非空文件。三段profile均有stop/disable/detach确认，无实际销毁或超时；失败/销毁路径只由上述单测验证。

原两case在DOMContentLoaded后请求采样，结束时finish，本次未跨后续导航。用**页面原始timeOrigin+pageMs**映射同机epoch，
而非批次到达时间，对照Node start ack与stop发出区间：

- 统计：导航回调07:58:51.859Z，start ack52.011Z，stop发出53.405Z；Name box三次input均在区间内。
  按未改spec顺序，第二次input对应case首个A93 fill，原始映射53.063Z（距ack约1052ms、距stop约342ms）。
- 表格：导航回调07:58:55.307Z，start ack55.423Z，stop发出57.111Z；Active cell value input56.236Z、
  Enter keydown56.267Z在区间内（Enter距两端约844ms）。两profile因此不只是load阶段采样。

上述覆盖是同机epoch映射推断，含Node wall-clock分辨率、浏览器timeOrigin基准与协议传输误差，不是严格同步或单样本精确归因；
原始page/Node时间、到达时间及实际CPU微秒窗口均存audit，未读取输入值。两case无profile错误/pageerror/crash，
Node ELD最大22.90/43.88ms、页面beat gap最大345.5/320.6ms；没有原30s停顿可用于根因判断。

### delta、证据保护与限制

开工`input-stall-r2-before.json`重算R1候选6273项、聚合4852de93…73a5b、零差异，记录107份R1证据SHA/mtime。
结束delta恰改fixture/observer/旧runner三项、新增profile模块/单测两项；R2共6275项，聚合
`47875ea8a03292ff73169391d9a1a848fd8022553cdb3a16fb5fac60224d0b90`。
R1 runner源码已变，不能将旧R1源码SHA当作新逻辑证据；新采样5文件SHA见sampled-code.json，运行后逐个零变化。
相对原6268仍仅两spec的R1 import差异，逆替换恢复原SHA，其余6266及React/Core/Rust源码、Cargo/pnpm锁、真实WASM、
dist、五tarball、consumer页面均不变。107份R1证据及10份旧freeze/attempt证据SHA/mtime均零变化，未覆盖任何旧结果。
`input-stall-r2-delta.json`/`input-stall-r2-audit.json`保存逐键核对；08:00:45.600Z确认8480/8481已退出、5191/5193无监听。

本轮只证明“阻塞前已启动、短同步阻塞恢复后stop可以取栈”；并未证明任意30s协议无响应时能取得栈。
若stop在绝对期限内不响应，会销毁target并可能丢失profile，仍是明确盲区；未确认销毁也不会报成功。
两短定向通过不关闭原I2，不推断负载/产品已修，不替代原失败完整JSON。后续若要捕获原长运行条件，仍需根另行裁决
能接受的前置有限采样窗口与失败销毁代价；本轮不自动扩大窗口/重复/超时或运行第三次full。

## 用户授权完整序列 attempt3（运行中）

用户另行明确授权唯一一次完整序列；R2独审已为APPROVED_WITH_CONCERNS、M2关闭，无新阻断。
本次不重建、不改输入或重跑局部验证。08:12:54.712Z只读重算6275项，聚合仍为
`47875ea8a03292ff73169391d9a1a848fd8022553cdb3a16fb5fac60224d0b90`，新存`frozen-attempt3-inputs.json`。
五源码SHA、117份旧证据记录、17个consumer dist文件及五tarball均核对；预留548个历史文件的SHA/mtime，
旧冻结/attempt1/2/R1/R2未覆盖。原自有PID退出，5191/5193无监听。详细预检见`full-attempt3-preflight.json`。

唯一进程于08:13:03Z启动，launcher14480 / Playwright14482 / tool session85947；确切命令及进程时间在
`full-attempt3-start.json`。直接默认CLI如下（CI未设置）：

```sh
INPUT_STALL_OBSERVE=1 INPUT_STALL_PROFILE=1 PLAYWRIGHT_JSON_OUTPUT_FILE=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-004/full-attempt3-results.json pnpm --filter @einfach/react-excel exec playwright test --config playwright.config.ts --reporter=list,json --workers=1 --retries=0 --output=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-004/full-attempt3-results > /Volumes/work/self/excel/.codex-artifacts/react-excel-package-004/full-attempt3-e2e.log 2>&1
```

2677项、workers1/retries0、原30s、trace retain-on-failure。只有两spec的18例开启页面/Node观测和首次DOMContentLoaded
后尽力≤4s取栈，其余2659例无观测；4500ms收尾期限可能主动销毁自有页并报诊断失败，不等于产品crash，
窗外或销毁仍可能缺栈。本次不是attempt2的零扰动复刻。运行中仅监测同一进程，保持输入冻结，等待自然终态后
再核对结束指纹/旧证据/清理及同JSON1026门禁；此处尚不宣称通过或关闭I2，历史根因未知保留。

运行中第108项新增超时：`advanced-formatting/lifecycle.spec.ts:29` 的390px wildcard/display-text下载重开用例，
日志35.4s。只读原trace显示下载重开、三格高亮与Undo disabled断言均成功，最后在第54行`go(A1)`碰到整例30s期限。
最后Reference fill底层112.316ms、测试层153.510ms，并非30s fill卡死；After Hooks已在1263756.432开始，
fill测试层于1263791.752返回，后续Go click只有测试层约5.297s记录，没有对应底层click；context关闭后的
`toHaveCount(0)`收到undefined成为error-context展示位置。无pageerror/crash，此spec不在18例接线范围，
没有心跳或CPU profile，不能据此归咎负载或宣称根因已知。原始逐调用时序及trace SHA独立记在
`full-attempt3-failure-108-audit.json`，不改源码/超时、不重试；原完整继续自然运行。

第484项新增独立断言失败：`editing/fill-handle-horizontal.spec.ts:7`的390px向左填充，日志6.8s。
第24行Name box断言实际5.044s，14次均读到`D71:D75`而期望`C71:D71`；原Name box输入及Enter已完成。
trace中hover→mouseDown→scrollIntoView→boundingBox→mouseMove(204,720)→preview可见→mouseUp均完成，
随后才出现范围差异，尚未执行后续数据/underline/Undo断言。无pageerror/crash；此spec也没有诊断/profile，
不是原30s输入停顿。确切坐标/滚动原因未知，不根据单份trace作修复猜测。两份`failure-484`审计保留逐调用时序；
pointer补充明确原trace没有序列化boundingBox返回值，不把该值称为已保存实测。继续唯一完整，不改测试或重跑。

第2187项新增独立断言失败：`workbook/freeze-cross-features.spec.ts:66`冻结带内插入，日志6.0s。
Freeze selection、Select row2 click、insert-rows selectOption均返回，最后selectOption耗时8.394ms；
第75行冻结行数期望4却13次读3（cols2），属性等待5005.587ms，尚未执行Undo。末态error-context显示
Select row5 pressed，仅凭该末态不能断言选区如何改变或产品根因。无pageerror/crash及profile，不是原30s输入停顿；
`full-attempt3-failure-2187-audit.json`保留逐API/日志与trace SHA。继续原完整，无源码/断言/时限更改。

### attempt3 自然终态与同次门禁

唯一session85947自然exit1；原JSON记08:13:03.966Z起，5808795.876ms（96.8133min），约09:49:52.762Z完成。
2677项均执行一次：**2674 passed / 1 timedOut / 2 failed / 0 skipped/interrupted/retry/flaky，errors=[]**。
三失败精确耗时为35353ms（108）、6751ms（484）、5974ms（2187），事实与原trace详见上文及独立失败审计，
均未启诊断，不能归为diagnostic pageclose；仍是完整验收阻断，不据猜测改产品或放宽断言。

结束后先执行同口径冻结与保护核验，09:50:51.407Z仍6275项、
`47875ea8a03292ff73169391d9a1a848fd8022553cdb3a16fb5fac60224d0b90`、changed:[]；
548个历史文件SHA/mtime均未变，原报告前缀不变。监测过的112个自有PID均退出，5191/5193无监听。
证据为`frozen-attempt3-verification.json`与`full-attempt3-preservation.json`，没有覆盖旧freeze/JSON/log。

随后只解析本份JSON并执行`pnpm check:e2e-features --results /Volumes/work/self/excel/.codex-artifacts/react-excel-package-004/full-attempt3-results.json`：
自然exit0，**1026/1026主绑定有成功证据**；三失败是主绑定之外的变体/交叉回归，主绑定通过不能抵消完整失败。
同次真实包42/42、嵌入18/18通过；未拼接定向结果、未重试或再开full。

| 原始输出 | SHA-256 |
|---|---|
| full-attempt3-results.json | 9981a94931cc133937efcb231b374a3d8dbfc2cb93c4d54537d865da60bcfc27 |
| full-attempt3-e2e.log | c39d6110b34a1ffc5655754201912bae6f3992280541d1b893a64057ff8ffbd2 |

`full-attempt3-result-audit.json`保存状态/耗时/失败/worker及原包结果；`full-attempt3-feature-gate.log`保存同JSON门禁。
Playwright在失败后自动更换worker/browser（没有手动重启或重试），stats实际worker27706/browser27709，
table实际worker48167/browser48168；不能把全程96.8min当作原两例均在同一寿命浏览器中的证据。
自有PID/CPU/RSS周期快照与进程寿命限制另见`full-attempt3-monitor.jsonl`/`full-attempt3-process-audit.json`。

### attempt3 观测与原输入窗口

两spec共18项均passed，18份profile全部stopped/cleanupConfirmed；实际CPU窗995.806–1898.156ms，
没有deadline、销毁自有页、page-close、pageerror/crash或遗留RPC，drop0。最大页面自身gap427.8ms，
Node gap257.153ms、ELD37.192ms，批次arrival gap1229.285ms分开记录，不混称页面阻塞。

| 原失败入口本次证据 | STAT-019 名称框fill | TABLE-036 公式栏Enter |
|---|---|---|
| 本次功能结果 | passed，1541ms | passed，1629ms |
| 实际profile窗 | 1169.782ms，377 samples | 1257.089ms，351 samples |
| start ack→stop发出（UTC） | 09:32:37.701→38.810 | 09:44:05.135→06.326 |
| 浏览器原始事件映射UTC | 首个case fill约09:32:38.525 | input约09:44:05.732、Enter约05.757 |
| 输入与边界余量 | ack后824.2ms，stop前284.8ms | Enter在ack后622.3ms、stop前568.7ms |

事件使用浏览器`timeOrigin+pageMs`，不是Node批次到达时间；统计case入口按未改beforeEach/原case顺序对应第二个
Name box input（不采内容）。两例各单导航，输入在保守ack→stop边界内；仍含同机跨时钟基准、传输及分辨率误差，
不是逐CPU样本因果对齐。17个单导航例的146个input/Enter均在该边界内；show/hide统计例含reload，
ack→stop2833ms但实际profile仅995.806ms，其9个旧文档事件不能由命令边界证明CPU覆盖，明确记UNKNOWN。
逐例原始时序、profile SHA与缺失限制见`full-attempt3-profiles-audit.json`和`full-attempt3-profile-window-limitations.json`。

本次原两处30s停顿未复现；18例无诊断诱发失败，不代表零扰动或任意长协议停顿必能取栈，绝对期限销毁丢栈盲区仍在。
原attempt1主动终止/fixture遗漏与attempt2两超时历史全部保留，本次通过原两例不能宣称已找出或修复旧根因。
M1 Vite/Rspack控件字号差异继续为已接受非阻断限制；本轮没有build/pack、应用版本、commit/push/npm发布。

回执：**DONE_WITH_CONCERNS（本次授权执行与证据收尾完成）；总004未完成/不可发布，验收7仍未通过，I2不自行关闭。**
下一步仅建议根/独审先检查三份原失败trace：108拆分原动作累计时间与收尾后的断言，484核对拖拽时滚动/坐标命中，
2187核对冻结前后行头点击命中/实际选区与插入范围；证据不足再由根明确授权最小定向定位，不盲目第四full，
不先调超时、扩大repeat或猜测修改产品。本轮不执行这些新定位。

## 三项交叉回归定向收敛（首轮，2026-10-22）

回执：**DONE_WITH_CONCERNS**。本轮有界定位/最小收敛交付完成，004/I2/验收7仍未完成、不可发布；未运行第四full。
根已批准本节对应任务末尾的最小产品范围；没有Core/Rust/样式/构建/metadata/锁/消费者改动。

### 三项原因与最小处理

| 原失败 | 本轮分类与可复核事实 | 本轮处理及限制 |
| --- | --- | --- |
| attempt3 #108，390px格式重开 | 已证测试场景累计预算耗尽；产品性能慢因仍未知。旧trace新空白对话框等待3842.570ms、重开2587.459ms，多次Go/保存约0.88–1.26s；最后Go在整例30042.005ms才发出，先前下载/重开/3格高亮/Undo已过。不是单次Reference.fill卡30s或已证格式丢失。 | 仅该持久化case后续A1:A2/A3/A1三次跳转复用已有Name box真实DOM入口；start/numberFormat仍走Go to。文件规则/原值/General/邻格全部断言保留。原样26.1s通过，收敛后22.7s通过；不是性能基准，也不保证任何负载下都低于30s。 |
| #484，390px向左填充 | 已证测试交互混入底边自动滚动。原trace滚动1481→1491→1551→1591，preview由227×28横条转120×128纵条，松手后D71:D75。新观测目标中心y720、scroll.bottom734，相距14px，位于48px边缘区；新短成功样本也滚动10px。 | 条件观测只等scrollTop增长>84，无sleep，真实按住一次再松手得到D71:D81/原水平断言失败，独立证据保留。最小修正只在left分支按下前真实wheel把目标移离底边，并断言距离>48；right保留原动作。不改产品轴向/自动滚动。 |
| #2187，冻结带内插入 | 已证产品DOM身份风险。旧locator解析row2后，action快照4955853.637中`__playwright_target__`位于普通`.row-headers`的row5，另有新冻结row2且未被标记；click后、插入前Name box已A5:P5。不是仅从最终row5 pressed倒推。 | GridHeaders普通行key由窗口slot改实际`rowStart+index`，避免同节点变成另一行。新增就近身份回归：离窗row2断开、重叠row5仍同节点且label不变；旧key红，新key绿。最终浏览器恢复原全局row2入口，没有用冻结限定selector替代产品证明。点击后新增A2:P2断言，再保留rows4/Undo回3/原值断言。 |

最短调用链核对：GridHeading→selectGridHeaderAtom更新真实选区；StructureTools→runSelectionStructureAtom读取选区起点→真实Worker `sheet.editStructure`→WASM `edit_structure`→Rust `shift_frozen_panes`。
原第5行起点at4不小于冻结带3，Rust保持3符合原生规则；没有证据要求修改Core/Rust。
填充链为FillHandle坐标→workbookCellAtViewportPoint→dragFillHandleAtom→fillSelectionAtom/真实Worker range.fill；自动滚动每帧按新scrollTop重算命中，原横向测试在底边停留时转为纵向有具体现场支持。

### 范围、红绿与自然结果

最终7处输入职责：lifecycle仅收敛非被测导航；fill-horizontal仅left手势准备；freeze-cross-features验证真实第2行选区；GridHeaders仅修行身份；header-selection.test就近DOM身份回归；FEATURES更新既有FREEZE-003说明，ID/主绑定不变；input-stall-profile仅导出既有ProfileResult类型。
support.ts未变，临时观察imports/env分支/脚本均已撤下；其原源码、DOM附件与trace留在忽略证据目录，不成为新框架。新增注释均中文，源/测试文件均≤300行。

所有新文件前缀为`.codex-artifacts/react-excel-package-004/cross-regression-r1-`。下表NAME对应`NAME-results.json`、`NAME.log`、`NAME-output/`；每组独立，未拼成完整通过。

| NAME / tool session | 开始UTC | 自然结果 |
| --- | --- | --- |
| baseline-format / 71666 | 10:07:53.783 | 未改原格式case 1 passed，27.742s含启动 |
| baseline-fill / 9705 | 10:08:31.546 | 未改原left390 case 1 passed，3.007s |
| baseline-freeze / 37518 | 10:08:50.914 | 未改原冻结case 1 passed，2.082s |
| observed-fill / 43875 | 10:10:15.759 | 原动作+有界DOM观测1 passed，3.185s |
| observed-freeze / 45159 | 10:10:30.394 | 原动作+有界DOM观测1 passed，2.602s；实际A2:P2→rows4 |
| edge-fill / 87869 | 10:12:02.406 | 条件按住实验1 failed，8.677s；原水平断言获D71:D81，不当作产品回归 |
| fixed-fill-freeze / 24121 | 10:14:24.704 | 首版4 passed/1 timedOut，38.631s；错误推广预定位到right390使handle出视口，原始失败保留 |
| final / 53460 | 10:15:27.781 | 修回right原动作后6 passed，32.718s：格式390+填充4+冻结1（当时尚无产品key修复） |
| key-browser / 60086 | 10:20:50.284 | 根授权补充阶段3 passed，7.444s：修key后原全局冻结插入、桌面/窄屏冻结可用、FREEZE-003键盘/Undo |

首阶段从第一次启动到final自然结束共486.715s（含实施间隔），低于600s；补充阶段7.444s低于根授权300s。9组实际运行时长合计126.087s，单worker串行、retries0；没有并行浏览器/改30s或expect预算/skip/fixme/only。
确切共同CLI：在`excel/react-excel`执行`INPUT_STALL_OBSERVE=0 INPUT_STALL_PROFILE=0 PLAYWRIGHT_JSON_OUTPUT_NAME=../../.codex-artifacts/react-excel-package-004/cross-regression-r1-NAME-results.json pnpm exec playwright test FILES --grep PATTERN --workers=1 --retries=0 --trace=on --reporter=list,json --output=../../.codex-artifacts/react-excel-package-004/cross-regression-r1-NAME-output`，stdout/stderr定向同名log。
各文件/精确grep、UTC/end、session、自然exit、原错误、日志可证PID见`cross-regression-r1-run-audit.json`。observed两组另设CROSS_REGRESSION_R1_OBSERVE=1，edge另设CROSS_REGRESSION_R1_HOLD_EDGE=1；这些仅临时取证、最终已删。
首launcher/PW PID54560/54568曾只读核实；其余launcher未逐个实时保存，不补造PID，保留对应session及日志中的实际Node PID（含服务器/worker）作资源证据。

身份回归旧实现`cross-regression-r1-header-red.json`为4 passed/1 failed（row2仍连接）；修key后`header-green.json`两文件15/15；最终类型适配后`header-final.json`仍15/15。没有用仅label变化或快照全量重写冒充身份回归。
最终格式/填充浏览器后只有中文注释、换行/尾逗号调整，真实TypeScript parser结构核对相同，见`cross-regression-r1-postrun-token-audit.json`及at-run源副本；原扫描器不处理模板词法上下文的hash不作为门禁。
两个E2E阶段不是同一输入：6例发生在产品key修复前，后3例才覆盖新key；不合并宣称2677完整通过。

### 静态门禁、保护与剩余限制

- 正式`pnpm --filter @einfach/react-excel typecheck`最终exit0（session27640）：`cross-regression-r1-typecheck-final.log`于10:21:59.373Z落盘、131bytes、无诊断。最初包检查TS4058暴露R2返回类型不可命名；根授权仅`export interface ProfileResult`后解决，transpile运行输出相同（run-audit中true），不重跑旧18采样。曾以declaration=false作诊断的exit0不是正式门禁。中间`typecheck-verified.log`于10:21:20.360Z记录exit2的三处Testing Library无效`exact`参数，随后改等价锚定name正则，再跑上述原命令exit0并最终15项复验；“verified”旧名不表示通过，失败log保留。
- 7路径`pnpm exec eslint --config rules/.eslintrc --ignore-path rules/.eslintignore ...`最终exit0：`cross-regression-r1-lint-complete.log`；首次裸eslint未带仓库config exit2、随后旧105字长行lint失败均保留，最终仅换行收敛，不关闭规则。`pnpm check:e2e-features`exit0登记1026项，不是浏览器通过率；`git diff --check`exit0。
- 新delta：`cross-regression-r1-delta.json`。原6275 aggregate `47875ea8a03292ff73169391d9a1a848fd8022553cdb3a16fb5fac60224d0b90`到当前6275 `8b32cfb30ebd2ea5c8a6ead27a51e19e838f1ca5e05eb583ef5a7192b15fad07`，恰上述7键、无新增Git输入，各before/after SHA在该文件；这不是对旧freeze的零差异宣称。548旧证据SHA+mtime、attempt3索引71文件及旧报告43439字节前缀不变。第一次本地mtime核对读错字段后已按ISO schema纠正，未写旧证据。
- 1964项受核实物（React dist/Core多格式/WASM/consumer生产页面/tarballs）全部保持旧hash；Core/Rust/锁/其他生产源不变。**React打包实物尚未含本次GridHeaders产品修复**，旧42包验收/构建只能代表旧实物；本阶段禁build/pack，不能当新源发行证明。
- 清理：run-audit记录本轮已知自有PID均退出，5191/5193无监听（lsof exit1/空输出），未杀其他进程。所有自然输出保留，未追加采样/完整/重建/pack/版本应用/commit/push/npm发布。

旧attempt1失败终止历史、attempt2两输入停顿根因未知、attempt3三失败均未改写。当前三处有针对性处理与局部证据，不等于旧完整门禁通过；历史输入长停顿的产品原因仍未知。M1工具栏字号差异继续非阻断限制；旧长协议停顿可能缺profile的诊断盲区仍在。
下一步仅交原独审者只读核对本节与cross-regression-r1证据；004/I2是否进一步整合新实物及最终完整须由根明确安排，本轮不自行执行。
