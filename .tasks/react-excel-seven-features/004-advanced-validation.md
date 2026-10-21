---
id: 004
title: 公式验证、输入提示与错误级别遵循真实原生写入语义
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
  - excel/react-excel/src/workbook/advanced-validation/
  - excel/react-excel/test/workbook/advanced-validation/
  - excel/react-excel/e2e/advanced-validation/
  - excel/react-excel/docs/advanced-validation/
  - excel/spreadsheet-ui-core/src/data-validation/advanced/
  - excel/spreadsheet-ui-core/src/rust-workbook/advanced-validation/
  - excel/spreadsheet-ui-core/test/advanced-validation/
  - excel/rust/excel-core/src/advanced_validation/
  - excel/rust/excel-core/tests/advanced_validation/
  - excel/rust/wasm/src/advanced_validation/
  - excel/spreadsheet-ui-core/src/data-validation/
  - excel/rust/excel-core/src/data_validation/
  - excel/rust/excel-core/src/data_validation.rs
  - excel/rust/excel-core/src/clipboard_paste_values.rs
  - excel/rust/excel-core/src/auto_fill/apply.rs
  - excel/rust/excel-core/src/auto_fill/apply/inferred.rs
  - excel/rust/excel-core/src/sheet_data_validation.rs
  - excel/rust/wasm/src/wasm_data_validation_wire.rs
  - excel/rust/wasm/src/wasm_workbook_data_validation.rs
  - excel/rust/excel-core/tests/advanced_validation.rs
  - excel/rust/excel-core/tests/table_*.rs
---

# 公式验证、输入提示与错误级别遵循真实原生写入语义

## 目标与交付边界

### 本次E2E准备修复 R1（非已绿原生R5/R6/R8重做）

只修改e2e/advanced-validation/support.ts和batch-input.spec.ts及自己的报告。真实256定向CF70过后3个失败：两次Copy阶段Clipboard permission was denied，尚未进入validation写入；第三找不存在button Fill down。现场/tmp/react-excel-seven-targeted-r2.euSgCD/report.json及artifacts/advanced-validation-batch-*。授予现有真实浏览器clipboard-read/write权限，不mock剪贴板；fill使用实际combobox Fill selected range的真实Fill down选项（参照当前FillTools和同仓旧E2E）。保留全部Continue/Cancel/原始payload范围、整批Undo、未变邻格及原值断言，不改标题、不加sleep/timeout、不改生产/共享fixture/数据/协议。仅--list/空白检查并给008冻结hash/精确影响与就绪，由008唯一browser窄验再补齐34条；不自行启动browser/cargo/WASM/full JS。

自定义公式验证、选格输入提示、Stop/Warning/Information 错误提示。Stop 必须拒绝原生提交；Warning/Information 若提供继续/取消必须用明确原生确认提交，不静默绕过。引用相对选区锚点，空白策略/多格原子/剪贴板/Table 输入/数组及跨表依赖正确；提示不写历史，接受一次提交一条历史，取消保留草稿。文件往返及中英文可用。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

根裁决：AdvancedValidationOptions直接是DataValidationRule.options字段（默认Stop/无输入提示），DataValidationKind仅新增CustomFormula等真正规则类型；禁止为了省旧literal机械迁移引入递归Advanced{Box<kind>,options}。实际rg仅25处Rule构造/声明。你获准tests/table_*.rs仅补新options默认初始化，不改旧测试语义；WASM tests/data_validation_persistence.rs、table_headers.rs的构造由008修改，不抢写。

追加clipboard_paste_values.rs仅验证实际候选值/公式的原生校验；002不修改此文件，clipboard_paste.rs/apply.rs等其余批量事务仍002独占。确认提示仅保留当前失败操作的不可变输入/坐标、connection/revision与UI草稿，Continue不能重读新选区而改另一块；不引入ticket/retry/controller/新计算后端。

002已交付停止修改，auto_fill/apply.rs及apply/inferred.rs现转你补真正原生验证及失败原子回滚；务必保留已落的所有保护guard与用户基线fill改动。002以后若回派这两文件必须先重新分配，避免并发冲突；008继续不改这两文件。

保护跨域契约已稳定：Workbook::ensure_range_editable(sheet,CellRange)、ensure_sheet_unprotected(sheet)、ensure_workbook_unprotected() -> Result<(), &'static str>。你独占验证规则原生入口，set/remove规则须在第一写/历史begin之前用sheet guard；真正普通输入的验证仍在Rust权威路径，Warning/Information确认不得绕过保护/其他规则。历史共享入口由008接，领域内入口由你接，别假设UI disabled足够。

当前 DataValidationTools.tsx、CellValidationList.tsx，Core data-validation/native-panel.ts/native-rule.ts；Rust data_validation/ 与 sheet_data_validation.rs；WASM wasm_data_validation_wire.rs、wasm_workbook_data_validation.rs。整数/小数/日期/时间/列表/文本长度及比较已验收。Table 表头输入刚补原生 validate_input_value，不可绕过。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- V-01,V-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出 AdvancedValidationFields 的明确 props 类型，复用 runNativeValidationAtom（以实际源码名为准）及 validation.read / validation.change；警告确认协议在早期报告列出精确 Rust/Worker 签名，008 接线。
- 先在 reports/004-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/advanced-validation/README.md。
- E2E 功能 ID 用 VALADV-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/advanced-validation/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 备注专项发现已存在的async atom通知边界：慢Worker请求await前的同步set可能仍在batch，React看不到busy。参考当前hyperlink/notes命令既有微任务写法，增加deferred React DOM专项验证reading/saving确实出现及重复/取消规则；不新建通用async controller。
- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/004-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 2026-10-20：003交付释放名额，开始004。005参数帮助原生数据在生成，当前cargo编译可能因未齐资源阻挡；可先写领域与Core/React专项，缺失公共构建证据保持待验，不反复重启cargo。
- 最新裁决：Stop非模态错误/草稿提示；Warning/Information才显示Continue/Cancel，保留一次Escape退编辑。批量Continue经008导出的resumeValidatedPasteAtom/resumeValidatedFillAtom复用原命令全部成功收尾，不直接另写Worker+投影链。
- 补充产出validation_reference_sheets(&self,target,edit)->Vec<usize>，沿现有retarget参数类型，以相同算法预览会变更的跨表规则owner，供008结构快照准确capture。
- 005 full/lite帮助原生专项均4/4并已释放cargo；004先跑本业务原生专项，结束直接通知006，再由006接续。不要重启或并发重型cargo。
- 最终DONE_WITH_CONCERNS：23/23 Rust、11/11 Core、5/5 React真实通过；sheet rename/delete/结构目录历史、精确边框capture及动态spill候选已闭环，最终领域hash bfb11f9b…a0fd4。34持久E2E/17主操作与WASM2例待008统一；源码冻结、独立审查待收口，不标done。
- 独立审查R1 Important：CandidateProvider每次读取公式格重新parse/eval、只有visiting无memo；B1=RAND()，A1验证=$B$1=$B$1，同一次规则读同格两次得到不同值而误拒，宿主callback也会反复调用。回原owner补单次候选provider内按(sheet,addr)结果memo，保留候选依赖重算，新增重复引用/跨sheet/spill anchor确定性回归。只跑受影响原生专项，不重复Core/React未改输入。
