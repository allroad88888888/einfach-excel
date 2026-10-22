---
id: '003'
title: 插件宿主安全读写并订阅真实成功修改
kind: leaf
parent: null
depends_on: []
model: gpt-6.1-sol
status: done
created: 2026-10-22
done: 2026-10-22
base: 08caefbce8cb4934ceea4f0c26115d910569a47c
files:
  - excel/spreadsheet-ui-core/src/**
  - excel/spreadsheet-ui-core/test/**
  - excel/spreadsheet-ui-core/docs/host/**
  - excel/rust/excel-core/src/**
  - excel/rust/excel-core/tests/**
  - excel/rust/wasm/src/**
  - excel/rust/wasm/tests/**
---

# 插件宿主安全读写并订阅真实成功修改

## 目标与交付边界

一个完整宿主数据闭环：同一Store类型化原始值/公式批量读写 → Rust真实事务 → UI与API同源成功通知 → 宿主按范围增量读回；保护/交互锁/结构策略不能被旁路。
值协议、原生写入、通知、失败和旧连接失效必须一同验收，不能只导出类型或封装API而漏掉用户UI。
与001并行，严禁改React、根构建/锁文件。公共新增模块收在Core `src/host/` 与Rust独立职责目录。

## 上下文

- `rust-workbook/commands.ts` 目前有projection.readVisible/cell.setInput/workbook.importCells/history.apply。初始化importCells会清历史，不可用作运行期patch。
- `rust-workbook/runtime.ts` 是现有Worker dispatcher，现超过500行；新增宿主逻辑需抽真实职责，不把新功能继续塞进去。
- `window-projection.ts`→WASM read_sparse_range→cell-io.ts产生DisplayCell，字符串display不是typed原值协议；不能从格式化显示反推保存值。
- `runtime/rust-workbook-runtime.ts` 的replaceRustWorkbookRuntimeAtom(text:string|null)已候选Worker校验后交换，start(definition)则先销毁旧连接；复用前者支持内存文本换簿，不重写业务JSON转换。
- `rust-worker/transport.ts` 只负责RPC关联。必须保持传输无电子表格业务；可增通用事件接收线，但mutation语义和校验在rust-workbook/host里。
- Rust `workbook_history_entry.rs` 已有affected_sheets，历史Cells before/after含跨表快照，但当前对外只给主范围/受影响表，不足以准确增量保存跨表引用。
- 原生批量import有逐格stats且不记用户历史；运行期patch必须真原子或明确partial，不可try循环写后伪装整批成功。
- `@einfach/core` Store的getter/setter/sub可供Core外部宿主使用；React产品代码仍禁止直接调用。
- 插件已有properties稀疏索引，不加Rust字典；不依赖插件HostPort。可只读 `/Volumes/work/web/excel-plugin/packages-core/workbook-contract/src/host.ts`，不修改外部项目。

## 覆盖矩阵行

PKG-06、PKG-07、PKG-08、PKG-09、PKG-10。

## 接口（稳定最小命名；不得另造SDK）

### 消费

现有rustWorkbookConnectionAtom、Rust原生保护/历史、候选Worker替换、projection结果发布命令。

### 产出，供004消费者使用

- `RawCellValue` 判别联合：`{kind:'number',value:number}`、`{kind:'string',value:string}`、`{kind:'boolean',value:boolean}`、`{kind:'blank'}`、`{kind:'error',code:string}`。公式输入与求值结果分开。
- `RawWorkbookCell`：`{row:number,col:number,input:string,formula?:string,value:RawCellValue}`；value是当前原生计算值，不是formattedDisplay。
- `readWorkbookRangesAtom`：输入 `{targets:readonly {sheetId:string,range:CellRange}[]}`，返回 `Promise<{status:'ok';ranges:readonly RawWorkbookRange[]} | {status:'error';error:{code:string;message:string}}>`；每个RawWorkbookRange为 `{sheetId,range,cells:readonly RawWorkbookCell[],revision}`。说明稀疏空格省略规则、预算/边界、公式惰性求值。一次多范围读同一原生修订版，无UI选区依赖；失败不得吞成空列表。
- `writeWorkbookCellsAtom`：输入 `{cells:readonly {sheetId:string,row:number,col:number,input:{kind:'literal',value:RawCellValue}|{kind:'formula',formula:string}}[],source?:'api'|'refresh'}`；返回 `Promise<{status:'ok';changed:boolean;revision:number} | {status:'error';error:{code:string;message:string}}>`。一批一个Rust事务/撤销步骤，失败不留前半批、不清旧历史。保留字面量00123和前导=字符串。必要时限量原子拒绝，不伪造partial。原生提交后投影刷新失败不得改报事务失败：保留成功事实/通知，视图错误单独反馈；transport断线提交未知的错误code/文档须准确，不能承诺回滚。
- `WorkbookChangeEvent`：`{operationId:string,revision:number,source:'user'|'api'|'import'|'refresh'|'history',kind:string,changes:readonly {sheetId:string,ranges:readonly CellRange[]}[]}`；增加doc/connection身份字段如确有旧实例误投风险，不能仅靠revision。提供只读 `workbookChangeAtom` 订阅入口；不能以投影变化推断事件，不保存无限事件日志。
- 事件覆盖：UI编辑、粘贴、清除、填充、格式、撤销/重做、跨表源/目的/被重写引用、结构/元数据的实际持久修改。成功后一次；拒绝/失败/无变化不发成功；重算/滚动不发用户修改。import/refresh准确标source，dirty由插件决定。读范围可能触发原生异步求值，但不能当用户保存。
- 原生应给实际改写范围；允许将本次真实写入位置压缩为有限矩形，不扫描/回传整张表来掩盖漏项；多表位置不可只给同一个主range。跨表动态/命名范围仍遵循现有明确拒绝边界，不扩大兼容承诺。
- `hostControlsAtom`/`configureHostControlsAtom`：最小控制 `{readOnly:boolean,busy:boolean,allowSheetStructure:boolean}`，默认false/false/true；configure返回 `Promise<{status:'ok'} | {status:'error';error:{code:string;message:string}}>`。readOnly拒绝所有宿主/用户持久修改；busy是交互锁，拒绝user/history但允许显式api/refresh写（不是服务端授权）；allowSheetStructure=false拒绝新增/删除/改名/移动表及插删行列。原生保护仍执行，不可用source绕过。
- 门禁必须在Worker命令执行前统一生效，Core入口也明确反馈。捕获到旧连接的异步结果/事件不能写新Store工作簿。生命周期配置、初始化导入和只读查询不被误挡。
- 安全换簿继续用公开 replaceRustWorkbookRuntimeAtom(text|null)，文本由宿主内存提供即满足本轮；不要扩展插件业务数据格式。补失败保旧/成功通知/重挂控制的测试。

## 验收标准

1. Rust+Core定向测试覆盖typed值/结果/公式、稀疏与多范围同修订、字面量文本/空格/error、保护/边界、原子失败、保留历史和一次撤销重做。
2. 用户UI现有cell.setInput/clipboard.paste/range.clear/range.fill/history.apply也走同一事件源，不只新API有通知；跨表剪切与引用改写范围有native断言。
3. 失败/无变化不产成功、滚动/异步重算不误记user，import/refresh source正确、锁/结构策略阻挡实际Worker命令且只读仍可读。
4. 旧连接晚回包/晚事件、换簿失败、同Store重启保持正确；事件订阅不泄漏，dispose终止等待。
5. 不增加TS workbook mirror/通用backend/不在JS循环调用cell.setInput伪装原子批量；所有新增层能一句话解释必要性。
6. 需新增WASM导出时更新现有API签名快照并审查实际diff，不能盲目生成。仅跑相关Rust/Core用例；004最后统一重建WASM/全仓验证。

## 验证分工

- 执行者：本任务Rust/Core定向测试；报告精确源码diff标识、命令、native/API改变和未验项，不跑全仓build或完整E2E。
- 004：一次最终WASM构建、DOM/包消费者场景、全仓门禁、FEATURES登记。
- 独立reviewer：权限、事务、通知真实边界/漏域、旧连接及跨表正确性，可独立否决本叶子。

## 执行记录

- 2026-10-22：就绪派发；基线08caefbc，与001范围隔离。
- 2026-10-22：确认Einfach0.4.0 setter丢弃finally派生拒绝的依赖缺陷。裁决新宿主命令采用显式status结果，调用方不需靠catch处理正常拒绝；禁止覆盖Promise实例方法/改node_modules/全局补丁。旧replace约定Promise<boolean>保持并内部反馈失败false。此处是本任务公共协议调整，004和外部消费者须同步。
- 执行中实测发现原子校验失败回滚会残留候选spill子格，已修结算；作者报5项native与64项Core通过，最终修改范围补强后待最终指纹/报告。独审重点复核失败无残留/无成功事件，不把该中途证据当最终全绿。
- 2026-10-22：收DONE_WITH_CONCERNS与reports/003-report.md，421项Core、最终105项native（11 binaries）、Core tsc、WASM cargo check、保护2项与API签名检查通过；无真实WASM重建。已派独立事务/权限/事件审查，状态仍running，004最终接管真包及DOM验收。
- 2026-10-22：独审REJECTED，详见reports/003-review.md。进入修复R1（原作者），范围不变；全部4项Important需关闭后再复审，Minor M1顺带澄清文档。不得把先前421/105项结果冒充修复后结果，仅补跑受影响用例并给新指纹。
- 2026-10-22：R1收DONE_WITH_CONCERNS，52文件聚合指纹82c7277f...cac66146；Core54文件431项、native20 binaries189项、Core tsc/WASM crate check/API invariant通过，实际WASM仍待004。修复与故障语义见003-report.md末节；派原独立reviewer复审4 Important/M1及delta，状态仍running。
- 2026-10-22：R1独审APPROVED，52文件指纹一致；原4 Important/M1全部关闭，额外最小探针验证首次post失败后重试成功的序号/队列。PKG-06至10本叶定向通过，状态done；严格保留004真实WASM/DOM/包消费与全仓门禁边界。

## 修复R1

必须完整读reports/003-report.md和reports/003-review.md，以审查报告的最小复现和六条验收为准。修复依然是本叶同一交付，不新增层或叶。

- R1：原生删表Presence、undo、redo事实必须包含真正重写的跨表公式及规则/验证位置；利用已持有archive变化，不把权限affected_sheets泛报成修改。特别覆盖恢复成功取走archive后的undo事实。
- R2：候选换簿所有await完成、交换所有权之前，按Store当前controls重新门禁；readOnly/busy在等待中改变则拒绝候选并保旧文档、旧连接及事件。
- R3：条件格式仅从实际改变的规则前后像提取全部新旧范围，覆盖多区域create/disable/delete、scope移动及undo/redo；不要上报未改变规则。
- R4：提交后metadata/身份组装失败不能让当前RPC无响应或毒化后续队列。新增表身份必须覆盖该失败窗口；保持原生已提交的事实与诊断，不伪报回滚，错误发布自身也不能逃出消息边界。
- M1：澄清全轴元数据事件范围未必可按画布/预算直接typed read；值增量与格式/规则等元数据保存协议不同，按需切分或用现有export。

回归需保留review所揭示的精确分支，不仅覆盖普通投影抛错。补充报告至003-report.md的R1节，列改变文件、新源码指纹、命令/计数和剩余边界；不改003-review.md、不跑全仓/E2E、不修改其他叶。

## 集成回修R2：仅格式

004根lint首次运行发现本叶13个TS文件共17项max-len失败，详见`.codex-artifacts/react-excel-package-004/lint.log`。只在该日志列出的13文件换行，不改变token、语义、导入集合或功能；不动其他文件、不跑全仓或Rust。不需要重做已通过的R1功能修复，004其余不相交验收继续。

完成后跑这13文件的定向ESLint，更新报告R2节和新范围源码hash；编排者按机械改动审查及下列修前token指纹核对，不为换行重复431项/189项/独立全审。若确需非换行改动先回报，不自行扩大。

修前naive TypeScript scanner（skipTrivia=true）的`[kind,text]` JSON SHA-256（仅诊断，后已确认模板上下文处理不足，不能据此验收）：

```text
0893affafd178e259b7c809bf5448c15017a9d6ba386f773ef47e412b0159f0f  excel/spreadsheet-ui-core/src/host/atoms.ts
b173dbb694ecf46a36b4fdd2aea590bd154049b68b4b33037b96090e21092964  excel/spreadsheet-ui-core/src/host/binding.ts
b818608cce25ca932664d2a16dff479d65581e2763c17b62983004e7731420f3  excel/spreadsheet-ui-core/src/host/connection.ts
19b40868ddd960542e07f1029ec1a3d2ad8f17c36fe0cf167da109d50a6016a7  excel/spreadsheet-ui-core/src/host/index.ts
09baf0826895ad54daf5ce8c708146f857bdf5d197409580ecdf752e199fbb6c  excel/spreadsheet-ui-core/src/host/state.ts
51a938e076aa7b33c42a2044827079f5ec8e648cbb5b471bc83a851a80db59cb  excel/spreadsheet-ui-core/src/host/types.ts
995cfad5edd9eb77a540ba7d9924d80734db77e85d1859f9bc8fbaf4d14fdcdd  excel/spreadsheet-ui-core/src/host/worker.ts
7b52795895a8c0d26910803638cca1740f09dd006ba4dab7ad113b3405d09b5c  excel/spreadsheet-ui-core/src/runtime/workbook-connection.ts
078ab09aa6ab648f9de9d2453870ad9da3ae5c9d51ae57eec7806574e4b24f58  excel/spreadsheet-ui-core/src/rust-workbook/wasm-types.ts
dc7ea38e5606eac31b0d87a6dae3c630a4353fa16d9be40a210a00c9a9b2048d  excel/spreadsheet-ui-core/test/host/atoms.test.ts
2301f0c8aefa53520704de2c168445dd8599101ffb9e8eaf748a76e1a67ea1d0  excel/spreadsheet-ui-core/test/host/replacement.test.ts
c929a9b4d1a0ada685f5ca0f2e018341b4e384913420e7d6dd8e98d691df3af4  excel/spreadsheet-ui-core/test/host/worker-failures.test.ts
49f824e25e2878e7e25965951e874b67e8942d929e67ad2a9da4798870b5e009  excel/spreadsheet-ui-core/test/host/worker.test.ts
```

方法修正：该naive scanner未在模板中reScanTemplateToken，模板反引号后的代码可能错误并入一个token，导致仅换行也出现伪差异。不得以此要求作者修改token。R2最终证据改为：用原报告的修前文件SHA验证内存逆向还原，再以parser-aware token/规范化AST比较；报告保留逆向片段/规则和修前后hash供根审复核。不写回旧源码，旧naive hash不当成功/失败判据。

R2追加集成测试修正（与13文件纯换行证据分开）：004完整Vitest发现两项明确旧期望。

- `test/initial-tables.test.ts` fake Worker未处理新增`host.configure`，当前fallback读取不存在的payload.cells并使启动失败；需给该命令正确回复，保留initialize→所有chunk→tables→catalog→configure→ready/async的真实顺序和表内容断言，不只是删去旧期望。
- `test/package-boundary.test.ts` 的字符串`.*wasm.*`规则误拒`host/worker.ts`的纯类型`WasmWorkbook`引用。精确处理type-only domain引用，仍禁止框架依赖、DOM及运行时glue；加允许类型/拒绝运行时glue的正反样例，不能豁免整个host目录。既有文件391行，不再给其堆新职责；必要时只把现有source-runtime边界测试内聚移到独立<300行测试，保留原检测和其他断言，不做大范围拆分。

这两项只修测试，不改生产行为；定向Vitest覆盖改动测试和新增负例，报告单独列修改/结果。004另有React测试在重负载下超时/草稿坐标差异，尚未复现定性，不属于本次回修，禁止顺手改。

编排机械审查：已逐条读17个逆向换行片段，均位于参数、类型/导入列表、既有if语句后等安全换行点；独立提取报告只读证明脚本，13/13原SHA与parser-aware token一致，自然exit0。首次提取用字符串split误切脚本内部同名文本而exit1，修成按实际标题slice后通过，非产品失败。13文件格式部分APPROVED，生产语义独审有效；状态running只待上述两项旧测试修正。

R2追加实物缺陷：004真实tarball的Vite/Rspack readOnly格内/公式栏提交被正确拒绝、值未改，但`editing/commit-feedback.ts`把已知HOST_READ_ONLY归成通用“That edit was not saved.”，没有保留宿主锁的明确已译诊断。复现证据`.codex-artifacts/react-excel-package-004/package-targeted-r2-results/controls-installed-vite-re-76ad6-oard-edits-with-en-feedback/error-context.md`。这是本叶PKG-10错误恢复闭环，不调低E2E断言。

最小修复共用editing反馈映射，保留已知HOST_*稳定诊断供现有React反馈词典翻译；不要新增生命周期/错误SDK/公共字段/英文文案副本，不改React或门禁策略。未知错误仍通用提示+原detail，outcome-unknown仍保持原不可盲重试语义。补Core反馈和必要command链定向回归，003给新生产hash后004重建/重pack，004的中英真实DOM负责最终验证。
