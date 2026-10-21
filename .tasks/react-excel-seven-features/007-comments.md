---
id: 007
title: 单元格线程批注可新建、回复及解决并保留作者与历史
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
  - excel/react-excel/src/workbook/comments/
  - excel/react-excel/test/workbook/comments/
  - excel/react-excel/e2e/comments/
  - excel/react-excel/docs/comments/
  - excel/spreadsheet-ui-core/src/comments/native/
  - excel/spreadsheet-ui-core/src/rust-workbook/comments/
  - excel/spreadsheet-ui-core/test/comments/
  - excel/rust/excel-core/src/comments/
  - excel/rust/excel-core/tests/comments/
  - excel/rust/wasm/src/comments/
  - excel/rust/excel-core/tests/comments.rs
---

# 单元格线程批注可新建、回复及解决并保留作者与历史

## 目标与交付边界

### 2026-10-21 最终 lint 焦点收尾 R2

执行人为同模型 /root/seven_comments_finish。只改 src/workbook/comments/CommentTools.tsx、test/workbook/comments/comments.test.tsx 与本报告，E2E R1已冻结不再碰。现有首次焦点effect读取state.author但依赖只有open/loaded/phase；直接把author加入依赖会在输入首字符后跳走。以DOM当前input.value选择首次焦点，或同等简单无第二状态的写法，保留空作者初聚焦作者、有作者初聚焦正文、加载/保存收尾及错误恢复，输入作者时不能每字符跳正文。不加ref状态/新atom/disable lint。不改英文文案（避免无关Lingui差异）。本文件和该测试的max-len等机械lint一并修，新增必要焦点回归断言。仅静态lint/--list，专项Vitest需交008统一执行（当前唯一cargo全量窗口），不要自行开检查。008机械格式明确排除这两个文件；交付后给root与seven_acceptance精确hash及影响测试。

### 本次E2E准备修复 R1（原生与产品冻结）

执行交接：原seven_comments重启后pending_init，root已interrupt确认停止，不存在并发写。当前blank真实清空/合并确认/内容Undo代码已可见，不从头重做；新同模型agent仅审阅本节指定boundaries.spec.ts、必要最小收尾、--list/空白检查与准确报告冻结hash。原/tmp现场已丢失，不伪造已读trace/浏览器通过。就绪发/root和新008 `/root/seven_acceptance`，不是已停的seven_integration。仍不启动browser/native/full检查。

只修改e2e/comments/boundaries.spec.ts及自己的报告，不改产品/共享fixture/seed/标题。其余域152条过程30过3败，现场/tmp/react-excel-seven-other-domains.ydlh8H/report.json与对应artifacts/error-context/trace。blank两宽错误假定K3为空，原始真实日期2026-09-04；通过真实UI明确清空并等ACK再创建线程，保留公式79、空白、marker/读取及Undo隔离，不把空白覆盖换成日期覆盖。merged K3:L3因真实非空L3触发Merge these cells? alertdialog，原测试未确认，尚未合并；必须走真实Merge cells确认并等merged结果后沿原线程读取/单marker/Undo断言，核对原K3值及被清L3经Undo恢复，不能绕原生/假写DOM。其它已过30条不重写。仅--list/空白检查并给008精确影响标题/冻结hash/就绪；不跑browser/cargo/WASM/full JS，统一008独占实跑。

新建线程、回复、解决/重新打开讨论；清楚显示作者和本地时间，纯文本安全渲染。作者为用户填写的工作簿内显示名，明确不是已认证身份；线程及元数据存 Rust 工作簿并能原生文件往返，历史可恢复。选格/跨表/结构变更/合并/冻结/备注共存与错误恢复正确。没有身份/网络服务，不伪造多人实时协作、通知、在线状态或服务端安全权限。

这是用户七项中的独立业务结果；Rust 数据/历史/文件、Core 命令、React 控件、就近测试/文档同一业务闭环。不是仅写外观或留测试假数据。共享原生字段/注册与旧界面最小接线归 008，业务目录归本任务，避免并发冲突。

## 上下文

001已实现Sheet.notes与history范围快照/结构shift，可读当前源码以复用相同共享边界，但不可写notes目录或建立另一个metadata backend。由008在HistorySnapshot等共享字段接comments。保护需在comments native写入前调用Workbook::ensure_range_editable(sheet,CellRange::single(addr))；begin_ranges已有集中guard，任何直写入口仍须原子检查。与备注共存跨域E2E由008负责：同格两工具写入，删除备注不删线程，解决/重开线程不改备注。

备注指示器现位于packages/react-cells/src/cell-metadata/与packages/canvas-cells/src/cell-metadata/，都由008所有；批注复用同一投影边界，不在应用目录再造一个未使用的格子指示器。可见投影仅需轻量commentIndicator（精确字段由你给008），完整线程经comments.read按当前格读取，避免每次滚动传整串消息。metadata-only空白格也要保留，普通值覆盖不应顺便清除批注。WASM notes/persistence.rs既有snapshot literal若因comment新字段需补默认，由008统一最小接线，你不要抢写notes领域。

Core comments/ 是旧可选 backend + ticket/ledger 边界，不能直接当作当前 Rust 已有支持。Rust 无原生批注。与 001 备注是不同数据：备注纯文字，批注是有作者/回复/解决态的线程。

主线实际运行的 Worker 是 excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts；连接类型在 commands.ts/wasm-types.ts。公开包 barrel 为 excel/spreadsheet-ui-core/src/index.ts。React 主工具栏为 excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon.tsx。不要编辑这些共享文件，向 008 请求接线。

## 覆盖矩阵行

- T-01,T-02：本功能正常/空/错误/忙碌/取消/焦点、native history/file、桌面1280/窄屏390、中英文及跨功能边界。

## 接口

### 消费

- 现有 RustWorkbookConnection / WorkerCommand / projection 类型及 Core 原子状态（从实际源码读取准确签名）。
- 现有 @einfach/react useAtomValue/useSetAtom；用既有 dialog-focus / Lingui / CSS token，不传 controller 对象。

### 产出

- 导出 CommentTools(): React.JSX.Element；comments.read / comments.change 命令/handlers；与 notes 使用独立 Rust 数据字段，不写对方目录。
- 先在 reports/007-report.md 写准确新接口、字段、持久化/结构迁移、共享修改请求、文件职责清单，立即通知主 agent，然后继续领域实现。不得造未存在接口并宣称已通过；需要 008 接线后才能运行的检查明确记录待验证。
- 产品源码和持久测试均在自己的目录；功能文档放 excel/react-excel/docs/comments/README.md。
- E2E 功能 ID 用 COMMENT-001 起序；报告列出每个具体操作的登记行，008 统一写 FEATURES.md。

## 验收标准

1. 本目标描述的全部用户操作通过真实 React DOM → Core command → Rust Worker/WASM；无硬编码坐标样式/本地数据镜像/假成功。
2. 新增纯逻辑/Rust/Core/React必要专项测试，记录命令、exit code和实际结果；当前未有源码接线时不得把采集错误或 mock 测试算 native 通过。
3. 持久 Playwright 在 e2e/comments/ 独立验收每个操作，桌面和窄屏；由 008 统一运行。断言结果与未受影响邻居/历史/文件，不直接从浏览器写 Core atom。
4. 已有行为不退化，原 demo 保留；功能目录/注释/≤300行要求满足；中英文文案及截图计划明确，源码无 skip/fixme/预期失败占位。
5. 报告列出每项要求完成证据/未验证点。不能因大功能有初版就把目标缩为最容易实现的子集。

## 验证分工

- 备注专项发现已存在的async atom通知边界：慢Worker请求await前的同步set可能仍在batch，React看不到busy。参考当前hyperlink/notes命令既有微任务写法，增加deferred React DOM专项验证reading/saving确实出现及重复/取消规则；不新建通用async controller。
- 你仅跑本业务必要专项测试；不运行完整 Vitest/E2E/build/wasm-pack，不修改运行中的别人的测试输入；不派子 agent、不 commit/push。
- 008 在共享接线后安排浏览器/原生全量和构件；复用未变输入的证据。
- 主 agent 审阅后派独立 reviewer，发现回原任务修复。你的 DONE 是待审交付，不代表整体目标完成。

## 报告

只写 .tasks/react-excel-seven-features/reports/007-report.md；可以通过 collaboration.send_message 给 /root 发送准确接线需求和阶段回执，不读取其他任务报告。结束回执 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + 报告路径。

## 执行记录

- 2026-10-20：006领域交付释放slot，显式gpt-6.1-sol/xhigh、fork_turns=none派发七项中的第七位负责人。008已有notes/protection/conditional/custom原生共享接线，先发布线程的准确字段/历史/持久化契约，不重复建立运行层。
