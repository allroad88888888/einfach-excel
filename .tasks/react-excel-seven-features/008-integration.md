---
id: 008
title: 七项功能从真实入口合流并通过跨功能整体验收
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
  - excel/react-excel/src/workbook/chrome/
  - excel/react-excel/src/workbook/grid/
  - excel/react-excel/src/workbook/selection/
  - excel/react-excel/src/workbook/formula/FormulaAssist.tsx
  - excel/react-excel/src/workbook/formula/formula-assist.css
  - excel/react-excel/src/i18n/
  - excel/react-excel/src/page/demo/sales-orders/
  - excel/react-excel/README.md
  - excel/react-excel/FEATURE_PROGRESS.md
  - excel/react-excel/docs/current-capabilities.md
  - excel/react-excel/e2e/FEATURES.md
  - excel/react-excel/test/integration/
  - excel/react-excel/test/workbook/editing/formula-completion.test.tsx
  - excel/react-excel/test/workbook/editing/formula-cross-sheet.test.tsx
  - excel/react-excel/e2e/seven-feature-integration/
  - excel/react-excel/e2e/format/conditional*.spec.ts
  - excel/react-excel/e2e/editing/insert-function.spec.ts
  - excel/react-excel/e2e/editing/formula-function-catalog.spec.ts
  - excel/react-excel/e2e/editing/formula-argument-help.spec.ts
  - excel/react-excel/e2e/editing/formula-completion.spec.ts
  - excel/react-excel/e2e/editing/data-validation.spec.ts
  - excel/react-excel/e2e/editing/directional-fill.spec.ts
  - excel/react-excel/e2e/editing/quick-formula.spec.ts
  - excel/react-excel/e2e/workbook/advanced-localization.spec.ts
  - excel/react-excel/test/i18n/feedback.test.ts
  - excel/react-excel/e2e/advanced-validation/edge-input.spec.ts
  - excel/react-excel/e2e/advanced-validation/custom-formula.spec.ts
  - excel/react-excel/e2e/advanced-validation/persistence-language.spec.ts
  - excel/react-excel/src/workbook/advanced-validation/advanced-validation.css
  - excel/react-excel/src/workbook/chrome/ribbon/data-validation-panel.css
  - excel/react-excel/e2e/notes/actions.spec.ts
  - excel/react-excel/e2e/formula-help/catalog.spec.ts
  - excel/spreadsheet-ui-core/src/index.ts
  - excel/spreadsheet-ui-core/src/runtime/
  - excel/spreadsheet-ui-core/src/rust-workbook/
  - excel/spreadsheet-ui-core/src/backend/
  - excel/spreadsheet-ui-core/src/editing/
  - excel/spreadsheet-ui-core/src/projection/
  - excel/spreadsheet-ui-core/src/protection/index.ts
  - excel/spreadsheet-ui-core/src/protection/README.md
  - excel/spreadsheet-ui-core/src/custom-formulas/expression-catalog.ts
  - excel/spreadsheet-ui-core/src/formula-functions/native-catalog.ts
  - excel/spreadsheet-ui-core/src/clipboard/system-clipboard-command.ts
  - excel/spreadsheet-ui-core/src/auto-fill/directional-command.ts
  - excel/spreadsheet-ui-core/src/history/rust-history-command.ts
  - excel/spreadsheet-ui-core/test/rust-history-command.test.ts
  - excel/spreadsheet-ui-core/test/seven-feature-integration/
  - excel/spreadsheet-ui-core/test/directional-fill.test.ts
  - excel/spreadsheet-ui-core/test/fill-handle-drag.test.ts
  - excel/spreadsheet-ui-core/test/fill-series-panel.test.ts
  - excel/spreadsheet-ui-core/test/native-data-validation.test.ts
  - excel/spreadsheet-ui-core/src/notes/command.ts
  - excel/spreadsheet-ui-core/src/comments/native/command.ts
  - excel/react-excel/test/page/demo/sales-orders/sales-orders-workbook.test.ts
  - excel/react-excel/test/workbook/advanced-validation/advanced-validation.test.tsx
  - excel/react-excel/test/workbook/comments/fixture.tsx
  - excel/react-excel/test/workbook/custom-formulas/custom-formulas.test.tsx
  - excel/react-excel/test/workbook/notes/notes.test.tsx
  - excel/react-excel/test/workbook/protection/protection.test.tsx
  - excel/rust/excel-core/src/lib.rs
  - excel/rust/excel-core/src/sheet*.rs
  - excel/rust/excel-core/src/workbook*.rs
  - excel/rust/excel-core/src/history*.rs
  - excel/rust/excel-core/src/eval*.rs
  - excel/rust/excel-core/src/hyperlink/
  - excel/rust/excel-core/src/filter.rs
  - excel/rust/excel-core/src/protection/history.rs
  - excel/rust/excel-core/src/workbook_history_borders.rs
  - excel/rust/excel-core/src/clipboard_paste.rs
  - excel/rust/excel-core/src/clipboard_apply.rs
  - excel/rust/excel-core/tests/fixtures/wasm_api_signatures.txt
  - excel/rust/excel-core/tests/seven_feature_integration.rs
  - excel/rust/excel-core/tests/architecture_invariants.rs
  - excel/rust/excel-core/tests/engine_owned_filter.rs
  - excel/rust/excel-core/tests/data_validation_comparison.rs
  - excel/rust/excel-core/tests/data_validation_history.rs
  - excel/rust/excel-core/tests/data_validation_input.rs
  - excel/rust/excel-core/tests/data_validation_limits.rs
  - excel/rust/excel-core/tests/data_validation_paste.rs
  - excel/rust/excel-core/tests/data_validation_regions.rs
  - excel/rust/excel-core/tests/data_validation_rules.rs
  - excel/rust/wasm/src/lib.rs
  - excel/rust/wasm/src/wasm_workbook*.rs
  - excel/rust/wasm/src/wasm_*persistence*.rs
  - excel/rust/wasm/src/wasm_*wire.rs
  - excel/rust/wasm/src/wasm_tests/
  - excel/rust/wasm/src/hyperlink/mod.rs
  - excel/rust/wasm/src/notes/persistence.rs
  - excel/rust/wasm/src/wasm_write_errors.rs
  - excel/rust/wasm/src/wasm_error_wires.rs
  - excel/rust/wasm/src/wasm_custom_registry.rs
  - packages/react-cells/src/SpreadsheetGrid.tsx
  - packages/react-cells/src/MergedCells.tsx
  - packages/react-cells/src/cell-metadata/
  - packages/react-cells/test/cell-metadata/
  - packages/canvas-cells/src/paint-cell.ts
  - packages/canvas-cells/src/cell-metadata/
  - packages/canvas-cells/test/cell-metadata/
---

# 七项功能从真实入口合流并通过跨功能整体验收

## 目标

### 2026-10-21 最终能力文档的过期描述收口

最终完整回归已通过，源码/tests/WASM 保持冻结。root 只额外授权 008 最小同步 `docs/current-capabilities.md` 中本轮七项功能的当前能力与边界、完整原生函数帮助及自定义表达式入口描述；若定向填充保护说明仍写成整张受保护表必拒绝，须据本轮真实可编辑范围语义校准，不能泛化为所有命令可用。`FEATURE_PROGRESS.md` 的当前全范围表中 #09、#21–22、#24–26、#34–35、#40 及紧邻条件格式边界说明同步，保留未做的参数填写表单、网络协作、身份认证、加密及其它高级能力。旧批次记录保留，不全文件替换历史文案，不触及其它既有欠账。

仅文档改动及必要 docs/diff 检查，不重复已冻结的源码、单测、E2E、Rust 或 WASM 门禁；更新交付文档指纹并通知独立 reviewer 后再由 root 总签，无 commit/push。

### 2026-10-21 SUM 原生中文文案契约迁移及 R16 两个分类漏翻译

remaining1811第1249项真实失败 Chinese 插入函数：旧断言「计算单元格区域内所有数字之和。」与原生math.tsv:2的准确新summary_zh「求数字参数及区域中数字单元格的和。」不一致。root亲读case/context/math.tsv，类别切换及SUM选项都成功；只迁移该button===插入函数分支到 `[data-formula-help="SUM"] .formula-help-summary` 精确新中文，并保原选择/类别/关闭/其它面板断言、标题不改，不将其误报漏翻译或改回原生文案。

root另在同一原snapshot实际发现中文类别选项 `Custom` 与 `Linked content` 仍英文；源码feedback-messages.ts确实缺两descriptor，PO也无这两msgid。这是新增真实R16本地化缺陷，不是失败期望的同义改写。17849结束后008仅在既有已授权feedback-messages及en/zh PO按当前机制加入两准确分类（自定义/链接内容），保原category value/原生目录不变；不修改未知诊断fallback/翻译函数名或用户数据。在既有test/i18n/feedback.test.ts参数表补两条真实zh/en回归先红后绿；同一个Chinese插入函数E2E分支检查两原value对应中文option label，保Math & statistics等原控制断言。i18n提取/strict compile与必要React/门禁在R15同批统一执行，不重建Rust/WASM。不在活run写、不泛改其它本地化case。

### 2026-10-21 HELP 面板底部视觉证据补齐（非产品缺陷）

独立reviewer已亲看help四图：顶部/当前可见参数布局可接受，但四图都未拍到底部Insert/Cancel，中文TRANSLATE限制正文也在截图下方。root亲看两图并实读catalog/editing E2E确认边界；HELP-005两宽Insert draft真实click已passed，不能把未入镜说成不可达bug，也不能宣称已亲看完整限制及底部。

17849结束后与R15合批，仅既有catalog.spec.ts的HELP-002/003两宽各在原顶部截图后追加真实滚动到既有footer/限制正文并捕获底部PNG及必要视口几何断言。保留完整499内置逐项遍历、ORDER_NET独立帮助、全部原语言/值/历史/Escape/focus/标题/timeout，不另增case/删旧图/改产品或helper。英语LET底部与中文TRANSLATE限制/动作均须实际入镜，长内容可分两张，不要求top与footer同屏。不要为补图另跑耗时全目录专项；随既定最终完整2474真实产生，再交独立reviewer只审新增底部截图。原四图结论保持其可见范围，不冒充完整。

### 2026-10-21 快速公式「无邻近数字」单例准备迁移

remaining1811真实失败 `quick-formula.spec.ts:98 no nearby number and canvas edge stay correctable`：H80得到合法 `=SUM(H75:H79)`，新图标示例H75:H79确有0/10/50/75/100。root亲读seed、SUMMARY_MERGES及workbook_quick_formula.rs，原生仅推断紧邻上/左连续数字、不跨空白；H81自身、紧邻H80与G81均无内容，且H81不属于合并区（现有合并只在第15、17–18行），符合原「无邻近数字」前提。G隐藏不改变原生读取为空的事实。

仍等17849真正结束后才改。008仅此case第一处定位H80改H81，可补真实bar原值为空、Undo disabled等准备/零写断言；保留原Auto sum入口及精确immediately below or right错误、A100:B100合法可取消草稿、A99/A100原生输入与no room边界/值断言，原标题/helper/timeout不动。不删新演示seed、不改产品/原生推断、不泛改其它用例。和其它已批准旧测试迁移一起窄验，再纳入最终完整轮；当前失败记录保留。

### 2026-10-21 完整原生帮助的旧 XLOOKUP「无元数据」单例契约迁移

remaining1811真实新增失败 insert-function.spec.ts:111 `autocomplete uses the native catalog in both editing inputs, without fake argument help` 的count0，实际原生完整帮助存在。root亲读原context及Rust formula_help/reference.tsv 第6行，XLOOKUP有6个真实参数（前三必填，后三可选）及limitations.rs的引用输入限制；005本目标明确完整编译目录帮助，因此不再期待无参数帮助，不是产品伪造元数据。该标题当前不在FEATURES唯一主绑定中，但保留标题即可避免不必要登记变化。

仍等17849真正结束后才改。008仅此原case把旧status count0替换为真实可见帮助的精确原生XLOOKUP签名/活动参数断言，可按现有data-formula-help-signature/active-argument定位；保留原格内= XLO补全、Tab不提交/Escape回原Acme值、公式栏TEXTBEFORE补全及最终hello实际求值。增加确认Undo仍disabled或原值/邻格未变等零原生写验证，不得只改count1或用宽松存在替代准确帮助。不更改产品/原生目录/helper/fixture/其它case，标题/绑定不动。单case与R15建议鼠标交互专项合并验证，最终完整轮覆盖。

### 2026-10-21 R15 只读参数帮助阻断网格引用指针

remaining2166两跨表失败已由原trace确认，root另亲看drag-frame原图：展开参数帮助覆盖Summary B1/B2，人工反向拖选坐标落入帮助层；third-sheet-pointer-evidence.log连续记录formula-help-active从formula-assist subtree拦截B1 click直到30秒。不是坐标或公式期望错，旧真实反向拖选/原单次保存/重算语义必须保留。后续remaining1811同文件native rejection的新败只读先确认是否同因，不能提前算通过。

17849活过程全程冻结，结束后才可改。008仅已获准 FormulaAssist.tsx + formula-assist.css，在现有render分支区分建议列表（有真实按钮、继续可点击）与只读signature参数帮助（pointer-events透传到底下网格）；复用现有suggestions/signature派生，只改纯DOM标记/class及CSS，不新增atom/ref/事件转发/测量/新浮层/隐藏帮助或降低完整帮助内容。不要全局给建议列表pointer-events:none；键盘接受建议与按钮点击/输入焦点保持原语义。

复用现有 formula-completion / formula-cross-sheet React两文件的必要测试，可在合适现例补分支标记及交互断言，遵守300行上限，不为单CSS拆大量新文件。原跨表E2E文件、帮助/补全E2E期待和坐标均不改；用原失败case及同文件必要引用场景、真实建议按钮点击做专项，证明帮助仍可读且不阻挡引用/保存、建议可点击。现有trace/DOM已经真实红证，无需修改旧预期或再造失败。必要React完整/类型/build/lint后冻结，剩余诊断关闭后仍最终单一full2474/955；Core/Rust/WASM未变不重跑重建。

### 2026-10-21 后段盘点的原图标种子断言精确迁移

活94404/remaining2166已实际发现 `editing/directional-fill.spec.ts` 的 `fill leaves the existing copy snapshot untouched` 原 `td[74:7].toHaveText('2')` 读到 `↓2`。root亲读新 Summary H75:H79 icon-set 示例及 renderer：图标是aria-hidden装饰span，原值在既有 `.cell-content` span，原生复制/公式值应仍为2。不是把箭头吞掉或更改全局seed来迁就旧测试，也没有确认数据污染。

全程冻结，必须等当前过程真实终结才修改。008仅获准该case原H75最终断言改为既有 `.cell-content` 的精确 `toHaveText('2')` 并 `toBeVisible()`；保留真实Copy→Fill→Paste及所有邻格/源值断言、标题/timeout。可同时核对H75 bar原始值仍2，不能接受含图标的宽松regex或只查DOM存在。其它case/helper/fixture/renderer/产品均不改。之后只窄验该原case，纳入最终完整轮。若诊断又有不同失败，精确回root，不在活run边改或自动泛改旧E2E。

### 2026-10-21 完整轮 R14 验证面板异步就绪焦点修复

后段诊断执行裁决：008从原完整JSON导出 focus-4.test-list.txt（三败+同类未跑390）及 remaining-2166.test-list.txt（实际未跑2167扣同类390）。R14四专项及必要门禁绿后先唯一执行剩余2166作诊断，及时收集后段实际失败，不为每个新失败反复重走前70个重型CF；期间源/测/WASM同样冻结，保留该分段原始JSON与未跑清单。全部已知失败与剩余诊断闭环之后仍必须唯一最终完整2474+955实际results，不能以分段拼接冒充单一完整通过。

该2166是后段缺陷盘点，使用workers1/retries0/forbid-only，允许 `--max-failures=0` 完整收集，不每遇3个同类失败就反复停/修/重启。源/测/WASM仍全程冻结；可以只读分析已完成失败，不得边跑边改。只有基础启动/Worker普遍崩溃导致后续无诊断价值时，才核实自身PID并保现场提前终止；普通交互断言失败继续收集。最终单一完整验收仍按已约定maxfail3，不把诊断错误算成功。

full-2474-layout.bx8BMj 已权威exit1/maxfail3：304 passed / 3 failed / 2167未执行 / 0retry，21.7分钟。三败均为旧E2E真实期待的 Applies to 初始焦点（comparison form fits 两宽及 validation form fits 1280），不是尺寸断言。390同类 validation form 尚未执行，也须专项一起覆盖。原始JSON/trace/context保持不变，不能改预期或把未跑算通过。

root亲读 DataValidationTools.tsx：现有唯一[open] modal effect在reading导致fieldset disabled时focus首input失败，就绪后不再执行。008仅获准该既有组件分离modal打开/关闭与首input初始就绪focus（DOM/ref职责，不新增Core状态/Ref缓存/会话身份）；复用现有 phase===reading 的布尔派生，避免把依赖直接改为phase后每次saving/失败都close/reopen modal或抢走正在编辑控件的焦点。读取完成后focus Applies to；字段输入/修改不重复focus；saving/错误不重开modal；Cancel读取和迟到响应不能复活，关闭仍回触发器。

在已授权 test/workbook/advanced-validation/advanced-validation.test.tsx 补deferred read真实React回归先红后绿，覆盖读完获焦及字段编辑不跳焦点、保存错误不重开/乱聚焦、取消读取保原收尾。现有两legacy E2E仅执行四个comparison/validation form fits两宽，所有原焦点/值/溢出断言和标题不得修改。其它reading/焦点专项可复用现有React必要测试。必要types/lint/build及React完整一次，新Core/Rust/WASM输入均未变不用重跑或重建。专项绿后冻结新源/测指纹再唯一full，不复跑已绿256定向作替代。

### 2026-10-21 独立截图审查 R12 / R13 的精确布局修复

纯布局放置补充裁决：root亲读 grid/viewport/grid.css 的唯一新增 `.grid-validation-feedback` 规则（absolute/inset/bottom/grid/gap/pointer-events，共11行），其职责是 WorkbookGrid 新布局容器，保留在就近 grid.css 比移动到领域CSS更自然。此精确规则追加授权，不改该文件其它部分；当前5425绿证输入保持冻结，不为无行为收益的样式文件搬移重新跑一轮。

独立 reviewer 亲看20图，root 另亲看原1280输入提示及中文表单图，确认：ValidationInputMessage 未定位直接进入 sheet-grid-frame 的两列 grid，被约40px行头列挤成逐字竖条；高级验证 custom-formula 说明 p 只占一格，造成桌面下方 label/control 错列。Stop 非模态 aside 具有相同直接 grid child + sticky 结构风险，必须一并覆盖，不能只修输入提示。首先正常终止唯一自身 full-2474.7FixJZ 过程并保留真实中断证据，确认结束才写输入；这是新产品缺陷裁决，不是观察超时重跑。

008仅独占上述新增三个产品路径（WorkbookGrid.tsx本来已在grid范围）：把这两个非模态反馈布局从巨大可滚动数据 grid 自动排格中移出，复用现有 worksheet-panel 定位上下文或同等简洁的纯DOM/CSS布局；保持视口内可读、提示不参与网格尺寸/不挡滚动交互，Stop关闭与键盘行为不变，同时存在时不能互相完全遮挡。验证面板 fieldset 的说明段落应横跨表单列，不改变真实 label htmlFor/控件/原子状态。不得新增状态镜像、测量/监听层、命令/transport/原生业务或文案。

仅现有 custom-formula.spec.ts / persistence-language.spec.ts 可补真实DOM几何断言与截图：输入提示和Stop在1280/390可读宽度/完整可见、滚动后仍在视口、无行头挤压；中文表单匹配label/control在桌面同行，窄屏标签在对应控件之前且不溢出。保留原全部功能/数据/历史/邻格断言、标题/主绑定，不用更长timeout或sleep掩盖。先加能真实复现当前问题的尺寸断言跑红，再最小修布局跑绿；必要现有React测试/类型/lint/build与DOM专项一次，未变原生/Core/WASM/6261行为证据复用，不重新重建。相关截图交独立reviewer只审增量；冻结新源/测指纹后才唯一重新完整2474/955实际results，不把中断旧轮报通过。

### 2026-10-21 备注窄屏邻格断言的单例定位例外

remaining-151.QjsCkJ 已实际全部执行，150 passed / 1 failed / 0 未运行；唯一失败是 notes/actions.spec.ts 中 `note on formula and blank cell preserves native content at 390px` 最后的 expectNeighbors 读取未挂载 A2。真实快照从 C 列开始，G2 公式、79、备注 marker、空白格与 Undo 已全部通过，不是邻格值被修改。008 仅获准在该参数化 case 最后 G2 marker 断言之后、原 expectNeighbors 之前补真实 `select(page, 'A2', '1:0')`，恢复邻格断言所需虚拟窗口；同 case 两宽可一并窄验。保留原 helper、所有值/样式/公式/空白/marker/历史断言，不改产品、其它用例、标题、fixture 或 timeout。原 notes owner 已冻结，此精确单例暂转 008 独占。通过后更新最终 E2E 候选 hash 并冻结，复用已过 168 个唯一用例，不再重跑该组；启动最终单一完整 2474 项回归。

### 2026-10-21 最终 lint 精确机械收尾

Stop R11修后真实4窄验2passed/2failed：原Stop配置文案1280/390已通过；blank-policy两宽快照既无错误也无编辑态、bar回kept，原单case在Ignore blank Apply后没等modal关闭/原生ACK就写外部bar。008先读trace确认，若是异步Apply收尾覆盖提前输入的准备竞态，只获准edge-input.spec.ts的该custom formula blank policy单case（两宽）在Apply后等待真实dialog关闭、bar可用/原kept、目标投影retained=false再提交空值；可沿既有select helper定位目标。全部原自定义文案/拒绝零写/Undo后允许空值/邻格断言保留，不改其它用例/共享helper/标题、无sleep/timeout/产品fallback。先窄验该两例，再补manifest剩151；未确认trace前不擅自修改产品。

169真实DOM首轮14pass/3fail/152未运行，三个Stop配置文案缺失有实际根因：原生拒绝title/message完整，FormulaBar pending禁用失焦→reject恢复focus→beginFormulaEditing对相同draft/source无条件update新session对象，offer的session见证立即过期，selector安全隐藏。008在已授权editing/session-domain.ts仅让已有drafting且有效source、draft及规范化source.kind均未变化的update返回原state；真正改draft/改来源、新start session仍新引用，不能弱化confirmation selector/session身份或删除过期守卫。先在test/seven-feature-integration/追加真实commit rejection→same focus update保持Stop配置文案的红回归，再修、绿；同时测真改draft/换source/取消重开仍失效。保留原E2E配置文案/无Continue/零写/草稿/Undo断言，不增加timeout，不改Rust/WASM。仅Core变化需必要editing/confirmation专项、类型/lint/presentation/build与受影响完整JS复证；未变原生/WASM输入证据可复用。

真实native错误修复精确范围：default R2 --no-fail-fast仅engine_owned_filter::the_entry_points_reject_an_unknown_sheet失败，新增protection guard把所有Err统一映射ProtectedWorksheet且早于原sheet存在检查。008在既有获准workbook_filter_{engine,rules,range}.rs只恢复既有custom-call拒绝与InvalidSheet存在验证后、任何扫描/commit之前的保护检查顺序；不存在表仍InvalidSheet，存在且受保护仍ProtectedWorksheet且零写，不能改旧expected去容忍误分类、不在protection复制错误转换表/放宽权限。既有engine_owned_filter.rs同一entrypoint测试可最小追加apply_filter_range未知表断言。保持读取/scan/restore其它语义不动；先必要filter/protection专项，再完整native继续。生产Rust确变则唯一重建lite/full并记录新hash，不能拿旧构件跑最终DOM；这次重建原因是产品修复而非日志丢失。

最终native旧契约迁移例外：data_validation_paste.rs中的ordinary_paste_does_not_treat_validation_as_a_database_constraint假定普通粘贴绕过规则，与本目标已批准/文档明确的默认Stop和整批验证冲突。008仅此用例改为普通All粘贴20真实拒绝，保留A1原值/相邻格/规则/历史无污染；另用合法数字证明普通All粘贴成功且历史可Undo/Redo。不改生产bypass/其它断言，可按真实新语义重命名本Rust用例。完整default/lite建议--no-fail-fast一次收集全部目标，而不是每失败一个重复整轮；重建仅测试无需WASM。其它实际失败先精确报告，不自动改新业务。

对应旧浏览器契约精确例外：root静态实读e2e/editing/data-validation.spec.ts:95标题values paste rejects atomically while ordinary paste bypasses entry validation，同样用7\n2写Summary H45:H46，Values拒绝而All期待H46=2越界。只此用例同步真实新Stop契约：两种paste都拒绝并保持5/0.5及Undo disabled，再合法TSV证明All成功与Undo/Redo，保留真实系统剪贴板/DOM/邻居，不改产品。可重命名反映新语义，核对FEATURES引用（当前rg此旧标题无主绑定，不顺手改其它ID）。不能等到最终full重走几小时才发现同一个已知旧语义；窄验时与高级validation一并覆盖。其余该文件用例不改。

持久验收目录acceptance-20261021.LeIzkC的lint-files.txt列出61个真实失败文件，lint-inputs-before.tar已备份。008仅获准其中排除excel/react-excel/src/workbook/comments/CommentTools.tsx和excel/react-excel/test/workbook/comments/comments.test.tsx后的59个精确文件：仅现有quotes/max-len/brace/comma等格式、局部no-shadow变量改名、clipboard命令return-await。后者必须保留原catch/反馈拒绝路径，不能删规则或禁用告警、不能抽象/重写业务。CommentTools首次焦点依赖和该测试的格式独占回007，008不得并发改这两文件。机械格式可用既有eslint --fix，但限定清单且审阅实际diff，不泛扫修其它路径。若出现文件行数超限只报告，不为lint假拆文件。无需WASM重建；源/测格式后完整Core/React/renderer Vitest、类型/lint和最终E2E由008唯一执行，记录持久候选hash。001和007 R1 E2E准备均已冻结，准确影响集见各自报告顶部，正式交008统一窄验。

最终native门禁精确扩权：root实读确认上述7个legacy data_validation测试文件以DataValidationRule as Rule初始化，漏新options字段（其它已迁移DataValidationRule直名literal不漏）。008仅在这7处Rule initializer补options: Default::default()，不改已有kind/operator/ignore_blank/断言或生产数据结构；不把测试问题改成产品fallback。无Rust业务owner并发写，编译/测试过程终结后才补字段并恢复完整default/lite；仅test输入变化不需WASM重建。遇其它文件精确回root，不泛改整个tests。

验收执行人交接：2026-10-21原seven_integration在机器重启后持续pending_init，root已interrupt确认previous_status=pending_init；旧7508权威返回Unknown process id、无cargo/browser，未中止任何活测试。由新同模型gpt-6.1-sol/xhigh agent接手008，原008不可再写/跑。先读本任务/index与reports/008-report.md最新定向结果表，不重做产品。001与007仅本域E2E准备仍在收尾，002/004/006均已冻结就绪；006 R3实际跨表用H11（H10原隐藏行），spec SHA fd41fd13ffed26bf2e66579ca9a0224df493834d94e0c801416da27d2966ee40。先确认持久目录/源码/WASM hash，再唯一运行完整native→静态/lint/cycles/presentation/目录/build及未过域窄验。历史3525/611/types通过运行输入未变，但原始/tmp产物丢失，最终可补全新的持久完整JS证据；不因日志失去重建未变两WASM。CF70/帮助16的原报告可指导排除已知问题，最终单一完整E2E/955results会重证全部，不能拿历史报告或少数smoke当最终完成。任何产品或测试修复需检查范围，不自动越入其它业务文件；原始产物必须持久保存。

2026-10-21运行环境恢复约束：机器重启后/tmp原始证据消失，先查实际句柄/ps，进程真终结才恢复检查。后续所有原始日志/JSON/traces/screenshots放`/Volumes/work/self/excel/.codex-artifacts/react-excel-seven-features/`各独立目录，路径已由root创建且既有.gitignore覆盖；不改.gitignore，不删除此目录。报告记录真实丢失边界，不能把旧临时路径当当前仍可打开的证据。新最终full E2E/results/截图与所有最终gate用持久产物收口。

完整JS窗口补充：已授权的test/workbook/comments/fixture.tsx可为export setup补最小显式返回类型（TestingLibrary render公开返回类型与实际request mock），消除TS2742的pnpm私有pretty-format推断泄漏；不改helper运行行为/业务，不引入测试私有依赖。仅改类型后复跑React typecheck，完整Core3525/3525与React611/611输入运行语义不变可复用，无需重新全量Vitest。

你是唯一共享接线负责人；七项业务负责人独立目录，你只改共享入口，确保用户不是只拿到七个无法访问的文件夹。你与他们并行，无需等所有业务写完才调查/准备接线；必须等所有七项成立并真实验收后才能交付本任务。

## 并发排除

你的 files 是共享文件的大范围路径白名单，但以下路径绝对由其他负责人独占，不得改：
- Core rust-workbook/{notes,protection,advanced-conditional-format,advanced-validation,formula-help,custom-formulas,comments}/；Core conditional-formatting/、data-validation/、formula-functions/、protection/native、comments/native、notes/、custom-formulas/。唯一性能修复例外：005/006已交付，formula-functions/native-catalog.ts及custom-formulas/expression-catalog.ts转008，仅减少无变化目录的重复发布/内置help重建，不改业务注册语义。
- Rust workbook_conditional*.rs、sheet_data_validation.rs、eval_core_dispatch.rs 以及 src/{notes,protection,advanced_conditional_format,advanced_validation,formula_help,custom_formulas,comments}/。
- WASM wasm_conditional_format_wire.rs、wasm_workbook_conditional_format.rs、wasm_data_validation_wire.rs、wasm_workbook_data_validation.rs、wasm_function_catalog.rs 以及七个新功能目录；唯一补充例外notes/persistence.rs转008仅为CellSnapshotJSON literal补comment_indicator真实同格标记，保留001所有notes语义。
- 补充独占转交002：Rust clipboard.rs/clipboard_apply.rs/clipboard_history_targets.rs/clipboard_column_widths.rs、sort.rs、auto_fit_dimensions.rs、workbook_history_{clear,replace,text_columns,remove_duplicates}.rs；008已确认未改这些文件。002交付后auto_fill/apply.rs及apply/inferred.rs已转004补原生验证，008仍不可编辑；workbook_history_borders.rs与clipboard_paste.rs已转008仅作实际写入点的权限/历史范围修正，clipboard_paste_values.rs仍归004。
- 七个 React 功能目录和对应 test/e2e 目录；唯一跨seed验收例外e2e/formula-help/catalog.spec.ts转008，仅修新ORDER_NET种子与完整原生picker目录并存的精确断言，保留全部内置项DOM遍历。
有新增必要交叉文件先通知 /root 修改任务边界，不能直接抢写。主 agent 只编排，不会替你改产品代码。

## 上下文与先行工作

- 完整JS门禁修复窗口（其余业务owner已冻结、无并发写）：以上新列精确文件转008。fill-handle-drag/fill-series旧整表protected短路预期改为实际发送native、native拒绝保留选区/草稿/反馈，另保留允许区native成功；不可仅改RPC次数让假native成功算保护拒绝。native-data-validation的reading可close/saving不可close，迟到success/error均不复活被取消面板或发布旧投影；保留断连语义。Sales Orders严格seed快照补新notes/comments/editableRanges/icon/custom与末尾chunk，并保留旧种子精确覆盖/地址唯一性，不能全部改宽松匹配。notes/command.ts与comments/native/command.ts仅修read payload重复sheetId：显式row/col及当前sheet.id保持精确目标，不改领域行为。五个React功能test的TestingLibrary不支持exact选项，改为锚定Regex保持同样精确name语义，不简单删exact。backend icon-set分支和seed字面量const类型修复属于原共享权限。不得为旧mock新增产品fallback，不需Rust/WASM重建；先窄验上述失败+相关领域Core，再跑受影响完整JS门禁，008仍独占浏览器窗口。

- 补充授权：共享 React/Canvas renderer 在上述精确文件及 cell-metadata 独立目录实现最小 note/comment 指示器、conditionalIcon 渲染及就近测试。不能从 renderer 包倒依赖 react-excel 应用组件；共享渲染小组件放 renderer 包自身的 cell-metadata 目录，不复制领域状态/业务判断。普通/合并/冻结单元格只显示一次，隐藏原值时保留可访问文本与原始复制值。
- 补充授权：旧 Core protection/index.ts 仅增加/reset并接原生投影（002报告契约），修正 README 的 UI canonical 描述；领域 native/ 仍归 002。旧 optional API 保留，但维护的 React 路径不能把它当原生权威。
- 补充授权：既有e2e/format/conditional*.spec.ts仅因尾部新增Summary图标样例而修正固定规则数量/必要相容断言，不能删旧操作或放宽真正失败断言。
- 002已待审，protection/history.rs整文件转008，仅新增CustomFormula等后续HistoryChange原生保护分类，既有Cells/几何权限语义保留。
- 002已待审，workbook_history_borders.rs转008：与workbook_history_format.rs统一按真实border key压缩连续行段，供begin_ranges与额外formats历史捕获；不得用包围矩形要求锁定角格或稀疏间隙可写。补同一候选实际稀疏边界写入/Undo保护回归。
- 004批量确认接口由你导出resumeValidatedPasteAtom/resumeValidatedFillAtom，输入{connection:RustWorkbookConnection,witness:ProjectionSnapshot,payload:RustWorkbookCommands['clipboard.paste'/'range.fill']['payload']}；普通操作和确认共用原命令发送/ACK/投影/尺寸/feedback/cut清理/扩选，004不得复制第二成功链。
- 004验证Stop保留原非模态错误与编辑草稿，仅Warning/Information modal；DataValidationTools读取时可以取消，仅saving禁取消，loading/saving文字分开。删除directional-command里整表protected一刀切拒绝，权限按真实目的写入范围/native结果裁决。
- 005目录v2将SUM帮助由旧Core的number1/number2改为原生number重复组；旧formula-argument-help.spec.ts与formula-completion.spec.ts只调整真实新签名/角色断言，保留插入/键盘/焦点/历史等原操作覆盖，不放宽实际失败。
- Core test/directional-fill.test.ts仅修与新保护契约冲突的JS整表短路预期：locked目的地确实拒绝/零写，native允许区确实发送并成功；locked只读source+允许目的地仍可执行。不要把拒绝测试简单删除或换成无断言。
- clipboard_paste.rs转008，将额外formats历史capture的border_plan_range矩形改为共享border_plan_ranges真实行段；其它clipboard文件仍排除。004对auto_fill/apply.rs对应两处作相同修复。
- 自定义公式种子采用ORDER_NET(quantity,price)=quantity*price与Summary空H82:H83样例，不撞006测试名称。定义属于工作簿：在RustWorkbookDefinition及workbook.initialize payload顶层增加可选customFormulas，不能挂到SheetInput假装表级；初始化公式导入前安装、末尾统一清history，普通调用缺省空无需迁移。
- 007时间：Core原生change_comment(...,change,now_ms:i64)，WASM外部API不变，内部js_sys::Date::now提供本地毫秒；Rust校验/保存/时钟回拨处理，Undo/Redo保留原事件时间。notes/persistence.rs已获唯一字段最小编辑授权，不重写领域逻辑。
- 独立审查R1目录热路径Important：每次滚动重复serialize/parse全部custom定义（上限约2MiB）、多次validate/复制并发布新引用，导致全内置help随滚动重建。复用同一原生workbook/revision下只读目录投影、hydrate相同定义不发布；必要时内置spec变换与custom依赖分开。不是新registry/版本服务，现有revision与实例身份足够。补同revision多窗口read调用数、相同hydrate引用保持、变更/Undo/file及时失效专项；只声明代码风险，不冒称已实测卡顿。
- 独立审查R1确认e2e/formula-help/catalog.spec.ts旧严格picker=499与新ORDER_NET seed冲突：预期真实完整内置names加唯一ORDER_NET（lite共500），每一内置项的帮助逐个DOM比对仍保留，单独断言自定义种子帮助/参数。不要改成>=或删完整遍历。
- R9补充授权catalog.spec.ts：现有HELP-001实际读取lite/full后，在page.evaluate内动态import现有Core native-catalog.ts的validateFunctionCatalog，对未JSON化的原始function_catalog()对象及JSON往返对象各严格验证，再沿原499/502及完整帮助断言。此断言仅放已有构件E2E，不让默认Core unit test新增对CI未提供full构件的依赖；不改CI工具链、不加缺构件skip。当前256定向过程session28707结束前不改其输入/不重启，结束后再补并窄跑HELP-001。
- 独立审查R7授权精确修改tests/architecture_invariants.rs的既有WASM公开API采集器：将notes/mod.rs、comments/mod.rs、protection/mod.rs、custom_formulas/mod.rs和advanced_validation/confirmed_input.rs这些真实公开入口纳入；不得把目录内私有辅助/测试方法泛扫为公开API。人工逐项审查新增签名后最小更新既有fixture，运行原wasm_public_api_signatures_unchanged；旧find_fill_down_end差异是目标前dirty，必须保留。
- R2尺寸历史修复允许仅内存的显式尺寸writer generation观测：真实set/clear发生变化时递增，PendingEdit捕获起点并仅对真实尺寸delta记录显式来源；自动字体/多行派生行高不属于显式元数据写。不新增持久尺寸来源/第二尺寸表/JS许可；仅回放entry实际轴delta并预检当前端点，嵌套私有history不引入Weak活动事务生命周期。
- 004本轮删除虚拟CandidateProvider：领域apply_validated_input复用既有公式安装/observer/batch/rollback事务，原生provider直接读取真实安装后的依赖/溢出缓存。008负责workbook_input的literal/number/formula委托；两个Table header在原change.apply后、record前验证，失败沿原change.apply(true)回滚；hyperlink display实际写后、finish前校验。领域helper由004独占，双方以精确签名接线，不复制候选计算引擎。
- 002已交付，clipboard_apply.rs仅转008在既有所有Sheet observers暂停的事务内加验证前、失败history rollback后的原生settle hook；其余clipboard职责/原有权限守卫不动，覆盖并发排除中的同文件旧归属。R8允许workbook_input中抽取现有真实解析安装为模块内install_parsed_input，普通输入仍在apply_validated_input验证；Table新增行复用该安装直至整行计算列继承、settle后统一验证。不是公开关闭验证scope/JS bypass，不复制解析或新增第二事务引擎。
- 七域smoke发现保护Undo真实阻断：src/history/rust-history-command.ts按affected protected整表JS拒绝，未发history.apply；与Rust允许区/真实metadata/尺寸守卫冲突。008获准仅此文件及test/rust-history-command.test.ts删除TS整表权限短路，保留identity/busy/原生失败与投影收尾。旧拒绝专项改验native确实收到并拒绝、零发布/不污染历史，加允许区native成功ACK；不可按history label/kind再造TS权限表，不需重建WASM。

- 实际 Worker: excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts，复用 projectChange / 当前 revision / 单请求单投影；不要新建 dispatcher/backend/bridge。
- 传输 union/types: commands.ts / wasm-types.ts，顶级导出 src/index.ts；启动 initialize-workbook.ts，文件 file-io.ts，投影 visible-projection.ts，重置 runtime/reset-workbook-view.ts。
- Rust: lib.rs 注册领域 modules；sheet_state.rs/生命周期/Workbook/历史 snapshot/持久化结构需要保留七项原生状态。不能把 notes/comments 全存 WASM 或 TS旁路绕过结构/Undo/文件。
- React: chrome/ribbon/WorkbookRibbon.tsx、ConditionalFormatTools.tsx、DataValidationTools.tsx、InsertFunctionTools.tsx 和 grid/editor/等是嵌入点。现有标签 Start/Insert/Formulas/Data/View，入口用已有分类，避免大改导航。新功能保持各自组件目录，只在原处嵌入。
- 七个业务组件：NoteTools、ProtectionTools、AdvancedConditionalFormatFields、AdvancedValidationFields、FormulaParameterHelp、CustomFormulaTools、CommentTools。前两项/后两项无控制器 props；字段型组件精确契约由业务早期报告发布。

## 覆盖矩阵行

X-01/X-02：共享接线、保护覆盖所有真实写入、共同历史/文件/状态清理、多语言及窄屏、原 demo、不重复计算/存储。

## 执行流程

1. 阅读 index 和本任务、主线 skills及当前源码。先写 reports/008-report.md 的共享文件职责/七项挂接位置/权限面清单；记录现在工作区的旧更改，不修改它们。
2. 每收到 /root 转交的业务准确签名/字段请求，接入已有链路。你可以读取 /root 明确转交的报告段落；未授权不要遍历其他任务。业务缺设计时给出最短替代并通知 /root，不自行复制业务层。
3. 只你操作 native module/struct/history/persistence/geometry 移位的共享注册。保护集中守卫必须覆盖实际原生写入面，不能 TS-only；新 note/comments/自定义定义需要会话重置/文件往返，切表不丢。
4. 合并业务提供的 Lingui 文案、原生seed、FEATURES 行；按当前 e2e/FEATURES.md 编号保持旧824项绑定不变。新增控件的开关/提交/取消/键盘按真实操作登记，不把多个操作塞一个主用例。
5. 浏览器测试需要独占窗口和冻结输入。任何 targeted E2E/wasm-pack前通知 /root 申请调度；等待业务仍在写源码时先做静态/集成专项，不自行暂停别人或重启完整 E2E。
6. 所有业务目录就绪后统一 Rust/WASM构建，API变化必须审查 tests/fixtures/wasm_api_signatures.txt 并跑 wasm_public_api_signatures_unchanged，不盲目再生。原生专项→必要全量，React/Core全量、build/types/lint/presentation/cycles/docs，最后单次完整E2E并核对每个功能 --results。
7. 桌面1280/窄屏390、中英文截图与焦点/overflow/pageerror 证据。共享 visual-runtime若缺失，沿用持久 Playwright 证据并明确未运行的工具。

## 验收标准

- 七项均从实际 React 可进入并走真实 Rust；没有仅组件/仅测试入口、空回调、mock native-success、JS mirror 或未登记操作。
- 新增功能及保护跨域、Undo/Redo/文件往返/原合并 demo 回归成功；中英文和窄屏可用。
- 全局约束命令成功且有当前候选指纹/日志；旧通过报告不能替代当前产物；完整E2E零失败/跳过/重试且每个主用例恰有一次 passed。
- 新大文件遵循职责/行数；超限旧文件仅必要接线并说明，不以本目标顺手做全仓重构。
- 完整报告注明七项缺口，全部满足才 DONE；其余保持运行并向 /root 报告实际需要。

## 验证分工

你唯一负责整体门禁与浏览器执行；复用业务已通过且输入未变的专项，不同时跑浏览器与重型 Rust/JS 检查。/root 最后另派独立审查。

## 报告

只写 .tasks/react-excel-seven-features/reports/008-report.md；不得改 index 或任务文件。不得 commit/push/派子 agent。接线请求和阶段结果 send_message 给 /root。

## 独立终审契约（只在主agent明确派为reviewer时执行）

这不是008实现者自审。fresh reviewer同样gpt-6.1-sol/xhigh、fork_turns=none，只读产品源码、不代修，不跑重复全量或浏览器；仅写reports/008-review.md并回报/root。

允许读取本index、001–008八个任务文档及reports/001-report.md至008-report.md；据各自files联合范围审阅当前源码与`git diff 1c47e6439657ee18d66db1d194d61dfa44bdf103 -- <精确范围>`。必须同时枚举/读取相关未跟踪新文件，不能只看git diff遗漏全部新功能目录。开始前用户已有dirty基线在/tmp/react-excel-seven-features.QjzUox/{tracked-before.patch,untracked-before.tgz}；只读区分原改动与本目标变更，不把旧未授权问题顺手纳入修改。

逐条用✅/❌/待证据核对七项与N/P/C/V/H/U/T/X覆盖矩阵，给文件:行号与复现条件，Critical/Important/Minor分级。重点看：

1. Rust原生所有权与真实React入口；无UI镜像/重复运行层/两条成功链；七个目录不是只有外观。
2. 保护在所有实际写坐标/跨sheet/Table/边框邻居/多区批量/Undo/Redo/文件恢复边界原子拒绝，allowed region与只读source不误拒；拒绝零写、无history污染。
3. 备注与线程批注独立、空白格指示器、普通/合并/冻结/Canvas可见性、结构迁移、同格共存、历史/文件/旧文件安全解析。显示名不是已认证身份。
4. Stop不能提交、Warning/Information只有明确确认可提交；候选值/公式/blank/array/同批依赖/跨sheet相对规则正确，取消及revision变化不会重发到别处，paste/fill收尾与正常命令一致。
5. 完整编译目录help真实性、可选/重复组/固定尾参/未完成输入高亮及中英文；不能以有502行元数据代替语义正确。
6. 自定义表达式沿原Rust LAMBDA/name-version求值、名称冲突/循环/arity/移除/依赖重算/file dangling安全；不执行文件内JS或全局host回调。
7. 实际操作FEATURES唯一主E2E、无跳过/放宽断言掩盖失败；证据对应最终源码/构件、零误报，尚未执行的E2E/截图必须明确待验。旧2218/824不证明新增七项。

所有Important/Critical回/root给原owner修复。若还有实现中或真实E2E未运行，可先给精确静态发现并保持审查待收口；不能仅因专项绿灯签整体通过。最终证据到齐后只复审修复范围与结果，不重跑全量亲验。
