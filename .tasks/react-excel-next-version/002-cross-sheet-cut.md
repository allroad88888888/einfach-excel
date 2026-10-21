---
id: 002
title: 跨表剪切数据及引用原子移动
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
  - excel/rust/excel-core/src/cross_sheet_cut/
  - excel/rust/excel-core/src/clipboard*.rs
  - excel/rust/excel-core/tests/cross_sheet_cut.rs
  - excel/rust/excel-core/tests/cross_sheet_cut/
  - excel/rust/wasm/src/cross_sheet_cut/
  - excel/rust/wasm/src/wasm_workbook_clipboard.rs
  - excel/spreadsheet-ui-core/src/clipboard/cross-sheet-cut/
  - excel/spreadsheet-ui-core/src/clipboard/system-clipboard-command.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/clipboard-capture.ts
  - excel/spreadsheet-ui-core/src/rust-workbook/clipboard-commands.ts
  - excel/spreadsheet-ui-core/test/cross-sheet-cut/
  - excel/react-excel/src/workbook/cross-sheet-cut/
  - excel/react-excel/test/workbook/cross-sheet-cut/
  - excel/react-excel/e2e/cross-sheet-cut/
  - excel/react-excel/docs/cross-sheet-cut/
---

# 跨表剪切数据及引用原子移动

先完整读index与指定skills；只写本任务files及reports/002-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖C-01/C-02。

## 已核对入口

system-clipboard-command.ts与clipboard-capture.ts通过prepare/finish确认身份后Rust保留快照；Worker runtime仅保token等关联状态。clipboard_move.rs::dependent_writes用稀疏公式索引更新同表移动的其它sheet依赖，rewrite部分范围重叠目前拒CLIPBOARD_PARTIAL_REFERENCE_MOVE。不可复制原生内容到TS镜像。

## 交付

- 同工作簿Cut→切表→Paste移动值/公式/有效格式及原有携带元数据，源成功后才清空；一次Undo/Redo同时恢复源/目标及依赖。完整单格/完整范围引用正确跟随；源内公式对未移动原本地格仍引用原表，目标带空格/引号表名正确。
- 部分引用范围拆分本版仍原子拒绝，不用端点平移造错引用；保数据、redo和可重试快照。不要为实现跨表改所有旧拒绝预期。
- Rust检查源/目标及受影响依赖公式实际写入权限；遵循现有验证Stop/Warning确认、数组/合并/Table/同表重叠政策或明确拒绝。失败不得清源、半写一张表、消耗token/redo。
- 切表不应使确认cut失效；新复制/实际内容变化/替换工作簿沿已有身份修订保护，外部clipboard失败源零写，不新造协议。
- 专属原生规划/事务/重写放cross_sheet_cut/，Core放clipboard/cross-sheet-cut/；旧文件必要分支即可。不需要新ReactUI就不造假组件，文档/E2E仍独立目录。
- 尽早发布准确API/多表history事务与rollback/注册请求。lib.rs/workbook.rs/history共用枚举、runtime.ts、commands.ts、wasm-types.ts和共同history apply由007接线；你独占白名单clipboard文件，不碰004/005。
- 新Rust/Core/React专项及持久e2e/cross-sheet-cut/，XSCUT-绑定。实际DOM剪贴板验两表和第三表依赖、绝对/混合引用、带引号表名、一次历史、拒绝/纠正/元数据，原copy/paste modes不退化。Cargo先约007，不能自己跑浏览器/重建WASM。

## 独立风险审查修复第1轮（root授权）

已确认：源Source!A1=4，工作簿命名范围Sales→Source!A1，Audit公式=SUM(Sales)。原跨表cut到Target!C4成功，但named definition仍指源，依赖结果4变0。reviewer静态证据见007-review-risk.md（正在收尾），原生named_range_reactivity已有同语义。

- 最小边界：跨表源范围与原生有效NamedDefinition::Range相交时，在一切内容/history/redo/token变化前明确原子拒绝；无关命名范围、常量/表达式名称和LET/LAMBDA局部变量不应误拒绝。不扩为本版命名范围搬迁历史系统。
- 在现有独占cross_sheet_cut/实现检查；尽量读现有原生公开定义查询，不新增状态镜像。若确实需要改白名单外共享接口先报root。
- 先补真实红测试证明旧代码成功却算错，再最小修复及影响集绿证。覆盖完整/部分命名range交集、稳定sheet身份、无关名称放行、源/目标/依赖/redo与快照失败保持。追加真实DOM错误分支E2E（由007运行），原主操作无需新增ID。
- 错误码/用户可纠正文案在原Core独占错误映射落地，新Lingui字符串报007集中处理。写报告精确文件/指纹/红绿证据；Cargo先约007，完成后结束释放槽位，再由风险reviewer补审。
