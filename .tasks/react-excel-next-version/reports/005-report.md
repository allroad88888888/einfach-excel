# 005 高级格式交付报告

状态：领域交付完成，待007统一浏览器/图审/全仓验收；请求进入review并释放执行槽位。未commit/push。

## 共享接线契约（2026-10-21）

- JSON `kind:"text"` 的 `condition` 增加 `matches-wildcard`、`not-matches-wildcard`；旧四条件不变。`text` 仍为1–1024个Unicode标量，通配符为整值匹配、Unicode小写折叠、`?`消耗一个原Unicode标量，`~*`/`~?`/`~~`转义。奇数个尾部`~`拒绝，草稿保留可纠正；匹配预算沿用FindWildcard的16,000,000。
- JSON `kind:"duplicate-values"` 增加可选 `compareBy:"value"|"display-text"`；省略等同`value`且不补写旧文件。`display-text`只使用原生基础显示文字，保原空/空文本/错误/非有限值跳过策略；文本大小写不敏感、保空白，不含当前CF/locale/像素/颜色。
- Core 共享 `conditional-formatting/types.ts`：扩展`TextMatchRule.condition`并给`DuplicateValuesRule`增加`compareBy?`。新领域模块`advanced-formatting/snapshot.ts`导出`snapshotAdvancedFormattingRule(value: unknown)`供`conditional-formatting/snapshot-rules.ts`的text/duplicate分支委托；不实现TS匹配器。新`advanced-formatting/draft.ts`导出`advancedFormattingDraftError(rule)`供通用editor-draft按text规则调用。
- React 新`workbook/advanced-formatting/AdvancedFormattingFields.tsx`导出`AdvancedFormattingFields({idPrefix:string})`；直接读`nativeConditionalFormatPanelAtom`，全部字段复用`runNativeConditionalFormatAtom`的`{type:'draft',rule:{condition|text|mode|compareBy}}`。007用它替换ConditionalFormatTools原text/duplicate字段块，并给其TEXT_CONDITIONS规则列表标签增加两个新条件。
- Rust 007已在`workbook.rs`注册`#[path = "advanced_formatting/mod.rs"] pub(crate) mod advanced_formatting;`，`workbook_conditional_format_rule.rs`使用`NativeRuleKind::Duplicates(rule) => Some(rule.statistic())`；projection使用`rule.matches(value, statistic, &target.base_format_at(CellAddress::new(row, col)))`。不改public/WASM API。
- 基础格式依赖方案经root批准并已实现：每条相关启用规则/每个snapshot准备统计时，恰好一次规则范围稀疏同步数字display keys到原生format-input primitive；derived范围atom同时读取value facades与format-input。input仅存数字显示键及坐标，不存style、locale、像素或CF颜色，不扫描空网格/全部styles。输入未变复用派生统计；初次或输入变化时有同步+派生两次稀疏扫描。删除/替换同时释放primitive与derived，计入owned并有测试。

## 新文件职责计划

- Rust `advanced_formatting/wildcard.rs`：复用原生查找匹配器的整值通配符契约。
- Rust `advanced_formatting/comparison.rs`：定义原值/基础显示文字的判重键。
- Core `advanced-formatting/snapshot.ts`：保存新增rule wire字段。
- Core `advanced-formatting/draft.ts`：返回可纠正的文字草稿错误。
- React `workbook/advanced-formatting/AdvancedFormattingFields.tsx`：显示新增条件格式字段。
- 各层`advanced-formatting/`专项测试；Rust`tests/advanced_formatting/`按匹配/显示/生命周期拆分。

调用链：React字段DOM → 现有Core草稿/保存command atom → 现有Worker/WASM conditionalFormat.change → Rust解析/范围atom/投影 → 现有Core投影atom → React。

## 已实现的边界

- 通配符复用`FindWildcard`，整值匹配，`?`消耗一个原Unicode标量；Unicode小写折叠、保空白，不做完整case folding/地区比较/Unicode归一化。预算沿用16,000,000；超预算的正反规则都不命中。原四字面量条件不变，包括字面量尾`~`。
- 数字基础显示直接使用现有`CellFormat::format_number`，文字/布尔用`value_to_display`，没有第二套formatter。原始值默认保留类型；基础显示可以把数字1/文字1、布尔TRUE/文字true合并；百分比、日期、舍入有对照。同原值不同基础格式可判唯一。
- 空/错误/非有限值跳过，数字格式生成空文字也跳过。当前CF不会参与key；保留优先级/Stop、启停、复制、编辑、清除、结构随动、保护与原历史/文件链路。异步结算与离屏公式已实测刷新。
- Core只新增wire snapshot和可纠正文字草稿校验，不实现匹配器。现有native panel保存由Rust返回校验错误，保留草稿；generic editor调用新增draft helper。
- React字段沿用现有panel设计tokens、fieldset grid、焦点与窄屏滚动，不建本地atom/useState/controller。新字段组件对接现有唯一command，不增加运行层。

## 专项验证（实际）

源基线`b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb` + 本任务当前工作区；原始证据根`.codex-artifacts/react-excel-next-version.11oYiO/`。

| 命令 | 实际结果 | 证据 |
| --- | --- | --- |
| `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test advanced_formatting --test conditional_format_text_duplicates --test conditional_format_stop --test advanced_conditional_format` | 新12 + 旧20 = 32 passed；0 failed | `005-native-targeted.log` |
| `pnpm --filter @einfach/spreadsheet-ui-core exec vitest run test/advanced-formatting` | 2 files / 6 passed | `005-vitest-targeted.log`，17:12:10工具原输出抄录 |
| `pnpm --filter @einfach/react-excel exec vitest run test/workbook/advanced-formatting` | 1 file / 3 passed | 同上 |
| 领域ESLint、行数与空白检查 | ESLint退出0；新/大改文件均≤300；tracked diff与全部领域untracked新增文件空白扫描无输出 | `005-source-fingerprints.txt`记录26个产品/测试文件SHA256 |

初次native编译出现本域错误：wildcard字段误放JSON struct、CellAddress不实现Ord；已修为运行态字段与HashMap，后续上述32项全部通过。未改其它领域文件。第一次领域lint发现2条max-len，已仅换行，无行为变化，因此复用已有Vitest证据。原生专项在007授权窗口执行后已释放，无并发Cargo/WASM/browser。

## E2E交接（未跑，不能计passed）

root裁决使用现有registry合法ID `AFMT-001..005`，五个新主标题已全部同步；不扩全局checker。每项另有390px变体。

| ID | file（`e2e/advanced-formatting/`） | 精确主标题 |
| --- | --- | --- |
| AFMT-001 | `wildcard-match.spec.ts` | `AFMT-001 toolbar wildcard match preserves Unicode and escapes at 1280px` |
| AFMT-002 | `wildcard-not-match.spec.ts` | `AFMT-002 toolbar wildcard non-match uses whole text and skips errors at 1280px` |
| AFMT-003 | `display-duplicates.spec.ts` | `AFMT-003 toolbar duplicate rule compares native base display text at 1280px` |
| AFMT-004 | `display-unique.spec.ts` | `AFMT-004 toolbar unique rule distinguishes equal values with different displays at 1280px` |
| AFMT-005 | `format-invalidation.spec.ts` | `AFMT-005 number format changes immediately refresh display duplicates at 1280px` |

共22个真实case（早前消息误报24，以此清单实际为准）：五主×两宽10，invalid/correction×两宽2，生命周期四项×两宽8，布局×两宽2。全部从真实File新建/clipboard paste/工具栏建规则，不使用Core直写浏览器helper；每个主case断言邻格原值与显示不变。

生命周期覆盖复制/启停/编辑/清除/Undo/Redo、真实文件download/open、基础数字格式恢复后立即重判、结构随动、旧字面量与通配符切换。原生专项另覆盖Stop/优先级、非连续范围、spill、行列基础格式优先级、离屏统计和异步结算。未新增demo seed，保留原Sales/Summary/旧种子。

`layout.spec.ts`生成8张：`advanced-formatting-{text|comparison}-{en|zh}-{1280|390}.png`，位于Playwright`info.outputPath`。需007逐张看实际图后签视觉结论。未运行/未宣称`.shared/visual-runtime`；使用现有真实Playwright截图链路。构建/WASM/公共签名/最终完整E2E统一由007执行。

## Lingui共享

所有新UI文案在领域组件的t/Trans中，由007统一extract/strict compile。建议译名已发：匹配通配符、不匹配通配符、比较依据、原始值和类型、基础显示文本。新增Rust反馈`Finish the wildcard escape with *, ? or ~.`已通知007统一登记。

## 真实浏览器r1前置纠正

007影响集r1自然max5结束（非整版结果）。本域AFMT-003的8格基础显示高亮断言均已通过，随后原值条预期`1`、实际`="1900-01-01"`失败；原始证据为`007-e2e-impact-r1.json`及`007-e2e-impact-r1/advanced-formatting-displa-7f729-base-display-text-at-1280px/error-context.md`。

只读核对`spreadsheet-ui-core/src/go-to/index.ts:333`的`applyGoToTargetAtom`确认：范围GoTo保持anchor=start、focus=end；`A1:A8`活动格A8显示其原公式符合既有契约。新测试错误地把范围活动格假定成A1，产品没有发生该错误。

root/007确认r2明确排除本域目录、该新spec不被当前进程收集/import，并授权精确冻结例外后，仅在`display-duplicates.spec.ts`8格高亮断言之后插入真实`await go(page, 'A1')`，再执行原`toHaveValue('1')`。未删除或放宽原值、邻格、8格高亮、value比较及后续公式断言，未改旧GoTo、src、共享support、config或WASM。五个primary标题与注册保持不变。

逐项检查本域所有新`valueInput`原值断言：wildcard-match、format-invalidation、lifecycle及AFMT-003后续A3/A4均已有真实单格GoTo，没有发现第二处相同假设。按本轮指令未扩大修改、未重跑Core/native/browser；原专项证据继续适用，本次E2E绿证仍由007独立取得。

修改后立即freeze并通知007。单文件新SHA256保存在`005-r1-correction-fingerprint.txt`；`005-source-fingerprints.txt`保留首次交付原始指纹供r1红证追溯，不覆写历史证据。

## 真实浏览器r3插行case前置纠正

007明确确认r3 PTY12236已自然结束exit1，整轮113pass/4fail，本域20/22实际通过；余下两宽为同一插行case失败，原始JSON/trace/error-context保存在`007-e2e-impact-r3`。两宽失败点均为插入后A1仍高亮，DOM内容仍是`a*`；不能据此宣称条件格式随动失败，因为原插入操作已被既有画布上限拒绝。

只读核对`rust-workbook/structure-geometry.ts:28`：插入会增长宿主rowCount，超过1,048,576时正确拒绝。该case通过已有`start()`的真实New blank workbook路径建立完整画布，原前置没有可插入容量。root已核该既有约束，本轮没有修改上限或产品行为。

收到007/root自然退出确认后，仅修改新`e2e/advanced-formatting/lifecycle.spec.ts`同一个插行case，新增16行、无删除或预期放宽：

1. 建CF规则之前，通过真实GoTo定位`A1048576`；确认原值条为空、末格DOM为空，确认`data-row-count=1048576`。调用既有结构工具的`delete-rows`，等待画布精确变为`1048575`，再回A1走原建规则和插行链路。
2. 原insert-rows之后，新增`row-count=1048576`、A1空/A2=`a*`/A3=`abc`断言确认实际插入成功；保留A2范围、邻格B2=`Neighbor`、A1不高亮/A2高亮的原断言。
3. 原一次Undo之后，新增`row-count=1048575`、A1=`a*`/A2=`abc`及CF目录范围A1断言；保留原高亮恢复与B1邻格不变断言。前置删行在建规则之前完成，不会让该Undo回退到容量准备操作。

source、shared、support、seed、config、WASM均未修改；primary标题/ID与E2E总数不变。改完已立即freeze交007，没有运行浏览器、没有重复Core/native，没有派agent。既有专项证据继续复用，本次真实绿证由007独立执行后补入整体验收。

原文件SHA256 `f9fcb16e5132408e9ee086f46cf0d4c2e75dce21ca13554ea55b8f160643d19a`；新指纹保存在`005-r3-correction-fingerprint.txt`。文件101行；no-index新增文件空白检查没有告警（正常diff退出1）。首次交付指纹与r1红证继续保留，不覆写。
