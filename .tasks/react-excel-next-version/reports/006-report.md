# 006 真 I/O 异步公式

状态：统一lint收尾后重新冻结，DONE_WITH_CONCERNS；本轮Core53与五文件lint通过，真实浏览器最终红绿由007统一执行，本轮未运行E2E。

## 已批准最小契约与实际交付

最短链路：原公式栏 → cell.setInput → Rust async memo/queue返回BUSY → Worker drain → 同源fetch → 原resolveAsyncCustomCall → Rust依赖/跨表/spill → 单挂起formula.awaitAsync RPC → 原runVisibleProjectionAtom当前sheet/window → React原渲染。

- `createAsyncFormulaIo(workbook, origin, onSettled, fetcher?)`位于rust-workbook/async-formulas/io.ts，复用register/drain/resolve。严格要求既有`read_custom_formulas():string`（native definition[] JSON），安装FETCHJSON前拒绝同名数据定义。live UI原生registry.contains本已拒host async同名。沿现有消息`The custom formula name is already in use.`，无新增Lingui消息。
- 可信应用initialize/openFile后安装provider；文件只恢复公式，不存provider/JS。007接dispatch success/error后drain、替换前dispose/abort、失败候选free并保留旧实例。I/O只存workbook引用、callId→AbortController、有限队列/queuedIds Set、单waiter/boolean settlement latch；无结果cache/依赖图/工作簿镜像/新ticket。
- formula.awaitAsync只在真实结算完成`{settled:true}`；先结算最多一个boolean latch，重复waiter拒绝，dispose返回`{settled:false}`。无轮询/eventbus。原生接受settle才由onSettled推进existing revision，失效旧预览/验证身份，不加内容Undo。
- Core watcher初次yield一个microtask等待runtime outer-writer flush，再按原connection身份守卫；唤醒读取此刻sheet/window并走原projection lane。不会改editing/selection/scroll/focus，旧连接不发布新实例，disposed闭包不再进入WASM。
- 原生hook准确为`self.retry_failed_async_custom_calls(sheet)`，007置于原recalculate callback/sheet检查后。所选sheet公式inner AtomId与memo store.reverse_dependents交集只重试已结算失败。共享memo恢复其所有观察者，无关sheet失败不变；success/inflight不重启。generation用wrapping_sub，旧callId映射显式移除，复用atom并按原rearm递增callId，不加Undo。
- FETCHJSON(url,pointer?)明确项目扩展；无builtin native catalog metadata，本版只承诺公式栏手填，003参数表单/原生补全不声称支持。
- URL限同源HTTP(S)、拒userinfo/script/file/跨源，credentials omit、redirect error。RFC6901 Pointer只访问own property，拒无效escape/数组index/prototype路径；不eval。结果仅标量或非空矩形标量数组。预算1MiB响应/5s/4并发/128排队/4096结果格/深32/20000节点；排队超额逐条native结算VALUE，可原重算重试。
- 参数/JSON/Pointer/结构/预算为VALUE；HTTP/网络/超时为NA。reader中途TypeError网络NA，非法UTF8 VALUE，真实ReadableStream专项区分。native resolve/drain异常abort并拒同一RPC，当前连接Core发布实际runtime错误后dispose，避免静默永久BUSY/未处理rejection。
- WASM字面量修复：原resolveAsyncCustomCall新增显式成功`{json:scalar|2DScalarArray}` envelope，无新export/签名变化。wasm/async_formulas/json_value.rs只认own json，既有error对象优先；旧direct string/array error-token契约不变。JSON字符串含NA/VALUE/BUSY直接Value::Text，有限数字/矩形/4096格/1MiB文本预算明确。Worker仅成功包json，失败沿旧error。

## 文件职责与共享接线

fetch-json.ts负责HTTP JSON值；io.ts负责原生队列I/O；commands.ts为功能wire边界；watch-settlements.ts负责Core结算唤醒。无新增React状态/管理器。Rust两原文件仅retry最小扩展；WASM原method仅专用字面值分支。

007共享：commands/wasm-types分别extends本域RustAsyncFormulaCommands/WasmAsyncFormulaQueries；Worker owner及revision；runtime双绑定watch；native recalculate hook；同名失败候选free；demo/JSON/FEATURES/i18n/统一门禁。最终接口已整包通知007。

demo为`?demo=async-formulas`；`/demo/async-formulas/result.json`含price21.5、matrix[[1,2],[3,4]]、label。Async JSON B3取price、C3乘2、B5矩阵、E5求和、B9坏pointer；Async Summary B2跨表C3。007已按契约添加，原Sales Orders种子不动。

## 实际验证

基线b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb；多owner共享工作区，无commit/push。证据根`.codex-artifacts/react-excel-next-version.11oYiO/`。

- `pnpm --filter @einfach/spreadsheet-ui-core exec vitest run test/async-formulas`：4文件48项passed，最终日志006-core-async-formulas.log。含安全URL/Pointer/真实流断连和UTF8/预算/锁存/重复waiter/dispose/队列饱和/resolve及drain抛错/current-window/old-connection/真实startup outer-writer绑定。
- `pnpm --filter @einfach/spreadsheet-ui-core exec tsc --noEmit --emitDeclarationOnly false`：通过，无输出。
- 预约Cargo `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test async_formulas --test manual_calculation`：新增9+既有6passed，006-cargo-async-formulas.log；追加同名拒绝后`--test async_formulas`最终10passed，006-cargo-async-formulas-name-conflict.log。窗口已释放。native覆盖失败scope/共享memo/success-inflight、跨表/array、参数旧调用/覆盖/UndoRedo/保护/恢复NAME缓存、BUSY与validation/filter/CF。
- 新/大改源测试均≤300行，原文件最大155行；新文件rg无尾空白，既有原文件git diff --check通过。WASMhelper62行，无签名snapshot预期变化，真实编译/签名由007执行。

## 持久E2E与剩余验收

共28cases已写但本人未运行：26项产品DOM+真实Vite Worker/WASM+HTTP；2项lite/full实际WASM补充wire回归。page.route只控制真实HTTP响应，不Core写值，不定时固定假I/O。

| 稳定ID | 文件 | exact primary title |
| --- | --- | --- |
| AFORM-001 | async-formulas/settlement.spec.ts | enter FETCHJSON through the formula bar and settle real HTTP with native dependents |
| AFORM-002 | async-formulas/settlement.spec.ts | retry a failed FETCHJSON with the existing Recalculate control |

其它覆盖HTTP拒绝/timeout/坏JSON/byte-array预算/redirect/跨源/同参去重/array跨表/保护焦点/参数迟到覆盖/UndoRedo/openFile迟到和重开/切表滚动/rename-delete/同名UI与file拒绝；json-literals.spec.ts实际HTTP的ISTEXT/ISERROR验证3种标量token文本及二维数组。wasm-wire.spec.ts补旧direct token、error优先、inherited json/对象/参差/Infinity拒绝。

待007统一lite/full重建、wasm_public_api_signatures_unchanged（不改snapshot）、28项浏览器实际结果、全仓门禁/截图。未运行项不声明通过；实际失败由root回派本owner，冻结期不私改共享代码。

## 独立风险修复第1轮：RISK-006-01

根因与精确delta：provider在HTTP非OK、非JSON类型、声明Content-Length超限时提前返回，尚未取得reader，body未取消；IO原finally清timer并从running移除controller，使未读响应脱离4并发/5秒/dispose所有权。只在本域io.ts原finally开头新增`controller.abort()`（两行边界注释加一行语句），先终结当前请求再清timer/删running/启动下一批。覆盖成功、显式错误、读体异常及native settle抛错后的同一收尾路径；不新增生命周期、RPC、Rust/WASM导出或错误语义。

新增`test/async-formulas/http-lifetime.test.ts`（133行，Node环境）直接使用临时127.0.0.1 HTTP server与Node原生fetch，只stub原生queue/resolve边界。三条早退各6个无限流验证signal/真实server close、最大活动HTTP≤4、下一成功请求继续、每个callId只native结算一次及NA/VALUE不变；另验真实body中途断连NA、dispose关闭4条在途流且不结算释放实例。

红绿过程与原始文件均在同一证据根，保留旧文件而非覆盖：

1. 未改产品先执行`pnpm --filter @einfach/spreadsheet-ui-core exec vitest run test/async-formulas/http-lifetime.test.ts`：5项中4失败/1通过，`006-r1-http-lifetime-red.log`。三早退每项均真实`active=6, maximum=6, abortedRequests=0`；第四失败为body断连后signal未终结。dispose原路径已通过。
2. 加入唯一abort语句后原命令：5/5通过，`006-r1-http-lifetime-green.log`。
3. 相关回归`pnpm --filter @einfach/spreadsheet-ui-core exec vitest run test/async-formulas --reporter=verbose --disableConsoleIntercept`：5文件53/53通过，无unhandled rejection，`006-r1-core-async-formulas-green.log`。这是最终相关Core总数，替代48，不相加。真实HTTP日志三早退active均0、maximum分别3/4/3、aborted均6；每项随后真实success42与dispose检查也通过。原timeout、错误映射、fatal恢复、连接身份专项保持通过。
4. 复用reviewer持久`007-review-risk-stream-probe-command.txt`中完整Node命令原样运行（仅stdout另tee），结果`006-r1-review-stream-probe-green.log`：第一阶段settled6、activeHttpResponses0、maxConcurrentHttpResponses3、anyRequestAborted=true；等待5200ms并io.dispose后active仍0、aborted=true。原reviewer红log保留，未替换。server、interval与连接在finally关闭。

本轮只改io.ts、新HTTP专项与本报告；原28项E2E不变，未执行Rust/Cargo、WASM重建、浏览器或全仓。以上真实Node HTTP不冒充Worker/WASM通过。最终语义delta/命令/指纹交原reviewer补审；006-r1-files.sha256记录本轮冻结输入，初轮006-frozen-files.sha256保留供比对。无需因纯报告更新重复产品测试。

## 真实浏览器r2：四处新测试契约纠正

依据root/007的r2真实结果，006当时24项通过、4项新测试失败；此处仅纠正被明确排除在当前r3及其imports之外的两份新spec。未改产品src、共享helpers、config、WASM、case标题/稳定ID，未运行浏览器或重复Core/native。修改后立即冻结，待007真实验收，不将静态核对计作绿证。

准确delta：

1. `lifecycle.spec.ts:68`：对`customFormulas`调用数组matcher改为精确断言文件无该属性。既有`wasm_bulk_wire.rs:202`的`skip_serializing_if = "Vec::is_empty"`会省略空registry；仍明确验证文件不含FETCHJSON provider，保留重开后的第二次真实HTTP、BUSY→6与原公式检查。
2. `lifecycle.spec.ts:115`：冲突文件先显式`customFormulas = []`，再push FETCHJSON定义；保留真实openFile错误`Current workbook kept`、关闭对话框与旧工作簿邻格不变检查，不让缺字段的JS TypeError截断原子拒绝验证。
3. `topology.spec.ts:20`：rename后的原公式精确期望从`='Renamed JSON'!B12+1`改为`=('Renamed JSON'!B12+1)`，保留真实HTTP返回7与依赖值8。源码依据为`workbook_sheet_refs.rs:71`调用`render_formula`、`shift/render.rs:92`的BinOp无条件括号规则；不是宽泛匹配。
4. `lifecycle.spec.ts:79`滚动case：删除Summary!B12必须不在DOM的错误overscan假设。真实HTTP结算前后都精确断言Async Summary选中、名称框B40、原公式`='Async JSON'!B12+1`；先确认实际scrollTop>0再记录，结算得到11后核对scrollTop与记录严格相等。DOM依据是`WorkbookGrid.tsx:157`的`data-testid="sheet-scroll"`、`NameBox.tsx:137`的真实名称框与`WorkbookSheetTabs.tsx:89`的选中态。只读取实际DOM滚动位置，未Core注入、未固定sleep、未删原行为。

两份spec分别122/36行；`git diff --check -- <两spec>`无输出，另对未跟踪文件执行尾空白检查无匹配。冻结SHA-256（完整路径及本报告指纹见证据根`006-r2-test-contract-files.sha256`）：

- lifecycle：`ce8e8f4bd2984cec7f2b21b398b317c755435fbfca94ce0d2ccc6c73b781d723` → `f55da2b79189c1b9dbed9abc295e3398b3d0baf55b709de624c8a3fdd6d5a06f`
- topology：`c8fea2bcb7e1a02987be9faaf5a1006f615b91ce7feec971fabe4938c0f9ad08` → `7d68e59263993fff51893ef1e332c379d6e40079ba86527346044198d84aa755`

## 统一lint收尾：单call闭包最小提取

开始条件：root与007均确认r3 PTY12236自然退出exit1，当前无浏览器；007明确授予本域原53项Core与scoped eslint窗口，本轮不占Cargo。只写原始`007-lint-check.log`命中的本域五文件，不动其它owner、规则/config、WASM或E2E。

精确前后diff在证据根`006-lint-owner-delta.patch`（151行unified diff；从本轮写前原文生成）。非格式变化只有`io.ts:61`同一`createAsyncFormulaIo` owner内新增`start(call: PendingAsyncFormulaCall)`：将原pump循环内此次call的controller、timeout、provider启动、then/finally/catch完整移入；pump仍按原顺序shift、queuedIds.delete、同步start，原并发门槛不变。闭包读取原owner的disposed/running/queue/waiter，不新增或复制事实、不引入层或导出；call是函数参数，避免循环内声明捕获可变owner状态的no-loop-func红证。`finally`顺序严格保持abort→clearTimeout→running.delete→未dispose时drain/pump，`catch(fail)`保持末端；resolve接受才publish、异常拒同一waiter、settlement latch/超时/排队预算/重算与错误映射均未改。

其余四文件只有准确格式：commands的resolve签名断行；fetch-json三处try/catch连接brace；http-lifetime的server.close Promise回调加block断行；io.test的150个请求setup断行。io的waiter类型只断行。没有eslint-disable、放宽断言、改测试数量或新增抽象。遵守react-excel/feature-wave的原链路与one-file-one-thing：I/O只负责执行原生队列，每次call启动逻辑在同文件内聚，五文件22/137/136/135/139行，均≤300。

一次验证实际结果：

- `pnpm --filter @einfach/spreadsheet-ui-core exec vitest run test/async-formulas --reporter=verbose --disableConsoleIntercept`：exit0，5文件53/53 passed，`006-lint-core-async-formulas.log`。包含真实Node localhost HTTP早退三场景active均0、maximum分别3/3/4、abortedRequests均6；成功继续、读体异常/dispose、超时/预算、native resolve/drain异常、连接与窗口身份专项均通过，无unhandled rejection。仍是Node/Core证据，不冒充Worker/WASM。
- 五文件准确`pnpm exec eslint --config rules/.eslintrc --ext=.ts,.tsx --ignore-path ./rules/.eslintignore <五文件>`：exit0、无输出，`006-lint-scoped-eslint.log`；完整展开命令及退出状态记`006-lint-commands.txt`。原37项全仓红证保留，本域未运行或宣称全仓lint通过。
- 五文件`git diff --check`无输出；另检查未跟踪文件尾空白无匹配。写后已停止源/测试修改并通知007，可继续统一浏览器。未跑Cargo/native、WASM重建、浏览器或全仓；r2两spec冻结指纹不变。

本轮写前指纹在`006-lint-before.sha256`；写后五文件、本报告、精确diff及命令记录在`006-lint-files.sha256`。最终io SHA-256为`f7e04e18ea02ec8285ec3f3e2d64f46f21a82e65f818f82b57a80f301a7eae9c`。已交root/007/原风险reviewer按这一闭包提取delta补审，原HTTP泄漏修复的abort顺序保留；不以这次专项替代整版验收。
