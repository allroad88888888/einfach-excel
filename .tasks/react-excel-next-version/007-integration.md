---
id: 007
title: 六项合流统一整体验收
kind: leaf
parent: null
depends_on: []
model: gpt-6.1-sol
reasoning_effort: xhigh
status: done
created: 2026-10-21
done: 2026-10-21
base: b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb
files:
  - excel/spreadsheet-ui-core/src/index.ts
  - excel/spreadsheet-ui-core/src/selection/index.ts
  - excel/spreadsheet-ui-core/src/keyboard/index.ts
  - excel/spreadsheet-ui-core/src/format-painter/index.ts
  - excel/spreadsheet-ui-core/src/format-painter/state.ts
  - excel/spreadsheet-ui-core/src/runtime/
  - excel/spreadsheet-ui-core/src/rust-worker/
  - excel/spreadsheet-ui-core/src/rust-workbook/commands.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/wasm-types.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/visible-projection.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/format-projection.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/initialize-workbook.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/history-apply.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/file-io.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/tracked-mutation.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/resize-io.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/table-commands.ts
  - excel/spreadsheet-ui-core/src/projection/
  - excel/spreadsheet-ui-core/src/backend/projection-contracts.ts
  - excel/spreadsheet-ui-core/src/backend/projection-helpers.ts
  - excel/spreadsheet-ui-core/src/backend/projection-primitives.ts
  - excel/spreadsheet-ui-core/src/history/rust-history-command.ts
  - excel/spreadsheet-ui-core/src/conditional-formatting/
  - excel/spreadsheet-ui-core/src/filter-sort/types.ts
  - excel/rust/excel-core/src/workbook_visibility_types.rs
  - excel/rust/excel-core/src/workbook_table_types.rs
  - excel/rust/excel-core/src/workbook_history_table.rs
  - excel/rust/excel-core/src/workbook_table_metadata_change.rs
  - excel/rust/wasm/src/wasm_workbook_visibility.rs
  - excel/rust/wasm/src/wasm_workbook_manual_visibility.rs
  - excel/rust/wasm/src/wasm_table_wire.rs
  - excel/spreadsheet-ui-core/src/tables/native-types.ts
  - excel/spreadsheet-ui-core/src/formula-functions/
  - excel/spreadsheet-ui-core/test/next-version-integration/
  - excel/spreadsheet-ui-core/test/rust-merge-worker.test.ts
  - excel/spreadsheet-ui-core/test/rust-aggregate-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-size-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-named-range-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-locate.test.ts
  - excel/spreadsheet-ui-core/test/rust-cross-sheet-edit.test.ts
  - excel/spreadsheet-ui-core/test/rust-function-catalog.test.ts
  - excel/spreadsheet-ui-core/test/rust-calculation.test.ts
  - excel/spreadsheet-ui-core/test/rust-text-columns-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-remove-duplicates-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-sheet-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-conditional-format-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-history-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-outline-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-spill.test.ts
  - excel/spreadsheet-ui-core/test/rust-filter-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-data-validation-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-find-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-sort-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-visibility-runtime.test.ts
  - excel/spreadsheet-ui-core/test/initial-tables.test.ts
  - excel/spreadsheet-ui-core/test/rust-workbook-runtime.test.ts
  - excel/spreadsheet-ui-core/test/workbook-file-command.test.ts
  - excel/spreadsheet-ui-core/test/formula-arguments/layout.test.ts
  - excel/spreadsheet-ui-core/test/rust-structure-worker.test.ts
  - excel/spreadsheet-ui-core/test/rust-number-format-preview.test.ts
  - excel/spreadsheet-ui-core/test/rust-fill-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-clipboard-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-calculated-column-input.test.ts
  - excel/spreadsheet-ui-core/test/rust-table-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-sheet-history-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-quick-formula-runtime.test.ts
  - excel/spreadsheet-ui-core/test/rust-freeze-worker.test.ts
  - excel/react-excel/src/workbook/chrome/
  - excel/react-excel/src/workbook/grid/
  - excel/react-excel/src/workbook/formula/
  - excel/react-excel/src/i18n/
  - excel/react-excel/src/page/
  - excel/react-excel/public/demo/async-formulas/
  - excel/react-excel/test/next-version-integration/
  - excel/react-excel/test/workbook/advanced-filter/fixture.tsx
  - excel/react-excel/test/workbook/cross-sheet-cut/dom.test.tsx
  - excel/react-excel/test/workbook/formula-arguments/dialog.test.tsx
  - excel/react-excel/test/workbook/formula-arguments/harness.tsx
  - excel/react-excel/test/workbook/multi-range-selection/modifier-pointer.test.tsx
  - excel/react-excel/e2e/advanced-filter/layout.spec.ts
  - excel/spreadsheet-ui-core/src/advanced-filter/contracts.ts
  - excel/spreadsheet-ui-core/src/advanced-filter/commands.ts
  - excel/spreadsheet-ui-core/src/filter/panel.ts
  - excel/spreadsheet-ui-core/src/filter/scope.ts
  - excel/react-excel/src/workbook/advanced-filter/AdvancedFilterGroups.tsx
  - excel/spreadsheet-ui-core/test/advanced-filter/fixture.ts
  - excel/spreadsheet-ui-core/test/advanced-filter/groups.test.ts
  - excel/spreadsheet-ui-core/test/advanced-filter/search-selection.test.ts
  - excel/spreadsheet-ui-core/test/cross-sheet-cut/runtime.test.ts
  - excel/spreadsheet-ui-core/test/multi-range-selection/cancel-and-limit.test.ts
  - excel/spreadsheet-ui-core/test/multi-range-selection/manual-pointer.test.ts
  - excel/react-excel/e2e/next-version-integration/
  - excel/react-excel/e2e/fixtures/cross-sheet-cut/index.html
  - excel/react-excel/e2e/fixtures/cross-sheet-cut/main.tsx
  - excel/react-excel/e2e/FEATURES.md
  - excel/react-excel/README.md
  - excel/react-excel/FEATURE_PROGRESS.md
  - excel/react-excel/docs/current-capabilities.md
  - excel/rust/excel-core/src/lib.rs
  - excel/rust/excel-core/src/workbook.rs
  - excel/rust/excel-core/src/workbook_calculation.rs
  - excel/rust/excel-core/src/sheet.rs
  - excel/rust/excel-core/src/eval.rs
  - excel/rust/excel-core/src/eval_core_custom_registry.rs
  - excel/rust/excel-core/src/workbook_history.rs
  - excel/rust/excel-core/src/workbook_history_entry.rs
  - excel/rust/excel-core/src/workbook_history_restore.rs
  - excel/rust/excel-core/src/workbook_structural_snapshot.rs
  - excel/rust/excel-core/src/workbook_sheet_archive.rs
  - excel/rust/excel-core/src/workbook_conditional_format_rule.rs
  - excel/rust/excel-core/src/workbook_conditional_format_types.rs
  - excel/rust/excel-core/src/workbook_conditional_format_projection.rs
  - excel/rust/excel-core/tests/fixtures/wasm_api_signatures.txt
  - excel/rust/excel-core/tests/next_version_integration.rs
  - excel/rust/excel-core/tests/engine_owned_filter.rs
  - excel/rust/wasm/src/lib.rs
  - excel/rust/wasm/src/wasm_workbook_helpers.rs
  - excel/rust/wasm/src/wasm_workbook_restore.rs
  - excel/rust/wasm/src/wasm_workbook_import.rs
  - excel/rust/wasm/src/wasm_bulk_wire.rs
  - excel/rust/wasm/src/wasm_workbook_table_commands.rs
  - excel/rust/wasm/src/wasm_tests/
---

# 六项合流统一整体验收

先完整读index与指定skills；只写本任务files及reports/007-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖X-01/X-02。允许读全部领域reports，先盘点已有共用路径/构件，不在无契约前猜字段。你是唯一共享接线/真实浏览器/WASM重建/全仓门禁负责人，证据根见index。root排独立reviewer，不自签整体done。

## 独占共享接线

- 追加授权（root）：keyboard/index.ts仅001所需Escape结束pointer再清非主区最小分支；workbook_calculation.rs仅006准确原生重试接口hook/注释，保持sheet范围，不借机重构整份文件。
- format-painter/index.ts、state.ts仅将既有Painter状态/派生atom原样提取，index保持re-export，以切断新增pointer→format-painter命令→pointer的真实循环；不新增状态镜像或重新设计格式刷。
- 上列既有runtime专项测试只授权按真实新增Worker前置依赖补location.origin及3个async WASM空队列stub；保留既有断言与功能测试，不扩成重写测试。红证007-async-runtime-mock-red.log已由root审阅，生产不加mock兼容fallback，实际触及清单记录报告。
- 跨表剪切专属3表E2E fixture入口追加授权；数据纯定义置src/page/demo/cross-sheet-cut/，不向测试植入Core直接写值/假业务命令，不删改原demo。可复用已有页面视图，不建立另一套runtime。
- 004 groups接线追加的8个精确共享文件仅DTO/default/验证、Table prepare/history分支、导入与显示投影；语义实现仍004。wasm_table_projection.ts与viewport/hidden-state.ts未证实需要改动，不借授权扩修。
- 旧engine_owned_filter.rs仅两处SheetFilterState字面量补groups:Vec::new()适配新增类型，既有断言完全不变；这不是旧行为预期迁移，不为确认必然编译缺字段单独开Cargo轮。
- 新增四个精确React测试文件仅修007-react-typecheck-red.log已证实的类型问题：三个域getByRole删除Testing Library不支持、运行时不生效的exact:true（字符串name仍默认精确）；modifier-pointer仅kind:'cell'标字面量as const。不改断言/预期/流程，不碰领域其它代码，通知owner避免并发写。自身cross-sheet seed用satisfies收窄真实定义类型，禁止as any掩盖类型错误。
- 004已交付后追加两项精确收尾授权：e2e/advanced-filter/layout.spec.ts局部Locator的apply改名applyButton，消除遮蔽导入apply函数的真实TDZ；Core advanced-filter/contracts.ts仅reduce参数sum:number/text:string注解。不改筛选语义、预算或断言；原始类型红证保留，通知004及UI数据reviewer，最终指纹包含此delta。
- formula-arguments/harness.tsx仅showArguments补ReturnType<typeof setupArguments>返回注解，解决真实TS2742可移植声明推断错误；不改测试运行值/流程/断言。
- 真实r3自然结束后授权：keyboard/index.ts去掉endPointerSelectionAtom命令层依赖，navigation非composing Escape直接用既有cancelPointerAtom与resetAppendPointerAtom，再沿原clearNonPrimary分支。该模式已排除公式引用/编辑，无需pickFormulaReference收尾；单一区也取消、append receipt/反馈须清。精确复用001 cancel/limit及现有keyboard影响集，check:cycles必须实际绿，真实Escape/旧选区填充回归保留。
- 007-lint-check.log的纯格式项允许在上列精确11个追加路径及原已授权四个React测试中断行、brace或静态import type迁移，保原断言/控制流/常量/语义。仅当前37项相关hunk，不全文件重排或免lint规则；004/001/002均已冻结交付，执行后报告准确fingerprint delta。006自身6个async文件的格式及IO no-loop-func归006，007不抢写。
- 完整Vitest红证007-vitest-full-red.log/.json经root读实际失败和四源文件后授权：三个精确旧Core runtime tests只对formula.awaitAsync建立真实无结算时挂起的stub，避免误走cells/import/export或消耗exportFile.mockImplementationOnce；既有命令顺序断言准确追加唯一await请求，保全部初始化/Table先后顺序、文件错误/不丢文档/可重试/销毁断言，不过滤命令隐藏请求，不生产加fallback。不增加重试/timeout/config。003 layout.test.ts仅把process.cwd相对路径改import.meta.url文件相对URL并删未用path import，502真实签名全部原断言不变。
- 收领域准确接口后接barrel/runtime/commands/wasm-types/module/history/persistence/UI/seed/Lingui/FEATURES。新增函数实现仍在领域文件夹，不塞大runtime。006异步先短方案经root审，不能自行加eventbus/poll或通用生命周期。
- 不写001 pointer命令/hook、002 clipboard*.rs/system-clipboard-command/clipboard-capture及commands/wasm_workbook_clipboard、004 filter*.rs/table_filter/Core filter及wire、005 text/duplicates/range统计、006已有async queue/workbook_custom/wasm_workbook_custom。缺额外文件先找root转owner或授权，不抢改。
- 原955绑定、66合并、128列与Summary保留。新seed只空白位置/独立page data；async JSON公开样例独立public/demo/async-formulas/，生产provider不特殊识别fixture路径。
- 全局脚本/CI/package变更需额外root授权，先不要改。旧E2E若需契约迁移先给root真实失败/根因/精确差异，不能自己调宽预期。
- 领域Cargo窗口由你管理串行，owner小专项不重复全仓；并行最多4是所有执行/审查，别再派agent。

## 验证顺序与报告

1. 先向root报接线缺口、WASM/运行配置/基线身份；按准确契约逐个合流，所有原生API可编译后统一重建lite/full，不每收一项就重建。签名先用现有测试审diff。
2. 各owner专项完成后按影响集一次真实E2E及中英1280/390截图，错误/取消/焦点/恢复/保护/history/file都按真实边界验。截图必须实际看，不以文字可见/文件存在代替布局。无.shared工具就如实用现有Playwright证据，别伪称运行。
3. root安排独立reviewer审权限/事务/异步与入口。真实bug保红证→owner修→受影响绿证→独立关闭，再入最终候选；复用未变证据，Minor不无限往返。
4. 最终一次root/mainline types/build、完整Vitest/scripts、lint/cycles/presentation/docs、相关完整Rust default/lite/WASM/真实browser harness必要gate。一个完整E2E过程forbidOnly/workers1/retries0，冻结source/test/WASM/config到自然结束；full JSON+FEATURES --results都过才签整版，不拼接诊断轮。
5. 独立总审六域与14行矩阵、原始报告、指纹和实际图；README/FEATURE_PROGRESS当前行/current-capabilities/FEATURES引言准确收尾，保旧历史，勿拖成无限文档审计。新增未跟踪空白/行数也检查，TSV空字段保留；纯文档变化记录精确delta不重复产品全量。
6. reports/007-report.md列每功能实际入口/原生行为/恢复/最短链路状态所有权、主绑定、真实命令/结果/指纹/截图路径及审图边界、遗留、服务是否在跑、未commit/push。未执行清楚写未执行，--list不当passed、中间进度不提前签绿。

### 重门禁串行（r4真实资源争用后裁决）

10核16GiB机器上默认10路rustc+完整Vitest+浏览器并跑已产生广泛资源争用，r4三条30s总超时trace各步一直成功、同390流程及随后普通case恢复。保留完整红证，不以资源解释当绿。完整Vitest自然结束464文件6425项6363pass/62fail，54纯5000ms超时，5明确stub/路径不兼容，3React非timeout尚待无竞争诊断；r4自然90项87pass/3总timeout/0skip/0flaky，所有本版其它修正已真绿。

- 待当前lite自然结束，之后Cargo/WASM/build、完整Vitest、浏览器必须重门禁串行，Vitest可CLI `--maxWorkers=1`，Cargo可未来CLI `-j 2`，不改仓库timeout/配置/期望或忽略失败。并发agent只读审查/文档不争重算。
- 无资源竞争先跑原3React非timeout及page-key等精确诊断，不改旧断言；若仍失败给root真实因果和精确最小方案，未授权不改。三个旧Core stub+003路径纠正后受影响一次，005三个原spec不改情况下实际绿证后再进入完整门禁。
- 最终完整Vitest与E2E各须一个完整自然结束绿过程，不拼接、不中途修改、不把无改动诊断当重试抹红；所有红证保留以说明调度/真正兼容修复。生产代码目前冻结，如新实际bug先报root。

## 独立风险审查委派入口

root以“独立风险审查”派发本任务时，你是reviewer，不是007接线owner。先完整读index及001/002/006任务与对应reports，复用原始专项证据；007提供的风险范围diff/新增文件清单/指纹位于证据根，由其reports/007-report.md列路径。base固定b2ab6a1a，按这三域和相关共享接线审阅，未跟踪新增文件也要读。禁止改产品、执行全量/Cargo/WASM/browser、再派agent或替实现owner签整版done。

- 唯一报告reports/007-review-risk.md：按原验收逐条✅/❌/待真实浏览器，不把没有执行当通过；每项真实质量发现分Critical/Important/Minor，给准确file:line、复现条件、风险和最小修正建议。只有证据缺失/新风险提出专项补验，不为亲验重跑稳定结果。
- 特别检查001拖拽authority/取消晚到move/编辑引用与格式刷优先级/自动滚动不破填充；002两端及依赖/边框权限、验证失败before-image和redo/token、跨表引用/动态拒绝/一次历史；006单waiter/latch/身份/队列预算/异步fatal恢复、失败重算scope/共享memo、JSON文本wire/名称冲突/打开文件late settle/保护与无Undo。
- API/状态抽象必须最短，React无状态镜像或复杂对象传递、Core无Rust结果缓存、native无第二依赖图。新增普通文件≤300行，不能为行数硬拆无意义包装。UI/网络必须走真实链，mock不顶替尚未运行的Worker/WASM。
- 审查期间004/005仍可改与此无关业务；若三域相关共享文件发生实际新增变化，记录精确delta再补审，别把候选快照冒充最终冻结。回执只给短结论和报告路径；实际修复回原owner，由root调度，最多三轮，Minor列triage。

## 独立界面与数据规则审查委派入口

root以“独立界面与数据规则审查”派发时，你是第二位reviewer，不是007执行owner。完整读index、003/004/005任务与最终领域reports、007-report，并读取对应实际改动（含未跟踪文件及007共享接线）。唯一写reports/007-review-ui-data.md，产品只读、不跑全量/Cargo/WASM/browser、不派agent；复用稳定专项和007真实浏览器/截图证据，未执行明确标待执行。

- 重点查参数表单必填/可选空位/重复组与固定尾参、目标身份和原编辑焦点；分组AND/OR、普通/Table文件和历史往返、超额搜索拒绝不部分提交；通配符Unicode/转义、display-text基础格式依赖、规则清理释放和不复制样式事实。
- UI检查实际en/zh×1280/390截图（有图须实际查看，不以文件名代替），键盘/取消/错误/可纠正草稿、busy/保护、主操作FEATURES精确绑定与原demo保留。每项按原验收列✅/❌/待真实证据，不扩大本版功能范围。
- 真实质量发现按Critical/Important/Minor给file:line、触发条件/风险/最小建议，不为文案偏好无限整改。实现修复交root调度原owner，不代写。若审查后相关代码变化，记录精确delta供补审；不把候选快照当最终整版签字。

### UI/data 真实截图及新测试精确补审（root派发时）

复用已关闭UI-DATA-01及已实际查看的004八图，不重复稳定专项。新增实际图在证据根`007-e2e-impact-r2/`的formula-arguments layout八图与`007-e2e-impact-r3/`的advanced-formatting layout八图；完整路径用rg --files查，不假设hash目录。逐张实际打开，检查必填/重复组/固定尾参、英文长说明、中英两宽字段/底部动作，不以007已看代替你的观察。r3仍运行时只读现存完整PNG，不变更其输入。

同时仅审004 clear-search/select-search（旧00123种子与异步全选结算）及005 display-duplicates（范围末活动格后显式回A1）的已冻结新测试修正是否保精确行为断言；003 FARG003真实引用修正可能仍在执行，只有报告给最终指纹后才审，未稳定明确待补。005 row-insertion lifecycle为r3新红，root已核满画布拒绝，仍待真实DOM前置纠正；本次不可签该case已绿。只报告图审/精确delta结论与剩余证据，不等待或重跑浏览器、产品不写，完成释放槽供后续修复。最终单一完整JSON仍待执行，不把局部图当整版完成。

### 风险精确delta及真实图补审（root再次派发时）

复用已关闭RISK-002-01/RISK-006-01全部稳定源码和专项，只补当前冻结变化：007 `keyboard/index.ts`断环（SHA7155e050…，navigation Escape直接cancelPointer+resetAppend）、grid DOM白名单Escape一行（SHA1e3a966c…）；006同owner IO单call闭包提取及五文件纯格式；001 overlap新spec局部真实DOM居中/安全可见点前置（SHA8d9732ae…，最终以owner报告为准）。本次只读源码/精确diff/原始53及55专项/cycles绿证，确认编辑/引用/painter优先级、取消追加receipt、abort-before-slot-release与旧generation语义不变，测试前置不删除或放宽断言。新测试契约四处纠正可一并确认其无安全断言削弱。

实际查看风险域代表性中英两宽图：001英文Control点击两宽+中文正常多区两宽共4张、002 r2布局双语两宽4张、006 r3双语两宽BUSY/settled8张共16张。精确路径由007-report/r3视觉清单与rg --files查出，必须真的view_image；已存在其它图不必为数量重复全看，不把007看过当你看过。不需复看004005或稳定旧图；未运行r4/full明确待执行。

唯一写reports/007-review-risk.md，保留初轮红证历史，追加本次delta结论、精确指纹/已看图及未完边界；不跑浏览器/全仓/Cargo/WASM、不写产品、不派agent。发现阻断立即报root，Minor不扩大整改；如无阻断完成释放槽，不等r4/full、不替整体done。最终覆盖审核后续只复用单一完整JSON和冻结指纹，不再循环重审整份稳定代码。
