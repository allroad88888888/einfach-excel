---
id: 005
title: 通配符及显示文本条件格式
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
  - excel/rust/excel-core/src/advanced_formatting/
  - excel/rust/excel-core/src/workbook_conditional_format_text.rs
  - excel/rust/excel-core/src/workbook_conditional_format_duplicates.rs
  - excel/rust/excel-core/src/workbook_conditional_format_row_band.rs
  - excel/rust/excel-core/src/workbook_conditional_format_scope.rs
  - excel/rust/excel-core/src/workbook_conditional_range.rs
  - excel/rust/excel-core/src/sheet_conditional_range.rs
  - excel/rust/excel-core/tests/advanced_formatting.rs
  - excel/rust/excel-core/tests/advanced_formatting/
  - excel/spreadsheet-ui-core/src/advanced-formatting/
  - excel/spreadsheet-ui-core/test/advanced-formatting/
  - excel/react-excel/src/workbook/advanced-formatting/
  - excel/react-excel/test/workbook/advanced-formatting/
  - excel/react-excel/e2e/advanced-formatting/
  - excel/react-excel/docs/advanced-formatting/
---

# 通配符及显示文本条件格式

先完整读index与指定skills；只写本任务files及reports/005-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖S-01/S-02。

## 已核对入口

Rust workbook_conditional_format_text.rs为四种字面量操作、忽略大小写保空白；duplicates.rs按类型和值建key、真空/空文本不计，统计经范围atom。已有find_wildcard.rs可复用语义。规则管理/stop/优先级/阈值/图标/history/文件已工作，不重建。

## 交付

- 新增匹配/不匹配通配符文字条件：*任意串、?单字符、~转义，整值匹配，明确大小写/Unicode；保原四字面量条件。空/过长/非法尾转义可纠正，匹配有成本预算，不添正则依赖/TS匹配器。
- 重复/唯一规则选择原始类型值（默认保旧）或原生基础显示文本。数字1/文本1、百分比/日期/舍入有对照，基础数字格式变更立即驱动结果更新，不能陈旧cache。基础显示不叠加当前CF，避免自依赖；不把locale/字体像素/CF颜色当key，不另存每格style或遍历所有样式。
- 原空/错误策略、优先级/stop、启停/复制/编辑/清除、Undo/Redo/文件/结构随动保持；不改cell/row/column优先级铁律。
- 新语义放advanced_formatting/、advanced-formatting/；旧解析/统计只必要接线。Core conditional-formatting/types/editor-draft/value-domain/snapshot-rules共享归007。
- 尽早报告rule JSON字段/default、React字段组件/command签名、Rust模块注册及基础format依赖怎么跟踪。需额外共享Rust范围先找root。
- AFMT-主绑定（沿用现有registry合法格式，不扩全局脚本），原生/Core/React专项及e2e/advanced-formatting/真实工具栏建规则、转义/Unicode、不同原值同显示/同值不同显示、改数字格式立即更新、历史/文件/邻格原值不变。中英两宽截图及旧字面量/阈值/图标不退化，Cargo/浏览器/重建由007调度。

## 真实浏览器影响集第1轮收尾

007-e2e-impact-r1自然max5结束，AFMT-003高亮8格全过，之后bar期望1但实际为末格原公式="1900-01-01"；原始log/json/error-context持久，非整版结果。root已读display-duplicates.spec.ts及失败信息，需确认既有GoTo A1:A8活动格是末格的真实契约。

- 只读确认根因；若确是新测试误假设活动格，最小在校验A1原输入前通过真实go(page,'A1')明确目标，保留原1断言/8格高亮/原值与邻格/后续value模式等断言，不直接把1改为另一格字符串。查其它本版新case有无同一错误假设；不改旧GoTo/产品行为讨好测试。
- 先向007确认无诊断执行，再改自身E2E。若确认是产品问题先报root，不自行重构。仅测试前置纠正无需重复Core/native；冻结立即报007，再补报告/指纹结束，实际绿由007跑。无新primary/文案/WASM/API。

## 真实浏览器r3：插行case前置纠正（仅自然退出后执行）

真实两宽红证保存在007-e2e-impact-r3原JSON/trace/error-context；root已读start()走New blank workbook，既有runtime初始化rowCount=1048576，structure-geometry.ts:28正确拒绝超过该上限。不能为新测试改旧上限/产品行为或把期待改“不动”。

- 只改自身新`e2e/advanced-formatting/lifecycle.spec.ts`插行case的前置：通过真实DOM定位空白末行并Delete selected rows释放一行容量，明确观察成功/画布尺寸后回A1执行原插行路径；可在建规则前先处理容量，避免干扰规则本身。保留范围移至A2、原值/邻格随动、高亮和一次Undo恢复全部严格断言；新增观察确认插入成功，而非只测颜色巧合。
- r3仍运行时全输入禁止写，先只读；收到007自然退出才实施，不改support.ts/seed/shared/src/config/WASM。仅前置改不重复Core/native，准确diff/指纹补报告，冻结交007真实执行，不新增ID。
