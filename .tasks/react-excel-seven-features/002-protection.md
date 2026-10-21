---
id: 002
title: 保护界面与 Rust 写入约束一致且可设置可编辑区域
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
  - excel/rust/excel-core/src/clipboard.rs
  - excel/rust/excel-core/src/clipboard_paste.rs
  - excel/rust/excel-core/src/clipboard_apply.rs
  - excel/rust/excel-core/src/clipboard_history_targets.rs
  - excel/rust/excel-core/src/clipboard_column_widths.rs
  - excel/rust/excel-core/src/auto_fill/apply.rs
  - excel/rust/excel-core/src/auto_fill/apply/inferred.rs
  - excel/rust/excel-core/src/sort.rs
  - excel/rust/excel-core/src/auto_fit_dimensions.rs
  - excel/rust/excel-core/src/workbook_history_borders.rs
  - excel/rust/excel-core/src/workbook_history_clear.rs
  - excel/rust/excel-core/src/workbook_history_replace.rs
  - excel/rust/excel-core/src/workbook_history_text_columns.rs
  - excel/rust/excel-core/src/workbook_history_remove_duplicates.rs
  - excel/react-excel/src/workbook/protection/
  - excel/react-excel/test/workbook/protection/
  - excel/react-excel/e2e/protection/
  - excel/react-excel/docs/protection/
  - excel/spreadsheet-ui-core/src/protection/native/
  - excel/spreadsheet-ui-core/src/rust-workbook/protection/
  - excel/spreadsheet-ui-core/test/protection/
  - excel/rust/excel-core/src/protection/
  - excel/rust/excel-core/tests/protection/
  - excel/rust/wasm/src/protection/
  - excel/rust/excel-core/tests/protection.rs
---

# 保护界面与 Rust 写入约束一致且可设置可编辑区域

## 目标与交付边界

### 本次E2E文件种子预期修复 R1

只修改e2e/protection/persistence.spec.ts与自己的报告，产品/共享seed/协议/其它E2E冻结。最新两宽下载文件测试失败：workbook.protection严格数组仅写sheet0，但Summary有本功能明确要求的初始open允许区A71:A73，真实序列化额外sheet1是正确数据。现场/tmp/react-excel-seven-remaining.d3tNhp/report.json及对应artifacts。保留sheet0受保护+E2范围的完整精确对象，补sheet1 mode open、范围rowStart70 rowEnd72 colStart0 colEnd0完整对象及唯一性，不改arrayContaining/放宽长度。原恢复、E2可编辑/F2锁定拒绝、Undo及面板原生状态断言全部保留，测试标题不变。仅--list/空白检查，给008/root精确影响与冻结hash/就绪；不跑browser/cargo/WASM/full JS，不修改已绿保护业务。

保护当前工作表、选择范围设为允许编辑、取消保护。保护必须在 Rust 权威写入处生效，不仅禁用按钮：普通/公式/Table 输入、粘贴/剪切、清除/格式、填充、行列/工作表结构、名称/Table/验证/条件规则等均盘点实际权限语义。保护配置不进内容 Undo，禁止 Undo/Redo 绕过当前保护；原生文件保存/打开保留。首版不伪造安全加密或无验证器的密码对话框；无密码工作表编辑保护明确不是保密安全边界。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

追加并发分工：008确认未改前述新增clipboard/auto_fill/sort/auto_fit/五个history文件，现整文件转你负责原生批量保护预检与必要专项。不重构已有业务；原有auto_fill改动是用户基线，保留。workbook_history_format.rs仍008独占并补axis/border实际目标guard。若新增错误enum需共享WASM映射，请报准确签名给008而非擅改。

待审之后的所有权变更：auto_fill/apply.rs及apply/inferred.rs已转004补原生验证与rollback；保留你的保护代码，但你若回派不能直接再写这两文件，须先报root安排。其余files不变。

另protection/history.rs待审后转008补CustomFormula等后续HistoryChange的保护分类，你回派不得与008并发写此文件。

excel/spreadsheet-ui-core/src/protection/README.md 明确旧模块是 UI-core canonical / optional backend persistence，不是 Rust 权威。现有 Rust 只有 clipboard unlocked_ranges 局部策略，不能冒充全工作表保护。当前写入入口在 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts、excel/rust/wasm/src/wasm_workbook*.rs 和 workbook_history*.rs。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- P-01,P-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出 ProtectionTools(): React.JSX.Element；native protection atoms；protection.read / protection.change 命令/handler；提供集中 Rust ensure_* 守卫及准确接线清单，由 008 修改共享入口。
- 先在 reports/002-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/protection/README.md。
- E2E 功能 ID 用 PROTECT-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/protection/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/002-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 2026-10-20：seven_protection DONE_WITH_CONCERNS进入待审。Core62/React5通过；Rust16为旧候选通过，新增18例与Table全局守卫收紧须008复验；24产品DOM E2E+2WASM补充未执行。真实入口/截图/seed/翻译与原生剩余风险仍待验，不标done。
