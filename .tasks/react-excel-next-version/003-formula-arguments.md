---
id: 003
title: 参数表单生成并保存原生公式
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
  - excel/spreadsheet-ui-core/src/formula-arguments/
  - excel/spreadsheet-ui-core/test/formula-arguments/
  - excel/react-excel/src/workbook/formula-arguments/
  - excel/react-excel/test/workbook/formula-arguments/
  - excel/react-excel/e2e/formula-arguments/
  - excel/react-excel/docs/formula-arguments/
---

# 参数表单生成并保存原生公式

先完整读index与指定skills；只写本任务files及reports/003-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖A-01/A-02。

## 已核对入口

formula-functions/types.ts::FormulaFunctionSpec有args(name/optional/repeats/descriptionZh)、repeat(start/length/minGroups)，支持LET重复name/value和固定calculation尾参。nativeFunctionCatalogAtom组合原生内置与表达式定义。insert-function.ts::runInsertFunctionAtom生成=NAME(，用connection/selectionAuthorityWitness约束目标，resolveContentMutationAtom后startEditingAtom。React InsertFunctionTools共用FormulaParameterHelp，保留原Insert draft/搜索/帮助契约。

## 交付

- 任意原生签名及自定义表达式可进入独立参数表单，字段取同一真实元数据，不只做SUM模板。支持无参/必填/可选中间空位/变长尾参/重复组增删/固定尾参，Core覆盖全目录元数据，浏览器验证代表性真实交互。
- 字段为Excel原始表达式，说明文本双引号、区域及跨表地址输入；正确保留嵌套函数、引号、逗号、数组常量，不用split逗号冒充解析。不在TS重写计算器。必填/组完整性先检查，语义仍Rust。
- 确认生成完整可编辑formula-bar草稿，交原Enter提交/Escape取消链；浏览/取消/切函数不写文件/history。目标/连接过期与保护/busy不能写错格。
- 保留旧picker按钮和旧全目录帮助；新组件/草稿集中formula-arguments/，共享picker由007挂接。不要新建临时预览工作簿；本版无实时结果预览或模态中网格拾取引用。
- 模态Tab/Escape/首焦点/处理中防重入、错误保草稿，中英1280/390布局不裁切。先报告公开atoms/组件签名，007负责barrel和InsertFunctionTools，不私改共享文件。
- FARG-独立主绑定写报告。Core/React专项；持久E2E至少SUM多参、IF可选、XLOOKUP可选空位、LET重复组/尾参、TODAY无参、ORDER_NET，验生成公式实际值/一次历史/邻格不变和取消零写。只专项，不跑浏览器/重建。

## 真实浏览器r2：新case前置纠正（root授权）

FARG-003精确生成`=XLOOKUP(2,{1,2,3},{10,20,30},,0)`成功，但提交后返回#VALUE。007只读定位、root核对：既有`src/formula_help/limitations.rs:34`明确lookup/return区域必须reference-backed；`eval_lookup_range_grid.rs`先解析RuntimeRef，因此不是本版空参表单缺陷。不得改原生引擎、改期望为错误或换更简单函数。

- 只改未纳当前r3的`e2e/formula-arguments/native-calls.spec.ts`中FARG-003，核对既有Summary!A47:A49、B47:B49数据后改用真实引用，保留match_mode=0、if_not_found空位、严格生成公式、20结果、一次Undo/Redo及邻格断言。
- 不改seed、旧用例、共享helpers、产品src/config/WASM，不跑浏览器/重建。改完冻结，准确diff/依据/指纹补003报告交007实际执行；无产品改动不重复Core/React专项。
