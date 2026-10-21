# 003 高级条件格式交付报告

状态：实现完成，专项交付待独立审阅；真实浏览器/WASM构件与全局检查待008统一执行。没有将mock测试算作原生通过。

## 已确认主线

`ConditionalFormatTools` → `runNativeConditionalFormatAtom` → `conditionalFormat.change` → 既有 WASM 条件规则历史方法 → `snapshot_display_format_range` → `applyVisibleFormats` → Cell DOM。沿用现有 JSON `rule_json`，不新增存储、Worker 命令或 WASM export。

## 共享接线请求（008）

1. `excel/rust/excel-core/src/workbook.rs` 注册 `#[path = "advanced_conditional_format/mod.rs"] pub(crate) mod advanced_conditional_format;`，并 `pub use advanced_conditional_format::ConditionalIconDisplay;`。`excel/rust/excel-core/src/lib.rs` 从 workbook 再导出 `ConditionalIconDisplay`，供 WASM 序列化类型使用。
2. `excel/rust/excel-core/src/sheet_conditional_range.rs` 的 `ConditionalStatistic` 加 `SortedNumbers` 变体；`summarize` 分支排序 `numbers.sort_by(f64::total_cmp)` 后返回 `Value::Array(Arc::new(ArrayData::new(1, numbers.len() as u32, numbers.iter().copied().map(Value::Number).collect())))`。空数值域继续返回 Null。此数据仅 Rust 内用于任意百分位，沿用现有稀疏依赖 atom。
3. `backend/projection-primitives.ts` 的 `DisplayCell` 加 `conditionalIcon?: { set: 'three-arrows' | 'three-traffic-lights' | 'three-flags'; index: 0 | 1 | 2; showValue: boolean }`；`backend/projection-helpers.ts` clone 时复制该对象。
4. `rust-workbook/wasm-types.ts` 的 `RustFormatRangeSnapshot` 加 `readonly conditionalIcons?: readonly ({ readonly addr: string } & NonNullable<DisplayCell['conditionalIcon']>)[]`。`format-projection.ts` 从 snapshot 按 addr 附加 `conditionalIcon`；每次新快照没有图标时清除旧值；不在 TS 判断阈值或反向。
5. Cell 显示入口仅渲染原生 `conditionalIcon`：`data-conditional-icon`、`data-icon-set={set}`、`data-icon-index={index}`，0/1/2 对应低/中/高（逆序已由 Rust 转换）；`three-arrows` ↓/→/↑，`three-traffic-lights` 红/黄/绿圆点，`three-flags` 红/黄/绿旗。使用独立 span，`showValue=false` 时隐藏可视文字而保留 cell 的可访问数值；图标须在合并锚点、冻结/隐藏投影沿现有 cell 渲染路径出现一次。
6. `ConditionalFormatTools.tsx`：导入 `AdvancedConditionalFormatFields`，在颜色/数据条现有字段区后插入 `<AdvancedConditionalFormatFields idPrefix={id} />`；supported 列表/Rule type options 增加 `'icon-set'` / `<Trans>Icon set</Trans>`，ruleLabel 增加 `t\`Icon set\``。组件自行读取 Core 草稿并 dispatch，准确导出：`export interface AdvancedConditionalFormatFieldsProps { idPrefix: string }`；`export function AdvancedConditionalFormatFields(props: AdvancedConditionalFormatFieldsProps): ReactElement | null`。无需传 controller、rule 或 setter。
7. Core public barrel 已 `export * from './conditional-formatting/types'` 则新类型自动可用；如不是请补导出 `ConditionalFormatThreshold`、`IconSetRule`、`AdvancedVisualRule`。本任务修改 conditional-formatting 自有文件，无需 008 编辑该目录。
8. 稳定重写接口：`pub(crate) fn rewrite_rule_formulas(json: &mut serde_json::Value, rewrite: impl FnMut(&str) -> Option<String>) -> bool`，位于 `workbook::advanced_conditional_format`；访问主公式及五种阈值公式，None保留原文，Some替换字段，返回是否至少一次替换。003已接结构/表名改写；008需将 `workbook_formula_rule_change.rs::FormulaRuleChange::prepare` 的命名区域/移动改写复用该visitor。
9. 003在Workbook公开set/remove及WASM set/manage/remove入口已加保护guard。008负责 `workbook_history_conditional_format.rs` 三个公开历史入口的 `ensure_sheet_unprotected(sheet)`，因为manage直接replace而非公开set/remove。
10. `wasm_tests/conditional_visuals.rs` 的 `DisplayFormatRangeSnapshotJSON` 构造器补 `conditional_icons: Vec::new()`；003自有WASM wire已增加此字段，无新增WASM export。全部visual已改用SortedNumbers，旧 `ConditionalStatistic::Bounds` 无调用，008删除旧分支避免dead_code warning。
11. 旧面板说明建议改为：`Automatic thresholds use the full numeric range. Advanced threshold fields override the default endpoints.` / `自动阈值使用完整数值范围。高级阈值字段可覆盖默认端点。`（003不修改旧UI共享文件。）

### Seed请求

Summary原100×8保持，在空位H74放标题`Icon thresholds`，H75:H79放0/10/50/75/100，追加原生规则`{kind:'icon-set',iconSet:'three-arrows',lowerThreshold:{type:'percentile',value:'33'},upperThreshold:{type:'percentile',value:'67'}}`，scope H75:H79。003提供seed E2E；008合并seed后目录从11变12，旧E2E固定条数需统一调整，原规则序号尾部追加保持稳定。没有改动默认Sales Orders合并/128列或Summary既有样例。

## 字段与兼容语义

`ConditionalFormatThreshold = { type: 'min' | 'max' } | { type: 'number' | 'percent' | 'percentile'; value: string } | { type: 'formula'; value: string }`。数值草稿保留 string，让 Rust 统一验证有限数；百分比/百分位限 0–100。ColorScaleRule / DataBarRule 加可选 `minThreshold`、`maxThreshold`；ColorScaleRule 另加可选 `midThreshold`。省略保持旧原生 min/max、三色中位数；数据条旧零轴保持。

`IconSetRule = { kind: 'icon-set'; enabled?: boolean; iconSet: 'three-arrows' | 'three-traffic-lights' | 'three-flags'; lowerThreshold?: ConditionalFormatThreshold; upperThreshold?: ConditionalFormatThreshold; reverse?: boolean; showValue?: boolean }`。省略阈值为百分比 33/67，showValue 默认 true，reverse 默认 false；等于阈值落较高档。阈值公式在该规则首范围左上角上下文求一次，错误/非数值则此规则不显示，不影响其他规则。结构/工作表改名会改写阈值公式，沿现有规则历史与文件回往。无需文件版本迁移，旧 JSON 未写新字段仍保留原行为。

## 文件职责清单

- Rust `advanced_conditional_format/threshold.rs`：验证和求解阈值。
- Rust `advanced_conditional_format/icon_set.rs`：求解三档图标元数据。
- Rust `advanced_conditional_format/mod.rs`：模块对外边界。
- 既有 workbook_conditional_*：接入现有规则分派、投影和引用迁移。
- Core `conditional-formatting/advanced/`：可视规则字段快照和草稿复制。
- React `advanced-conditional-format/AdvancedConditionalFormatFields.tsx`：读取原生草稿并呈现高级控件。
- React `advanced-conditional-format/ThresholdFields.tsx`：单阈值输入。
- 各自 test/e2e 目录：专项断言；docs 目录：语义和验收路径。

## 实际验证

| 命令 | exit | 结果 |
| --- | --- | --- |
| `cargo test -p einfach-excel-core --test advanced_conditional_format`（误在excel/rust运行） | 101 | 该层无Cargo.toml，未启动编译，不记通过。 |
| `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test advanced_conditional_format` | 0 | 12/12，真实Rust Workbook/WorkbookHistory。 |
| `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test conditional_format_color_scale --test conditional_format_data_bar --test conditional_format_stop --test conditional_format_formula_structure --test conditional_format_formula_sheets` | 0 | 24/24既有回归；含极端数/次正规中位数、零轴、依赖、Stop、结构及工作表历史。 |
| `pnpm --filter @einfach/spreadsheet-ui-core test test/advanced-conditional-format` | 0 | 首轮8/8；后新增busy用例将随最终专项跑，见下。 |
| `pnpm --filter @einfach/react-excel test test/workbook/advanced-conditional-format` | 0 | 3/3 DOM控件及atom草稿；transport mock，不宣称真实WASM通过。 |
| `pnpm --filter @einfach/spreadsheet-ui-core test test/advanced-conditional-format test/native-conditional-format.test.ts test/conditional-formatting-editor-draft.test.ts test/conditional-highlight-options.test.ts` | 0 | 最终37/37（5文件），新专项9条，含busy single-flight；既有面板/草稿/options回归。 |
| `pnpm --filter @einfach/react-excel test test/workbook/advanced-conditional-format test/workbook/ribbon/conditional-format.test.tsx` | 0 | 最终21/21（2文件），旧面板已接入Advanced字段后通过。 |
| `git diff --check -- <003自有源码与测试路径>` | 0 | 无空白错误。 |

最终候选采集时间2026-10-20 18:57:57 CST，基线HEAD `1c47e6439657ee18d66db1d194d61dfa44bdf103`，共享脏工作区。003自有代码自相关专项通过后未作语义修改；后续仅补E2E/文档。对有序文件列表执行`shasum -a 256 <files> | shasum -a 256`：

- Rust：`726c1f74b3b39b2757520a890ffeaadc2f482f9ecfa7d23e3356ff4d93aca885`。列表为`advanced_conditional_format/*.rs`、本任务修改的8个`workbook_conditional*.rs`、`tests/advanced_conditional_format.rs`、`tests/advanced_conditional_format/*.rs`、`wasm_workbook_conditional_format.rs`。其中WASM文件仅属于候选指纹，未在003运行WASM构件验证。
- Core/React/E2E：`d082c215cc99b48db2fa5697405ef8e050699a906f92271d7312c51730330eb5`。列表为Core `advanced/*.ts`、types/native-panel/snapshot-rules/value-domain/editor-draft、自有Core tests；React高级字段/专项test；自有e2e全部ts。E2E仅属于候选指纹，未执行。

共享注册/guard/翻译/seed等仍可继续变化；上述为003交付指纹，不冒称整体验收冻结候选。008最终需采集全部输入指纹。

新Rust覆盖：min/max/number/percent/percentile/formula；跨区域/屏外数值；非数值域；三色中点；数据条clamp；公式依赖变化；错误原子性；三种图标/反向/仅图标；图标与有效颜色/Stop组合；一次历史/规则快照回往；结构/表名引用迁移。

## FEATURES.md登记行（008合并）

以下完整标题为1280px主用例，同文件另有390px变体；E2E已持久化但尚未运行。

| ID | 具体操作 | E2E文件 | 完整主标题 |
| --- | --- | --- | --- |
| CFADV-001 | 色阶最小阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale min threshold applies and undoes once at 1280px |
| CFADV-002 | 色阶最大阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale max threshold applies and undoes once at 1280px |
| CFADV-003 | 色阶数值阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale number threshold applies and undoes once at 1280px |
| CFADV-004 | 色阶百分比阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale percent threshold applies and undoes once at 1280px |
| CFADV-005 | 色阶百分位阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale percentile threshold applies and undoes once at 1280px |
| CFADV-006 | 色阶公式阈值 | `advanced-conditional-format/thresholds.spec.ts` | color scale formula threshold applies and undoes once at 1280px |
| CFADV-007 | 数据条最小阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar min threshold applies and undoes once at 1280px |
| CFADV-008 | 数据条最大阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar max threshold applies and undoes once at 1280px |
| CFADV-009 | 数据条数值阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar number threshold applies and undoes once at 1280px |
| CFADV-010 | 数据条百分比阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar percent threshold applies and undoes once at 1280px |
| CFADV-011 | 数据条百分位阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar percentile threshold applies and undoes once at 1280px |
| CFADV-012 | 数据条公式阈值 | `advanced-conditional-format/thresholds.spec.ts` | data bar formula threshold applies and undoes once at 1280px |
| CFADV-013 | 图标最小阈值 | `advanced-conditional-format/icons.spec.ts` | icon set min threshold applies and undoes once at 1280px |
| CFADV-014 | 图标最大阈值 | `advanced-conditional-format/icons.spec.ts` | icon set max threshold applies and undoes once at 1280px |
| CFADV-015 | 图标数值阈值 | `advanced-conditional-format/icons.spec.ts` | icon set number threshold applies and undoes once at 1280px |
| CFADV-016 | 图标百分比阈值 | `advanced-conditional-format/icons.spec.ts` | icon set percent threshold applies and undoes once at 1280px |
| CFADV-017 | 图标百分位阈值 | `advanced-conditional-format/icons.spec.ts` | icon set percentile threshold applies and undoes once at 1280px |
| CFADV-018 | 图标公式阈值 | `advanced-conditional-format/icons.spec.ts` | icon set formula threshold applies and undoes once at 1280px |
| CFADV-019 | 三箭头 | `advanced-conditional-format/icons.spec.ts` | choose three-arrows icon style at 1280px |
| CFADV-020 | 三交通灯 | `advanced-conditional-format/icons.spec.ts` | choose three-traffic-lights icon style at 1280px |
| CFADV-021 | 三旗帜 | `advanced-conditional-format/icons.spec.ts` | choose three-flags icon style at 1280px |
| CFADV-022 | 图标反向 | `advanced-conditional-format/icons.spec.ts` | reverse icon order preserves values and undoes once at 1280px |
| CFADV-023 | 仅显示图标 | `advanced-conditional-format/icons.spec.ts` | show icon only preserves the raw value and undoes once at 1280px |
| CFADV-024 | 显式三色中点 | `advanced-conditional-format/thresholds.spec.ts` | third color accepts an explicit midpoint threshold at 1280px |
| CFADV-025 | 恢复自动阈值 | `advanced-conditional-format/thresholds.spec.ts` | reset threshold to automatic restores native full-range scaling at 1280px |
| CFADV-026 | 编辑公式引用值重算阈值 | `advanced-conditional-format/thresholds.spec.ts` | formula threshold tracks a changed reference without changing its rule at 1280px |
| CFADV-027 | 错误阈值恢复及取消 | `advanced-conditional-format/lifecycle.spec.ts` | invalid threshold stays correctable and cancel restores focus at 1280px |
| CFADV-028 | 图标颜色/Stop/优先级组合 | `advanced-conditional-format/lifecycle.spec.ts` | icons combine with highlight until stop and priority exclude lower rules at 1280px |
| CFADV-029 | 下载/打开高级规则 | `advanced-conditional-format/lifecycle.spec.ts` | advanced rules survive workbook download and open without baked display metadata at 1280px |
| CFADV-030 | 英中界面保持图标数据 | `advanced-conditional-format/lifecycle.spec.ts` | advanced editor fits and preserves data through English and Chinese at 1280px |
| CFADV-031 | 隐藏行统计域 | `advanced-conditional-format/boundaries.spec.ts` | hidden numeric members remain in advanced visual statistics at 1280px |
| CFADV-032 | 合并锚点单图标 | `advanced-conditional-format/boundaries.spec.ts` | merged anchor renders the native icon once at 1280px |
| CFADV-033 | 冻结滚动单图标 | `advanced-conditional-format/boundaries.spec.ts` | frozen pane renders the native icon once while scrolling at 1280px |
| CFADV-034 | 格式刷隔离 | `advanced-conditional-format/boundaries.spec.ts` | format painter copies base formatting without copying conditional icons at 1280px |
| CFADV-035 | 原生高级图标种子 | `advanced-conditional-format/lifecycle.spec.ts` | native advanced icon seed displays without history at 1280px |

## 中英文清单（008合并）

组件已使用既有Lingui，不另建翻译层。以下en同源文，zh建议如下；现有Formula/Number等条目可复用已有翻译。

| English | 简体中文 |
| --- | --- |
| Icon set | 图标集 |
| Icon style | 图标样式 |
| Three arrows | 三箭头 |
| Three traffic lights | 三交通灯 |
| Three flags | 三旗帜 |
| Reverse icon order | 反转图标顺序 |
| Show icon only | 仅显示图标 |
| Minimum threshold type | 最小阈值类型 |
| Minimum threshold value | 最小阈值数值 |
| Midpoint threshold type | 中点阈值类型 |
| Midpoint threshold value | 中点阈值数值 |
| Maximum threshold type | 最大阈值类型 |
| Maximum threshold value | 最大阈值数值 |
| Lower icon threshold type | 图标下限阈值类型 |
| Lower icon threshold value | 图标下限阈值数值 |
| Upper icon threshold type | 图标上限阈值类型 |
| Upper icon threshold value | 图标上限阈值数值 |
| Automatic | 自动 |
| Lowest value | 最低值 |
| Highest value | 最高值 |
| Number | 数值 |
| Percent | 百分比 |
| Percentile | 百分位 |
| Formula | 公式 |
| Automatic icon thresholds are 33% and 67% of the full numeric range. Equal values enter the higher band. | 自动图标阈值为完整数值范围的33%和67%。等于阈值的数值归入较高档。 |
| Percent uses the minimum-to-maximum span; percentile uses the sorted numeric values. Threshold formulas use the first range’s top-left cell. | 百分比使用最小值到最大值的跨度；百分位使用排序后的数值。阈值公式以第一个区域的左上角单元格为上下文。 |
| Enter a finite threshold number. | 请输入有限的阈值数值。 |
| Threshold percentages must be between 0 and 100. | 阈值百分比必须介于0到100之间。 |
| Enter a valid threshold formula. | 请输入有效的阈值公式。 |
| Choose a valid three-icon set and thresholds. | 请选择有效的三档图标集和阈值。 |
| Expected an icon-set rule. | 此处需要图标集规则。 |

## 验收边界与待008验证

- C-01：真实Rust语义、Core单请求/错误/忙碌/取消、React字段正常/消失已专项验证。外观、焦点完整链及真实Worker DOM待统一E2E；无本地规则镜像。
- C-02：Rust一次历史/规则恢复、旧色阶/数据条极端数与Stop回归已验证；真正文件download/open、合并/冻结/隐藏、格式刷、英中/390px用例已持久化但未执行。
- 截图计划：lifecycle用例产出`advanced-en-1280.png`、`advanced-zh-1280.png`、`advanced-en-390.png`、`advanced-zh-390.png`；这些目前不是已捕获证据。
- 各新增/大改文件均低于300物理行，字段组件继承现有panel网格、CSS token与focus trap。没有新设计体系、controller props、React atom/useState/useReducer。
- 003没有运行全量Vitest、E2E、build/typecheck、wasm-pack，未commit/push。008需执行真实lite/full构件/API快照检查及全局命令。

## R1：缩短真实DOM测试数据准备（续跑）

- 008提供的诊断证据：新WASM下`hidden numeric members remain in advanced visual statistics at 1280px`原30秒预算超时；仅将诊断预算临时设为120秒后，原产品/原断言33.2秒通过，`A3=100`与数据条10%均成立。trace：`/tmp/react-excel-seven-cf-diagnostic.h1YpJk`。慢段为五格逐次GoTo/输入；这不是本轮自行运行的证据，也不是原生丢值。
- 本轮仅修改`e2e/advanced-conditional-format/support.ts`的`start`准备阶段：沿现有剪贴板测试惯例授予`clipboard-read/write`，真实Name box选择A1，写入系统剪贴板TSV `0\t20\t\n10\t\tNeighbor\n100\t\t`，点击真实Paste按钮，等待`Pasted cells.`和原生投影`data-projection-retained=false`。逐格断言A1=0、B1=20、A2=10、C2=Neighbor、A3=100及C1/B2/B3/C3为空，再沿原GoTo选择A1:A3。数字由原生TSV解析，C2保持文本，无Core atom/Worker/native workbook直接写入。
- `write` helper完整保留，后续B1=40触发阈值重算的真实输入不变；所有产品代码、CF用例正文/断言/标题、showValue/border样式、超时与skip设置均未改。
- 历史审计：准备阶段由5次输入变为1次Paste，少4条准备history；使用`start`的CF用例均按自身操作相对Undo/Redo，无依赖旧5条准备history的绝对计数/清栈断言。两处`Undo disabled`分别是`lifecycle.spec.ts:12`的种子用例（不调用start）及`:67`打开文件后的新历史，均不受影响；原断言保留。
- 静态收集：`pnpm --filter @einfach/react-excel exec playwright test e2e/advanced-conditional-format --list`，exit 0，70 tests / 4 files（35操作×1280/390）。本轮未启动浏览器、WASM、Cargo、构建或全量测试。
- 文件69行；当前SHA-256：`342df89f85b186374ca5ae7f32246fbf37efac4cbcbb4d141d9eda193a5eb573`。已做作用域空白检查；本轮仅此helper与本报告变更。
- 新fixture尚待008唯一浏览器窗口真实执行，不宣称实测耗时改善。优先原30秒预算窄跑`boundaries.spec.ts --grep "hidden numeric members remain in advanced visual statistics"`（1280/390）及`icon set number`的1280用例；必要共享fixture专项由008统一执行。
