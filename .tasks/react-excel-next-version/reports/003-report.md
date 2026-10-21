# 003 参数填写表单

状态：领域实现完成，专项通过；真实浏览器/截图/全仓门禁待007统一验收，不作为已通过声明。

## 共享接线契约（2026-10-21）

- Core feature boundary：`src/formula-arguments/index.ts` 导出 `formulaArgumentsPanelAtom`、`runFormulaArgumentsAtom` 及 `FormulaArgumentsAction`。007 在主 barrel 导出上述两个 atoms/type。
- `runFormulaArgumentsAtom` 输入：`{ open: string }`（从当前原生/自定义目录按名称取真实 spec）、`'close'`、`'confirm'`、`'add-group'`、`{ removeGroup: number }`、`{ field: number, value: string }`。
- React：`src/workbook/formula-arguments/FormulaArgumentsDialog.tsx` 导出无 props 的 `FormulaArgumentsDialog`。请007在 `InsertFunctionTools` 返回的 fragment 中挂载（picker dialog 之外）。
- Picker 新按钮 `Fill arguments`：`type="button"`，无 selected 或 `selected.signatureAvailable === false` 时禁用；点击先 `runFormulaArguments({ open: panel.selected.name })`，仅成功后 `run('close')`。保留原 `Insert draft`、搜索、分类与完整帮助原行为。
- Picker trigger `ƒx` 添加 `data-insert-function-trigger`，本组件取消时通过 DOM 找回该触发器；成功生成草稿时不抢回焦点，由原 FormulaBar 接管。
- `formulaArgumentsPanelAtom` 投影含 `open/available/busy/spec/fields/groups/groupCount/minGroups/error/errorField/formula`；fields 按真实调用顺序给出 index/prototypeIndex/groupIndex/arg/value，groups 用于重复组独立移除。确认仅打开完整 formula-bar draft，不发Rust mutation，原Enter/Escape链负责提交/取消。
- 新 Lingui 消息将在实现完成后补精确清单；领域不改PO/feedback。

## 独立主绑定（请007写FEATURES）

| ID | 文件 | 精确主标题 |
| --- | --- | --- |
| FARG-001 | e2e/formula-arguments/native-calls.spec.ts | FARG-001 SUM arguments create one native formula edit |
| FARG-002 | 同上 | FARG-002 IF omits an unused optional argument |
| FARG-003 | 同上 | FARG-003 XLOOKUP preserves an optional middle argument hole |
| FARG-004 | 同上 | FARG-004 LET edits repeated bindings before its fixed calculation |
| FARG-005 | 同上 | FARG-005 TODAY creates a zero-argument native call |
| FARG-006 | 同上 | FARG-006 ORDER_NET uses native custom expression parameters |
| FARG-007 | e2e/formula-arguments/cancel-errors.spec.ts | FARG-007 cancelling argument forms and generated drafts writes nothing |
| FARG-008 | 同上 | FARG-008 required and incomplete repeated arguments keep the form draft |
| FARG-009 | e2e/formula-arguments/group-actions.spec.ts | FARG-009 adding an argument group keeps the fixed final expression |
| FARG-010 | 同上 | FARG-010 removing an argument group preserves the remaining parameters |
| FARG-011 | 同上 | FARG-011 Cancel button discards the argument form without a write |
| FARG-012 | 同上 | FARG-012 Escape discards the argument form and restores its trigger |

布局/双语、权限/目标身份由专项及附加E2E覆盖，最终实际截图和浏览器只由007执行。

## i18n（请007集中维护）

新增feedback：

- `Enter every required argument.` → `请填写所有必填参数。`
- `Complete every required parameter in each repeated group.` → `请补齐每个重复组内的必填参数。`

组件新增Lingui消息（源已就绪）：

- `Function arguments` → `函数参数`
- `Enter Excel expressions: "text" for text, A1:A3 for ranges, or 'Sheet name'!A1 for another sheet. Nested functions and array constants are allowed.` → `输入 Excel 表达式：文本使用 "文本"，区域使用 A1:A3，跨表引用使用 '工作表名称'!A1。可使用嵌套函数和数组常量。`
- `Argument group {0}` → `参数组 {0}`（宏提取实际占位符以extract为准）
- `Remove group` → `移除此组`
- `Add argument group` → `添加参数组`
- `This function takes no arguments.` → `此函数不需要参数。`
- `Continue editing in the formula bar` → `在公式栏继续编辑`
- `Create formula draft` → `生成公式草稿`
- `The formula bar opens next. Press Enter to save or Escape to cancel.` → `接下来会打开公式栏。按 Enter 保存，或按 Escape 取消。`
- 007 picker新按钮 `Fill arguments` → `填写参数`；沿用现有 Optional/Required/Cancel。

FETCHJSON 当前没有原生签名元数据，继续通过原Insert draft手填；不冒充零参数函数开放表单。

## 已交付与边界

- `layout.ts` 从同一真实签名展开固定前参、重复组、固定尾参，兼容旧v1 repeats尾参；TODAY/PI等真正零参数与缺失签名明确区分。
- 每个输入是原始Excel表达式，不按逗号拆字段、不在TS计算。嵌套函数、文本内逗号/双引号、数组常量、跨表引用原样组装；可选尾部省略、中间空位保留；LAMBDA未使用的可选形参组可在固定calculation之前省略。
- 组内required/optional依真实元数据校验（SORTBY的组内可选顺序不强行补必填）。可添加组、移除任意组，剩余值及LET固定末参不丢失。
- 连接、选区authority、活动表、当前签名在每次操作再次确认；切表再切回、换连接、自定义签名变化均不能让旧表单写到新目标。确认再走原mutation gateway；table处理中/编辑/历史等busy禁用，保护拒绝时保留参数。
- 对话框无props，只用useAtomValue/useSetAtom。它管理原生dialog、首焦点、Tab循环、非composing Escape、取消返回ƒx；成功时通过dialog DOM returnValue避免抢走旧FormulaBar应接管的焦点。
- 未改共享文件、Rust、Worker transport、原native目录或计算器。007已完成Core barrel/旧picker挂载/三按钮wrap/反馈注册，PO由007统一处理。

## 最终调用链与职责

`React picker Fill arguments → runFormulaArgumentsAtom(open) → formulaArgumentsPanelAtom → FormulaArgumentsDialog → runFormulaArgumentsAtom(confirm) → resolveContentMutationAtom → startEditingAtom(formula-bar) → 原Enter commit → Rust Worker/WASM → 原投影/历史/文件链`。

- Core `layout.ts` 必要性：将真实metadata映射为可编辑字段并保留原始表达式位置。
- Core `panel.ts` 必要性：把一个参数表单动作的校验、身份与多atom草稿交接留在命令层。
- React `FormulaArgumentsDialog.tsx` 必要性：原生模态和DOM焦点属于React。
- feature `index.ts` 是给007主barrel接线的功能公开边界，没有新增运行层或包装controller。

## 专项验证原始证据

基线/当前HEAD：`b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb`，工作树含其他owner并行改动；不commit/push。
运行环境：Node `v24.14.0`、pnpm `9.15.6`，2026-10-21 Asia/Shanghai。

- `pnpm --filter @einfach/spreadsheet-ui-core test -- test/formula-arguments --reporter=default --reporter=json --outputFile=/Volumes/work/self/excel/.codex-artifacts/react-excel-next-version.11oYiO/003-core-vitest.json`：2 files / 17 tests passed，17:10:57，exit0。
- `pnpm --filter @einfach/react-excel test -- test/workbook/formula-arguments --reporter=default --reporter=json --outputFile=/Volumes/work/self/excel/.codex-artifacts/react-excel-next-version.11oYiO/003-react-vitest.json`：1 file / 5 tests passed，最终JSX格式换行后复验，exit0。
- 指定全部新TS/TSX目录的 `pnpm exec eslint --config rules/.eslintrc --ext=.ts,.tsx --ignore-path rules/.eslintignore ...`：exit0，无告警。首次lint发现行宽和loop捕获已修复，没有更改规则。
- own tracked `git diff --check` 及逐个untracked `git diff --no-index --check /dev/null <file>`：无空白诊断。no-index对新增内容返回1表示文件差异，不是测试失败。
- own source/test/E2E共16文件，按路径排序计算 `SHA256(path + NUL + bytes + NUL)`：`364dc050fc74df9e9c93dafd64f7ad39b3576447a2c59049cf2d84ac0433f5a2`。
- 全目录专项实际读取现有full WASM的 `function_catalog()`，逐个验证502真实签名的字段顺序、重复组及固定尾参。此处只读取编译artifact，未重建、未冒充所有函数语义求值。被读binary SHA256：`4ecb0ab565fc48d8fa42a490c4e7520edc74d4089fb337b4f1efb43f82dec34a`。
- 新增/大改源测试均≤300物理行，最长140行；无复杂文件豁免。

已保存19个真实DOM/Worker/WASM E2E测试：上表12个独立primary + 保护/原Rust数据验证拒绝与纠正/文件往返/4个en-zh×1280-390布局case。
布局每case保存top/footer两张，共8张截图路径；007需实际执行并逐张看图。领域未运行浏览器、未重建WASM、未跑全仓门禁，learn-project继续暂停。

## 007待统一验收

1. 最终Lingui extract/strict compile及上述双语文案。
2. `e2e/formula-arguments/` 19个case真实执行，观察SUM=89、IF含引号文本、XLOOKUP=20、LET=7、TODAY=当前日期序号、ORDER_NET(E3,F3)=658；各原生primary一次Undo到基线、Redo恢复、邻格保持。
3. 取消路径下载工作簿前后 `.workbook` 严格相等；LET下载文件仍保存原公式，重新打开可编辑且原生值保持658。
4. 中英两宽8张截图逐张检查（top/footer），不得只凭DOM无overflow声明通过；旧picker/help/Insert draft回归由原专项与最终全量覆盖。

## r2 后 FARG-003 新测试前置纠正（root 授权，修改后冻结）

本轮仅修改 `e2e/formula-arguments/native-calls.spec.ts` 的 FARG-003 三行，以及本报告。
该文件未纳当前 r3，亦非其 import 输入；其余 source/test/helpers/config/WASM 保持冻结。

核实依据：

- `excel/rust/excel-core/src/formula_help/limitations.rs:34` 已公开 XLOOKUP 的 lookup_array/return_array 必须 reference-backed，不接受字面数组。
- `excel/rust/excel-core/src/eval_fn_lookup_modern.rs:60` 调用成对区域收集；`eval_lookup_range_grid.rs:35` 对两参先用 `runtime_ref_from_expr`，字面数组因而返回 InvalidValue。原 r2 已准确生成空位公式后的 `#VALUE!` 是这个既有边界，不改产品语义。
- `excel/react-excel/src/page/demo/sales-orders/data/table-seed.ts:28` 的 `[10,20,30]` 映射至 sheet1、row46+index、col0=`index+1`、col1=`value`，故已有 Summary!A47:A49 为 1/2/3、B47:B49 为 10/20/30。
- `sales-orders-workbook.ts` 将 `SUMMARY_TABLE_CELLS` 放入原 createImportChunks；`e2e/fixtures/plain-sales-orders/workbook.ts:14` 保留产品定义中所有 sheet!==0 的 chunks。因此 plain fixture 直接使用这组现有数据，无需 seed 改动或测试直写。

准确 diff（仅同一新 case 的参数文本与精确公式断言）：

```diff
-  await field(page, 'lookup_array').fill('{1,2,3}')
-  await field(page, 'return_array').fill('{10,20,30}')
+  await field(page, 'lookup_array').fill('Summary!A47:A49')
+  await field(page, 'return_array').fill('Summary!B47:B49')
   await field(page, 'match_mode').fill('0')
-  await commitArguments(page, '=XLOOKUP(2,{1,2,3},{10,20,30},,0)', '20')
+  await commitArguments(page, '=XLOOKUP(2,Summary!A47:A49,Summary!B47:B49,,0)', '20')
```

`if_not_found` 仍不填写，精确生成式中的 `,,0` 保留；结果仍必须为20。
既有 `commitArguments` 未改：生成后写前仍Northwind/Undo禁用，Enter保存断言结果，A3/C3邻格保持，Undo一次到Northwind且Undo禁用，Redo恢复20并重新定位B3核对精确公式。

静态核对：把新文件上述三行逆替换后 SHA256 精确等于修改前捕获的
`605ef090dc922b74e4e36f7fbeb8c4e10628542b743e5a96f73fe21832e97ed6`，证明没有夹带其它行修改。
修改后单文件 SHA256：`6cf4f4a1a5106a3770d5885218c0d8326b4675a3a066cffcc133c9062445df67`。
当前003同16个 source/test/E2E文件按此前同算法的新指纹：
`75a4ce4a1225ea4ae1d476235e0fa99e0bb2723e2146d1a3a324e5719c13f4b4`。
`git diff --no-index --check /dev/null <native-calls.spec.ts>` 无空白诊断（新增untracked内容差异返回1）。

本轮未改 Rust/产品 src/seed/共享 helper/config/WASM；未运行浏览器或重建，未重复稳定 Core/React 专项。
现已冻结，交007在其获准的下一验收过程实际执行；本纠正不声称 FARG-003 已通过。
