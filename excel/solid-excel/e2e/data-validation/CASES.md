# 数据校验 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/data-validation/（evaluateValidationLocal）+
> excel/solid-excel/src-vnext/data-validation/SpreadsheetDataValidationDialog.tsx +
> 后端 overlay：src-vnext/adapter/worker-workbook-backend.ts（applyValidationOverlay，
> 逐格求值）/ static-backend.ts（仅盖章 `validation.<kind>`，不求值）
> 存量 spec 行数超限登记：无（toolbar-data-validation.spec.ts 122 行）

## 语义要点（按实现核实）

- 校验结果经投影 `DisplayCell.validation` 到达网格：td 携带
  `data-validation-code` / `data-validation-severity` + class `cell-validation-<severity>`。
- **worker 后端**在投影时逐格求值：非法值 code 变 `validation.list_mismatch` /
  `validation.range_out_of_bounds` 等；合法值/空格保持通用 `validation.<kind>` 标记。
- **静态后端**只按 range 盖章 `validation.<kind>`，不随单元格值变化 —— 逐格求值
  断言只能跑 worker demo。
- severity 由 mode 决定：reject → `error`，warn → `warning`（`validationSeverityForMode`）。
- **reject 模式不拦截提交**：编辑照常落库，单元格仅被标为 error —— 这是当前实现
  （README：validation outcomes arrive via projection），非 Excel 的"拒绝弹窗+回退"。

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| DV-01 | 工具栏按钮可见/本地化 | Wave5 → 查按钮属性 | tooltip/aria 非 raw key | ✅ 存量 | toolbar-data-validation #"toolbar-btn-data-validation is visible, enabled, and not raw key" |
| DV-02 | 创建 list 规则（静态后端） | 填 North,South → save | 目标格 data-validation-code=validation.list | ✅ 存量 | toolbar-data-validation #"toolbar-btn-data-validation opens dialog and can create a list validation rule" |
| DV-03 | 对话框控件与取消路径 | 打开 → cancel | range/kind/list 控件可见，取消关闭 | ✅ 存量 | toolbar-data-validation #"data-validation dialog exposes initial controls and cancel path" |
| DV-04 | 编辑中按钮禁用与恢复 | dblclick 进入 drafting | disabled，Escape 后恢复 | ✅ 存量 | toolbar-data-validation #"data-validation button is disabled while drafting, and should recover after commit" |
| DV-05 | 数字范围规则逐格求值（reject 流按实现） | worker demo：D2 建 range 1..100 reject → 输 500 → 改 50 | 非法时 code=range_out_of_bounds + severity=error，合法后回 validation.range | 🆕 本轮 | validation-rules-eval.spec.ts |
| DV-06 | 规则应用于 range 的多格生效（list+warn） | E2:F3 建 list Yes,No warn → E2 输 Maybe → 改 Yes | 4 格全被盖章 warning；Maybe→list_mismatch，Yes→validation.list | 🆕 本轮 | validation-rules-eval.spec.ts |
| DV-07 | 清除规则恢复自由输入 | 同 range 重开对话框 → Clear | 4 格 data-validation-code 全部移除 | 🆕 本轮 | validation-rules-eval.spec.ts |
| DV-08 | 列表规则 → 单元格下拉选择 | — | — | ⏳ P2 延后 | —（无 UI 入口：网格编辑器无 list 下拉/datalist 渲染，list 规则只产出标记） |
| DV-09 | reject 模式弹窗拒绝并回退输入 | — | — | ⏳ P2 延后 | —（按实现 reject 不拦截提交，DV-05 已钉住现状；拦截式 reject 属产品未实现面） |
| DV-10 | 圈释无效数据（circle invalid） | — | — | ⏳ P2 延后 | —（无 UI 入口） |
| DV-11 | formula 规则求值 | — | — | ⏳ P2 延后 | —（evaluateValidationLocal 对 formula 返回 null，需后端求值，两端均未接） |

## 备注

- DV-05..07 跑 vNext Worker demo（真实 worker 后端，wasm/ts 双 runtime 语义一致：
  validation overlay 在 worker-workbook-backend.ts 适配层实现，两 runtime 共用）。
- 断言全部走 td 属性（data-validation-code/severity），locale 无关。
