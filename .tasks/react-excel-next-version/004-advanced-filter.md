---
id: 004
title: 高级筛选组合及全选搜索结果
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
  - excel/rust/excel-core/src/advanced_filter/
  - excel/rust/excel-core/src/filter.rs
  - excel/rust/excel-core/src/sheet_filter.rs
  - excel/rust/excel-core/src/sheet_filter_shift.rs
  - excel/rust/excel-core/src/workbook_filter*.rs
  - excel/rust/excel-core/src/workbook_table_filter*.rs
  - excel/rust/excel-core/src/workbook_history_filter.rs
  - excel/rust/excel-core/tests/advanced_filter.rs
  - excel/rust/excel-core/tests/advanced_filter/
  - excel/rust/wasm/src/advanced_filter/
  - excel/rust/wasm/src/wasm_filter_wire.rs
  - excel/rust/wasm/src/wasm_workbook_filter_values.rs
  - excel/spreadsheet-ui-core/src/advanced-filter/
  - excel/spreadsheet-ui-core/test/advanced-filter/
  - excel/spreadsheet-ui-core/src/filter/panel-state.ts
  - excel/spreadsheet-ui-core/src/filter/panel.ts
  - excel/spreadsheet-ui-core/src/filter/values.ts
  - excel/spreadsheet-ui-core/src/filter/command.ts
  - excel/spreadsheet-ui-core/src/filter/scope.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/filter-commands.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/filter-io.ts
  - excel/react-excel/src/workbook/advanced-filter/
  - excel/react-excel/test/workbook/advanced-filter/
  - excel/react-excel/e2e/advanced-filter/
  - excel/react-excel/docs/advanced-filter/
---

# 高级筛选组合及全选搜索结果

先完整读index与指定skills；只写本任务files及reports/004-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖F-01/F-02。

## 已核对入口

Core filter/panel-state.ts仅当前草稿和一候选页；filter/command.ts走sheet.filter或table.change并接Rust隐藏投影。Rust filter.rs::ColumnFilterRule目前equals/contains/range/list，flat AND。workbook_filter_rules.rs apply/reapply/clear显式扫描快照，不应改值时自动全表扫描。普通范围/Table scope独立，手工隐藏不变。

## 交付

- 组内AND/组间OR，新增/修改/移除组和条件，Rust求值；旧flat AND及文件兼容。不支持任意嵌套树，没有组/空组/非法列范围明确定义或整次拒绝，避免空组意外全匹配。沿原类型/大小写/空值。
- 搜索候选可全选/取消所有搜索匹配而非当前页，切页保选择、搜索变化不偷偷应用，显示计数。Rust受预算扫描给全匹配，不能UI无限拉页或无限值数组；保原当前页全选。完整匹配超预算明确拒绝、保草稿，不能截断谎报全选。
- 普通/指定范围/Table隔离、重新应用/清除、排序/统计/SUBTOTAL、手工隐藏、原生history/文件/结构随动和保护不退化；浏览/分组不写，Apply单事务，失败保redo/草稿。
- 新逻辑置advanced_filter/、advanced-filter/，不复制旧filter框架。不是Office完整条件区域/复制到区域，文档准确。
- 先发布分组schema/default兼容、Table wire及全查询API准确签名；lib.rs/共享table及persistence/filter-sort/types/WASM声明/全局UI由007。FilterTools/FilterConditionFields/FilterValueChoices也是007，你只写自己的组件。
- AFILT-主绑定；原生/Core/React和e2e/advanced-filter/实际添加OR/AND、编辑/移除、跨页查询全选/取消/改查询/重新应用。用1000条普通fixture验范围外/手工隐藏、双Table、Undo/Redo/文件/中英两宽/保护拒绝纠错。Cargo约007，浏览器/重建007。

## 独立界面/数据审查修复第1轮（root授权）

已确认兼容性回退：本版validFilterCondition把新1MiB选择预算用于通用list验证，旧flat rules及普通/Table projection共用该validator。旧版可保存的40个不同30002字符值（约1.2MiB，40<1000、每项<32767）现被拒，但Rust旧flat restore仍接受，导致打开旧文件/历史投影不合法。root已对照基线filter-commands.ts及当前projection/contracts证实，reviewer实际只读probe结果见007-review-ui-data.md（正收尾）。

- 保留旧flat持久形状上限（≤1000项，每项字符串≤32767），不让新增搜索/选择预算污染已有文件/历史/投影契约。新完整搜索、当前UI选择新增操作的1MiB预算继续明确拒绝，不通过取消所有预算治标；新groups自身8MiB总预算仍保持。
- 最小修复自身advanced-filter/contracts.ts及确有必要的现有自身命令边界；不改Rust/native/export、不改共享projection/Table原有校验接口、不加双validator框架或迁移镜像。007刚加reduce类型注解保持。
- 先补真实红测试，再修、相关Core绿。覆盖旧flat普通与Table projection、Worker apply/reapply或既有读回路径；新allMatches/合并选择超预算仍拒绝并保draft。不需要巨型真实DOM文件往返，仅为validator兼容做精准契约专项；007最终真实文件/历史/E2E仍统一跑。
- 写报告精确根因/红绿/指纹，通知007这是TS-only delta可与原生build并行。不得自行跑浏览器或重建WASM；完成即结束释放槽，原reviewer补审。

## 真实浏览器影响集第1轮收尾（root批准精确夹具纠正）

007-e2e-impact-r1自然max5结束，20pass/5fail/152未执行，原始log/json保留；不是完整通过。root已读失败log及既有import-seed.ts:94：dataRow===2的订单号自基线就为文本00123而非SO-10003。因此SO-10合法匹配998、SO-100匹配98，取消后900仍不变；原订单seed不能为新测试改掉。

- 只修本版新clear-search.spec.ts/select-search.spec.ts：999数量/页计数改准确998，Next首项改SO-10052（第一页因缺10003末项为10051），保留900、真实Off-page checked、Apply/Undo/Redo与邻格断言。不是放宽/删除断言或修改旧测试。
- clear-search 390的原始红实际为0 selected，须额外核异步动作顺序：Select all click后立即修改search会使未完成查询失效，不能在结果尚未settle时执行下一步。若确认该身份保护是原预期，在第一次Select all之后先用998 selected精确自动等待结算，再改变查询；保留改变搜索后的选择断言，不用sleep/retry/放宽数量掩盖。确为产品丢失则先报root。
- 不动产品/WASM/旧seed/稳定主标题，无需重跑Core/Rust。先同007确认上轮已结束、当前没有另一诊断在跑，再改上述两文件；改完立即通知007 test冻结，再补短报告/指纹结束释放槽。浏览器绿仍由007统一提供。
