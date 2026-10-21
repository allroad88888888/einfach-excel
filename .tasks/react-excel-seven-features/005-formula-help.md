---
id: 005
title: 实际编译函数目录中的每个函数均有准确参数帮助
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
  - excel/react-excel/src/workbook/formula-help/
  - excel/react-excel/test/workbook/formula-help/
  - excel/react-excel/e2e/formula-help/
  - excel/react-excel/docs/formula-help/
  - excel/spreadsheet-ui-core/src/formula-functions/help/
  - excel/spreadsheet-ui-core/src/rust-workbook/formula-help/
  - excel/spreadsheet-ui-core/test/formula-help/
  - excel/rust/excel-core/src/formula_help/
  - excel/rust/excel-core/tests/formula_help/
  - excel/rust/wasm/src/formula_help/
  - excel/spreadsheet-ui-core/src/formula-functions/
  - excel/rust/excel-core/src/eval_core_dispatch.rs
  - excel/rust/wasm/src/wasm_function_catalog.rs
  - excel/rust/excel-core/tests/formula_help.rs
---

# 实际编译函数目录中的每个函数均有准确参数帮助

## 目标与交付边界

实际 lite/full 原生目录全部函数的参数签名、必填/可选/重复参数分组、语义说明、调用示例与当前参数高亮。别名对应真实签名，不用统一 args... 或无帮助占位冒充完整。搜索/插入函数/格内及公式栏帮助入口一致，不能触发写入或改 Undo。逐个比对 Rust evaluator 的参数读取与拒绝逻辑；仍存在实现限制须明确标注，不捏造 Office 兼容性。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

Rust excel/rust/excel-core/src/eval_core_dispatch.rs 的 BuiltinFunction 只有 name/category/note；lite 499 / full 502（含别名）由编译分发表产生。Core formula-functions/native-catalog.ts 用 registry.ts 的 21 项补帮助；React InsertFunctionTools.tsx 与公式补全消费。参数帮助不可列假支持函数。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- H-01,H-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出 FormulaParameterHelp 的明确 props 类型；原生 BuiltinFunction 帮助结构及校验覆盖实际编译目录；现有 nativeFunctionCatalogAtom 保留兼容真实消费者，008 嵌入现有面板/补全。
- 先在 reports/005-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/formula-help/README.md。
- E2E 功能 ID 用 HELP-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/formula-help/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/005-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 窗口已开放：session28707已首败exit1结束，无活动浏览器；005现在仅实施已批准的Core两artifact测试/imports清理、保留纯wire回归并窄验，报告最终结果/hash。008同期只改自己的HELP-001并诊断CF新失败，文件无冲突；⑤不要新建WASM、浏览器、CI改动或共享E2E编辑。

- 本次R1修复（真实浏览器阻塞）：008用新lite构件在http://127.0.0.1:5191开始256条定向，首例真实启动失败“Rust returned an invalid function catalog.”，1 failed/255未运行；现场/tmp/react-excel-seven-targeted.HG52iT/report.json及artifacts trace。008 Node直接读新lite确认v2/499完整，但Rust help.repeat=None会省略字段，Core help/validate.ts只接受repeat===null，拒绝实际wire。只修本域help/validate.ts与types.ts中准确可选性及就近test/formula-help，允许非重复组null/undefined且仍要求args无repeats，保留全部其余严格校验；加省略/null/真重复组/非法repeats组合回归，优先消费008提供的实际构件JSON，不能删目录验证或放宽成任意object。native-catalog.ts仍008独占，勿改。
- 008已完成lite/full构建，不要重复WASM或开浏览器；你只跑本域必要Core专项并给结果/最终hash，之后008再执行同批真实DOM。记录为R1/首轮，未授权改Rust数据或UI其它行为。模型继续gpt-6.1-sol/xhigh。
- 根审R1回归的CI依赖：Core默认测试不得要求gitignored full构件（现有CI build只ensure lite）。同意从catalog.test.ts移除2条实际构件导入测试及node fs/path/url imports，保留纯wire省略/undefined/null/严格非法组回归；实际两构件完整validate移至008独占HELP-001既有E2E，已跑27/27记补充证据。当前008 session28707的256定向仍执行时冻结全部输入，你先不编辑，根通知过程结束窗口后再删纯test导入并窄验，不开WASM/浏览器、不改共享catalog.spec.ts、不改CI/加skip。

- 2026-10-20：001领域交付释放名额，优先启动完整函数帮助以减少长尾；每函数参数语义必须对照当前Rust真实实现，不以目录数量代替准确度。
- 最终DONE_WITH_CONCERNS：full/lite原生各4/4，Core组合52/52及最后LET专项10/10，React12/12通过；16条持久E2E仅收集未浏览器执行。报告含最终39文件hash及准确度边界，待独立审查/008最终gate，不标done。
