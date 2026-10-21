---
id: 003
title: 高级阈值及图标集条件格式在 Rust 计算并正确投影
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
  - excel/react-excel/src/workbook/advanced-conditional-format/
  - excel/react-excel/test/workbook/advanced-conditional-format/
  - excel/react-excel/e2e/advanced-conditional-format/
  - excel/react-excel/docs/advanced-conditional-format/
  - excel/spreadsheet-ui-core/src/conditional-formatting/advanced/
  - excel/spreadsheet-ui-core/src/rust-workbook/advanced-conditional-format/
  - excel/spreadsheet-ui-core/test/advanced-conditional-format/
  - excel/rust/excel-core/src/advanced_conditional_format/
  - excel/rust/excel-core/tests/advanced_conditional_format/
  - excel/rust/wasm/src/advanced_conditional_format/
  - excel/spreadsheet-ui-core/src/conditional-formatting/
  - excel/rust/excel-core/src/workbook_conditional*.rs
  - excel/rust/wasm/src/wasm_conditional_format_wire.rs
  - excel/rust/wasm/src/wasm_workbook_conditional_format.rs
  - excel/rust/excel-core/tests/advanced_conditional_format.rs
---

# 高级阈值及图标集条件格式在 Rust 计算并正确投影

## 本次R1持久E2E准备耗时修复

008用新WASM执行256定向时，`hidden numeric members remain in advanced visual statistics at 1280px`因30秒总预算首败；已用原产品/原断言、timeout120s诊断通过（33.2s），不是数据丢失。trace在/tmp/react-excel-seven-cf-diagnostic.h1YpJk：五格GoTo+输入占6.1–24.7s；后续规则/隐藏/Undo均成功，A3=100/bar10%完整通过。HELP-001真实lite/full的raw+JSON严格validator两例也通过。当前无浏览器/heavy进程，允许改你自己的test输入。

这次只优化e2e/advanced-conditional-format/support.ts中start的无关fixture准备，不改CF产品/任何功能断言/历史期待、不加skip/固定sleep/把全测试timeout提高到120s。New blank后复用现有真实DOM系统clipboard流程（可读e2e/editing/system-clipboard.spec.ts及e2e/support/clipboard.ts），一次粘贴3×3 `0\t20\t\n10\t\tNeighbor\n100\t\t` 到A1，按已有permission惯例授予浏览器剪贴板权限、点真实Paste按钮并等待原生投影ACK，逐格断言原有A1=0/A2=10/A3=100/B1=20/C2=Neighbor及应空白邻格，再原GoTo A1:A3继续。不能直接写Core atom/伪造Worker/私改Native workbook代替DOM路径；此处只是准备CF测试数据，不把填5次输入当CF主操作。

保留通用write helper用于那些真正测试后续改值导致CF重算的用例。仅可跑必要静态收集/空白检查，不启动浏览器/wasm/cargo/全量；完成后给008报告精确修改与采集结果，由008单一窗口运行同一hidden案例1280/390、必要共享fixture专项。报告注明此前原逻辑33.2s通过，新fixture尚待真实执行。模型仍gpt-6.1-sol/xhigh，不派子agent/commit/push。

## 目标与交付边界

色阶/数据条/图标阈值的原生最小/最大、数值、百分比、百分位与公式语义；三档图标集、反向及仅图标显示。规则编辑/优先级/停止后续规则/隐藏合并冻结/格式刷隔离等现有行为不得退化。图标及文字/背景组合按实际有效规则投影，不在 React 再算条件。保留原规则文件向后兼容及一次历史。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

当前 ConditionalFormatTools.tsx 的规则目录/CRUD/八种比较/公式/排名/色阶/数据条已支持；Core native-panel.ts/types.ts，Rust workbook_conditional_*.rs，WASM wasm_conditional_format_wire.rs 与 wasm_workbook_conditional_format.rs 是现有路径。必须扩展现有命令而不是另造样式仓库。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- C-01,C-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出 AdvancedConditionalFormatFields 的明确 props 类型，复用 runNativeConditionalFormatAtom 与 conditionalFormat.change；共享旧面板的最小嵌入 diff 交 008，领域元数据及 Rust 求值在本任务范围内完成。
- 先在 reports/003-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/advanced-conditional-format/README.md。
- E2E 功能 ID 用 CFADV-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/advanced-conditional-format/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/003-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 2026-10-20：seven_conditional交DONE_WITH_CONCERNS；Rust新增12/既有24、Core37、React21通过，35个主E2E操作另390px覆盖未执行。待共享seed/翻译/WASM/真实端到端/独立审查，不标done。
