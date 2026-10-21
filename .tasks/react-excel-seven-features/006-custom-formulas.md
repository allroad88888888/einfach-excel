---
id: 006
title: 用户自定义公式可注册、调用与移除且由 Rust 求值
kind: leaf
parent: null
depends_on: []
model: gpt-6.1-sol
reasoning_effort: xhigh
status: done
created: 2026-10-20
done: 2026-10-21
base: 1c47e6439657ee18d66db1d194d61dfa44bdf103
files:
  - excel/react-excel/src/workbook/custom-formulas/
  - excel/react-excel/test/workbook/custom-formulas/
  - excel/react-excel/e2e/custom-formulas/
  - excel/react-excel/docs/custom-formulas/
  - excel/spreadsheet-ui-core/src/custom-formulas/
  - excel/spreadsheet-ui-core/src/rust-workbook/custom-formulas/
  - excel/spreadsheet-ui-core/test/custom-formulas/
  - excel/rust/excel-core/src/custom_formulas/
  - excel/rust/excel-core/tests/custom_formulas/
  - excel/rust/wasm/src/custom_formulas/
  - excel/rust/excel-core/tests/custom_formulas.rs
---

# 用户自定义公式可注册、调用与移除且由 Rust 求值

## 本次R1 E2E引用数据一致性修复

### R3换新agent接手：两项历史/跨表E2E准备

前人试了2次，报告在reports/006-report.md，R1源值/引用修正、R2窄屏虚拟邻居准备已由原15条真实两宽15/15验证，不要重做或撤销。新agent保持gpt-6.1-sol/xhigh，接手仅e2e/custom-formulas/history-file.spec.ts与006报告，其它产品/领域/共享fixture/WASM/测试输入冻结；不派子agent、不commit/push。

最新/tmp/react-excel-seven-stable-domains.thIu0c/report.json两项事实：跨表公式写G10，但Summary G列原种子隐藏，td不存在；选真实可见空位（如H10，先确认为空）并保留DOUBLE(5)=10、定义替换后15、跨表与邻格断言。retry duplicate-parameter成功Register后未等待dialog关闭/ACK就定位背景K3，被注册完成时旧投影/焦点恢复A1，真实trace最后A1=#VALUE!而K3仍日期；真实当前lite Node set_cell_input('=DOUBLE()')已得到K3 #VALUE!，不是native缺参bug。只补成功Register之后await editor/dialog count0，再真实定位K3、断言原日期2026-09-04后输入=DOUBLE()，保留#VALUE!及邻居/重试/目录断言。可以读对应trace/error-context与arity-diagnostic截图。不能改原生算术/缺参预期、全局plain seed/隐藏列配置、不要sleep/timeout/skip，不重写已经绿15条。仅必要--list/空白检查，给008/root精确两标题/冻结hash/就绪；不启动browser/cargo/WASM/full JS，实跑008单一窗口。若新证据证明产品问题先原样报告，不擅自扩权。

### R2：窄屏虚拟网格的可见性准备

008修后17例过程首段4个1280注册/调用/替换/删除真实passed；390三项在fixtures.ts neighbors:40找A2时element not found，公式4/6先已通过，10未运行。现场/tmp/react-excel-seven-smoke-repair.8zNSXd。网格横滚至K3后A列已虚拟卸载，原neighbors假定A/G/K可同时留DOM，不能据此判数学失败。

本轮仅修本域E2E可见性准备：neighbors通过既有真实Name box分别定位原A2/A3/G2后断言相同原值，不改预期/不删邻居；审计所有后续K3/公式格断言，必要时同样真实定位再读，不能直接改CSS/滚动虚拟化实现/访问Core atom以跳过。核对helper是否改变后续所需选区/焦点，按调用者真实工作流恢复原目标（不是无谓每次重置）。没有产品权限，没有native/WASM/CI修改。先给008精确就绪，仅--list/空白检查；他单一browser窗口复跑390受影响病例及原1280相关，不能自行浏览器或扩大重写全部测试。

七域代表smoke已执行，006 `call registered expression from formula bar`实际2/预期4。008已只读定位：本域fixtures.ts::inputFormula默认=DOUBLE(E2)，plain-sales-orders既有源E2数量1，所以×2=2才正确；E3才是2。现场/tmp/react-excel-seven-smoke.3Oq7OF/report.json及artifacts trace，未改产品或放宽断言。002另一个失败由008修共享Core history guard，与你无关；当前无活动浏览器。

只核对你e2e/custom-formulas/的原始数据、公式引用和明确数学预期（4/6等）；保持原plain fixture/data/demo，不改Rust/Core/React产品。选择一个一致数据引用（如真正数值2的E3）并在准备时明确断言源值，再核对所有相关调用/替换/Undo/Redo/文件预期，不能只把4改成任意实际值或删断言掩盖计算错。新增/修改仍是原真实DOM函数调用，不dispatch Core或改native数据。不改008独占文件/共享fixture。

只跑必要--list/空白检查并给008准确影响清单与就绪，不启动浏览器/wasm/cargo/全量。008单一窗口复跑受影响调用/替换/历史及smoke，报告不得把list算通过。本轮模型仍gpt-6.1-sol/xhigh，任务为原结果R1，不新建树/不派agent/不commit/push。

## 目标与交付边界

入口接受函数名、参数名、公式表达式：真实用户可新增定义、调用、移除（含替换定义后的依赖重算）。Rust 解析/求值与错误传播；名称/内置冲突、参数个数、重复参数、递归/循环、无效表达式有清楚边界。函数目录/补全/帮助及时更新，移除后调用给出真实错误；注册定义不篡改用户格子。原生文件往返保留表达式定义，不执行下载文件内任意 JavaScript。保留既有宿主 callback API，不混成第二套计算后端。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

保护契约已稳定：Workbook::ensure_workbook_unprotected()->Result<(),&'static str>。新增/替换/移除定义会重算跨表消费者，须在任何定义/历史写前做此原生预检；文件恢复在fresh open workbook安装定义、公式，最后恢复保护。已提交表达式只存原生registry，Core目录仅原生投影。

WASM wasm_workbook_custom.rs 已有 registerCustomFormula(js_sys::Function) 与异步调用，但没有 React 产品入口。Rust 已有 LET/LAMBDA（eval_core_dispatch.rs）、名称及原生解析器。主线程函数不能直接 postMessage。不要 eval/new Function、TS 计算引擎或硬编码几个函数来冒充自定义。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- U-01,U-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出 CustomFormulaTools(): React.JSX.Element；customFormula.read / customFormula.change 命令/handlers；自定义定义的原生类型及目录合并接线清单。对 HELP 输出只消费，不改其文件。
- 先在 reports/006-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/custom-formulas/README.md。
- E2E 功能 ID 用 CUSTOM-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/custom-formulas/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 备注专项发现已存在的async atom通知边界：慢Worker请求await前的同步set可能仍在batch，React看不到busy。参考当前hyperlink/notes命令既有微任务写法，增加deferred React DOM专项验证reading/saving确实出现及重复/取消规则；不新建通用async controller。
- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/006-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 2026-10-20：002交付释放名额，启动006。005正在扩原生目录v2与帮助metadata；仅消费其公开类型/现有源码，新增自定义目录接线由008统一，别改005所属formula-functions/与eval_core_dispatch.rs。
- 已收最终DONE_WITH_CONCERNS及reports/006-report.md：Rust9/9、Core64/64（旧59+新增5）、React5/5通过；31持久E2E/20主FEATURES/3WASM文件测试待008统一，等待独立审查，不标done。
