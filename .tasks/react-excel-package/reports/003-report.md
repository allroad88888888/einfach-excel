# 003 宿主数据闭环交付报告

状态：DONE_WITH_CONCERNS。R1 已独审 APPROVED；R2 格式、追加旧测试及实物反馈修复已落地，定向验证见文末各独立小节。最新指纹见文末，不能把纯换行证明扩展到随后授权的反馈语义修复。真实重建 WASM、打包消费者/DOM 与全仓门禁属于 004，未据此声称可发布。

以下原交付正文及 43 文件指纹保留为首次送审历史，不代表 R1 最新候选；003-review.md 的首次拒绝结论未由执行者改写。

基线：`08caefbce8cb4934ceea4f0c26115d910569a47c`；未 commit、push、发布。只改本叶 Core/Rust 范围及本报告，保留并行 React 等改动，未修改外部插件、依赖或 node_modules。

## 交付与协议

- Core 根入口公开 `RawCellValue`、`RawWorkbookCell`、`RawWorkbookRange`、`readWorkbookRangesAtom`、`writeWorkbookCellsAtom`、`WorkbookChangeEvent`、`workbookChangeAtom`、`hostControlsAtom`、`configureHostControlsAtom`、`workbookReplacementErrorAtom`。详见 `excel/spreadsheet-ui-core/docs/host/README.md`。
- 按编排裁决，read/write/configure 返回 `status:'ok'|'error'`；read 成功包裹 `ranges`，write 成功含 `changed/revision`，可含独立 `displayError`。既有 replace 保留 `Promise<boolean>`，失败 false + diagnostic atom，不丢旧簿。
- 原始值不是 DisplayCell；字面量 `00123`、前导 `=`、空格、空字符串、boolean、number 精度、原生 error 均独立于公式源与当前计算值。空格/spill 子格省略，空字符串保留；数组锚点取左上角结果，独立 LAMBDA 按原生返回 `#CALC!`；意外内部类型显式报错，不当 blank。
- 读取最多 64 范围、4096 个返回格、约 4 MiB 记录文本预算；同一 native 调用、同一 revision，无选区依赖。超额明确失败，不截断成成功。公式惰性/异步求值可能发生，依赖求值 CPU 成本不由返回格预算限制。
- 写入最多 4096 格，输入加旧前像预算 4 MiB；重复坐标、非有限数、非法 error/公式、越界、原生保护先拒绝。一个 Rust Store batch + 一个 native history transaction，不调用 import、不清旧历史、不在 JS 逐格 setInput。失败回滚全部源值及依赖 spill，再恢复通知。
- 首版原子 patch 明确拒绝 Table 范围、已有 spill/blocked anchor、合并非锚点；可以新建数组公式，但其既有 spill 之后需要既有专用命令处理。该限制由实现、文档与测试共同固定，不承诺任意复杂区域 patch。
- 原生成功提交后，即使 drain/投影失败，事件仍发且 host.write 返回 ok + 真实 changed/revision + displayError。旧 UI RPC 用 `WORKBOOK_COMMITTED_PRESENTATION_FAILED` + `detail.committed:true` 表达提交成功/展示失败，不能当回滚。transport 断线/释放/换簿时若写结果未知，error 带 `commitStatus:'unknown'`，不能盲重试。

## 原生事实源与命令覆盖分类

`WorkbookHistory.push` 在预算淘汰之前发布原生 MutationFact，undo/redo 在成功回放后发布；独立递增 sequence 不取 undoCount、不依赖最后可见历史条目是否仍存在。保护变更原来不进 undo，但确实持久，WASM 仅在原生 change_protection 返回 true 后调用 `record_metadata_mutation`。Worker 比较 native sequence，不比较 revision/ACK/投影；即使原 dispatcher 对 noop 也 revision+=1，仍不发成功事件。

Cells 的坐标由事务已持有的稀疏前后像比较：源值/公式文本、单格格式、链接、notes、comments、轴格式/尺寸与 merge 几何；不新增整簿快照/每命令扫描。格式轴变化给真实全轴范围。结构与 Table/命名引用从其原生局部快照/实际重写列表取得各表坐标；模板只表示目录变化，不冒充模板原点单元格。权限 footprint 不等于修改 footprint：rename 不报告未触及表，混合 noop sheet target 不报告该表。

| Worker 命令类别 | 是否持久 / native 事实来源 | 范围语义 |
|---|---|---|
| cell.setInput、clipboard.paste、range.clear、range.fill | 持久；既有 native Cells/TableDefinition transaction | 实际前后像；跨表 cut 的源/目的/被改写公式各自位置 |
| format.setRange、range.resize | 持久；原生格式/尺寸 history | 单格稀疏差异、真实行/列范围 |
| range.sort、workbook.replace（查找替换）、duplicates.apply、textColumns.apply | 持久；原生分组 Cells history | 实际被改写原始输入，不依赖返回 cells/movedRows 或 revision |
| notes.change、comments.change、hyperlink.change | 持久；原生 Cells 元数据前后像 | 真实单元格位置 |
| validation.change、conditionalFormat.change、range.merge | 持久；原生 DataValidation/ConditionalFormat/Merge history | 原生目标规则/合并范围；不是由计算显示格式触发 |
| sheet.filter、sheet.freeze、outline.change、range.visibility | 持久；原生 Filter/Freeze/Outline/Visibility history | 所属 sheet，ranges:[] 明示元数据，无虚构 A1 |
| sheet.editStructure | 持久；原生 StructuralHistoryChange | 被移动/重写单元格本表及跨表自己的坐标；目录表可 ranges:[] |
| workbook.changeSheets、workbook.editSheet | 持久；原生 SheetHistoryChange | 增删移动表目录；rename 的跨表公式/rules/validation/template 实际变化 |
| table.change | 持久；原生 TableCreate/TableDefinition/Filter history | Table 定义范围 + 实际重写公式各表坐标，模板按元数据 |
| namedRange.change | 持久；原生 NamedRangeChange | 名称定义相关表目录 + 实际重写公式，各表分别报告 |
| customFormula.change | 持久；原生 CustomFormulaChange | 全簿定义目录：changes:[]，以 kind 区别换簿，不虚构 activeSheet/A1 |
| protection.change | 持久但不进用户撤销；原生 bool 成功后额外 fact | 对应 sheet ranges:[]，相同配置不发 |
| history.apply | 成功回放时持久；同一 history entry 的 native mutation_ranges | source:history；失败/无栈项不发 |
| host.writeCells | 持久；单 Rust transaction | source:api 或 refresh；真实差异，无变化 changed:false |
| workbook.initialize/openFile/importCells | 生命周期导入，不视为逐条 user patch；发布连接后关闭这些原始初始化入口 | Store 首次发布/成功候选替换发一次 source:import、kind:workbook.open、changes:[] |
| projection.readVisible、formula.catalog/awaitAsync/recalculate/inspectSpill/suggest、customFormula.read、notes.read、comments.read、protection.read、validation.read | 非持久输入修改；计算/查询/临时展示状态 | 不采集 mutation，不发 user 事件，即使计算推进 revision |
| workbook.exportFile/locate/find、duplicates.preview、textColumns.preview、format.preview、sheet.filterValues、selection.aggregate、host.readRanges | 只读/预览 | 不发修改；readOnly 下仍可用 |
| clipboard.export/capture/finishCapture | 剪贴板/格式刷临时 token，不改工作簿保存数据 | 不发；实际 paste 才从原生提交发 |
| host.configure | 交互控制而非工作簿数据 | 不发修改；未知新命令默认视作持久命令，门禁 fail-closed |

只保存最近 native fact 和最近 Store 事件，无无限日志。事件加入 connectionId，operationId 包含连接身份，revision 重置也不混簿。当前实现使用每条 Worker 持久命令对应既有单 native history transaction 的事实，不汇总人为 JS 多次写入。上述逐域来源按实际 dispatcher/native history 路径核对，非每个菜单动作都已做新事件 DOM 断言，见未验证。

## 逐条验收

1. 通过（本叶）：`tests/host_data.rs` 6 项覆盖 typed/公式/字面量/blank/error/多表、一批一次 undo+redo、原历史保留、cycle/validation 回滚、保护/边界/预算/复杂目标拒绝；Core host 多范围测试断言同 revision + 一次 native call。
2. 通过（本叶）：`test/host/worker.test.ts` 现有 UI setInput/paste/clear/fill/format/history/protection 均用 native fact 同源；不是只测 host.write。`host_mutation_facts` cut 断言源 A1、目标 C4、第三表 J30，并断言 undo/redo 相同真实范围；结构插行和 rename 也断言 J30，不用同一主 range 套全表。
3. 通过（本叶）：noop revision 变化仍不发；失败不发；projection/recalculate/awaitAsync 不发 user；api/refresh/import source 均有 Core 测试。新 native async 测试令 FETCHJSON BUSY→7 发生在 history 前后快照之间，再 UI/host 同公式重交、typed 读和 recalc，sequence/undoCount 均不增加。原有 HistorySnapshot 原本只保留源输入，不含公式缓存，测试落实此边界。
4. 通过（本叶）：旧连接晚读回包/晚事件不能发布；dispose 拒绝在途请求并移除监听；失败候选 open/config 保旧且不发 import；成功/同 Store restart 重挂 controls、distinct connection identity。订阅以 `{dispose}` 对象持有，避免函数被 Einfach primitive setter 当 updater 执行。
5. 通过：无 TS workbook mirror、backend、通用插件生命周期；transport 仅增通用 event listener，不识 sheet/mutation。host gateway 抽出权限/事实/串行队列职责；原 runtime.ts 从 580 附近缩至 560 行而非继续加逻辑。新源文件最大 157 行；现有 commands 388 / wasm-types 316 只作类型接线；native structure 391 为现有单一复杂算法，未做凑行数拆分。
6. 通过（定向）：新增 WASM 恰为 host_read_ranges/host_write_cells/host_mutation_state 三项；修复签名扫描器遗漏独立 host 目录，再查看预期失败差异，仅手工加入这三行后验证通过，没有盲 regen。004 仍必须真实重建 .wasm 与 glue。

readOnly/busy/structure 门禁同时存在 Core connection 与 Worker 执行前；Worker 再检查 history 下个 entry 的 structuralEdit/sheetChange。readOnly 拒绝一切持久命令；busy 拒绝 user/history、允许显式 api/refresh；关闭结构拒绝增删改名移动 sheet 和插删行列及其回放。source 只接受 api/refresh，不绕过 native protection。初始化控制在候选发布前稳定同步，运行期原始 import 被封闭。

## 覆盖矩阵与 004 FEATURES 待登记

| 行 | 本叶证据 | 最终消费者证据 |
|---|---|---|
| PKG-06 | host_data 6；host atom typed/read/write；worker multi-range 一次 native call；public tsc | 004 真包千行/多表、typed 增量保存 |
| PKG-07 | worker UI setInput/paste/clear/fill/format 共享 native fact；Rust 稀疏全选清除只给 D100 | 004 真 DOM 编辑/粘贴/清除/填充后订阅与 readback |
| PKG-08 | host_mutation_facts 5；cross_sheet_cut 28；history/structure/name/table/border 定向 | 004 真实 undo/redo、跨表剪切与第三表引用 |
| PKG-09 | old event/response/dispose；替换失败保旧/成功 import；noop/投影失败/async 边界 | 004 重挂/换簿/多实例及真实 WASM 事件 |
| PKG-10 | host 原生保护、Worker/Core 锁、init bypass、structural history；protection 18 + WASM 2 | 004 实际键盘/工具栏拒绝与只读查询；002 接 HOST_* 的 Lingui 映射 |

建议 FEATURES 独立登记以上 PKG-06~10 对应五条用户可见能力，保留本叶定向与 004 DOM 两列证据。本叶按分工未直接修改 FEATURES.md。

## 命令、自然退出与失败修正

所有完成结果为进程自然退出，不把超时/轮询当通过。cwd 默认为仓根，另注明者除外。

1. `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test host_data --test host_mutation_facts --test async_formulas --test cross_sheet_cut --test protection --test workbook_history --test workbook_history_edges --test structural_history_transactions --test named_range_history --test table_rename_history --test border_format_history`：最终自然 exit 0，11 binaries 共 105 项（11+6+28+6+5+5+18+9+6+6+5）。最终执行 session 7767，包含报告指纹中的 native 源码。
2. `pnpm exec vitest run test/rust-*.test.ts test/cross-sheet-cut/runtime.test.ts test/protection/worker-contract.test.ts test/async-formulas/runtime-binding.test.ts test/host test/workbook-file-command.test.ts`，cwd `excel/spreadsheet-ui-core`：自然 exit 0，53 files / 421 passed，无 unhandled rejection；session 6595。之后 Core 仅类型注释与文档变化，无运行时/测试源码改变。
3. `pnpm --filter @einfach/spreadsheet-ui-core build`：自然 exit 0（tsc，session 77983）。不是根 build / WASM build。
4. `cargo check --manifest-path excel/rust/wasm/Cargo.toml`：自然 exit 0；使用本机 target 进行 Rust 类型检查，未重建浏览器 .wasm/glue。既有 regex-disabled args/provider/dead fn 三条 warning 保留。
5. `cargo test --manifest-path excel/rust/wasm/Cargo.toml protection_tests --lib`：自然 exit 0，2 passed / 204 filtered；同样不是完整 WASM test suite。
6. `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test architecture_invariants wasm_public_api_signatures_unchanged -- --exact`：自然 exit 0，1 passed / 10 filtered。4~6 最终组合 session 8377；此前相同定向各自也已自然通过。
7. `git diff --check -- excel/spreadsheet-ui-core/src excel/spreadsheet-ui-core/test excel/spreadsheet-ui-core/docs/host excel/rust/excel-core/src excel/rust/excel-core/tests excel/rust/wasm/src excel/rust/wasm/tests`：自然 exit 0。
8. `git ls-files -m -o --exclude-standard ... | sort | xargs wc -l`：43 个交付源/测试/文档文件；所有新增源/测试 <300 行；巨型既有文件仅接线/减行。文件清单与 SHA 如下。

中途真实失败均已修复/解释，不能把它们算通过：初次 Rust check exit101（方法可见性/表 API 名称）、初次 Core tsc exit1（投影 reason 与参数标注）修复后通过；旧 fixture 预期未含 configure/subscribe 导致定向断言失败，按新协议修正后 421 全过。最重要的 native 测试曾发现 validation 拒绝批次后 C3 spill 子格残留：在 finish(false) 回滚后结算候选影响范围、恢复通知前移除残留，最终 host_validation_rejection_restores_dependencies_without_publishing_candidate_values 通过，断言源/本表/跨表值及无候选通知。最后添加复杂目标测试时误以为独立 LAMBDA 返回内部类型，实际 native 返回 #CALC!；该次 exit101 为错误测试预期，修正为真实 #CALC! 后最终 105 通过。

Einfach 0.4.0 的 setter 对 Promise 调用 finally 丢弃派生拒绝，本轮曾出现调用方 catch 后仍 unhandled 的真实依赖问题；按编排批准改用显式 status 业务失败结果，replace 内部捕获 false+diagnostic。未修改 Promise/thenable、依赖源码或外部仓库；其他既有拒绝式 atom 的上游依赖风险不在本叶全局修复范围。

## 未验证与疑虑

- 未运行全仓 build、完整 Rust/Core suite、完整 E2E，未构建/替换 WASM 产物，未安装独立 Vite/Rspack 真包。本叶证据是 Rust native + Core Worker/Store 定向；Core Worker tests 用受控 WasmWorkbook fake，不能冒充真实浏览器 native 集成。
- 持久类别均已核对 native 路径；新增事件测试重点覆盖 UI 主路径、真实跨表/结构/历史/全局定义，尚未逐个 Table 菜单、规则管理、notes/comments/links/outline 菜单做真实 DOM 事件断言。004/独审应据上表抽查，尤其元数据必须用原生 export 保存而不是仅 typed cell read。
- PATCH 首版复杂目标拒绝是有意限量原子边界，宿主要整体更新 Table/spill 需换簿或既有专用命令；不可把接口宣传成任意 Excel 对象修改器。
- `workbookChangeAtom` 只保留最近事件，不是跨异步消费者的可靠队列；宿主应在订阅回调读取事件并自行排队/保存。连接不可达时不能推断 write 回滚，需恢复/读回确认。
- 新控制失败消息 UI 翻译由 002 接线；004 需实测只读/busy/禁结构的实际键盘和工具栏入口，不仅断言按钮外观。
- 外部插件现有 Einfach/React 版本不对齐问题仍属编排记录的后续集成阻碍，本轮不替插件升级，也未宣称兼容 React19/旧 Einfach。

## 精确源码标识

43 个文件按路径排序的 `shasum -a 256` 输出再次 SHA-256：`db42adf7e883c936daff12abd91c46e0c7b90ccd77653a7d2e647ef4645697e6`。生成命令：

```sh
git ls-files -m -o --exclude-standard excel/spreadsheet-ui-core/src excel/spreadsheet-ui-core/test excel/spreadsheet-ui-core/docs/host excel/rust/excel-core/src excel/rust/excel-core/tests excel/rust/wasm/src excel/rust/wasm/tests | sort | xargs shasum -a 256 | shasum -a 256
```

本报告不参与产品指纹；以下均相对仓根，包含未跟踪新文件，避免只 hash git diff 漏新源码。

```text
16203ca7916aaa88374952d8314176d45d0766dc05dadc9f4a9e79b167ade759  excel/rust/excel-core/src/host/mod.rs
ccac6dc20d731a7f4dfe83ae06da5ba7c09e1063c5d8493d31949cf516159b90  excel/rust/excel-core/src/host/mutation.rs
ebfb287d01d7c64bf57e88a87c9b12517e15954dc848f9fae1b95a1b20c69bd0  excel/rust/excel-core/src/host/snapshot_changes.rs
622f21c525124727f312f0e4076475b828f7b44c61591399ddb76b0217c6d25f  excel/rust/excel-core/src/host/table_mutation.rs
89524a0b197acef9c5369c66a3518a4cc99ce2640e147aee03c19836939861af  excel/rust/excel-core/src/host/transaction.rs
d3d53c2d2f489ac3a2bd30a136f2ba343f53d468176fcbefa2721d7c2f40ee1d  excel/rust/excel-core/src/lib.rs
af1fce86f801f96274b3b9bd32994262918b2670042440c4f9c384c8f4a444a9  excel/rust/excel-core/src/workbook_formula_source_change.rs
dd6c86fac1a1ae9d316c93f31f044a58ae4397792b50bbc3e86f1eddcd90e91b  excel/rust/excel-core/src/workbook_history.rs
31966d9964537ff8820c34e76677f05380417838c412cd6b5e0f81b55d686bc1  excel/rust/excel-core/src/workbook_named_range_edit.rs
3a46428025fe5dc2bd21712b54818401bd02a18f9eccf923ed56da416e945d33  excel/rust/excel-core/src/workbook_structural_history.rs
1116b37800fda9b98f6a2f5e1efcf32aba86ae02f6231ae9201aa657b9335125  excel/rust/excel-core/src/workbook_table_change.rs
261c358c82bca31abf4e3e135e2465cb0e84e52f17e49867118831b295e61723  excel/rust/excel-core/tests/architecture_invariants.rs
17bb18ccc0cb2746e644db8b9ca28001a6a6ef5d953dfaddd31f771a4f7f0db1  excel/rust/excel-core/tests/async_formulas/history.rs
fbf2af240c4f12fef84fd1203e2e65a3f5204c1fd719b87963b5e1dc894e4535  excel/rust/excel-core/tests/fixtures/wasm_api_signatures.txt
e18240c28f6b5b17c503039f1b140a02f8e8db2a70dc0442e2d82e7b9e35698d  excel/rust/excel-core/tests/host_data.rs
33ff0b0bae044d8b1fb10c87b7a152836bf144d5d06d4a1fbb5346f969ee802d  excel/rust/excel-core/tests/host_mutation_facts.rs
f298d2e0cd8fb9f9884d387a492eb2c91912a2ea4a2e24f1c23d168b1ba67561  excel/rust/wasm/src/host/mod.rs
c82e856d75ad3e31b59b92b6926b8668c5033825aecdd13f33f063520e9c2fc8  excel/rust/wasm/src/lib.rs
9878041401ded1e7ff0ac9173056ed9d02d23f78457bddd89e0ad54acf27996a  excel/rust/wasm/src/protection/mod.rs
028769710b91a8e6c1ec0dba9f21b705c85fce048005ff8a700c6b506b259ee3  excel/spreadsheet-ui-core/docs/host/README.md
174f0aa27b19c0ef216edb3e4d62b9798a813755151c66de6d32838f4b5812cd  excel/spreadsheet-ui-core/src/host/atoms.ts
9b76f5e6446eabaf9ed394692edf7e6dd9e36c870acb39a7944228856d3a87a7  excel/spreadsheet-ui-core/src/host/binding.ts
f93b34564417e384a0724bd0311a57623c804dfb1145e94b6145992d9e266295  excel/spreadsheet-ui-core/src/host/connection.ts
87c6534f86fbab5b760108aeb5a0823d0bdbf2ad7fc176646bb975d50007227b  excel/spreadsheet-ui-core/src/host/errors.ts
a422116061ba687e222be2cb9b0f5e3b46402dec4161ed6ff6bf5b2520756484  excel/spreadsheet-ui-core/src/host/index.ts
7611a2d3a899e58b6ab1f1ae70f48f5a73dd9896a16ea7284705091584024828  excel/spreadsheet-ui-core/src/host/policy.ts
c395dd4d5fa0ffabd1c92eb0c5d09d3a561edbce5f62676aecc1bfa937a7632a  excel/spreadsheet-ui-core/src/host/state.ts
36d508ee2729092cf2951fe08aa75e1ffd8c6888525018b2f9c0fe6fb31fafe0  excel/spreadsheet-ui-core/src/host/types.ts
b4c5466986259864238d570dd971698aa1215939dcb12928ecad31b3b3c82374  excel/spreadsheet-ui-core/src/host/worker.ts
61e999afdc8d51e0434df180a6dd8107de96143436886ecd740ca6990097145d  excel/spreadsheet-ui-core/src/index.ts
15240ca457a4e23a36efa941010abacc81f979c3f7865b9aa927c837e8bf0ad4  excel/spreadsheet-ui-core/src/runtime/rust-workbook-runtime.ts
a0fc0b4e36d33db9a3aa64b14b5860ea467e6c959aff64da68c8ef25e5153eec  excel/spreadsheet-ui-core/src/runtime/workbook-connection.ts
65d24673437aba2ef630ee45948e55ad74db6fcf542b5b68a83b0f24af4eed61  excel/spreadsheet-ui-core/src/runtime/workbook-file-command.ts
d5f3dc5407eca703d4b61f451624a3a532123e8d5c45e6bcdfe60dfcb63f1fc0  excel/spreadsheet-ui-core/src/rust-workbook/commands.ts
653de28b85d5564ae9ac172a4d9e5ff10fef2698ee6a5443bf54456ac531b3a1  excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts
2290187ab4ee401821fc80d5240caeae6ce75deef692d4ac8a8370e7ebaf24bc  excel/spreadsheet-ui-core/src/rust-workbook/wasm-types.ts
5af7a17e00fcf91de62a8f6356892a60153bad0bd2d6a2b40d2936a931b2f0e2  excel/spreadsheet-ui-core/src/rust-worker/transport.ts
013030c2ad24b77be0796014c5f41cb22137accfdba4517f68c273007a875231  excel/spreadsheet-ui-core/test/host/atoms.test.ts
ff74e9994a6e3fd67aeec8a6e887ffc849cf2346c8f31e176b04665b9e56bf0b  excel/spreadsheet-ui-core/test/host/replacement.test.ts
b0ddaee1a7626b550b0d217eccc069fc2d205cd0bf411451be4280f70d525e18  excel/spreadsheet-ui-core/test/host/worker.test.ts
5ecdf4ed9caf01a3c418ebfd4ef365c806f540cad717a856589438c4c381e9c6  excel/spreadsheet-ui-core/test/rust-workbook-runtime.test.ts
065ef797c5fe712818826bd3bd9112049aec570920a5bfe14d68f0a91caf22fa  excel/spreadsheet-ui-core/test/rust-worker-boundary.test.ts
d699627fc2d4094b84722de212736c15ca05f53b436e6e77f0134246d1ff0ae9  excel/spreadsheet-ui-core/test/workbook-file-command.test.ts
```

## R1 修复与复验（最新候选）

依据任务 R1 追加要求，完整重读 index、003 任务、原报告与 003-review.md 后修复。四项 Important 和 M1 均已落地并获下列作者定向证据；这是修复候选，不自行宣告独立审查通过。未改变公开数据类型/结果包裹协议，也未添加公共事件字段。

### 逐条验收与覆盖矩阵

| 项 | 修复与事实来源 | 回归证据及边界 |
| --- | --- | --- |
| R1 / PKG-08，删表跨表范围及历史 | 新增 `host/sheet_presence.rs` 从删表本已保留的 formula source、conditional、validation、template archive 比较实际改动；用剩余表 stable key 登记。Presence 保留独立 mutation footprint，undo 消耗 archive 后仍可发相同事实，redo 重新归档时更新。footprint 纳入 history retained bytes，不绕预算。 | `host_presence_facts` 2 项：删除索引 0 的 Sheet1，Audit 的 J30 公式、B5:B6 与 K30:K31 条件规则、D9:D10 validation 均出现；未改 Z900:Z901 规则及 Untouched 表不出现。undo/redo 的 stable-key 范围和 sequence 1/2/3 一致。另有仅 calculated-column 模板引用 Sheet1、实际列格均为 literal exceptions 的用例：只报模板所在表元数据，不虚构模板起点格；删/撤销/重做一致。 |
| R2 / PKG-10，换簿异步时序门禁 | `rust-workbook-runtime.ts` 在候选 open/catalog/configure 完成后、交换 owner 前重新从当前 store 校验 host controls；最终检查到交换之间没有 await。失败仍 false + diagnostic，保留旧连接/事件并终止候选。 | `replacement.test.ts` 新增 6 项：在 `workbook.openFile`、`formula.catalog`、`host.configure` 分别暂停候选，将 readOnly 或 busy 开启后释放；断言对应 HOST_READ_ONLY/HOST_BUSY、原连接仍在、原事件不变、旧连接未终止、候选终止。原成功/失败换簿测试保留。 |
| R3 / PKG-07，多区域条件格式 | `host/rule_changes.rs` 比较原生 history 已保留的 before/after entries，只枚举真正变化规则的所有 primary/additional ranges，包含更新前后的范围；history 条目与 mutation mapper 复用同一函数，去除重复范围。未用通用 self.range、权限范围或全表扫描替代实际事实。 | `host_conditional_facts` 1 项：多区域 A1:A2 + J30:J31 的创建、disable、移动至 A50:A51 + N70:N71、删除，以及每步 undo/redo；断言完整 old/new 集合，不含未改 Z900:Z901 规则。原 conditional format native 定向套件同时通过。 |
| R4 / PKG-09，提交后发布/展示异常 | `sheet-edit.ts` 在 native 新增成功后，先登记预先生成 id 与 native stable key，再读取易失败的 name。gateway 区分 native committed 与 notification published；映射/发布重试均受保护，lastSequence 仅在实际 post 成功后更新，最外层隔离异常并为 queue 同时设置 fulfilled/rejected 恢复路径。 | 新 `worker-failures.test.ts` 4 项：实际 `editWorkbookSheet` native add 后 name 抛错，仍有映射事件和 committed RPC、revision 推进、后续只读成功；未知 key 返回明确 unmapped 整簿失效事件和 native committed 诊断；连续两次事件 post 失败保留未发布事实诊断，后续只读及下一次 mutation 正常；错误响应 post 自身失败不产生逃逸 rejection、不毒化后续只读。 |
| M1，元数据范围与 typed read | host 文档明确 typed range read 只适合实际单元格输入增量；全轴尺寸/格式等范围可超过 UI 逻辑尺寸和 typed read 预算，不可无条件将事件范围逐个交回 read；元数据和整簿失效使用原生 export/整体重同步。 | 文档审阅证据；未伪称 metadata typed-cell roundtrip 成功。004 应据此验收保存消费者。 |

R4 的公开语义：正常可映射时仍为原 kind、原精确范围；罕见无法映射/发布正常事件的已提交窗口，使用 `${原 kind}.committed-unmapped` 和 `changes:[]`，明确代表**整簿失效、需 export/重同步**，不代表 noop，也不等同普通表元数据事件。RPC 为 `WORKBOOK_COMMITTED_PRESENTATION_FAILED`、`detail.committed:true`；发布失败时带 `nativeMutation`、`notificationError`、`notificationPublished`。`host.writeCells` 原生提交后仍返回 ok + 真实 changed/revision，展示失败走独立 displayError。该约定已写入公开 README 并经回归。若连 response/event 的 postMessage 都持续不可用，不能承诺通道上实际送达；测试仅证明无无人消费拒绝、队列继续服务及可发送的后续结果，不把物理断线当回滚。

R1 不改变原报告的持久类别划分。新增比较只读取已由具体 native 操作持有的局部引用/规则/模板前后状态，不对每条命令新增全簿快照或 cell 扫描；native mutation 仍不依赖 revision、undoCount、可见末条历史。纯求值/同源重提交边界仍由原有 `host_mutation_facts` 与 `async_formulas/history` 回归覆盖，未将异步缓存变化引入本次 archive 比较。

### R1 命令与自然退出

cwd 除注明外均为仓根。所有“通过”均为命令自然退出，不以等待工具返回/超时作为通过。

1. `cargo check --manifest-path excel/rust/excel-core/Cargo.toml`：自然 exit 0（session 20881）。
2. `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test host_presence_facts --test host_conditional_facts`：最终自然 exit 0，2 binaries / 3 passed（session 3479），包含模板-only 回归。
3. 最终扩大 native 回归：

   ```sh
   cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test host_data --test host_mutation_facts --test host_presence_facts --test host_conditional_facts --test async_formulas --test cross_sheet_cut --test protection --test workbook_history --test workbook_history_edges --test structural_history_transactions --test named_range_history --test table_rename_history --test border_format_history --test conditional_format_management --test advanced_validation --test workbook_sheet_history --test workbook_sheet_archive --test conditional_format_regions --test conditional_format_formula_sheets --test table_calculated_topology
   ```

   自然 exit 0，20 binaries / 189 passed。含新增 3 项以及规则/validation、sheet archive/history、table topology、保护/异步/跨表等既有回归。先前同一集合为 188 passed，增加模板-only 测试后整组再次运行到 189，不用旧结果替代新测试。
4. `pnpm exec vitest run test/rust-*.test.ts test/cross-sheet-cut/runtime.test.ts test/protection/worker-contract.test.ts test/async-formulas/runtime-binding.test.ts test/host test/workbook-file-command.test.ts`，cwd `excel/spreadsheet-ui-core`：自然 exit 0，54 files / 431 passed，无 unhandled rejection（session 25882）。此后仅测试缩进整理；无产品源码变化。
5. 整理缩进后 `pnpm exec vitest run test/host/replacement.test.ts test/host/worker-failures.test.ts`，同 cwd：自然 exit 0，2 files / 13 passed，无 unhandled rejection（session 86932）。
6. `pnpm --filter @einfach/spreadsheet-ui-core build`：自然 exit 0，tsc（最终 session 46106，同行后续 scoped diff check 亦 exit 0）；未做根 build/WASM 产物构建。
7. `cargo check --manifest-path excel/rust/wasm/Cargo.toml && cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test architecture_invariants wasm_public_api_signatures_unchanged -- --exact`：自然 exit 0（session 21860）；WASM crate 仅本机 target 类型检查，API invariant 1 passed / 10 filtered。既有 regex-disabled 的 args/provider/dead fn 三条 warning 保留；未改变 R1 WASM public API 或 fixtures。
8. `git diff --check -- excel/spreadsheet-ui-core/src excel/spreadsheet-ui-core/test excel/spreadsheet-ui-core/docs/host excel/rust/excel-core/src excel/rust/excel-core/tests excel/rust/wasm/src excel/rust/wasm/tests .tasks/react-excel-package/reports/003-report.md`：自然 exit 0。

中途一条命令使用了不存在的 `--test sheet_history`，Cargo 自然 exit 101、未运行测试；改为真实 `--test workbook_sheet_history` 后获得上面 20 binaries / 189 项完整自然通过结果。此命令拼写失败不算通过，也不隐去。早期 Core host 定向 7 files / 50 passed、早期 build/check 通过均只作调试过程，不替代本节最终结果。

### R1 文件职责、源码标识与剩余项

遵循技能的作用：以原生事务前后像/真实 source 为最短所有权链；将规则范围比较与删表 footprint 分为两个职责模块，未为 gateway 增加通用 transport 业务。新增源 `rule_changes.rs` 23 行、`sheet_presence.rs` 29 行，新增测试 49/76/104 行；`worker.ts` 199、`sheet-edit.ts` 41、replacement test 102。既有 `workbook_sheet_history.rs` 从基线 307 增至 313 行，是同一 topology history/replay 算法的小型 bug 修复，保留在复杂文件 500 行上限内；archive 268、conditional history 259，未顺手拆既有巨型 dispatcher。本轮未新增依赖、未改 React/任务账本/FEATURES/独审报告/外部工程/产物。

R1 相对首次候选共变动 16 个路径：5 个新文件（2 native helper、2 native test、1 Worker test），4 个原有未改文件（conditional history、sheet archive、sheet history、sheet-edit），7 个首次候选文件继续修正。最新产品交付范围合计 52 个 tracked-modified/untracked 文件，使用前文同一排序 hash 命令，聚合 SHA-256：

`82c7277f08d8cd6f2ea8d6f04d478986f0ebf94a91243f26e9fb1eddcac66146`

以下 16 个 delta 覆盖首次 43 文件指纹中的旧版本；其余原候选文件 hash 不变。组合为可复现的完整 52 文件清单，报告本身不参与产品 hash。

```text
d6aa8e2e9563b7f4448a38055b4cd4c8c151d87f88a68f2bfc3a78aab56ed999  excel/rust/excel-core/src/host/mod.rs
37a5b6b0a1b565bfb88d731bf14146e6ecb0edc55c0014b574d573e22c32b20f  excel/rust/excel-core/src/host/mutation.rs
adfc1cacdc1c98c587d209e1589f4764a65d7eedae0ab684d5e8ce59377aa18c  excel/rust/excel-core/src/host/rule_changes.rs
4cfb6ed613e5f38d2a5290bd3f9245ab7e42cf4899bede4eda174a2a226ad5d0  excel/rust/excel-core/src/host/sheet_presence.rs
483429264d1f3385eb00863716511f54b331c32bd83458b6d314987bc57f2b36  excel/rust/excel-core/src/workbook_formula_source_change.rs
24c7472f6826f9f56c66527883d592aae6386cb94ba4c36479680d0fa7be9566  excel/rust/excel-core/src/workbook_history_conditional_format.rs
845cc05cf9822832fa2f2f9a17f3719227f07218b3dc9d986638d668537b393f  excel/rust/excel-core/src/workbook_sheet_archive.rs
92ce9aa2cca2fd25a70a55e1463c92fde80abb4359551248c139365c12686277  excel/rust/excel-core/src/workbook_sheet_history.rs
3f1b9dc28c948939afa48bd1c4c0c205b38d7941926df4647575148eb44944aa  excel/rust/excel-core/tests/host_conditional_facts.rs
3cf43e4da9e38fce9310853983d08d04e1e984f98c9df6ba68ad56d5f9e72193  excel/rust/excel-core/tests/host_presence_facts.rs
a0c5257c1a1b3d39a1ea976790e2d8f9df788fdf0ccb85f617ce8ce6728bb37e  excel/spreadsheet-ui-core/docs/host/README.md
e0b4ce784d923187b63af67aad1d9a8229d43d3d27e5f2d18657de0c345de16e  excel/spreadsheet-ui-core/src/host/worker.ts
9c9dae483e9823437ec67a8bd114950e7f366d0842df6dd626ad9d800b5b8ce0  excel/spreadsheet-ui-core/src/runtime/rust-workbook-runtime.ts
8af0474d5d29b4747207507dd600b679cf8e69bf8ed1baf10786f0e8f6d3c119  excel/spreadsheet-ui-core/src/rust-workbook/sheet-edit.ts
74e21666880576f6baeb78f6aa1dd293fadcb874fb835aaf25bb8558a66bf194  excel/spreadsheet-ui-core/test/host/replacement.test.ts
59bf881d933757d01453be39d65325586bad781f7ae7aab7099100638f3e82e7  excel/spreadsheet-ui-core/test/host/worker-failures.test.ts
```

剩余/疑虑：原报告未验证项继续有效；本次新增 Worker 用例仍是受控 native fake 的故障注入，不能代替浏览器真实 WASM。未运行全仓/完整套件/实际 DOM，未重建 WASM/glue。需独审复核 R1 范围真实性与故障队列，再由 004 用最终统一产物验收 PKG-07/08/09/10，尤其事件保存策略、实际键盘/工具栏控制拒绝与替换。没有把这些待办表述为已通过或发布许可。

## R2 集成回修（13 文件仅格式批次）

输入为 004 的 `.codex-artifacts/react-excel-package-004/lint.log`：本叶 13 个 TS 文件、17 处 `@stylistic/max-len`。只在日志精确路径调整换行/缩进，没有修改非空白字符、import 集合、公开类型或控制/事件功能。无新文件、无依赖/产物/React/Rust 改动，未碰其他叶。R1 独审 APPROVED 结论见 003-review.md；本节不把作者机械检查冒充另一次功能独审。

遵循项目技能的职责约束，不增加层或扩大格式任务；唯一超过普通 300 行的本次文件是既有 `wasm-types.ts`，316→317 行，仅接口 extends 列表换行，不借机重构。其余本次文件最多 201 行。最终调用链与所有权没有变化。

### 定向命令与结果

仓根执行以下命令，自然 exit 0（session 39080），无错误/警告输出；未使用 `--fix`，未启动全仓 lint、Rust、431/189 功能套件或 E2E：

```sh
pnpm exec eslint --config rules/.eslintrc --ext=.ts,.tsx --ignore-path ./rules/.eslintignore \
  excel/spreadsheet-ui-core/src/host/atoms.ts \
  excel/spreadsheet-ui-core/src/host/binding.ts \
  excel/spreadsheet-ui-core/src/host/connection.ts \
  excel/spreadsheet-ui-core/src/host/index.ts \
  excel/spreadsheet-ui-core/src/host/state.ts \
  excel/spreadsheet-ui-core/src/host/types.ts \
  excel/spreadsheet-ui-core/src/host/worker.ts \
  excel/spreadsheet-ui-core/src/runtime/workbook-connection.ts \
  excel/spreadsheet-ui-core/src/rust-workbook/wasm-types.ts \
  excel/spreadsheet-ui-core/test/host/atoms.test.ts \
  excel/spreadsheet-ui-core/test/host/replacement.test.ts \
  excel/spreadsheet-ui-core/test/host/worker-failures.test.ts \
  excel/spreadsheet-ui-core/test/host/worker.test.ts
```

`git diff --check --` 上述 13 路径及本报告：自然 exit 0。原 R1 功能证据按无语义变化复用，不把那些历史进程写成 R2 重跑结果；004 须刷新 Core 打包输入再统一集成。

### token 核验方法修正与可复核逆向规则

修前先重现任务列出的 13 个 naive scanner 指纹，全部一致。换行后最初按同法核验自然 exit 1：8 个一致、5 个不一致（binding、connection、worker、atoms.test、replacement.test）。原因不是代码 token 改动，而是直接 `scanner.scan()` 未在模板插值结束时按 parser 上下文调用 `reScanTemplateToken`：例如 binding 的 `${connectionId}:${event.operationId}` 结束反引号被当作另一个模板起点，后续包含换行的整段代码误计入 kind 15 文本。skipTrivia 无法消除这类错误模板内部的换行。已向编排者报告并获确认，不为迎合错误 hash 修改 token，不再将该 naive hash 用作本轮门槛。

改用 TypeScript 5.8.3 的 `createSourceFile(..., ScriptKind.TS)`，递归 `getChildren()` 取得正确模板上下文中的 token，比较 `[kind,getText(sourceFile)]`，忽略位置/格式但保留字符串与模板原文。只在内存逆向还原下面 17 处换行，先校验其源码 SHA 等于原交付/R1 报告的修前 SHA，再比较修前后 token。结果：13/13 修前源码 SHA 一致，13/13 去空白内容一致，13/13 parser-context token 序列逐项一致，两侧 parse diagnostics 均 0；自然 exit 0。没有写出或覆盖旧源码实物。

以下可在仓根直接复核；字符串内 `\n` 表示实际换行，所有规则均为「当前片段 → 修前片段」，期望 SHA 从本节之前的原报告/R1 hash 记录读取。代码只读文件，在内存做逆向替换与解析：

```js
const fs = require('node:fs')
const crypto = require('node:crypto')
const ts = require('typescript')
const root = 'excel/spreadsheet-ui-core/'
const reverse = [
  ['src/host/atoms.ts', [
    ['{ sheetId: request.sheetId,\n          window: request.window,',
      '{ sheetId: request.sheetId, window: request.window,'],
  ]],
  ['src/host/binding.ts', [
    ['get: Getter, set: Setter,\n  connection:', 'get: Getter, set: Setter, connection:'],
    ['synchronizeHostControls(get: Getter,\n  connection:',
      'synchronizeHostControls(get: Getter, connection:'],
  ]],
  ['src/host/connection.ts', [
    ['createHostWorkbookConnection(\n  workerFactory:',
      'createHostWorkbookConnection(workerFactory:'],
  ]],
  ['src/host/index.ts', [
    ['HostCommandFailure,\n  ReadWorkbookRangesInput,',
      'HostCommandFailure, ReadWorkbookRangesInput,'],
  ]],
  ['src/host/state.ts', [
    ['atom((get) =>\n  get(workbookChangeBackingAtom))',
      'atom((get) => get(workbookChangeBackingAtom))'],
  ]],
  ['src/host/types.ts', [
    ['(targets: readonly {\n    readonly sheet: number;',
      '(targets: readonly { readonly sheet: number;'],
    ['readonly range: CellRange;\n      readonly cells:',
      'readonly range: CellRange; readonly cells:'],
  ]],
  ['src/host/worker.ts', [
    ['NativeWriteWorkbookCellsResult,\n  ReadWorkbookRangesInput,',
      'NativeWriteWorkbookCellsResult, ReadWorkbookRangesInput,'],
    ['if (isPersistentHostCommand(message.command))\n        before =',
      'if (isPersistentHostCommand(message.command)) before ='],
  ]],
  ['src/runtime/workbook-connection.ts', [
    ['bindHostConnection(get, set, connection,\n      () =>',
      'bindHostConnection(get, set, connection, () =>'],
  ]],
  ['src/rust-workbook/wasm-types.ts', [
    ['HostWasmCommands, WasmSpillQueries,\n  WasmFindQueries,',
      'HostWasmCommands, WasmSpillQueries, WasmFindQueries,'],
  ]],
  ['test/host/atoms.test.ts', [
    ['readOnly: false, busy: true,\n    allowSheetStructure:',
      'readOnly: false, busy: true, allowSheetStructure:'],
  ]],
  ['test/host/replacement.test.ts', [
    ['await vi.waitFor(() =>\n      expect(candidate.commands',
      'await vi.waitFor(() => expect(candidate.commands'],
  ]],
  ['test/host/worker-failures.test.ts', [
    ['(targets: unknown[]) =>\n      targets.map', '(targets: unknown[]) => targets.map'],
    ['{ receive = listener },\n    postMessage: post,',
      '{ receive = listener }, postMessage: post,'],
  ]],
  ['test/host/worker.test.ts', [
    ['host_write_cells: write,\n    host_read_ranges:',
      'host_write_cells: write, host_read_ranges:'],
  ]],
]
const sha = text => crypto.createHash('sha256').update(text).digest('hex')
const historical = fs.readFileSync('.tasks/react-excel-package/reports/003-report.md', 'utf8')
  .split('\n## R2 集成回修')[0]
const expected = new Map([...historical.matchAll(/^([0-9a-f]{64})  (excel\/.*)$/gm)]
  .map(m => [m[2], m[1]]))
function tokens(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (sf.parseDiagnostics.length) throw new Error('Parse failed: ' + file)
  const output = []
  function walk(node) {
    if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken) {
      if (node.kind !== ts.SyntaxKind.EndOfFileToken) output.push([node.kind, node.getText(sf)])
    } else for (const child of node.getChildren(sf)) walk(child)
  }
  walk(sf)
  return JSON.stringify(output)
}
for (const [relative, replacements] of reverse) {
  const file = root + relative
  const current = fs.readFileSync(file, 'utf8')
  let previous = current
  for (const [after, before] of replacements) {
    if (!previous.includes(after)) throw new Error('Expected fragment missing: ' + file)
    previous = previous.replace(after, before)
  }
  if (sha(previous) !== expected.get(file)) throw new Error('Original SHA mismatch: ' + file)
  if (current.replace(/\s/g, '') !== previous.replace(/\s/g, ''))
    throw new Error('Non-whitespace edit: ' + file)
  if (tokens(file, previous) !== tokens(file, current)) throw new Error('Token edit: ' + file)
  console.log('MATCH ' + file)
}
```

### R2 精确源码指纹

以下 13 路径均相对 `excel/spreadsheet-ui-core/`，逐项列完整 SHA-256。修前指纹来自原报告/R1 最后版本，并由上面逆向还原独立验证；修后指纹来自实际文件。

| 路径 | 修前 SHA-256 | 修后 SHA-256 |
| --- | --- | --- |
| src/host/atoms.ts | 174f0aa27b19c0ef216edb3e4d62b9798a813755151c66de6d32838f4b5812cd | 52f2ddce914e837636acd13bc756e121f19d5eae401be8b2f42423d922edd485 |
| src/host/binding.ts | 9b76f5e6446eabaf9ed394692edf7e6dd9e36c870acb39a7944228856d3a87a7 | 85b5b1d882d0d289fae438504aeb2111ea9db398db2b52db58284eb19952db32 |
| src/host/connection.ts | f93b34564417e384a0724bd0311a57623c804dfb1145e94b6145992d9e266295 | 38782e3d813ecbcdf937446f39abc4823fd7666db47fda820f8d3ffbb0c4e1ea |
| src/host/index.ts | a422116061ba687e222be2cb9b0f5e3b46402dec4161ed6ff6bf5b2520756484 | 03ba477be9f96e6df7b772586893af71fcaa8e21915f74c173954b3090a4f99f |
| src/host/state.ts | c395dd4d5fa0ffabd1c92eb0c5d09d3a561edbce5f62676aecc1bfa937a7632a | 71bfa7bb2da5de2e93acce95394f8c7de297f28be9e0138dfb63429a298f7b17 |
| src/host/types.ts | 36d508ee2729092cf2951fe08aa75e1ffd8c6888525018b2f9c0fe6fb31fafe0 | d6167fa55ab5fbbe34c4dde8ea05992dc84ffe0dbafd31f033072324c85f7c54 |
| src/host/worker.ts | e0b4ce784d923187b63af67aad1d9a8229d43d3d27e5f2d18657de0c345de16e | 15dfbfd65f00eaf9387bcc86de36142b363da3dbfab9fd88db5ea4f09b48652f |
| src/runtime/workbook-connection.ts | a0fc0b4e36d33db9a3aa64b14b5860ea467e6c959aff64da68c8ef25e5153eec | 5b62ffb6b63ad419d4984748ed6b743985c864497f88e60aad721e1f91b8b411 |
| src/rust-workbook/wasm-types.ts | 2290187ab4ee401821fc80d5240caeae6ce75deef692d4ac8a8370e7ebaf24bc | 3b04a8287a1bf1d5887ab510e2290b792e6060213d155af39e0b1ab4b4a9d317 |
| test/host/atoms.test.ts | 013030c2ad24b77be0796014c5f41cb22137accfdba4517f68c273007a875231 | 1ccc6c36b8a7f481e11e0a984387ca9b59f07198b7879f0693ca0b3ac77f899d |
| test/host/replacement.test.ts | 74e21666880576f6baeb78f6aa1dd293fadcb874fb835aaf25bb8558a66bf194 | e240f7c18af0aa8ce53baa8fe582178c1747c9a51ebd6ea54dcd27465753c413 |
| test/host/worker-failures.test.ts | 59bf881d933757d01453be39d65325586bad781f7ae7aab7099100638f3e82e7 | ef20e48f71c149380ba25d81c6aab0af43372bed3593e866504c6c67cdf36bac |
| test/host/worker.test.ts | b0ddaee1a7626b550b0d217eccc069fc2d205cd0bf411451be4280f70d525e18 | 0e5d6a8e2a9aeae3a0a3bc819bdb0e7da37cc16f7ad97729213cc0c2c6472577 |

本次纯换行批次其余 R1 产品指纹不变；当时交付范围仍为 52 文件，按前文排序聚合 SHA 命令得到 `01bd341f3eed441e0ad176b9be405efcf66ce3dcb5e8dd471d2d19f8abd9db9b`。报告不计入产品 hash。该批次没有新功能/未验证功能；原报告和 R1 的集成未验证边界继续由 004 负责，本节只关闭格式失败，不声明全仓可发布。随后授权的两项测试修正及反馈修复单独记录如下，不混入 13 文件纯换行证明。

### R2 追加集成测试修正

依据 003 任务末尾授权，先对原测试定向运行：`pnpm exec vitest run test/initial-tables.test.ts test/package-boundary.test.ts`（cwd Core），自然 exit 1：2 files / 2 failed + 10 passed。两条失败分别是初始化调用停在 host.configure、host/worker.ts 的纯类型 WasmWorkbook 被误报 forbidden import，与 004 的完整运行发现一致。

仅修测试的三个路径：

- `initial-tables.test.ts`：fake Worker 显式区分初始化/catalog/import/control，不再把无 cells 的控制消息当导入；host.configure 的 ACK 故意延迟，验证配置前仍 loading、无 async waiter。ACK 后验证完整 initialize → 两个内容 chunk → tables-only import → catalog → configure → async 顺序、ready，以及初始化定义、两个 chunk 的精确内容、Table 内容、controls 内容、dispose 终止。原 Table 快照/范围/filter 断言保留。
- `package-boundary.test.ts`：只移出原 source-runtime 检测及专属文件读取函数，其余 8 项公共导出/只读 atom/保护 port 断言和类型断言不变；391→342 行，不继续扩写存量超长文件，也不大范围拆分。
- 新 `source-runtime-boundary.test.ts`（103 行）：承接原全源扫描测试。用 TS parser 区分 type-only import；例外必须解析到精确 `rust-workbook/wasm-types` 合约、仅具名 WasmWorkbook、每个绑定均 type-only。支持 import type、内联 type、alias、多行形式，不允许默认/namespace/value/mixed 引用或 runtime glue。保留既有 rust-runtime.ts 与 rust-workbook 实现例外，**没有排除 host**。新增 5 个允许样例、20 个拒绝样例；检查框架/绑定、glue 普通/side-effect/dynamic/reexport/type-only、未批准领域类型、DOM 裸全局/DOM 类型/Worker 构造；投影 result.window 字段仍允许。原 `from` 规则覆盖的 reexport 拒绝保留，不因改 parser 漏掉。

首次三文件修复候选定向自然 exit 0：3 files / 35 passed（session 11065）；补保留 reexport 正确性两负例后，与后述反馈回归一起最终通过，不能拿 35 项冒充包含这两条新增负例。此阶段生产语义未改。

### R2 追加实物反馈修复（PKG-10）

004 真包 E2E 已证明实际拒写和值未改，但提示被 Core 吞为通用文案。本次唯一新增生产改动是 `src/editing/commit-feedback.ts`：在 rejected 分支保留已知 `HOST_READ_ONLY`、`HOST_BUSY`、`HOST_STRUCTURE_DISABLED` 为稳定 message 词典键，并保留原 detail；不复制英文文案，复用 React 既有 feedbackMessages 对这三个键的翻译。无新增公共字段/SDK/生命周期，不修改 React、Worker/门禁策略、事务或原生 API。未知错误仍通用提示 + 原 detail；outcome-unknown 优先级与不可盲重试含义完全不变。

`editing-commit-feedback.test.ts` 新增回归先在修前生产源码运行，自然 exit 1：1 file / 7 failed + 7 passed。失败准确落在 3 个稳定键映射与 4 条真实 Core command lane；unknown/outcome-unknown/原有 Table 与 validation 提示仍通过。修复后保留以下证据：

- 三种 HOST_* 的裸 code 与原 commit 前缀形式均返回同一稳定键与完整 detail。
- HOST_FUTURE_ERROR 仍通用提示；outcome-unknown 即使 detail 包含 HOST_READ_ONLY，也仍显示“not confirmed”语义，绝不伪装已确认拒写。
- cell/formula-bar 两输入源 × readOnly/busy，使用实际 createRustWorkbookConnection/configureHostControlsAtom → commitCellEditingAtom → setRustCellInputAtom → lifecycle → editingCommitFeedback 路径；Worker fake 只 ACK configure，断言拒写未送 Worker、draft/source 保留、投影及变更事件对象未变、可明确取消。此处是 Core 连接门禁回归，不冒充真实浏览器原生执行。

### R2 追加最终定向验证与依赖说明

1. `pnpm exec vitest run test/initial-tables.test.ts test/package-boundary.test.ts test/source-runtime-boundary.test.ts test/editing-commit-feedback.test.ts test/editing-commit-ack.test.ts test/editing-commit-settlement.test.ts test/editing-commit-timeout.test.ts test/cell-editing-commands.test.ts test/host`，cwd Core：自然 exit 0，12 files / 98 passed，无 unhandled rejection（session 27104）；包括最终 reexport 负例、保留 ACK/outcome-unknown/timeout 与 host 既有回归。原始输出摘要为 `Test Files 12 passed (12)`、`Tests 98 passed (98)`、`Start at 12:33:20`、`Duration 1.18s`。
2. `pnpm exec tsc --project excel/spreadsheet-ui-core/tsconfig.json --noEmit`，cwd 仓根：自然 exit 0，不生成/覆盖打包产物。
3. 三个旧测试修正路径的首轮定向 ESLint 自然 exit 0（session 72002），但有 1 条真实 warning：新测试使用仓根已有 TypeScript，Core 未直接声明 devDependency。已向编排报告；未加 eslint-disable、未改脆弱 regex、未自行改 manifest/lock。编排明确由 004 在其 metadata 范围补与根相同 TypeScript devDependency/lock，随后再做最终五路径 ESLint；结果续记下方，不把有 warning 的早期结果冒充零 warning。
4. 004 在 Core devDependencies 补 `typescript:^5.7.2`（已安装解析器仍为 5.8.3）后，运行：

   ```sh
   pnpm exec eslint --config rules/.eslintrc --ext=.ts,.tsx --ignore-path ./rules/.eslintignore \
     excel/spreadsheet-ui-core/test/initial-tables.test.ts \
     excel/spreadsheet-ui-core/test/package-boundary.test.ts \
     excel/spreadsheet-ui-core/test/source-runtime-boundary.test.ts \
     excel/spreadsheet-ui-core/test/editing-commit-feedback.test.ts \
     excel/spreadsheet-ui-core/src/editing/commit-feedback.ts
   ```

   cwd 仓根，自然 exit 0，零错误/零 warning、无输出（session 93371）。本执行者未修改 manifest/lock；004 的 lock-only 结果由其报告登记。
5. `git diff --check --` 上述五路径及本报告：自然 exit 0。

最终新增测试计数独立核对：source-runtime 文件共 **26** 项＝迁移保留 1 个全源扫描＋新增 5 允许＋20 拒绝；不是早期口头的旧数。feedback 文件共 14 项＝原有 6＋新增 3 stable-code、1 unknown/outcome-unknown、4 command-lane，共新增 8。两个范围合计净增 **33** 项；initial-tables 仍为 3 项，仅增强原用例，原 package-boundary 剩余 8 项无删减。

这两项测试修正与实物反馈修复是任务后续明确授权，不属于 13 文件 whitespace-only 证明。未重跑 Rust、全仓 Vitest/lint/build 或 E2E，未触碰另有 React 超时/草稿差异的用例。技能影响仅为按职责将 source-runtime 检测内聚移出，控制原文件长度；未扩大产品链路。

### R2 追加源码指纹（最新候选）

新增/再改 5 个路径，修前/修后 SHA-256 如下；其中新 source-runtime test 没有旧实物，旧 package-boundary 中被迁移部分已保留在 diff 可复核。

| 路径（均在 excel/spreadsheet-ui-core） | 修前 SHA-256 | 修后 SHA-256 |
| --- | --- | --- |
| test/initial-tables.test.ts | 53564701cca1bb6784cf9f5a9f22bcfa6393e8e8aa46044f9d95a48e930fc2ba | 00fac355ae8efbcaaa2cbbfe4a039ca4c9b907d8d415c5b14d0b811ef9cd4929 |
| test/package-boundary.test.ts | b43399803f789e22191ea6b232e15d75e52ebb808aa6c114fde16b6eaba5fc6f | 57be545a2271ddc29692b12fc837369a4fcae3d120e0614c55665f9fbef800fc |
| test/source-runtime-boundary.test.ts | 新文件 | 324fe52f7301845f0c738ed02a1789c6da938b8004dde17935a72d17414ec6ed |
| test/editing-commit-feedback.test.ts | 77037e5b629842d033ef64763a60089cfaaccade2ddba7645818d5f62029da67 | f0996e6cd2cbbf9796c7c20051a1f35fb46f0ff3031aa5a4562d99b83e59cf5f |
| src/editing/commit-feedback.ts | a2f0fe669a346d32fbc1c7da4c1e49425dda3af308a26a74706e6f08a510516b | 500684b76853f69015a30024d048fb4f3976b648540e6e5f92bfb6613ffa72c3 |

最新交付源/测试/文档范围 57 文件，使用前文相同路径排序 hash 命令，聚合 SHA-256 为 `d5437f73580ba2e7b7a9cdf3f80558971d6adb5abf4c0b6e534231f9bb72bb5c`。此前 52 文件仅格式 hash 保留为阶段记录，新增这 5 路径后不可继续称其为完整最新候选。包元数据/lock 由 004 独立登记，不在本聚合范围。本执行者未改它们。

剩余验证：004 需以新 commit-feedback 生产 hash 重建/repack，并用 Vite/Rspack、中英、实际格内/公式栏 DOM 验证明确锁提示、draft 与未改值。作者只给以上 Core 定向与类型证据，未将实物反馈 bug 的本地回归冒充最终 tarball/E2E 已通过。
