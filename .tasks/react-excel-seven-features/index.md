# React Excel 七项功能并行交付

日期：2026-10-20。用户已授权直接实施；七项功能各一位独立 agent，全部 gpt-6.1-sol、xhigh，fork_turns=none。旧验收 goal 已结束，本树不能复用旧通过数冒充新功能通过。

## 最终交付（2026-10-21）

001–008 全部 done。独立总审见 [008-review.md:415](reports/008-review.md#2026-10-21-最终独立总审与签核)，最终签核在该报告第466行：七项逐项 PASS、16行矩阵 PASS、整体 PASS，无本目标内未结 Important/Critical。下文保留早先失败、修复及待验收时点的历史，不将其当当前状态。

- 单一最终完整 E2E 2474/2474，0失败/跳过/重试/flaky；同一原始 JSON 的955/955唯一功能绑定均成功，不拼接诊断轮。七域254加同格备注/批注共存2均在该轮实际通过。
- React615、UI Core3529及完整原生默认/lite/WASM、真实Chrome WASM harness、类型/build/lint等必要证据已由008执行并经独立审阅。既有native ignored如实保留，不计为通过或隐藏为E2E skip。
- 执行快照 `b6cc7df901c0eec140cab844dad5ffc934aaefd86036f16d072a672af3c00b3a` 原样保留；最终 docs-only 快照 `c79ca2f7706624d9bb1c993028896fcb1a73a7c16286e71747ae371301d24aaf` 仅其中FEATURES第9行说明变化，其余2578文件、955登记行、12发布WASM文件及21配置未变。最小docs/diff通过，不冒称最终2579仍全同执行快照。
- 44张受派发中英/两宽图片已独立实看；原合并demo保留。批注仅工作簿本地线程，保护不是认证/加密，自定义公式仅Rust表达式；远程协作、自动保存、任意脚本、完整参数填写表单及整个41项计划不在本次完成声明内。
- 交付报告见 [008-report.md](reports/008-report.md)，原始证据在 `.codex-artifacts/react-excel-seven-features/acceptance-20261021.LeIzkC/`。无本任务活测试过程，未commit/push。

## 全局约束

- 工作目录 /Volumes/work/self/excel，HEAD 1c47e6439657ee18d66db1d194d61dfa44bdf103。开始前工作区已有 106 个跟踪文件修改、135 个未跟踪条目；全部属于用户/先前批次，不能 reset、checkout、删除或覆盖。基线备份目录 /tmp/react-excel-seven-features.QjzUox；共享文件必须与当前工作区比较，不仅比较 HEAD。
- 必须亲自完整阅读 excel/react-excel/SKILL.md、excel/react-excel/skills/react-excel-feature-wave/SKILL.md。写新文件前阅读 /Users/dol/.codex/skills/one-file-one-thing/SKILL.md；写 UI 者另读 /Users/dol/.codex/skills/frontend-design-codex/SKILL.md。不恢复已暂停的 learn-project，不创建新的设计体系。
- React DOM → UI Core command atom → Rust Worker/WASM → 返回投影 → React。Rust 拥有持久数据与语义；Core 仅 UI 状态/command；React 仅渲染、事件、焦点、指针、滚动。只用 @einfach/react useAtomValue/useSetAtom，不在 React 新建 atom/useState/useReducer/controller props，不引入 backend/bridge/adapter 或新生命周期。
- 七个功能各自独立目录，按各 leaf files；一文件一职责，普通文件≤300 行，复杂单算法≤500且解释。注释说明规则/边界。不可为了目录独立复制现有运行层。
- 固定最大 4 个执行/审查 agent 同时运行；不再派子 agent，不 commit/push，不发布、不做跨项目改动。主 agent 仅编排/审阅/写此账本；产品共享接线由 008 专责。
- 只可改自己的 files。共享 barrel、Worker runtime/command union/WASM 声明、Rust module/struct/history/persistence 注册、现有工具栏/格子入口、Lingui 汇总、FEATURES.md 和 seed 由 008 改。每项先读代码，在自己的 reports/NNN-report.md 发布准确的导出签名/字段/注册请求并发送主 agent；008 读取后接线。不得双方抢同一文件，不创建另一套工作簿数据存储。
- agent 可读实现所需源码与自己的任务/index；不能读其他任务或依赖聊天历史。跨域需求由主 agent 转交；额外文件编辑前必须由主 agent 更新范围并确认无并发冲突。
- 原默认 Sales Orders 66 组合并、128 列画布与 Summary 保留；普通订单测试用 e2e/fixtures/plain-sales-orders。新种子只由 008 合并。缩放、自动保存、暂停的 Solid/Vue、协作/身份/版本/外部服务不在范围。
- 中英文使用现有 Lingui。英文和中文字符串清单写报告，由 008 合并 messages.po/反馈；不得每人提取覆盖全仓翻译。
- 每个具体新增操作需唯一主 E2E；功能分组 ID 前缀在 leaf 给定。leaf 报告提供 FEATURES 行（文件/完整标题），008 合并。不能用父综合用例代替不同操作。
- 只由 008 安排真实 Worker/WASM E2E、全仓 build/typecheck/lint/full Vitest/full E2E、WASM 构件重建和 API snapshot 核对。各 leaf 仅必要专项 Vitest/Rust 测试，不抢跑浏览器/全仓/wasm-pack；需要检查锁或并发编译时报告，不重复启动。
- 最终完整 E2E 只跑一个过程，冻结所有源码/测试/WASM直到结束；遇失败保留现场，专项复现修复后再跑下一次；不因观察超时重启。旧 2218/2218 和 824 绑定只能当基线，不是新功能证据。
- 无任意脚本执行：自定义公式先用参数+公式表达式交 Rust 解析求值，不 eval/new Function；若发现只能引入任意代码/新的外部服务才成立，先报告真实阻碍，不能擅自换成几个预置函数。

## 覆盖矩阵

| id | 表面/状态 | 精确入口 | 归属 | 验证证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| N-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/notes/` | 001 | E.notes 26/26：actions 原生增改删/拒绝/纠正 | passed |
| N-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/notes/` | 001 | E.notes actions/persistence/localization + X共存2/2；五域20图已实审 | passed |
| P-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/protection/` | 002 | E.protection 26/26：锁定/允许区、原生权限与Undo守卫 | passed |
| P-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/protection/` | 002 | E.protection persistence/dialog；五域20图已实审 | passed |
| C-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/advanced-conditional-format/` | 003 | E.advanced-conditional-format 70/70：阈值/图标/优先级/边界 | passed |
| C-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/advanced-conditional-format/` | 003 | E.lifecycle 的语言/文件/历史场景 + CF四图已实审，冻结输入布局未变 | passed |
| V-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/advanced-validation/` | 004 | E.advanced-validation 34/34：公式、提示、三级错误与批量原子性 | passed |
| V-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/advanced-validation/` | 004 | E.persistence-language/error-levels + R11–R14闭环；提示/表单10图已实审 | passed |
| H-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/formula-help/` | 005 | E.formula-help 16/16：lite499/full502、实际picker全目录、参数组与提交 | passed |
| H-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/formula-help/` | 005 | E.HELP002–005；顶部四图+最终底部六图已实审；R15/R16闭环 | passed |
| U-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/custom-formulas/` | 006 | E.custom-formulas 31/31：注册/调用/替换/删除与错误恢复 | passed |
| U-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/custom-formulas/` | 006 | E.history-file/localization；五域20图已实审，表达式由Rust求值 | passed |
| T-01 | 界面/原生功能与错误恢复 | `excel/react-excel/src/workbook/comments/` | 007 | E.comments 51/51：新建/回复/解决/重开、输入与权限边界 | passed |
| T-02 | 历史/文件/中英文/窄屏及跨功能 | `excel/react-excel/src/workbook/comments/` | 007 | E.persistence/localization + X共存2/2；五域20图已实审 | passed |
| X-01 | 七项可从实际 React 界面进入、保护跨命令/模块、共同历史/文件 | src/workbook/chrome/ribbon/WorkbookRibbon.tsx + src/rust-workbook/runtime.ts + Rust 原生入口 | 008 | E七域254+共存2全过；完整native/文件/历史专项及R1–R16闭环 | passed |
| X-02 | 全量/多语言/目录/原有 demo/边界审计 | React + UI Core + Rust + lite/full | 008 | E2474/2474，955 results全过，执行前后source/WASM/configs一致；最终docs-only差异明确；008-review:415–466独立总签PASS | passed |

本表E唯一指 `.codex-artifacts/react-excel-seven-features/acceptance-20261021.LeIzkC/full-2474-r15-r16.GWt4iv/report.json`，不是多轮拼接：expected2474/skipped0/unexpected0/flaky0/errors空，audit.json逐域精确成功，final-audit-status.tsv五项全0。955成功绑定见该目录features-955-results.log。原生/JS/构件指纹与各独立截图结论见reports/008-report.md及reports/008-review.md；原失败/中断轮均原样保留。16行矩阵已由独立总审逐行签收，root于2026-10-21将001–008标done；最终文档说明差异与执行快照的区分见上节。

## 任务树

- 001 单元格备注可新增、修改、删除并随原生文件及历史恢复 (leaf，无前置，业务目录独立)
- 002 保护界面与 Rust 写入约束一致且可设置可编辑区域 (leaf，无前置，业务目录独立)
- 003 高级阈值及图标集条件格式在 Rust 计算并正确投影 (leaf，无前置，业务目录独立)
- 004 公式验证、输入提示与错误级别遵循真实原生写入语义 (leaf，无前置，业务目录独立)
- 005 实际编译函数目录中的每个函数均有准确参数帮助 (leaf，无前置，业务目录独立)
- 006 用户自定义公式可注册、调用与移除且由 Rust 求值 (leaf，无前置，业务目录独立)
- 007 单元格线程批注可新建、回复及解决并保留作者与历史 (leaf，无前置，业务目录独立)
- 008 七项共享入口合流与最终整体验收 (leaf，无前置，可边接入边等待领域报告；不能在七项全部成立前完成)

## 状态表

| id | 任务 | model | status | created | done |
| --- | --- | --- | --- | --- | --- |
| 001 | 单元格备注可新增、修改、删除并随原生文件及历史恢复 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 002 | 保护界面与 Rust 写入约束一致且可设置可编辑区域 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 003 | 高级阈值及图标集条件格式在 Rust 计算并正确投影 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 004 | 公式验证、输入提示与错误级别遵循真实原生写入语义 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 005 | 实际编译函数目录中的每个函数均有准确参数帮助 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 006 | 用户自定义公式可注册、调用与移除且由 Rust 求值 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 007 | 单元格线程批注可新建、回复及解决并保留作者与历史 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |
| 008 | 七项共享入口合流与最终整体验收 | gpt-6.1-sol / xhigh | done | 2026-10-20 | 2026-10-21 |

## 决策与变更

- 裁决: 最终唯一完整2474/955已真实通过后，当前能力文档仍将完整帮助、表达式入口、备注/批注及保护写为未接入；008只同步 README/FEATURE_PROGRESS/current-capabilities 与 FEATURES 当前引言，保留旧批次历史和未做边界 — 避免交付文档与已验收代码矛盾，不变更955登记或产品输入 — 只补必要docs/diff及文档指纹，独立reviewer亲读最终delta后由root总签，不重复已冻结重型检查。

- 裁决: 第四失败Chinese插入函数原SUM同义文案期待迁移为精确原生summary_zh（math.tsv:2），保类别与全部原断言；root在实际snapshot另发现Custom/Linked content中文分类仍英文，确有两descriptor/PO缺失，记录真实R16 — 活17849后008仅既有i18n补两分类、feedback参数回归及该E2E原分支精确option标签，不改原生value/目录/未知fallback — 与R15合批红绿/strict Lingui/必要门禁、再最终full。

- 裁决: HELP四图实际审阅只证明当前可见参数区，底部动作及中文限制正文未入镜；Insert draft两宽真实click已有passed，不据此捏造不可达bug — 活17849结束后catalog既有HELP-002/003仅补真实滚动/底部截图，保全目录遍历/原行为，随最终full产生且只审新增图，不另重跑500目录专项 — 完整视觉结论待底部实看。

- 裁决: quick-formula旧「无邻近数字」单case H80紧邻新H75:H79图标数值，实际合法生成SUM；root核seed/merge/原生连续扫描，H81及上/左为空、不合并，活17849结束后仅此case首定位改H81恢复原测试前提 — 保留精确错误、A100边界及全部原值/历史语义，不改seed/推断/宽松断言 — 窄验及最终full仍必须实际通过。

- 裁决: 旧insert-function「without fake argument help」单case XLOOKUP count0与本目标完整原生帮助冲突，root实读原context+Rust reference.tsv真实6参/限制；活1811结束后仅迁移为精确原生签名/活动参数可见并确认未提交，保留格内/公式栏补全、Escape原值及TEXTBEFORE求值/原标题 — 不能为维持无元数据旧预期删真实新帮助，也不能只把0改1糊弄 — 专项和最终full实测，产品目录不变。

- 裁决: R15由原trace和root亲看帧确认参数帮助展开覆盖B1/B2且拦截点击/反拖；活remaining1811结束后008仅FormulaAssist.tsx/CSS区分只读signature与有按钮建议列表，只读指针透传，保帮助内容/建议交互/全部旧E2E坐标与预期 — 修真实产品交叉缺陷，不迁就旧测试点击坐标或隐藏帮助 — 必要React/原跨表与建议按钮E2E专项及门禁后入最终full，原生/Core/WASM无需变更。

- 裁决: remaining2166 中方向填充的「保留copy snapshot」单case H75 raw td读取到↓2，root确认是新CF种子的aria-hidden箭头+既有.cell-content值2；活过程结束后仅将该精确值断言落到既有.cell-content且验证可见，原Copy/Fill/Paste及全部源/邻格断言不变 — 装饰不应混入数值断言，不删seed或改renderer掩盖 — 窄验原case后归最终full；当前失败如实保留。

- 裁决: 剩余2166为缺陷盘点，零重试/单worker/forbid-only，max-failures=0收集完所有普通交互失败；不边跑边改，唯一基础启动普遍崩溃才核实自身PID保现场停 — 避免每三个同类断言失败就停/修/重启的碎片化验证；最终完整2474仍另起单一最终轮 — 诊断失败如实记账，不能把分段无failfast视作验收成功。

- 裁决: R14修复及原四焦点场景/必要门禁绿后先跑从实际JSON导出的remaining2166（2167未跑扣同类390），单一诊断过程冻结输入；后段真实缺陷闭环后再唯一最终full2474/955 — 避免每个新失败都重复约15分钟未变CF70，又保留最终单一整体验收 — 分段结果只能作诊断，不可拼成虚假的完整绿轮。

- 裁决: 真实完整回归发现R14验证面板初始焦点3败，保留旧E2E期待，008仅 DataValidationTools.tsx 与既有advanced-validation React单测修「reading时input禁用，唯一open effect聚焦失败且就绪不再跑」 — modal生命周期与就绪focus拆成两个DOM effect，读就绪后获焦但保存/字段更新不反复重开或抢焦点；不新增状态层 — 专项四个form fits两宽全过及必要React/type/build后冻结新候选再full，旧304/3/2167非完整绿证据。

- 裁决: R12新增容器的唯一 `.grid-validation-feedback` 11行布局规则可保留 grid/viewport/grid.css（root已亲读），精确补充008范围，禁止其它增量 — 这是WorkbookGrid布局而不是验证领域状态，位置自然；避免在绿证过程中或之后无行为收益地来回搬CSS — 保持当前5425输入冻结，按真实结果验收。

- 裁决: 独立截图审查发现 R12 输入提示被grid行头列挤成竖条（root另亲看确认）及R13桌面验证表单说明p导致后续错列；同结构Stop提示纳入布局回归。正常终止008唯一full-2474.7FixJZ自身过程、保留真实已跑/中断记录，再将 advanced-validation.css、WorkbookGrid.tsx、data-validation-panel.css 与两个现有E2E的精确几何回归交008。仅DOM/CSS布局，原生/Core/文案不变，不重建WASM；先红后绿/截图复审后冻结新候选再完整回归 — 不能为保住已启动full而继续验已知有缺陷的UI，也不拿可见文字断言冒充布局验证 — 代价是该中断轮不作为最终完整证据。

- 169首轮14pass/3fail/152未运行，Stop自定义提示缺失是真实跨功能焦点/session问题。008只读定位并隔离WASM证实原生错误/配置完整；pending失焦后恢复focus会对同draft/source发布新session，导致原offer见证安全过期。批准008最小no-op去重update（仅已有drafting/有效source且draft和规范source未变），保留新start/真变更新引用及selector过期保护，先红再绿集成回归和实际三例，不把期望改通用消息。Rust/WASM未变不重复重建；新Core输入复证相关/完整JS门禁。

- default R2完整--no-fail-fast唯一失败为filter未知表错误分类，root实读确认run_filter/clear_filter/apply_filter_range的新增保护guard先于InvalidSheet且map所有Err为ProtectedWorksheet。交008精确三文件恢复custom-call/存在性/权限的安全顺序及原测试最小补显式range未知表；不改旧断言容忍错误。生产Rust变后必须重建lite/full新候选，native及最终真实DOM对应新hash；未变日志丢失不是重建理由。

- root静态追查同类旧契约，在e2e/editing/data-validation.spec.ts:95发现普通paste允许非法H46=2的同一旧预期；精确移交008仅此例，Values及All都原子拒绝，另保留合法All+Undo/Redo。既有FEATURES无此旧标题绑定，主ID不增不丢。未把静态预判当作已运行失败/通过；先最小迁移再窄验，避免最终full才重现已知冲突。

- 2026-10-21完整native首轮真实失败为旧ordinary_paste_does_not_treat_validation_as_a_database_constraint：默认Stop的All粘贴20返回DATA_VALIDATION_FAILED而旧断言unwrap。root已读该原用例和advanced-validation文档，批准008仅本例迁移为真实拒绝/零污染，并保留合法All粘贴+Undo/Redo；不恢复绕过。其它5/5同target已过、此前unit1668/3既有ignored通过不冒称完整default通过。后续default/lite用--no-fail-fast精确收集失败，避免反复重启全套。

- 2026-10-21 001/007 的 R1 测试准备已核对并冻结，001转review；001两spec聚合15b0e131862abf5927bf30e5cde81357b647991ed97f1258ee27b74a2daa16f6，007 boundaries SHA24248177e4d5e4f5618ff2780fd9f1cd857bb63a98fca5aa63343da04363359f。list/空白检查不能算浏览器通过，真实影响集交008。007追加小修仅批注首次焦点的依赖告警及回归，E2E不变。
- 最终lint窗口：008独占持久lint-files.txt列出的61个精确文件中除CommentTools.tsx/comments.test.tsx以外59个文件，仅当前诊断机械格式（quotes/max-len/brace/comma）、局部no-shadow改名和system-clipboard-command的return-await；不改规则、不禁用、不得重构业务。CommentTools及其单测转007专责焦点语义与本文件机械格式，其余业务owner冻结。格式后完整JS/类型/lint由008唯一重证。

- 裁决: 008 追加最小 react-cells/canvas-cells 元数据与条件图标渲染入口，具体 files 已写 008；不允许 renderer 倒依赖 React 应用功能组件 — 原共享渲染器未消费已有 note/comment 标记，新能力否则无可见输出 — 只接投影不搬业务状态，避免跨包循环。
- 已收 001/002/003 首版原生与传输契约，转 008 实施；保护仍须补原生写入面与 Core projection hydrate 清单，契约并非验收通过。
- 裁决: 原生 try_* 入口可新增 SheetError::ProtectedCell 并映射明确保护错误；原有 void setter 保持签名但遇锁定必须零写入 — 不为旧 API 兼容引入旁路 — 当前 Worker 必须使用可返回错误入口，不能将原生拒绝当成功。
- 裁决: 002追加14个原生批量保护入口文件，008确认未改并从其白名单排除；workbook_history_format.rs仍008负责 — 分摊跨功能接线瓶颈并保持逐文件唯一所有权 — 范围仅原子权限预检，不顺手重构旧逻辑。
- 裁决: 验证的提示/级别配置直接放DataValidationRule.options，不为避免25处旧初始化迁移而造递归Advanced kind包装 — 配置属于规则，保持简单数据结构 — 旧测试literal机械补默认，004/008按文件独占分工。
- 裁决: 002待审后auto_fill/apply.rs及inferred.rs转004补真实验证/失败回滚，原保护守卫与旧用户改动保留 — autofill原先完全没有候选验证入口，不能只补确认UI — 后续回派按当前所有权而非历史白名单直接写。
- 裁决: 用户已授权七项各派 agent，跳过二次确认；最大四路并发，七位业务负责人依次补位 — 避免共享内核抢写/重复重建 — 代价是后一组稍晚启动。
- 裁决: 首轮启动 001、002、003、008，004–007 补空闲位；不是将目标缩成前三项 — 可先建原生数据/权限与稳定接线 — 全目标仍七项。
- 裁决: 批注是工作簿内线程数据，作者显示名不是已认证身份；不引入用户未授权的网络/身份服务 — 保留真实批注行为、不冒充协作 — 将来认证服务需替换作者来源。
- 裁决: 原备注/批注/保护旧 UI-core 模块不能证明 Rust 能力已存在 — 当前代码证据如此 — 原生所有权与写入约束必须在本目标补齐。
- 裁决: 自定义公式采用 Rust 解析的公式表达式，保留已有宿主 JS callback API但不开放文件内脚本执行 — 保持用户只接 Rust 主线及输入安全 — 不支持脚本式自定义函数编辑器。
- 裁决: 验证Stop沿用非模态错误/草稿提示，只有Warning/Information弹继续/取消确认 — 保持一次Escape退出编辑与原焦点语义 — 新标题/消息必须仍显示且Stop绝不能写入。
- 裁决: 批量验证确认复用原paste/fill command的发送与成功收尾，008导出resumeValidatedPasteAtom/resumeValidatedFillAtom供004调用 — 不能只重发Worker而遗漏cut清理、反馈、选区扩展 — 不添加新的通用重试层。
- 裁决: 删除fill的protected整表一刀切UI拒绝，按真实目的写入坐标检查原生权限 — 允许区应可操作且只读source不应被误算写入 — 保护权威仍为Rust，不能仅依赖UI许可。
- 裁决: 002待审后workbook_history_borders.rs转008最小修改begin_ranges/history捕获为实际border写入点的连续行段 — 包围矩形会错误要求锁定角格可写并使Undo失败 — 保留002既有原生权限检查，不改不相干边框功能。
- 用户再次明确子agent型号为6.1-sol/xhigh；后续007与独立终审仍以model=gpt-6.1-sol、reasoning_effort=xhigh、fork_turns=none显式派发，不改换低档或默认型号。
- 裁决: clipboard_paste.rs在002交付后转008，auto_fill/apply.rs仍004各自将额外边框history范围改为真实写入行段 — 避免保护+批量Undo错误锁定无关角格 — 不动彼此独占文件。
- 裁决: 自定义公式seed字段放RustWorkbookDefinition/workbook.initialize顶层，不挂SheetInput — 表达式定义是工作簿级唯一registry — ORDERS/既有Summary布局保留，仅空H82:H83示例且启动history清零。
- 裁决: 批注本地时间由WASM Date::now显式传now_ms给Rust校验/持久，Undo/Redo不重新生成；不依赖wasm32-unknown-unknown不完整的std时钟、不新增clock抽象或服务端身份 — 原生确定性测试/浏览器均可用 — 时间仍用户本机，不声称受信任服务端时间。008最小获准notes/persistence.rs补同格comment_indicator字段。

## 验证账本

- 最终收口：已亲读独立总签 `reports/008-review.md:415–466`、008最终docs-only报告顶部、真实文档patch/proof/delta与最终status。16矩阵全部PASS，七项及合流可签，当前任务全done；后续各条为原时点历史。执行b6cc与最终docs-only c79ca2区分，不覆盖旧失败轮/旧日志，不复跑无变化的重型门禁。

- 最终91445自然结束exit0，唯一full-2474-r15-r16.GWt4iv实际2474/2474 passed；root亲读最终JSON stats expected2474/skipped0/unexpected0/flaky0/errors空及status.tsv=0，duration4868791.78ms（约81.15分钟）。不替换/删除任何旧红轮。008正仅用该JSON核955 results、每例attempt及source/全部发布WASM/configs前后一致，独立终审/16矩阵最后签收待原始审计到齐，暂不提前标done。

- 最终91445 HELP16全组实际passed，新六张底部图在visual-help-bottom-6-manifest.txt；独立reviewer已逐张view_image亲看并追加reports/008-review.md:398，LET两宽footer、中文TRANSLATE两宽限制整句与动作完整可读，窄屏无重叠，原四图的底部视觉缺口关闭。root另亲看中英文窄屏footer。未重复旧38图/已关闭R15R16，不跑额外browser，当前最终完整轮仍运行，未据此签2474/955或全部矩阵。

- 独立review已逐个对照pre-r15-r16备份13文件实际diff、React红绿/PO保留、21真实DOMJSON/audit/status，原cross-sheet/completion E2E hash与修前一致。reports/008-review.md:360判R15/R16局部关闭、四旧case/HELP捕获未弱化、无新增Important/Critical；未跑额外测试/浏览器，未签整体。最终91445仍运行，HELP新增底部六图及2474/955最终结果待真正产生。

- 88828权威exit0，受影响最终React113物理文件/615pass/0fail/0pending及types/build/lint/cycles/presentation/955采集/docs/diff九项全0；Lingui1407 strict绿。b6cc7df…source/全部发布WASM/configs逐文件check全0，原生/Core/WASM未变证据复用。008已启动唯一最终91445/full-2474-r15-r16.GWt4iv（forbid-only/workers1/retries0/maxfail3），源/测/构件全程冻结；后续955实际结果只认此报告，当前仍运行中。独立13文件审查尚待结论，新增HELP底部图随后真实产生再实看，不能现在标全部完成。

- R15/R16合批已冻结b6cc7df901c0eec140cab844dad5ffc934aaefd86036f16d072a672af3c00b3a（2579只13文件变化，incremental.patch/changed-files.json持久）。必要React4红→30/30绿，Lingui1407 strict compile绿且原1405记录全保留仅两新增。18055/r15-r16-21.ESu2FA权威exit0：21/21一次passed、零skip/retry/flaky/errors、41.8秒，包含原跨表全11/补全全6（ROUND真click）及copy/XLOOKUP/quick/中文四旧场景，七个跨段原未过case均有实际绿证。独立review正在只读此13文件及原结果；88828统一受影响React完整615/types/build/static尚在执行，最终单一2474/955未完成，未把专项当整体。

- 17849/remaining-1811.ztC8A2已权威exit1：1811全部执行、1807passed/4failed/0skipped/0flaky、每例一次、reportErrors0，50.03分钟。四败为跨表native rejection同R15帮助遮挡、XLOOKUP旧无帮助、H80旧无邻近数字、中文SUM旧说明；无新的第五失败。原JSON/log/trace/PNG/audit与source93750d…/发布WASM逐文件check均持久，未把失败或早先分段改写为最终完整通过。5191/唯一自身runner已终结，008才解冻13精确文件合批R15/R16+已批准测试迁移/帮助底部捕获；先必要红绿、原失败窄验与一次受影响JS/静态，再冻结最终单一2474/955。

- remaining2166/94404已权威exit1/maxfail3：352 passed /3 failed /1811未运行 /0retry、9.7分钟，原audit与not-run-1811清单持久。除图标旧断言外，cross-sheet backwards drag原公式未插引用、third-sheet完成公式场景30s超时；仍只读trace定位，未擅改坐标/预期/产品。按已批准唯一17849续实际未跑1811，目录 `remaining-1811.ztC8A2`，实际max-failures=0/workers1/retries0/forbid-only，同一93750d…候选，copy单例也尚未修改，输入全程冻结。分段不充当最终full。

- 后段94404累计监测更正：尾部通过项不代表全程0fail；较早已有directional-fill copy snapshot raw td期望2实为↓2失败，已向用户更正，008改用全日志累计监测/最终JSON为准。原context/trace保留，root亲读确认H75新CF图标装饰与已有.cell-content分离，已限定单case测试迁移；当前活run输入仍冻结，不把该失败或其它未执行项当通过。

- 独立reviewer R14局部审查已完成（reports/008-review.md:327），亲读React红/绿21与原四legacy DOM JSON、核两legacy E2E hash未变；两个effect不随字段/saving/error反复开窗或抢焦点，取消迟到与trigger回焦保留，无新Important/Critical。仅关闭R14局部，2166诊断/最终单一2474+955/help四图与指纹仍待。

- R14后84333八门禁实际全部exit0，React113files/613passed、types/build/lint/cycles/presentation/955采集/diff；源93750d…/发布WASM全目录/configs逐文件复核均exit0。唯一94404已启动 `remaining-2166.wcMjF1` 诊断，workers1/retries0/forbid-only，实际maxfail3（root maxfail0建议到达前已启动）。不得为CLI选项重启活过程，保持输入冻结；若真实maxfail3结束，下次仅续实际未跑清单可用maxfail0，当前报告必须记真实3。该轮不冒充最终完整2474/955。

- R14原 `validation-focus-4.CP6JZz` 四legacy焦点场景两宽真实4/4 exit0、0retry、6.9秒，两legacy E2E文件完全未改。只组件+授权React回归变化，2579源/测聚合93750d1e71411a4b0fd367bbef4c01c5f8c4e6f002e9331e0f781d657b72a32c。84333唯一React完整613/types/build与静态门禁，结束后准确remaining2166诊断；独立reviewer仅增量复核R14红绿/代码，不重审未变CF四图或其它稳定原生，最终full仍待。

- R14新deferred React回归 `validation-focus-red.log` 实际1 failed/5 passed，读完仍body焦点；最小修复仅DataValidationTools派生reading布尔、初始input.focus移独立[open,reading] effect，原modal[open]保留，未加atom/ref缓存。`validation-focus-green.log` 两现有React文件21/21，覆盖输入不跳焦点、保存错不重开、取消迟到和回触发器。唯一99217在原focus-4三败+同类未跑390实际窄验，尚不宣称浏览器全过；后续React完整613/必要门禁、唯一剩2166诊断再最终full，原生/WASM未变。

- 唯一30713完整轮已真实exit1/maxfail3，`full-2474-layout.bx8BMj` 304 passed /3 failed /2167未运行 /0retry，21.7分钟。CF70、验证34、批注51、自定义31及新布局/modal八例均在这轮通过；三败是comparison fits1280/390和validation fits1280的Applies to初始focus。root已亲读shared组件唯一[open] effect与disabled fieldset，授权R14最小React焦点修复/红绿；旧错误与完整证据全部保留，未声称304后未运行项通过，不重建未变WASM。

- 唯一30713新full已实际40 passed/0 failed且越过旧主动中断点，仍未完整结束。条件格式中英文×1280/390四张图来自本轮已过场景，`full-2474-layout.bx8BMj/visual-cf-4-manifest.txt` 已交独立reviewer只读审图；帮助四图待本轮实际产生。源/测/WASM持续冻结，无第二browser。

- R12/R13经独立reviewer亲读3产品/2E2E、10新图、真实几何红/绿及modal红/8绿原始证据已局部关闭（reports/008-review.md:272–312），无新Important/Critical，整体未签。36755全部exit0：strict compile、React113files/612passed、types/build、lint/cycles/presentation/955采集/diff；未变Core原6261其余项目/原生/WASM复用。最终2579文件 `source-layout-fixed.sha256` 聚合 `2ed8c67a9f404be41a06b6c23f41818cf202d1e646a566a130c354beb7464dd0`，source/WASM全文件/configs复核均exit0。唯一30713完整回归在 `acceptance-20261021.LeIzkC/full-2474-layout.bx8BMj`，workers1/retries0/maxfail3/forbid-only，输入冻结；旧中断轮保留不计完整通过，955最终只认新轮JSON。

- `layout-modal-green-8.q7OFiT` 真实8/8 exit0、0retry、13.8秒，既有Warning/Information两宽Continue/Cancel全部历史/草稿/邻格断言保持通过；只新增CSS auto已冻结。独立reviewer已亲看布局10新图并读红/绿6例：R12提示/Stop同显与真实滚动可读、R13中文桌面配对恢复，等8例原始证据补审后可局部关闭，整体仍待。唯一36755顺序strict Lingui compile→React完整612→types/build→lint/cycles/presentation/955采集/diff，未变Core/Rust/WASM不重跑；静态及增量审查后冻结新候选，唯一full重启。

- root提出的modal指针风险已真实复现：`layout-modal-red-1.04GsfT` 既有warning1280 Continue在原30s超时，trace反复html intercepts pointer events，`pointer-interception.log`持久；未把静态猜测当证据。13606结束后008仅给既有.validation-error-alert补 `pointer-events:auto`，不改任何命令/焦点/测试预期。唯一58112实际验证既有error-levels 8例（Warning/Information×1280/390×Continue/Cancel），布局6例PNG仍对应同样外观；最终full仍待。

- R12/R13 最小布局绿证 `layout-green-r2-6.f0i68N` 实际6/6 exit0、0retry，10张新增PNG包含两宽提示/Stop同显及真实滚动/中文表单。008已恢复grid.css零增量，最终仅原三产品路径，不再搬移。root另只读发现 wrapper pointer-events:none可能被modal继承，008先窄验真实warning Continue，若受阻只补既有dialog CSS auto并验error-levels八例；当前不能把该风险说成已通过。独立reviewer只审本次代码/几何断言/10新图，最终full仍待。

- R12布局首次绿验 `5425` 真实3 failed/3未运行：脱离40px行头后自然fit-content宽190.97，仍未满足新增240px可读门，未放宽断言。008在收到保留grid.css裁决前已于进程结束后原样迁移容器样式至advanced-validation.css并恢复grid.css零增量，按实际现状保留三产品文件，不再来回搬移。现显式input320/Stop360且受可用宽约束，唯一85886运行第二次6例几何绿证；仍不重建原生/WASM。

- R12/R13 几何红证 `layout-red-6.sSfcVv` 真实exit1：6例中5 failed/1 passed、0retry。两宽输入提示宽度实为41.890625px，低于新增可读240px门；中文桌面标签bottom371.25、对应checkbox top407.75，真实错行，390原单列通过。所有原功能文字/零写断言保留，不靠放宽或新timeout。008确认无活浏览器后开始最小三产品文件DOM/CSS修复，未改原生/Core/WASM。

- R12/R13修复前008精确核实自身Playwright CLI PID38507归属于session30226/full-2474.7FixJZ后仅SIGINT该PID，权威exit130；相关子进程已结束、5191无监听，用户3002未动。原2474 JSON完整落盘：29 passed、1 interrupted、2444未执行、0 unexpected/0 flaky；reportStats skipped2445含中断/未执行，不是通过或主动跳过用例。现场日志/JSON/trace/PNG均保留，旧full不能当完整绿证据。008现仅获准布局几何红证→最小纯DOM/CSS修复→绿/增量审图，不重复未变原生/WASM/6261。

- notes-2.EtyEBV 两宽真实 2/2 exit0，窄屏恢复 A2 虚拟窗口后原全部邻格断言通过；原 169 场景已按 file+title 分段唯一全部实际通过，不冒称某一轮169全绿。最终2579文件 source-final.sha256 聚合 `5b8832163224d264e8912701a489202309fbd9427d4ee6ad5b6c735aae7673b3`，发布全文件/执行配置校验 exit0。唯一30226浏览器过程运行完整2474，目录 `acceptance-20261021.LeIzkC/full-2474.7FixJZ`，workers1/retries0/maxfail3/forbid-only，输入冻结。最终955逐结果必须只取此完整实际JSON；当前仅开始，未宣称完整通过。独立reviewer只读五域20图，不运行第二browser。

- remaining-151.QjsCkJ 真实执行 151/151：150 passed / 1 failed / 0 未运行；原 169 唯一场景累计 168 passed，不能标 169 全过。唯一失败 notes/actions 390px 的末尾邻格 A2 已虚拟卸载，公式/空白/marker/Undo 都已通过。精确授权 008 仅该 case 在最后 G2 marker 后真实 select A2，再执行全部原 expectNeighbors；helper 与功能断言不变，两宽窄验通过后冻结最终 E2E hash，唯一完整 2474 回归继续。五域 20 张英中×1280/390 PNG 已持久，独立 reviewer 只读审图，可与唯一浏览器回归并行。

- blank准备ACK修后blank-2.njwDMw真实2/2 exit0、0retry，原空白拒绝自定义文案及Undo后允许清空/邻格断言全保留；未重跑已绿Stop两例或未变6261/native。两Stop+两blank已全部实际通过，R11当前DOM闭环成立。2579files E2E-ready候选2679a64e461d0aa7584394fae65abbaa086cae1bd054d9be9e1671d5dec14c66（相对5689仅E2E ACK变化）；唯一2526运行remaining-151.QjsCkJ，来自原实际JSON未运行manifest，尚不冒称完整169通过。

- Stop原失败两宽已真实passed（stop-4.TDX5Oo），R11代码/Core与该DOM闭环成立；同轮blank-policy两宽failed，不能称4/4。原blank case在修改ignore_blank Apply后无modal关闭/ACK等待就对外部bar输入。008已从原trace提取证实：Apply6437.221ms与fill6438.733ms都仍modal，Enter6445.553ms实际textarea仍kept，未提交空值；blank-trace-modal-evidence.log/actions.log持久。已精确允许仅该case补真实ACK等待、原全部拒绝/Undo/邻格断言保留，不改产品或加时间预算；其余151先不与输入修改并发。

- Stop R11增量已由独立seven_final_review亲读代码/原生detail/红绿日志：代码与Core专项层可接受，无新Important/Critical；引用见证/pending锁/start/cancel未放松，DOM仍待。post-fix root完整438files/6261passed/0failed/0pending（Core3529/React612），root build含types exit0，21255继续最终lint等静态。2579files候选56890f2a771b6657df644989228d681dc9a11819b8c30c5ba6020fd454a88e4f，两WASM hash校验OK。原失败JSON导出stop-4清单4/2files与remaining151/21files已静态确认，导出清单不是浏览器通过。

- Stop提示焦点/session真实修复已先红再绿：stop-session-regression-red-feedback.log新4例1fail/3pass，同draft/source update令配置提示selector=null；session-domain仅3行no-op guard后stop-session-regression-green.log 13files/83passed exit0，保留改draft/换source/取消重开旧见证失效三例。生产/selector/startEditing未改其它语义，Rust/WASM不变。21255重证root完整JS/types/build/lint/静态，随后原3失败+同类390 blank四例真实窄验、补原JSON未运行151，避免重新跑已过14；最终单一full仍重证全部最终候选。

- 2026-10-21最终34245全部exit0：root Vitest437files/6257pass（Core3525/React612含批注6/6）、scripts17、root build含Core/React types/Rollup/Vite、lint/cycles/docs/presentation/955绑定采集/diff。更正上一条PO描述：实际前后SHA也完全一致，并非发生位置变化。2578files冻结聚合178a8937b2bdce1703d0e7c9ecf988185714fcf94dce7d30407e397accef8dc2，持久清单可复核。唯一真实browser88297运行targeted-169.xKSZKP，0retry/maxfail3；当前及最终full结束前不写其输入，955登记≠逐results通过。

- 2026-10-21最终root六project Vitest完整437files/6257tests全部passed exit0，root-vitest.json与原始log持久；包含007焦点新增第6项及Core/React/renderers/TSbaseline。test:scripts exit0。Lingui extract/strict compile exit0，en/zh各1405、zh missing0；lingui-content-equivalence.log证明提取前后PO非注释内容一致，只位置注释变化。34245继续root build/types与最终静态，不能把测试通过当build或DOM通过。

- 2026-10-21新发布两WASM build真实exit0，含filter顺序修复：lite SHA105b67983b4f7f6d30d6a511c47fb92343373b596ea1849ea4d0ad9383d1eedd、full SHA4ecb0ab565fc48d8fa42a490c4e7520edc74d4089fb337b4f1efb43f82dec34a；旧6d1e/cf49仅历史候选，不证明新源码。唯一34245接Lingui→root六project单测→scripts→root build/types→最终静态门禁，仍无并发browser。当前169合并窄验与最终full尚未开始。

- 2026-10-21最终bench --locked --no-run exit0、native WASM205passed/0failed/1既有ignored exit0、wasm-pack headless Chrome真正执行1+6共7/7 exit0；Chrome155使用持久目录内匹配官方driver，不改CI/用户Chrome。native-bench.log/native-wasm-final.log/wasm-browser-harness.log可复核。58232继续唯一lite/full发布构建，169/23files静态采集已确认不等于DOM通过。

- 2026-10-21 final native lite完整exit0：3606passed/0failed/10既有ignored、278结果段；与default3646/0/10同一62380顺序完成，原始日志/status持久。58232唯一重检查顺序接bench --no-run→最终nativeWASM→Chrome debug harness→真实新源码lite/full发布构件；尚不声明后续通过。Lingui extract/strict compile先于最终root六project npm test及hash冻结。

- 2026-10-21 final native default R3完整真实exit0：3646passed/0failed/10既有ignored、278结果段，原始native-excel-core-default-r3.log与native-status.tsv持久可复核；同一62380顺序续lite完整，不并开heavy。Ignored与未执行浏览器不算通过；final WASM/native/browser/gates仍继续。

- 2026-10-21筛选precedence修复窄验54/54 exit0（engine_owned_filter25/filter_range5/protection18/data_validation_paste6），持久native-filter-validation-targeted.log；完整default/lite唯一过程62380在跑，未宣称完整通过。机械格式最终原始证据是format-semantic-equivalence-verified.log，root已读取59/59（两项显式授权return-await/局部变量改名先归一化），旧format-semantic-equivalence.log的13/59是早期比较脚本问题且保留不覆盖；不要引用旧失败文件为最终绿。本次format保ConditionalFormatTools249行，未因formatter膨胀假拆或破坏JSX文本。

- 2026-10-21 007焦点R2已冻结并转review：仅DOM当前author input.value用于open/loaded/phase就绪焦点，不再effect闭包读state.author；新增A/Alice输入不跳、保留作者重开正文获焦、保存成功/失败焦点回归。定向eslint exit0，候选React从5→6未执行，由008唯一完整JS补证；CommentTools SHA b8a397977fd6fc09b04149ae57e4ecb0f3877a9236c94237797851022e78b3cc，test b530b30dcd1ad5138533692877ece3f4ebde468b387b4102c3138e649684ce60，R1 E2E不变。

- 2026-10-21新独立reviewer seven_final_review已亲读001/002/004/006/007的7个冻结E2E准备文件并重取hash匹配报告：未见放松功能/邻居/历史断言，无新增Important/Critical；这只是静态迁移可接受，不是browser/最终签收。当前007仅焦点/lint收尾，008负责机械lint、旧Stop契约测试同步与唯一最终门禁；所有子agent显式6.1-sol/xhigh。

- 当前修复裁决（2026-10-20）：004复用原生真实安装后验证事务并删除虚拟CandidateProvider，覆盖无关volatile缓存与spill扩形；008接共享入口。R2尺寸历史使用仅内存实际writer观测，不新增Weak活动事务生命周期/持久尺寸来源。R7既有WASM API门禁遗漏新目录公开入口，已精确授权008扩展collector并人工核对快照；三项均未验收通过。
- 007最终领域已冻结待审：Rust comments8/8、Core44/44、React5/5 exit0；28主登记与51持久E2E仅采集，WASM3/浏览器/截图尚未执行。008最新共享Core12文件95/95、React renderer1/1、Canvas1/1 exit0，包含commentIndicator真实camelCase传输修复，不能替代WASM证据。
- 008尺寸/API修后专项exit0：seven_feature_integration8/8、protection18/18、border_history4/4、architecture_invariants10passed/1既有snapshot生成器ignored。覆盖显式resize/autoFit/reset的保护Undo拒绝、允许格字体36/多行派生行高合法Undo、notes Undo不覆盖外部尺寸、真正变轴端点冲突原子拒绝。API采集新增5实际入口/10公开签名，人工审后原gate通过；R2/R7待独立复核，非整体验收。
- 004真实安装后验证首轮33例26过7败，确认Store.batch未结算导致旧依赖/spill读取，4个重复引用/无关RAND缓存例已过；由004复用现有flush/受影响数组groups且observer先detach修，不恢复候选模拟引擎。Reviewer新增R8：Table新行literal早于计算列继承校验，008修共享整行顺序、004补新增行/空首行与失败原子回滚专项；当前未通过。
- 范围例外记录：008格式化workbook_history模块曾递归仅触及已冻结007 comments/history.rs纯格式，无语义修改；不擅自恢复。最终统一hash/Rust gate覆盖，后续rustfmt必须精确文件并skip_children=true。

| 范围 | 命令/场景 | 验证版本 | 结果与证据 | 复用 |
| --- | --- | --- | --- | --- |
| 基线 | 已完成上一 goal E2E | HEAD+旧工作区，源码90f086d… | 2218/2218，仅作基线 | 防退化，不证明七项 |
| 001 Core 备注 | pnpm exec vitest run test/notes | 001最终领域hash 0ba736…b8f；详见001报告 | 9/9 pass exit0（busy修复后重跑） | 领域输入未变可复用 |
| 001 Rust 备注 | cargo test --test notes | 001最终领域hash 0ba736…b8f；共享另由008验 | 最终4/4 pass exit0，含CRUD/历史/结构/保护/Unicode；执行者001 | 领域输入未变可复用 |
| 001 React 备注 | pnpm exec vitest run test/workbook/notes | 001最终领域hash 0ba736…b8f；详见001报告 | 最终5/5 pass exit0；26条端到端尚未运行 | 领域输入未变可复用 |
| 003 高级条件格式 | 新Rust/Core及必要既有Core/React专项 | 003报告两个最终SHA聚合 | Rust新增12，Core最终37，React最终21 exit0；执行者003 | 35主操作及窄屏E2E尚未运行 |
| 003 既有条件格式回归 | color_scale/data_bar/formula_sheets/formula_structure/stop五专项 | 同003候选 | 7+5+5+4+3=24/24 exit0；执行者003 | 未改输入可复用 |
| 002 保护Core/React | Core test/protection、React test/workbook/protection | 002报告最终候选 | Core62/62、React5/5 exit0 | 当前Rust18/E2E/WASM未通过 |
| 002 原生保护 | cargo test --test protection --no-default-features | 16例旧候选 | 曾16/16通过；后加18例/全局守卫，编译WIP未运行 | 不可作为最新18通过 |
| 008 元数据最小渲染 | Core metadata、react-cells/canvas-cells cell-metadata Vitest | 008报告19:01 CST候选 | Core2、React renderer1、Canvas1 exit0 | 最终共享候选另验 |
| 005 完整原生帮助 | cargo test --test formula_help；加--no-default-features同专项 | 005已齐资源候选，最终指纹由报告补齐 | full4/4、lite4/4 exit0；实际502/499目录及示例/arity | 005仍补持久E2E，不代表UI通过 |
| 005 最终领域帮助 | Core组合+LET尾参、React必要三文件 | 39文件hash713a1e48…930，详005报告 | Core52/52、LET最终10/10、React12/12 exit0；16E2E仅收集 | Rust通过后两处纯文案更正，由008最终gate统一覆盖 |
| 006 自定义公式Core/React | Core test/custom-formulas；React test/workbook/custom-formulas | 006当前领域候选，最终指纹由报告补齐 | Core64/64（旧59+新增5）、React5/5 exit0 | Rust与E2E待验 |
| 008 共享Core初始化 | test/seven-feature-integration三文件 | 008报告19:18:47候选 | 5/5 exit0，初始化允许范围仍open/history末尾清空 | 最终共享候选另验 |
| 004 高级验证原生首轮 | cargo test --test advanced_validation | 当前16例候选 | 实际12过4败，exit非零；literal候选类型接线漏项及3项fixture待修 | 不标通过；006接续cargo后再专项 |
| 004 高级验证修后 | cargo test --test advanced_validation；Core/React本领域专项 | 004最新18例候选，报告补最终指纹 | Rust18/18、Core11/11、React5/5 exit0；跨表结构/整列迁移已覆盖 | 后续边框精准capture改动另验，WASM/E2E待验 |
| 006 自定义公式原生 | cargo test --test custom_formulas | 006最新领域候选，报告补最终指纹 | 9/9 exit0，含name-version重算/历史/arity/scope/保护 | WASM文件3例及31E2E待验 |
| 008 共享保护/边框 | cargo test --test seven_feature_integration --test protection --test border_history | 008当前共享原生候选，后续尺寸Undo不在此 | 4+18+4=26/26 exit0；Top/Outside内部锁格、稀疏corner锁格写/Undo/Redo | 复用已覆盖且未变输入，尺寸漏洞另验 |
| 004 最终验证原生 | cargo test --test advanced_validation | 004最终23例候选，报告补指纹 | 23/23 exit0；含rename/delete/history、精确边框capture、动态spill成员候选 | Core11/11+React5/5输入未变复用，WASM/E2E待验 |

## 当前调度

- 新008重启后持久原生证据：atom core64/64 exit0；WASM native完整205passed/1既有bench ignored/0failed（web-only native下0不是browser证明）。excel-core default完整编译因tests/data_validation_comparison Rule initializer缺options exit101、0tests；root实读另外6个相同alias旧literal，精确7文件转008仅补Default options，原业务断言不动、不重建WASM。008已继续单一静态窗口31242，所有原始产物在持久acceptance目录。

- 001/007原agent同样pending_init，root均interrupt确认停止（非停止活检查）；两域R1源补丁已在工作树，换同模型6.1-sol/xhigh精确接手仅核对/收尾指定E2E与冻结报告，不重做产品。008新acceptance已核5191无监听/无本项目heavy、WASM两hash匹配，持久验收根`.codex-artifacts/react-excel-seven-features/acceptance-20261021.LeIzkC`，接续完整native窗口。仍最多4执行。

- 008执行交接：原seven_integration重启后持续pending_init，root interrupt返回previous_status=pending_init，旧7508 Unknown process id、ps无heavy，未打断活测试。新同模型6.1-sol/xhigh接008任务与报告，沿既定范围继续验收，原008禁止再写/跑。新证据仅存.codex-artifacts持久目录。001/007收尾准备待回执，002/004/006均已冻；006 R3 spec SHA fd41fd13ffed26bf2e66579ca9a0224df493834d94e0c801416da27d2966ee40（H11先空、10→15、两表邻格，Register ACK后K3日期再#VALUE!），只两项list/空白exit0，未实跑。

- 新外部事实：2026-10-21 10:11 CST机器uptime仅8分钟，root ps未见cargo/browser/vitest，所有旧/tmp/react-excel-seven*现场及新final-gates目录均不存在，源码/HEAD/刚写002文件hash仍在。008先权威核查session7508是否失效，终结才恢复，不盲目重复heavy。后续门禁/JSON/trace/截图统一存已gitignored持久目录`/Volumes/work/self/excel/.codex-artifacts/react-excel-seven-features/`内独立子目录，不改变.gitignore；旧报告通过保留为历史记录，丢失的临时原始现场不能冒称当前可复核，最终新完整验收必须给持久原始产物。

- 002准备R1已冻结待browser：仅persistence严格数组新增Summary完整open允许范围，旧sheet0对象/恢复/锁定拒绝/Undo保留，spec SHA9bcec60fb64daefc40945c49d914a11d93de512a55ba641cc4cd8992ab8a9952已由root实读核对。2例仅list+空白exit0，未新增实跑。原slot释放，下一步006 R3新agent仅两项历史/跨表准备接手。

- 004准备R1已冻结：真实clipboard-read/write权限、真实Fill selected range/down入口，原全部业务断言不变；34例仅list exit0、hash8c50cb7f8c54b5766524c8ec40d709652ff9364aedfc381f542cf878b652354a，batch6例待008先窄验再34。释放slot后派002仅文件保护数组精确新增Summary种子，不改业务；001/007仍修本域E2E，008唯一native窗口active（core→excel-core default→lite→wasm），日志/tmp/react-excel-seven-final-gates.kzmL8G。

- 2026-10-21主协调恢复；已核实无活动heavy/browser。008按file+title合并原256：184passed/12failed/60未跑；CF70/70、帮助16/16、同格共存2/2全过。失败精确表在008报告，不是整体验收。先回派001/004/007仅精确E2E准备R1（产品/共享seed/WASM冻结），008可做不读这些E2E的剩余Rust/静态/build门禁；最大4执行。002严格文件seed数组及006隐藏列/成功Register ACK准备待空位，不丢范围、不重跑不变CF70；最终完整E2E仍要覆盖全域。

- 006 R2原15条两宽实际15/15 exit0，26.2s、原30s预算、0skipped/flaky，/tmp/react-excel-custom-r2.OGOpLY/report.json。008接续唯一256七域定向过程/tmp/react-excel-seven-targeted-r2.euSgCD session55978，retries0/maxfail3，源码/构件冻结，无并行heavy；未将15例冒称256或整功能完成。

- 当前JS门禁全部绿：Core3525/3525、React611/611、Core编译、Reacttypecheck exit0；comments fixture只补公开返回类型，运行语义不变。候选聚合6a2af801539eb572741d15ef4ff481d2db1389b3c233a1de62b33fd6e35b9be9。008已独占启动006原15条两宽真实browser（原30s、maxfail3），/tmp/react-excel-custom-r2.OGOpLY，URL127.0.0.1:5191/lite，无WASM重建；过程结束后直接256，不中途改其输入。

- 修后完整Core3525/3525、React611/611、Core编译exit0。React typecheck剩comments/fixture.tsx导出setup推断泄漏pnpm私有pretty-format路径TS2742；同文件008获最小显式公开返回类型授权，类型变更复跑React typecheck即可，完整Vitest运行语义不变复用。当前无active检查/brower，后续顺序不变。

- JS修复专项Core130/130、React31/31已实际exit0；修后Core完整3525/3525 exit0，/tmp/react-excel-seven-js-fixed.01R3Ra/core.json。候选聚合c6631b168974f9973cdf5f218657ac29a863f80e2d1164df4600a625e6445620，008顺序React完整→Core编译→Reacttypecheck，再006原15条两宽→256 maxfail3；未与browser/Rust并行。此绿灯不代替尚待React/类型/浏览器。

- 独立增量审查已复核R9/R10并可按各自专项关闭，无新Important：帮助raw自有repeat=undefined/JSON省略的nullish修复+Core25/25+两构件HELP-001实跑；保护删TS整表guard+Core23/23+allow-region1280/390 2/2。CF真实一次Paste+ACK仍保留9格/全部功能及相对Undo；006 E3=2、4→6、逐格Name box/恢复K3静态确认未弱化，R2浏览器尚待。审查不含当前JS WIP，不代表整体验收。

- 完整JS首轮真实结果：Core3517pass/4fail（3521项），React608pass/2fail（610项），另Core编译3处及React类型错误，日志/tmp/react-excel-seven-js-gates.vr2bTq。现精确授权008迁移两项fill旧JS整表保护预期、validation读取可取消预期、旧seed严格快照及小范围类型错误（files列于008），不改产品迎合mock；业务owner均冻结，无活动browser/JS进程。修后窄验再完整JS门禁，随后006两宽窄验→256，不计旧红灯为通过。

- 006 R2已冻结待审：只本域fixtures/actions真实Name box定位A2/A3/G2，注册用例恢复K3，所有原值与4/6数学预期保留，无产品修改；31例仅list exit0、SHA f7807fc090311b3ecfd61eacbdf650245a6bef01fba81f2bddb977cafc536ac3。没有新增browser通过证据，待008完成JS窗口后两宽实跑。

- 保护共享重复guard修复已有真实结果：Core23/23+DOM allow-region1280/390 2/2 exit0，E2允许写2/G2重算158、F2锁定拒绝保79、Undo E2回1/G2回79、E3仍2；/tmp/react-excel-protection-history.Q2Fwr9。WASM未变，无当前活动browser；保护全部24+跨域及最终全量仍待，不把两例报成整功能完成。

- 17窄验已结束：006四个1280注册/调用/替换/删除passed，390三项公式4/6实际先通过，后neighbors找已横向虚拟卸载的A2失败，10未运行；现场/tmp/react-excel-seven-smoke-repair.8zNSXd。回006 R2仅用真实Name box定位A2/A3/G2及后续目标保留原断言，审计选区/焦点；不改网格/数学/产品。008可先跑不依赖006文件的保护allow两宽，避免同域fixture失败阻断其它域。

- 006 R1已冻结待浏览器：仅本域3个E2E，明确E3=2且统一DOUBLE(E3)=4/替换=6，保留计算/历史/文件/保护断言；注册不改格子场景补K3原日期2026-09-04前后相同检查，不再假定空白。31例仅list exit0，15例直接受影响清单已给008；没有修改产品/原始数据/plain fixture，无新浏览器通过证据。008可窄验后扩256。

- 008旧Core history权限重复修复已冻结，rust-history-command专项23/23 exit0（允许区Undo/Redo实际native ACK，native拒绝无投影/尺寸/栈污染，跨表cut拒绝保留）；相关文件201/276行，未新增权限表。新固定错误已进Lingui，1405条strict compile exit0。等待006引用fixture就绪后，008统一保护/custom两宽窄验，无需重建WASM。

- CF新fixture3/3在原30s预算exit0：hidden1280/390各16.4/15.7s，icon number12.7s。七域smoke已完成7例5pass/2fail（CF/验证/批注/help/备注通过）：006源E2=1却公式DOUBLE(E2)预期4的fixture引用错配回原owner R1；002允许区输入/计算成功、Undo被旧Core整表protected短路挡住（未发native），008获准仅history command及就近test删重复TS权限，保留Rust唯一裁决/失败原子性。现场/tmp/react-excel-seven-smoke.3Oq7OF，当前无活动browser，未扩256。

- 003 R1 fixture已冻结待实跑：仅start用一次真实系统Clipboard Paste+状态/投影ACK，9格数值/文本/空白均断言，保留原write/选区/所有CF及Undo/Redo断言，无绝对准备history假设。静态收集70例/4文件exit0；helper SHA342df89f…eb573，新fixture浏览器待008的3例窄验，不能以list冒称通过。后续按3例→七域7例→256执行，当前只008持浏览器窗口。

- 新诊断3/3 exit0：原CF隐藏/Undo案例逻辑33.2秒通过，A3仍100、bar10%，无新console/pageerror；HELP-001现有validator raw+JSON真实lite499/full502各通过。非数据丢失，30s失败主要是5次GoTo+输入准备耗18.6秒。回派003 R1仅用真实DOM一次3×3Paste替代无关fixture，逐格验原数据，保留CF全部逻辑/断言/write helper，不增全局timeout。008持单一浏览器窗口，等待新fixture后窄验再扩大。

- 005 R9修复及CI安全测试迁移已冻结待审：Core纯wire3文件25/25 exit0，不默认依赖gitignored full构件；此前真实两构件raw+JSON的27/27记补充证据，长期由008接现有HELP-001原始/JSON严格validator。⑤当前领域hash5a430927…51ce4。CF失败trace已查明先耗尽30s预算，撤销/断言在收尾才执行，暂无native丢值证据；008独占session84778三例诊断（原CF1280 timeout120s+HELP-001 lite/full），新native临时Workbook前/隐藏/Undo值均100，真实label Hide rows。

- 256真实targeted修后首例已越过启动，现CF场景“隐藏A3再Undo”A3可见但值空（预期100）首败，1failed/255未运行；现场/tmp/react-excel-seven-targeted-r1.wkaWp6已保留、过程exit1结束。008先只读定位共享visibility/history/投影，不放宽CF断言。现开放⑤Core去artifact依赖与008 HELP-001已有validator接入的最小测试迁移窗口。

- 独立review增量已确认R5/R6/R8代码+38/38专项可关闭，无新Important；已暂停订阅的原事务内复用flush/现有受影响arrays结算，Table完整行后验证，没有全局bypass。R9=005非重复help字段可选性真实browser故障，仍R1修复中；R4目录seed冲突仍待browser绿证据。008 lite/full构建已exit0，WASM文件13/13已通过，不能据此宣布整体通过。

- 新浏览器发现005 R1：lite/full构件构建exit0，首个真实targeted因Core错误要求非重复help.repeat必须显式null而启动失败（1失败/255未运行，现场/tmp/react-excel-seven-targeted.HG52iT）；实际Rust JSON省略None。已回派005仅修help validator/type与必要Core回归，008持实际构件JSON/现场，不重建WASM、不并行浏览器；此失败不能算功能通过。

- 最新：004 R1语义修复专项advanced_validation38/38 exit0（保留原23），领域/共享实现冻结，仅补报告。R5/R6/R8待独立增量复核；008已获准独占WASM native文件专项→构件重建→七域targeted真实DOM窗口，尚无新浏览器通过证据。R2/R7已由独立review按修复diff+专项关闭。reviewer本轮只复核结算增量，不能代跑/重跑全量。
- 004最终领域SHA5349d5cb…899c，已待审并空闲；formula35行/input_transaction60行，删除CandidateProvider/memo/虚拟spill，不改Store。008冻结生产+test/E2E候选SHA c7d6ca0072f5512b76afdf15be56b35b3163be2f3a1e378075eb269674ead84c；WASM native文件notes3/protection2/validation2/custom3/comments3共13/13 exit0，唯一build:wasm:both正在执行。后续真实Playwright URL为http://127.0.0.1:5191（默认lite，帮助另核full）；目前不声明构件或浏览器通过。

- R8范围裁决：clipboard_apply.rs在002冻结后仅转008补原observer暂停事务内验证前/失败回滚后的settle hook；Table新增行复用同一个模块内解析安装直到整行完成后统一验证，不开放关闭校验scope。004保留领域helper/测试，008独占共享文件。

- 当前执行主责：`/root/seven_acceptance` (接手008)；001–007全部领域及测试准备已冻结待整体review，007焦点R2也已交付。原008/001/007旧pending_init权限已撤回；新seven_final_review只读增量审查后等待最终证据。全部保持6.1-sol/xhigh，未新开功能范围。
- 七个业务结果均未标done，以状态表为准；独立review已完成稳定原生/领域静态审与已报修复专项复核，真实全量/browser/截图尚待。不要因专项或7域代表通过就停止goal。
- 上述调度条目为逆序阶段记录，引用的“待修/尚未运行”只表示该条当时状态；最新结果以更上方条目及008最终报告为准，不能把历史红灯/旧候选绿灯冒称当前结果。

## 遗留与发现

- 保护能力边界裁决：保证维护的React→Worker→WasmWorkbook/Workbook语义用户命令在Rust守卫内执行；独立review目前未发现实际Worker绕守卫链路。既有公开sheet_mut/&mut Sheet原始存储API不构成安全隔离边界，不能声称任意native宿主的所有原始Sheet写都强制保护；不为此复制保护map/新增上下文。无密码保护不是加密/身份权限系统。

- 无已确认的阻塞；各业务需要先发布真实原生接线契约，不允许以本地镜像或假成功替代。
- 首轮原生专项遇 protection/structure.rs 的 shift_interval 参数错误，002已修；001重试后003接续专项。失败编译均未执行测试，不计通过，未重复启动全量。
- 002原生13例首次实际执行12过1败，发现允许编辑区可以经 WorkbookHistory::set_data_validation 清除规则绕过sheet metadata保护；已回008修共享入口，尚未将13例记为通过。
- 002审计发现结构Undo若恢复旧保护快照会丢失后来配置，已回008改当前权限范围按真实逆向几何位移；保护不进入内容Undo，完整删除授权范围不会被内容撤销复活。
- 004首轮原生测试发现literal替换formula时ISFORMULA/FORMULATEXT看到旧类型；领域已有validate_input_literal_value，008负责workbook_input.rs两处及必要hyperlink literal预检接线。另3项Table/clipboard/结构断言fixture由004核正，16例当前不能算通过。
- 根审发现LET第二组未完成name/value时参数高亮丢失（=LET(x,1,y,）；005已确认并补实际atom回归。008获准仅更新旧formula-argument-help/formula-completion的SUM真实v2签名断言，不能删覆盖。
- 006原生专项实际1/9、后5/9通过，发现参数大小写、fixture误撞SECOND内置名及workbook_cycles.rs新CustomFormula enum分支unreachable；前两项006修，后者008修，尚不能报9/9。008轻量Core59/60，旧directional-fill的整表JS短路预期与新允许区语义冲突，获准最小更新且保留锁定拒绝/原生允许区证据。
- 独立审查R1发现Important：workbook_history_borders仍对整个原selection预检，Top仅写两行却被锁定未写内格误拒（仅解锁B1:D2，选择B2:D4应用Top）。已交008按真实plan修并补对应专项；未验前不关闭发现。
- 独立审查R1确认Important目录热路径：每滚动重复Rust序列化全自定义定义（上限约2MiB）、多次验证复制/发布，带动全内置help重建。没有实测卡顿数据，不声称已复现帧延迟；008获准两只读catalog文件最小修复，沿现有workbook/revision复用与相同数据不发布，补调用数/引用保持/失效专项，不造新registry。
- 独立审查R1静态确认005目录E2E严格499项与006 ORDER_NET seed冲突；e2e/formula-help/catalog.spec.ts最小转008修为完整内置+唯一seed实际names，保留全内置DOM逐项比对，不用>=弱化。
- 独立审查R1发现Important尺寸Undo保护漏洞：单格B2尺寸history仅按B2权限检查却回放整列width；调整宽度后仅允许B2并Protect可绕过尺寸sheet锁。已交008最小区分尺寸权限，补原子拒绝/width与cursor不变专项并核对row height/auto-fit，不得误禁普通允许区note/content撤销。
- 008获准共享3-target cargo首次因新增ValidationRuleSources import错误编译失败（0tests），已修且仅重跑同一过程；未误计通过。004等待此窗口后跑最终23例，新增候选spill成员读取正确性，领域现冻结。
- 008复验26/26、004最终23/23已实际通过，cargo释放007本业务专项；尺寸Undo新发现尚不在这两轮通过证据。Top/Outside Important已转reviewer只复核修复范围。
- 独立审查R1新Important：验证候选provider同一公式地址重复求值无memo，RAND()格与自己比较也可能误拒且重复宿主调用。已回004原owner最小单次求值memo及确定性跨sheet/spill回归；23/23旧候选不能替代修后证据。
- 同轮候选链R6 Important：A1=1、C1=SEQUENCE(A1,1,1)，A1验证=C2=2；候选A1=2会新扩形但C2无旧spill anchor而被当空。004已接shape扩展直接读/SUM及缩小回归；不许复制spill布局，先给复用原生安装/回滚事务的最小方案，与008分配shared接线。
- 004 R5三例已实际红复现0/3，最小memo后26例专项已启动且期间源码冻结；R6在该过程结束后追加，同一个R1发现修复组，不混称前一过程覆盖新shape。
- 尺寸R2当前27/27覆盖显式resize/autoFit保护拒绝，但独立审查确认字体36/多行值自动行高的合法操作Undo会被新行高比较误拒。008正在区分显式尺寸事务权限，不能把27当最终R2关闭；避免额外Sheet尺寸来源/计数，先复用真实语义writer与history。
- 007线程合同已齐，008接共享字段；004新验证规则还须覆盖工作表rename/delete，不因18例结构测试通过留成已知缺陷。领域sources复用既有AST改写、共享拓扑历史由008接，待专项。
