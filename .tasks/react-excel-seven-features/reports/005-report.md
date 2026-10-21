# 005 函数参数帮助交付报告

状态：DONE_WITH_CONCERNS，待独立审查及 008 统一构件/浏览器验收；不声明端到端已通过。

## 共享契约（2026-10-20）

原生 `BuiltinFunction` 保留 `name/category/note`，新增 `help: BuiltinFunctionHelp`。`function_catalog()` 升级 `version: 2`；目录仍完全由编译分发表产生（lite 499 / full 502），不会扩大函数支持集合。帮助仅为只读二进制元数据，不写工作簿、历史或文件，不需要持久化迁移。

`BuiltinFunctionHelp` 的序列化字段：`summary: string`、`summary_zh: string`、`args: { name: string; description: string; description_zh: string; optional: boolean; repeats: boolean }[]`、`repeat?: { start: number; length: number; min_groups: number } | null`、`examples: string[]`、`limitations: { en: string; zh: string }[]`。无重复组时，Rust JSON 为 null，WASM 为 undefined，JSON 往返后可省略该字段（R1 实际构件验证）；这三种形态均必须满足所有参数 repeats=false，其余帮助字段仍完整严格验证。重复组通过索引表达，支持 LET 名称/值组与末尾 calculation、MAP 多数组与末尾 lambda、SUMIFS 的范围/条件组。`args` 是一个原型组，后续实际参数按组循环高亮。

Core `FormulaFunctionSpec` 增加 `summaryZh?: string`、参数 `description?/descriptionZh?`、`repeat?: { start; length; minGroups }`、`examples?: readonly string[]`、`limitations?: readonly { en; zh }[]`。保留 `nativeFunctionCatalogAtom`、`renderFormulaFunctionSignature` 与现有消费方式。v1 目录兼容现有测试/旧宿主，但真实 v2 必须逐函数验证完整帮助，不再用 21 项注册表补齐真实目录。原生自定义公式 `customFormulaFunctionSpecsAtom` 在内置项之后合并；只消费 006 已有定义投影，无新 Worker read，无 value import 循环。

React 导出 `FormulaParameterHelp(props: { spec: FormulaFunctionSpec; activeArgIndex?: number; compact?: boolean })`，路径 `src/workbook/formula-help/FormulaParameterHelp.tsx`；仅渲染数据，无控制器 prop 或本地工作簿状态。008 在 `InsertFunctionTools` 的 description 区使用 `<FormulaParameterHelp spec={panel.selected} />`；在现有格内/公式栏共用提示中用同一组件 `<FormulaParameterHelp spec={signature.spec} activeArgIndex={signature.activeArgIndex} compact />`，保留原提示外框、焦点与 aria 关联。帮助组件不包含 dialog，不新增入口状态。

## 008 共享修改请求

- 不需要添加 Worker command：现有 getFunctionCatalog 请求原样运输 v2 对象；WASM `function_catalog` 的版本在本任务文件内升级。
- 如 public barrel 尚未导出 `FormulaFunctionSpec` 类型，补导出（当前 `formula-functions/index.ts` 已 export types，本任务会维护此边界）。
- 旧界面两处嵌入上述组件；共享 Lingui 汇总及 FEATURES.md 由 008 合并。
- 由 008 重建 WASM、执行 full/lite 及真实浏览器；本任务不运行这些共享构件步骤。
- 原生模块通过本任务拥有的 `eval_core_dispatch.rs` 内 `#[path = "formula_help/mod.rs"] mod formula_help` 注册，`pub use` 导出 `BuiltinFunctionHelp/FormulaParameter/FormulaRepeatGroup/FormulaLimitation`。008 已在 `eval.rs` 与 `lib.rs` 同步公开重导出，无需再注册第二个模块。
- `FormulaAssist` 补全选项的摘要也使用 `summaryZh`；008 已接入。旧真实 v1/无 XLOOKUP 帮助的 E2E 预期由 008 更新；旧 21 示例只代表旧示例回归，不代表全目录验证。
- 真实 v2 的 SUM 为 `SUM([number, ...])`，不是旧 v1 注册表的 `SUM(number1, [number2, ...])`。旧 `formula-argument-help.spec.ts`/`formula-completion.spec.ts` 若断言旧参数名，须按原生重复原型更新，不能改回假签名。

## 文件职责清单

- Rust `formula_help/mod.rs`：将经核对的定义转换为原生帮助结构。
- Rust `formula_help/{math,logical,text,reference,arrays,date,statistics,distributions,financial,engineering}.tsv`：对应函数家族的真实签名、双语语义与示例。
- Rust `formula_help/parameters.tsv` 与 `parameters.rs`：参数角色双语词汇与上下文特例；`limitations.rs`：已确认的实现偏差。
- Core `formula-functions/help/`：v2 元数据校验、重复组签名与参数定位。
- Core `formula-functions/parse.ts/index.ts/native-catalog.ts/types.ts/registry.ts`：沿既有签名 atom、解析、目录与呈现链路接入，不另建 React 状态层。
- React `workbook/formula-help/`：只读双语参数帮助呈现。
- 各自领域 test/e2e/docs：持久专项验证、真实界面验收用例与使用文档。

## 实现与准确度边界

- 编译分发表产生的 full 502 / lite 499 名称均有定义，别名用各自名称生成可执行示例。`BETADIST` 与 `BETA.DIST` 的实际参数差异保留，不按名称相似度共用假签名。
- 每项包含真实原型参数、必填/可选、重复组、双语参数含义与至少一个示例；零参数项如 PI/TODAY/NOW 显式无参数，不用 `args...` 或无帮助占位冒充完整。
- 参数签名对照 evaluator 的读取/拒绝逻辑；非重复函数上下参数数量边界逐项真实执行，重复函数另有分组定位专项。所有函数示例在真实 evaluator/引用 provider 上解析求值，除 NA 的故意错误外不允许错误结果。这里是完整目录及示例/arity 证据，不是所有数值/错误/条件路径的形式化证明。
- 当前参数不再 clamp 到最后槽。解析整个调用（包含光标右侧）并跳过引号/数组/结构引用逗号；支持 dotted names。SUMIFS 多组、LET 固定 calculation/未完成 value、MAP 固定 lambda、SWITCH 可选 default、零形参 LAMBDA 都有实际 Core atom 专项。
- AGGREGATE 字面功能码按引擎截断规则区分 1–13 的数组和 14–19 的最终 k。动态引用/表达式功能码不在输入辅助中求值，最后参数角色歧义时不错误高亮。
- 对已发现的引擎差异明确显示限制：CEILING/FLOOR 为单参数整数舍入；MOD 欧几里得余数；TRANSLATE 字符替换；IMAGE/HYPERLINK 无原生图像/跳转呈现；PHONETIC 原样文本；SEARCH 无通配符；日期/时间解析范围；部分函数仅引用区域；Rust regex 限制；ACCRINT 简化；ISOMITTED 作用域；ERF.PRECISE 实际接受可选上限等。没有承诺 Office 全面兼容。
- 本任务使用 one-file-one-thing 与 frontend-design-codex：数据与解析/校验/呈现分责，普通文件均 ≤300 行；沿现有 token/焦点/弹层，重要参数说明使用正文色，窄屏流式换行，无新视觉体系。

## 验证记录（均为实际执行）

| 命令（相应包 cwd） | exit | 结果与边界 |
| --- | --- | --- |
| `cargo test --test formula_help`（excel-core） | 0 | 4/4；full 实际 502 项、所有示例真实求值、别名、固定 arity、只读历史/值 |
| `cargo test --no-default-features --test formula_help`（excel-core） | 0 | 4/4；lite 实际 499 项，同上 |
| `pnpm exec vitest run test/formula-help test/formula-functions-atoms.test.ts test/formula-functions-parse.test.ts test/native-function-catalog.test.ts`（Core） | 0 | 52/52；严格 v2、v1 兼容、绑定连接、自定义投影合并、分组/后缀定位及既有回归 |
| `pnpm exec vitest run test/formula-help/signature.test.ts`（Core，最后 LET 边界修正后） | 0 | 10/10；含 LET(x,1,y, 等待第二组 value，未把固定尾参无限循环 |
| `pnpm exec vitest run test/workbook/formula-help test/workbook/editing/formula-completion.test.tsx test/workbook/ribbon/insert-function.test.tsx`（React，最终组件） | 0 | 12/12（3 文件）；帮助双语/参数说明/零参数/固定尾参及旧 picker/补全 |
| `pnpm exec playwright test e2e/formula-help --list`（React） | 0 | 成功收集 16 项；仅清单/语法预检，不是浏览器通过 |
| `git diff --check -- <本领域路径>` | 0 | 无空白错误；普通文件最长 eval_core_dispatch.rs 230 行 |

过程中的失败均未隐藏：两次 Rust 首轮收集被其他业务 WIP 字段/visibility 阻挡（0 tests），修正后才有上列 full/lite 通过；真实例子首轮发现 ERF.PRECISE 与若干引用专用函数差异后，修正定义/例子/限制再跑通过。React 首轮被共享 clipboard 的 finally 解析 WIP 阻挡（0 tests）；其修好后发现旧 getByText 不接受嵌套 span 的完整签名，已在本组件无高亮时输出完整文本，最后三文件 12/12。

Rust 两次通过之后仅更正 PERCENTRANK significance 的位数语义与 PROB prob_range 严格正概率文案；未改签名、示例、求值或 Rust 测试。遵照共享 cargo 调度不为这两处文案重启编译，最终候选由 008 全量复验。

未运行：WASM 重建、真实 E2E、截图目测、全量 Vitest/build/typecheck/lint/API snapshot。不得把上表 mock/Core/React 单测或 Playwright --list 算作 Worker 端到端通过。

## Lingui 固定文案清单（由 008 合并）

| English | 中文 |
| --- | --- |
| Parameters | 参数 |
| Required | 必填 |
| Optional | 可选 |
| Repeating group | 重复组 |
| Repeat the marked parameters together, in order. | 按顺序一起重复标记的参数。 |
| Examples | 示例 |
| Implementation limits | 实现限制 |

函数摘要、参数语义与限制的双语数据直接来自原生 catalog；不是把 502 条动态句子塞进 Lingui。语言切换只改变显示，不写工作簿。

## FEATURES 登记行与精确主 E2E 标题

以下路径相对于 `excel/react-excel/`，每一行是一条实际收集的主标题；由 008 登记 FEATURES。状态全部为 pending-browser。

| ID | 文件 | 完整标题 |
| --- | --- | --- |
| HELP-001 | e2e/formula-help/catalog.spec.ts | HELP-001 lite artifact contains complete actual help |
| HELP-001 | e2e/formula-help/catalog.spec.ts | HELP-001 full artifact contains complete actual help |
| HELP-002 | e2e/formula-help/catalog.spec.ts | HELP-002 every real picker entry renders its own help at 1280px |
| HELP-002 | e2e/formula-help/catalog.spec.ts | HELP-002 every real picker entry renders its own help at 390px |
| HELP-003 | e2e/formula-help/catalog.spec.ts | HELP-003 Chinese parameters and implementation limits at 1280px |
| HELP-003 | e2e/formula-help/catalog.spec.ts | HELP-003 Chinese parameters and implementation limits at 390px |
| HELP-004 | e2e/formula-help/editing.spec.ts | HELP-004 cell actual parameter groups and suffixes at 1280px |
| HELP-004 | e2e/formula-help/editing.spec.ts | HELP-004 formula actual parameter groups and suffixes at 1280px |
| HELP-004 | e2e/formula-help/editing.spec.ts | HELP-004 cell actual parameter groups and suffixes at 390px |
| HELP-004 | e2e/formula-help/editing.spec.ts | HELP-004 formula actual parameter groups and suffixes at 390px |
| HELP-005 | e2e/formula-help/editing.spec.ts | HELP-005 picker, draft, native commit and one history step at 1280px |
| HELP-005 | e2e/formula-help/editing.spec.ts | HELP-005 picker, draft, native commit and one history step at 390px |
| HELP-006 | e2e/formula-help/read-only.spec.ts | HELP-006 browsing preserves native file and previous history step at 1280px |
| HELP-006 | e2e/formula-help/read-only.spec.ts | HELP-006 browsing preserves native file and previous history step at 390px |
| HELP-007 | e2e/formula-help/read-only.spec.ts | HELP-007 search recovery, category help and cancel keep the target at 1280px |
| HELP-007 | e2e/formula-help/read-only.spec.ts | HELP-007 search recovery, category help and cancel keep the target at 390px |

HELP-002 不只抽样：浏览真实 lite 499 个内置 DOM option，与实际 WASM v2 每项说明/参数/示例/限制逐项比对。008 后续按根授权将默认新增的 ORDER_NET 自定义种子作为第 500 项单独严格校验，不把它计入内置 499 项、不用 >= 放松名单。HELP-004 使用真实输入框/键盘定位，不写 Core atom。HELP-005 确认只在 Enter 后写入且仅一步 Undo/Redo；HELP-006 比较实际下载的原生 workbook/canvases 前后完全不变，并保留先前历史。HELP-007 覆盖空搜索、修正、分类、零参及 Cancel/焦点；HELP-002 覆盖 Escape/焦点。已有 commit 生命周期抑制帮助的 Core 回归保留。

截图计划已写在测试：`help-catalog-{1280,390}.png`、`help-chinese-{1280,390}.png`、`help-{cell,formula}-{1280,390}.png`，写入各自 testInfo 产物目录。需 008 运行后检查长签名/说明无横向溢出、中文标签、光标高亮与现有弹层可见性；当前无截图通过声明。

## 最终候选指纹与交接

R1 CI 安全迁移后当前领域 39 文件 SHA-256：`5a430927e1c1f83049f0552d293b12d144061217ffc2dd16fb77229a4d551ce4`。首次交付快照为 `713a1e48feb074b6a027ad2e650a616a39ea2f6eb784d9f5dcd228bc6ec08930`，R1 迁移前为 `35348c4631c71a64bcfefd41d10ceabade7ed960556c6b85b0564e63f8c0d101`；其后 008 获准优化 native-catalog.ts 只读热路径、上述种子 E2E 与 HELP-001 实际构件校验，当前领域快照包含这些共享合入，不冒称均为本次修复。

算法：以下路径递归得到文件，按相对路径排序，逐文件向 SHA-256 追加 `path + NUL + bytes + NUL`；不含本报告或其他领域共享接线：React 的 `src/workbook/formula-help/`、`test/workbook/formula-help/`、`e2e/formula-help/`、`docs/formula-help/`；Core 的 `src/formula-functions/`、`test/formula-help/`；Rust 的 `src/formula_help/`、`tests/formula_help/`、`tests/formula_help.rs`、`src/eval_core_dispatch.rs`；WASM 的 `src/wasm_function_catalog.rs`。

没有 commit/push、浏览器运行、WASM 构建或越权修改共享文件。待 008 合并文案/FEATURES、更新旧 v1 E2E 预期并完成统一构件及完整真实浏览器验收；再交独立 reviewer 审查参数语义与测试覆盖。报告中的领域完成不等同于整体目标完成。

## R1：真实 WASM 可选字段修复（2026-10-20）

008 首次真实定向浏览器共计划 256 项，首例启动报 `Rust returned an invalid function catalog.`，实际 1 failed / 255 未执行，现场 `/tmp/react-excel-seven-targeted.HG52iT/report.json`。不能将该轮当成功，也不能用此前 mock 单测代替真实传输。

原因为无重复组的 `repeat` 在真实 WASM 对象中值为 undefined，而旧 validator 只接受显式 null。只读 Node 精确观察 ABS：`Object.hasOwn(help, 'repeat') === true`，`typeof help.repeat === 'undefined'`；`JSON.stringify` 后字段才消失。此前“原始对象完全没有键”的口头描述不精确，此处以实际观测修正。

根仅授权本次改动：`src/formula-functions/help/validate.ts`、`src/formula-functions/types.ts`、`test/formula-help/catalog.test.ts`。validator 使用 nullish 判断且继续要求 args 均非重复；types 标注真实可选性。未改 native-catalog.ts、Rust 数据、WASM 构件、UI 或 E2E。

首轮补充专项直接用 Node fs+ES module 加载已构建 lite/full WASM，而非复制目录为假 fixture。分别对完整 499/502 项原始返回对象及 JSON 往返对象执行现有 validateFunctionCatalog，并将全部条目投影到同一 Core catalog。所有 NativeFormulaHelp 其余字段仍经同一严格检查；SUM 的真实 repeat 原型保留。该两条构件用例现已迁出普通 Core 测试（见下文）；Core 仍永久保留省略/显式 undefined/null、无组却 args.repeats=true、空组、越界/错误组与 min_groups 不一致的纯 wire 严格回归。

实际命令：Core cwd `pnpm exec vitest run test/formula-help test/native-function-catalog.test.ts`，exit 0，3 文件 27/27。初版测试夹具曾因 URL 解析及 hasOwn 错假设失败，已按真实 Node path/undefined 形态修正，不将失败计作通过。`git diff --check` exit 0。

测试输入构件 SHA-256（只读，未重建）：

- lite JS `857c4ee07d0a37c39baa37665bf97632d0c10546afca8bcb61b6a72302b9b69d`
- lite WASM `6d1ea81cdcc391a3d1f670cd640f3ecc010e4fb77f42a59a70eef30184121bb3`
- full JS `86f9c31304bc6bc5a679dba3dbd86b8da9a96c169f940288e7916c662a3494a8`
- full WASM `cf4921d146ef3e80442c2ba10b49a8422658b27d42750d095777958d972ae79b`

本轮没有启动浏览器、cargo、WASM build 或全量 gate。008 继续同批真实 DOM 验收，新的端到端通过数仍由其报告记录。

### R1 CI 安全迁移（已实施）

根审确认常规 CI 的 build 只保证 lite 构件，而 lite/full 目录均 gitignored；因此上述 Core 新增 full 构件载入不能永久留在普通单测中。27/27 真实构件验证仍是本次补充证据，不等于干净 CI 已通过。

批准的最短迁移已落地：005 在 008 当前 256 项浏览器唯一过程结束、根开放窗口后，删除 Core 两条 actual-artifact 测试及 node fs/path/url imports，保留省略/undefined/null/非法重复参数组合的全部纯 wire 回归；不加 skip、存在判断、构件构建或新 workflow。008 独占既有 HELP-001 的实际构件读取入口，已在 page.evaluate 内对 `function_catalog()` 原始对象和 JSON 往返对象调用现有 `validateFunctionCatalog`，继续完整 lite499/full502 断言，不改 native-catalog.ts 或复制另一份 validator。HELP-001 迁移后尚未执行浏览器，等待根统一窗口。

此前 session28707 执行期间仅更新报告，没有修改任何产品/测试/E2E/构件输入。当前过程结束后只改授权 Core 测试删除与本报告，未改产品、共享 E2E、WASM 或 CI。最终 Core cwd 执行 `pnpm exec vitest run test/formula-help test/native-function-catalog.test.ts`，exit 0，3 文件 25/25；不再要求 lite/full 构件存在。`git diff --check` exit 0。实际构件 27/27 为历史补充证据，不再充当普通 CI 的当前测试数；没有声称全仓 CI 或最终端到端通过。
