---
id: 006
title: 真I/O异步结算及原生依赖传播
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
  - excel/spreadsheet-ui-core/src/async-formulas/
  - excel/spreadsheet-ui-core/src/rust-workbook/async-formulas/
  - excel/spreadsheet-ui-core/test/async-formulas/
  - excel/react-excel/src/workbook/async-formulas/
  - excel/react-excel/test/workbook/async-formulas/
  - excel/react-excel/e2e/async-formulas/
  - excel/react-excel/docs/async-formulas/
  - excel/rust/excel-core/src/async_formulas/
  - excel/rust/excel-core/src/sheet_async_custom.rs
  - excel/rust/excel-core/src/sheet_workbook_async_context.rs
  - excel/rust/excel-core/src/workbook_custom.rs
  - excel/rust/excel-core/tests/async_formulas.rs
  - excel/rust/excel-core/tests/async_formulas/
  - excel/rust/wasm/src/async_formulas/
  - excel/rust/wasm/src/wasm_workbook_custom.rs
---

# 真I/O异步结算及原生依赖传播

先完整读index与指定skills；只写本任务files及reports/006-report.md，状态由root改。共享契约尽早写报告发root转007，不私改共享文件。

覆盖Q-01/Q-02。

## 已核对基础

WASM wasm_workbook_custom.rs已有registerCustomFormulaAsync(name)、drainAsyncCustomRequests()->[{callId,name,args}]、resolveAsyncCustomCall(callId,value)->bool、unregisterCustomFormula；Rust workbook_custom.rs take_pending_async_custom_calls/resolve_async_custom_call、按(name,args) memo、generation丢过期call、#BUSY及array spill传播。sheet_async_custom.rs cache cap512。Core Worker还没接，不能另造Async引擎。

## 先发布短设计契约

报告先给一页最短链路、现有API复用、I/O map仅存什么非工作簿状态、settle如何更新当前视图、projection/request身份如何丢旧结果、recalculate如何重试缓存失败；发root审最小性再交007共享接线。优先现有RPC，不加轮询/eventbus/全局store；若需单一结算通知说明当前必要性/最小wire。共享runtime/transport/projection/WASM声明你不写。

## 交付

- 明确标“项目扩展”的FETCHJSON(url,pointer?)，真实Worker fetch同源JSON后取标量或矩形标量数组交Rust结算；标准JSON Pointer或安全明确路径，不eval、不把demo URL硬编码返回值。
- URL限同源http(s)、拒账号密码/脚本/file/跨源，约束redirect/凭据、响应大小、超时/并发/结构；无未知外部服务/付费/身份契约。样例JSON由007放public/demo/async-formulas/或page专属目录。
- #BUSY→真实结果或准确错误，Rust原有依赖/跨表/array自动传播；失败能原Recalculate重试，不新加内容Undo。相同name,args不重复网络。
- 参数变更、覆盖公式、Undo/Redo、rename/删表、切表/滚动、initialize/openFile/dispose时旧结果不能污染当前实例或调用free后的WASM，不夺焦点。尽量复用已有generation/身份，不新造ticket协议；inflight abort仅现实必要性。
- 打开文件只恢复公式，可信应用代码装同源扩展，不执行文件内provider/JS。保护不能阻止已有公式正常计算，也不能借settle改锁格公式/值事实。BUSY与校验/筛选/CF语义有明确测试，不吞错。
- UI如需要仅async-formulas/小型说明/状态或原重算入口，不造第二公式管理器；Core不缓存Rust结果或依赖图。
- AFORM-主绑定；原生缓存/失效/重试必要专项、Core deferred命令/换连接、React状态焦点。持久e2e/async-formulas/真实Vite Worker/WASM+HTTP，可路由控制同源响应，不能Core直写值或setTimeout固定值假I/O。验成功/拒绝/超时/坏JSON/预算/失败重算/同参去重/参数旧请求/UndoRedo/openFile迟到/跨表/array。Cargo先约007，所有浏览器/重建由007。

## 独立风险审查修复第1轮（root授权，派发后执行）

已确认真实HTTP probe：HTTP403、非JSON类型、Content-Length超限三条早退分支不消费/cancel body，IO finally清除timer并删running但没abort。6条无限403流在native错误settle后activeHttpResponses=max=6，5.2秒及dispose后仍6，signal未abort，突破并发/超时owner边界。证据见007-review-risk.md及证据根007-review-risk-stream-probe-command.txt/.log；该probe是Node真实HTTP，不是整版WASM签绿。

- 在自身async-formulas/边界最小修复：成功/错误/throw各完成路径都终结此次HTTP owner，早退body不脱离管理。可选IO finally abort或provider finally cancel，但须覆盖非OK/类型/声明超长提前返回、完整读取成功、reader异常和dispose；不新增第二生命周期系统。
- 新专项先跑旧代码得到真实红证，再修复取得绿证。验证早退后signal/body真实关闭、总活动HTTP≤4且后续请求可继续、dispose后无泄漏，原NA/VALUE语义、native结算一次、无unhandled rejection不变。复用reviewer HTTP probe做修复后绿证并保原始输出，不只模拟取消计数。
- 不需改Rust/export/新RPC；只跑相关Core专项，不抢007浏览器或重复全仓。必要E2E补入原目录交007，新原始专项/指纹及边界更新006报告，完成结束释放槽，由原reviewer按精确delta补审。

## 真实浏览器r2：四个新case契约纠正（root授权）

r2实际24条通过、四条新测试前置/预期错误。只允许改未纳r3且不被r3 import的`e2e/async-formulas/lifecycle.spec.ts`、`topology.spec.ts`，不改产品src/shared helpers/config/WASM。

- 既有wasm_bulk_wire.rs空customFormulas省略序列化。reopen测试明确验证无FETCHJSON provider数据，可准确断言省略或空数组，不能要求不存在字段一定是数组；冲突文件测试先显式建立customFormulas再注入冲突，保留原子拒绝/旧工作簿不变。
- rename测试使用既有原生规范化公式精确`=('Renamed JSON'!B12+1)`，保留值8，不改为宽泛正则。
- B40滚动窗口测试不能以当前Summary!B12不在DOM断言没有跳回来源表（overscan可合法包含它）；改为结算前后实际scrollTop不变、当前Async Summary/B40活动格及公式不变，值11更新。保留真实HTTP、可观察滚动/焦点身份验证，不删除行为、不sleep、不Core直注入。
- 修改前先核契约，修改后冻结、列准确diff/指纹/依据到006报告，由007跑真实红绿。仅新测试更正不重复稳定Core/native，不新增首要ID。

## 统一lint收尾（须收到007确认r3自然结束后方可写）

原始007-lint-check.log有本领域命令/fetch-json/io/http-lifetime/io.test的max-len/brace及IO两处no-loop-func。仅在自身五文件按准确错误断行/brace；IO把一次call的启动与then/finally闭包整体提到同一owner内小函数，由pump调用，不复制running/queue/disposed事实，不改abort先于释放槽、publish/异常/预算/settlement latch/定时器语义，不disable规则。可保同文件，无理由再造层。

这是生产结构变化，完成后约007运行原Core async 53项影响集及scoped lint；不跑浏览器/Cargo/WASM或新增全仓。精确前后diff/指纹/实际结果追加报告，交原风险reviewer按闭包提取delta补审。当前r3冻结先完成上面两个被排除的新E2E纠正；未收到自然结束消息前不可碰src或其被import输入。
