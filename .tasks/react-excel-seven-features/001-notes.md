---
id: 001
title: 单元格备注可新增、修改、删除并随原生文件及历史恢复
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
  - excel/react-excel/src/workbook/notes/
  - excel/react-excel/test/workbook/notes/
  - excel/react-excel/e2e/notes/
  - excel/react-excel/docs/notes/
  - excel/spreadsheet-ui-core/src/notes/
  - excel/spreadsheet-ui-core/src/rust-workbook/notes/
  - excel/spreadsheet-ui-core/test/notes/
  - excel/rust/excel-core/src/notes/
  - excel/rust/excel-core/tests/notes/
  - excel/rust/wasm/src/notes/
  - excel/rust/excel-core/tests/notes.rs
---

# 单元格备注可新增、修改、删除并随原生文件及历史恢复

## 目标与交付边界

### 本次E2E准备修复 R1（产品与WASM冻结）

执行交接：原seven_notes重启后pending_init，root已interrupt确认停止，不存在并发写。本R1源码清空K3与幸存seed读取已可见，不从头重做。新同模型agent仅审阅当前两指定E2E是否满足本节、必要最小收尾、--list/空白检查与006式准确报告冻结hash。原/tmp现场已丢失，不伪造已读现场/浏览器通过。就绪发/root和新008 `/root/seven_acceptance`，不是已停的seven_integration。仍不启动browser/native/full检查。

只修e2e/notes/actions.spec.ts与persistence.spec.ts及自己的报告，不改产品/共享seed/邻居helper/测试标题。actions的formula+blank两宽错误假定K3为空，旧原始数据实际日期2026-09-04：通过真实UI明确准备空白并等实际ACK，再沿原新增/读取/Undo/marker/公式79断言；可以真实清空K3，不改变全局fixture，不把预期改成日期而取消空白覆盖。persistence结构删除A列后B2原生种子备注会正确移到A2，不能断言marker0；优先真实打开读取幸存种子text与已删A2的First line不同，Undo后验证原A2和B2各自内容/标记恢复，保留原值/结构历史证明。现场/tmp/react-excel-seven-stable-domains.thIu0c与/tmp/react-excel-seven-remaining.d3tNhp（error-context/trace）。仅--list/空白静态检查，不跑browser/cargo/full JS/WASM；给008准确影响标题、冻结hash/就绪，实跑由008独占。此为该测试准备新发现R1，不重做已绿原生业务。

新增、查看/修改、删除备注；纯文本多行，显示有备注的标记；取消/Escape 不改原文，空白/超限有明确规则。原生数据归 Rust，Undo/Redo、工作表/行列结构随动、原生文件往返、相邻值/公式/格式隔离。备注与线程批注可同格共存，不能互相覆盖。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

现有 excel/spreadsheet-ui-core/src/comments/types.ts 有 CellNote，但 Rust 没有原生备注实现；不能接旧可选 backend。参考现有 excel/rust/excel-core/src/hyperlink/、excel/spreadsheet-ui-core/src/rust-workbook/hyperlink/、excel/react-excel/src/workbook/hyperlink/ 的原生历史/文件链路。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- N-01,N-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出无控制器 props 的 NoteTools(): React.JSX.Element；Core 的 native note 读/写 command atoms；notes.read / notes.change 命令类型与 Worker handlers 放在独立 notes 目录。
- 先在 reports/001-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/notes/README.md。
- E2E 功能 ID 用 NOTE-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/notes/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/001-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 2026-10-20：seven_notes 已交 DONE_WITH_CONCERNS，领域聚合 SHA256 0ba7365568cf06bc860ba2f8322028fa2de7a541e3825ab8550a1e0207ef7b8f；Rust4/Core9/React5通过，26条E2E/WASM专项/截图及独立审查待008统一。不标done，待整体原生接线与实际入口验收。
