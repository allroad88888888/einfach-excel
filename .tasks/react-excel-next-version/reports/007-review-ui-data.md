# 007 独立界面与数据规则审查

状态：源码/稳定专项及下述两轮精确补审完成，**当前未关闭 0 Critical / 0 Important / 0 Minor**；UI-DATA-01 已在 R1 关闭，003/004/005 共 24 张布局图已实际查看。003 更正后的 FARG-003、005 row-insertion 红证纠正、最终相关 delta 与单一完整验收过程仍待 007；本文不是整版签字。以下首轮发现与证据缺口保留为历史，以末尾补审结论为准。审查人 `/root/next_review_ui_data`，2026-10-21。

## 范围与证据身份

按 007 末尾独立委派入口审 003/004/005 及关联共享接线，完整读取 index、三份任务、三份领域报告、007 报告和指定四份技能。产品只读；唯一写本文；未运行全仓、Cargo、WASM 或浏览器，未派子 agent。学习项目技能继续暂停。

基线 `b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb`，工作树尚有其它 owner 合流；本次按实际 tracked diff 和 untracked feature 源码审阅，不把报告清单代替代码。原始证据根 `.codex-artifacts/react-excel-next-version.11oYiO/`。

实际读取并核对的稳定结果：

| 领域 | 证据 | 实际结果 / 使用边界 |
| --- | --- | --- |
| 003 | `003-core-vitest.json`、`003-react-vitest.json` | JSON success=true，17 Core / 5 React，failed=0；包括 502 个已有 full artifact 真签名展开，未当作全部函数语义计算通过 |
| 004 | `004/core-vitest.json`、`004/react-vitest.json`、`004/native.log` | 53 Core / 15 React / 67 native，failed=0；原生 8 文件结果 15+25+5+7+2+3+5+5；不掩盖下述未覆盖的兼容性回归 |
| 005 | `005-vitest-targeted.log`、`005-native-targeted.log` | 6 Core / 3 React；新 12 + 相邻 20 native，failed=0；Vitest 日志明确是工具原结果抄录，非 JSON |
| 007 | `007-filter-groups-wiring.log` 及报告 | 共享接线 5 项；仅补充 DTO/种子/投影形状，不代替完整 Table 文件 wire |

复用专项，不为亲验重复运行。额外只运行下面列出的只读 Node 叶子校验 probe、原始 JSON/指纹核对和源码检查。

## Important：新增选择预算收紧了旧 flat 持久条件

**UI-DATA-01，Important，待 004 修复。** 主因 `excel/spreadsheet-ui-core/src/advanced-filter/contracts.ts:17`：通用 `validFilterCondition` 的 list 分支调用新增 `filterSelectionWithinBudget`，把 1 MiB 新选择预算变成所有旧持久列表的有效性条件。

传播位置：

- `excel/spreadsheet-ui-core/src/rust-workbook/filter-commands.ts:61`：原 `validFilterRules` 全部委托该叶子校验；基线只限最多 1,000 值、每值最多 32,767 UTF-16 单元，没有 1 MiB 合计限制。
- 普通筛选：`excel/spreadsheet-ui-core/src/projection/contracts.ts:245` 拒绝原生返回的旧 `filterRules`。
- Table：`excel/spreadsheet-ui-core/src/tables/native-types.ts:88` 先调用同一 `validFilterRules`，随后 `projection/contracts.ts:228` 拒绝整份 Table 投影；初始 Table seed 的 `runtime/rust-workbook-definition.ts:116` 也受到相同收紧。
- 原生旧 flat 恢复 `excel/rust/excel-core/src/workbook_filter_engine.rs:203` 仅新校验 groups 并保持旧 flat 契约；Table wire 同样保留旧 flat 分支。因此是原生接受旧文件、Core 拒绝随后显示投影的契约不一致，不能称为导入前主动迁移。打开替换链先发布新工作簿，随后投影被拒绝，旧合法文件无法正常显示/继续筛选。

触发数据只需 40 个不同字符串，每项 `String(i).padStart(2,'0') + 'x'.repeat(30000)`；每项 30,002 字符，总计含选择条目开销 1,201,040 字节，远低于旧 1,000 项/32,767 字符及工作簿 64 MiB 上限。旧 UI 的逐项/Select page 路径也可创建此条件；已对照基线 `filter/values.ts` 与 `validFilterRules`，不是只能手造的非法文件。

实际只读 probe（导入当前产品叶子函数，不运行 WASM/浏览器）：

```sh
node --experimental-strip-types --input-type=module -e 'import { validFilterCondition, filterSelectionWithinBudget } from "./excel/spreadsheet-ui-core/src/advanced-filter/contracts.ts"; const values = Array.from({length:40}, (_, i) => String(i).padStart(2,"0") + "x".repeat(30000)); const rule = {kind:"list", colIndex:0, values}; const oldListCheck = values.length <= 1000 && values.every(value => typeof value === "string" && value.length <= 32767); console.log(JSON.stringify({count: values.length, utf8Bytes: values.reduce((sum,value)=>sum+new TextEncoder().encode(value).length+24,0), baselineListCheck: oldListCheck, currentActualLeafCheck: validFilterCondition(rule,8), currentSelectionBudget:filterSelectionWithinBudget(values)}));'
```

exit0，原输出：

```json
{"count":40,"utf8Bytes":1201040,"baselineListCheck":true,"currentActualLeafCheck":false,"currentSelectionBudget":false}
```

风险：旧普通筛选或旧 Table 文件的列表条件有效性发生未授权变化，加载/历史投影无法通过 Core 校验；还可能迫使用户丢弃已存选择才能重应用。现 004 专项只测新预算拒绝，缺少旧 flat 大列表读回。

最小建议：恢复旧 flat 存储/投影形状的原上限；把新完整搜索返回及新 UI 选择的 1 MiB 拒绝留在现有命令边界，不放宽新 allMatches 预算，不静默截断或改写旧值。补普通与 Table 的旧 flat 大列表 projection/读回专项，确认拒绝新扩张不会破坏已有条件；无需全量迁移旧文件。root 已核实并接受本项，修复交原 owner，本 reviewer 不代写产品。

## 按原验收逐项核对

以下 ✅ 仅代表已读源码及列明的稳定专项支持该边界；真实 DOM/Worker/WASM 或视觉未运行的部分单列待验。

| 验收 | 源码 / 稳定专项结论 | 真实验收状态 |
| --- | --- | --- |
| A-01 必填、可选尾部及中间空位 | ✅ `formula-arguments/layout.ts:41` 保留原表达式，不 split 逗号；只剪未使用尾位；XLOOKUP 空位、引号/嵌套/数组/跨表输入专项明确 | FARG-001..003 等待真实浏览器 |
| A-01 重复组、固定尾参、零参数、自定义表达式 | ✅ layout/panel 插入删除发生在 repeat.start + group*length；LET suffix 保留；可选 minGroups=0 与 SORTBY 组内可选项已有专项；502 个签名使用同一元数据；缺签名不冒充零参数 | FARG-004..006、009..010 等待真实浏览器 |
| A-02 目标身份、busy、保护、纠错草稿 | ✅ `panel.ts:34` 同时约束连接、authority、sheet 与当前 spec；确认重新过 mutation gateway；表命令 busy 禁改；保护拒绝不清草稿；切表返回、换连接、签名改变均有专项 | 保护/原生数据验证拒绝纠正等待真实浏览器 |
| A-02 原编辑/取消/焦点/零历史 | ✅ confirm 只交 `startEditingAtom`；不发送工作簿 mutation；React 首焦点、Tab 循环、composing Escape、取消回 ƒx 和成功交原 FormulaBar 已有 React 专项 | FARG-007..008、011..012，下载前后 workbook 相等、Enter 一次 Undo/Redo、原生文件往返待真实浏览器 |
| F-01 AND/OR、非空组、预算 | ✅ `advanced_filter/mod.rs` 一份借用谓词；组内 AND/组间 OR，8/8/32、空组/非法列/数值拒绝在扫描前；native/Core 覆盖同列交集、单组等价与失败 redo 保留 | AFILT-001..005 等待真实浏览器 |
| F-01 搜索跨页全选/取消、错误恢复 | ✅ `filter/values.ts:88` 一次 allMatches 请求；检验完整 total/offset/revision/唯一成员/预算后整次替换；pending 对象与连接/表身份拒迟到结果；失败保原页/选择；原生 50k/1000/1MiB 不截断 | AFILT-006..007；1000 匹配合并已有值超额拒绝、缩小查询纠正待真实浏览器 |
| F-02 普通范围/Table 隔离、重应用、history | ✅ 原生范围扫描与 Table prepare 共用谓词；原手工隐藏与 header/totals 保留；先 scan/prepare 再 commit，一次原生 history；结构随动不重扫；源值变化须显式 reapply；原生普通/Table undo/redo、保护/范围外专项支持 | AFILT-008、普通范围/双 Table/保护纠错待真实浏览器 |
| F-02 旧 flat 文件兼容 | ❌ UI-DATA-01；新预算误进持久形状校验，旧普通与 Table 均受影响 | 修复及最小专项待 owner；普通 groups 文件重开也待真实浏览器 |
| F-02 新 Table groups 文件 wire | ✅ 源码 `wasm_table_wire.rs` 明确 rules/groups 互斥并保留 groups；Table metadata history/reapply 分支与 Core 投影均已接 | 待补实际 Table groups 下载→重开。现新文件用例只对普通 groups 保存/重开，双 Table 用例没有文件步骤；native Table clone/history 不能代替该新增 wire |
| S-01 通配符 Unicode/转义/预算 | ✅ 复用 FindWildcard，整值匹配，`?` 消耗原 Unicode 标量，~*/~?/~~；奇数尾 ~ 可纠正；预算错误正反均跳过；四旧字面量策略不变；原生/草稿专项含 İ、emoji、空文字、错误与超额 | AFMT-001..002 及 invalid/correction 等待真实浏览器 |
| S-01 原值/基础显示判重 | ✅ compareBy 省略保持 value；display_key 使用既有 formatter/value_to_display，不引入 TS 匹配器；值类型保真；数字/文字1、百分比/日期/舍入/布尔、空/error/非有限/空显示均有原生专项 | AFMT-003..004 等待真实浏览器 |
| S-02 基础格式依赖、清理、优先级/结构/history | ✅ 每条相关启用规则/每个 snapshot 一次稀疏数字 key 同步；派生仍读原 value facades；只存计算键，不复制 cell/row/column style；离屏数字格式、row>column、spill、async settlement、格式 Undo/Redo、Stop 与 replace/remove 两 atom 释放已测 | AFMT-005、启停/复制/清除/结构、原生文件下载重开及通用保护回归待 007 |
| A/F/S UI 双语/窄屏/键盘/错误 | ✅ 源码沿用 tokens/native dialog 与既有命令；无 React useState/useReducer/store 直读写/atom 镜像；组件字段语义标签及 focus 边界可定位；feedback 已登记 | **待截图及真实浏览器**，不按 CSS 或文件名签视觉质量 |

## 入口覆盖与视觉待验

实际逐个对照三域主测试的 DOM 交互与 FEATURES 精确 file/title：FARG-001..012（12）、AFILT-001..008（8）、AFMT-001..005（5），共 25 个独立主绑定。参数类保留旧 picker `Insert draft`；分组修改复用旧字段；搜索全选走真正 Select all search matches；格式规则通过工具栏建/改规则，不是浏览器 helper 直接 dispatch Core。

只读比较 `git show b2ab6a1a:excel/react-excel/e2e/FEATURES.md` 与当前合法三位 ID 行：原 **955/955 file/title 完全保留**，当前 998 条（含其它三域）。原 Sales Orders、Summary 及 plain-sales-orders fixture 对基线无文件 diff；本三域未加 demo seed、未动 66 合并/128 列数据。

准备的真实 case 为 003 **19**、004 **24**、005 **22**，合计 65；是源码盘点，不是通过数。证据根目前没有这些域的 `.png` 或 Playwright 结果 JSON。应由 007 运行并逐张看：

- 003：`formula-arguments-{en|zh}-{1280|390}-{top|footer}.png`，8 张；确认长 LET 首尾可达、输入/错误/按钮不裁切、成功 FormulaBar 焦点和取消回触发器。
- 004：`advanced-filter-{en|zh}-{1280|390}-{top|footer}.png`，8 张；确认分组层次、搜索操作、错误/计数和 Apply/Cancel 两端可达、Tab/Escape。
- 005：`advanced-formatting-{text|comparison}-{en|zh}-{1280|390}.png`，8 张；确认现 panel 字段长说明、Unicode 示例、比较选择器与错误恢复。真实 footer/滚动状态仍应结合实际截图/DOM 检查。

`.shared` 不存在，未谎称 visual-runtime 或 visual lint 已跑。最终 Lingui extract/strict compile 也由 007；已核对三域新 feedback 在共享映射和 zh PO，当前登记不等于最终词典/截图通过。

## 最短链路与成本

003：picker DOM → runFormulaArgumentsAtom → Core 参数草稿 → 原 startEditingAtom → 原 Enter → Worker/WASM 单格历史。Rust 仍持有公式/结果；不存在临时预览工作簿。

004：分组/候选 DOM → Core 既有面板草稿 → 原 sheet.filter/table.change 或 sheet.filterValues → 原生借用 FilterCriteria/扫描/事务 → 返回投影。groups 与 rules 非空互斥；flatten 仅供头部展示，没有第二份提交事实。

005：字段 DOM → 原 conditionalFormat.change → 原生规则/统计 → 返回格式投影。format-input 是数字显示 key 与坐标，不是样式镜像；每次相关快照仍要同步一次稀疏成员，首次/输入变更再派生扫描一次，是已裁决并如实记录的成本。

新 feature 源/测试按实际物理行检查，无新普通文件超过 300 行；003 最大 140，004 独立目录最大 112，005 独立目录最大 94。`filter.rs`/共享 panel、projection 等存量超限文件仅必要接线，未将其当作新复杂文件豁免或扩大重构。

## 快照指纹与后续 delta

按排序路径 `SHA256(path + NUL + bytes + NUL)`，当前只读快照：

| 范围 | 文件数 | SHA-256 |
| --- | --- | --- |
| formula-arguments 各层源码/测试/E2E/文档目录 | 17 | `75b055e224f17c057e153c6159fa4d120f372b627e0a4504146772c26ec5af0b` |
| advanced-filter / advanced_filter 各层独立目录 | 31 | `2409f86bd84ef04107eeaee1c9debfad1dc039754861e6832a68c2988922df44` |
| advanced-formatting / advanced_formatting 各层独立目录 | 22 | `d2b8bbe839df1a0bf72c78a2747768912bdd673805b5c41569eb018926a76104` |

004 `source.sha256` 的 51 项已核对：仅两项与领域交付指纹不同，均是 root 已告知的 007 授权最小 delta，并已读当前源码：

- `e2e/advanced-filter/layout.spec.ts`：`957cafa4...` → `cefc2dffb73532c56cf73be71b8aec280a21f7aaeb08538c9d369ec3d5acff38`；遮蔽导入函数的 Locator `apply` 改名 `applyButton`，避免 TDZ，未改断言。
- `spreadsheet-ui-core/src/advanced-filter/contracts.ts`：`db0eed44...` → `d6bf1749bfbc6658759c0cc9e1a2dd156343be8aca72ad5251873b228c31f700`；reduce 参数补 number/string，仅类型修正。UI-DATA-01 是原实现已有问题，不由此 delta 引入。

005 `005-source-fingerprints.txt` 全部 **26/26** 与当前文件一致。003 当前16个源/测试/E2E聚合 `6e62d972d60fd682a57579de19ac58d2b5558ffea87a20a2f072aa8fd19d2308` 与领域旧聚合不同；已确认 007 授权 dialog.test.tsx 删除无效 getByRole exact 选项（当前该文件 `986529068cdd8b4d5e4a06a990b5d5641ab8634532bda017af9e540949dd837a`），断言未变。

后续只需补审 UI-DATA-01 修复及关联专项、Table groups 文件真实证据、007 最终相关共享 delta、24 张实际截图与统一浏览器结果。本文保留首轮发现，不提前关闭 Important，不以候选快照替代最终冻结。

## R1 精确补审：UI-DATA-01 关闭

2026-10-21，按 root 指定范围复查 004 报告末尾 R1、唯一生产修复及三个测试文件、原始红绿 JSON 和四文件指纹。**UI-DATA-01 已关闭；当前未关闭 Critical 0 / Important 0 / Minor 0。** 此结论更新首轮历史状态，不代表 F-02、其它两域或整版浏览器验收完成。本轮未改产品、未重跑专项/Cargo/WASM/浏览器，未派 agent。

修复边界核对：

- ✅ `spreadsheet-ui-core/src/advanced-filter/contracts.ts:17` 恢复旧 flat list 的 1,000 项、每项字符串不超过 32,767 UTF-16 单元形状限制。没有给旧列表追溯 1 MiB 总限额，也没有放宽原计数/字符上限。因此现有 `validFilterRules` 的普通与 Table 投影调用、旧 Worker apply/reapply 可沿原契约保留完整列表。
- ✅ `contracts.ts:34` 在新 groups 路径显式保留每个 list 的 1 MiB 选择限额；groups 8/8/32、总保留体积 8 MiB 等拒绝仍在。不存在新增状态、迁移镜像或第二套运行层。
- ✅ `filter/values.ts` 本轮未改，SHA-256 仍为首轮已审的 `8b7601f609d3414b85d12eb883698cd4f748799ad03c85caca71d94dffddf978`。allMatches 完整响应与合并后的预算、select-page/toggle 新选择预算继续在 UI 命令边界执行，拒绝保留草稿/当前页且不调用 Apply。

实际读取原始结果，而非只采用领域报告结论：

| 证据（相对证据根 `004/`） | 核对结果 |
| --- | --- |
| `review-r1-red.json` | success=false，3 文件 / 19 项，16 passed / 3 failed；失败恰是 ordinary projection、Table projection、Worker apply 三个旧 flat 大列表入口 |
| `review-r1-core-vitest.json` | success=true，9 文件 / 67 项，67 passed / 0 failed；包括新增旧契约 4 项、groups 预算 1 项、搜索选择预算 4 项及既有接线回归 |

已读新增测试：普通/Table projection 均覆盖缺省 groups 和显式空 groups；旧 flat 1,000 项/32,767 字符上限保留；Worker apply 完整传原列表后可 reapply。新预算测试覆盖 allMatches 响应自身超额、合并后超额、当前页全选/toggle 超额，失败保旧选择/页、不写原生，缩小查询可纠正。现有 Rust flat 解析和持久化未改变，本轮以该最小 Core 影响集关闭错误收紧；真实文件往返仍在最终验收账本中。

`review-r1.sha256` 四项 **4/4 与当前文件一致**：

| 文件（相对 `excel/spreadsheet-ui-core/`） | SHA-256 |
| --- | --- |
| `src/advanced-filter/contracts.ts` | `dc05d224bd309480374a50500eca7c3b7abd6b0e9200f0281117848b339914ae` |
| `test/advanced-filter/contracts.test.ts` | `3e4c634f08ab8675e3c68140299c4a8e3d6b0dac998e8fb4e41b2da2b839dab5` |
| `test/advanced-filter/search-selection.test.ts` | `ffe8b4e5364cad2b8c85cd757e04e5f075beb7ea3483acfc3c51f39ba4ee8238` |
| `test/advanced-filter/legacy-list-compatibility.test.ts` | `aa522a7ae3ed568a61ed46357fe95da36240c000db570c29f4600aefecaf40c3` |

### 已实际查看的高级筛选 R1 图

逐张打开证据根 `007-e2e-impact-r1/` 中八张原图，不以文件名、DOM 断言或 root 已看记录代替本次视觉检查：

| 子目录 / 图片 | 本次观察 |
| --- | --- |
| `advanced-filter-layout-adv-4b203-h-controls-fit-en-at-1280px/advanced-filter-en-1280-{top,footer}.png` | 已看两张。完整英文说明换行、列/条件输入对齐；搜索选择/计数可见；滚动末端 OR 第二组与 Apply/Cancel 完整 |
| `advanced-filter-layout-adv-a74b3-h-controls-fit-zh-at-1280px/advanced-filter-zh-1280-{top,footer}.png` | 已看两张。中文组/且/或层次明确，搜索操作正常换行；末端组操作与应用/取消未被遮挡 |
| `advanced-filter-layout-adv-3c99f-ch-controls-fit-en-at-390px/advanced-filter-en-390-{top,footer}.png` | 已看两张。面板留约 16px 侧边距，长说明/搜索操作换行；无字段/按钮横向裁切，第二组与底部按钮可通过面板纵向滚动到达 |
| `advanced-filter-layout-adv-3dc06-ch-controls-fit-zh-at-390px/advanced-filter-zh-390-{top,footer}.png` | 已看两张。中文说明和搜索计数留在面板内，组框/输入/操作无横向溢出；末端应用/取消完整可见 |

四个对应 layout case 在 `007-e2e-impact-r1.json` 中实际 passed，且原用例含 Tab 循环及 Escape 关闭检查。该图只证明所拍两组/两候选状态的排版；未替代 1,000 候选跨页或错误/busy 的真实行为证据，未做数值对比度 lint，未声称不存在的 `.shared` 工具已执行。

R1 JSON 已核对：forbidOnly=true、workers=1、retries=0，整体自然结束为 **20 passed / 5 failed / 152 未执行**，不是整版通过。004/005 当前另修新 E2E 夹具/数据预期，不纳入本次生产修复签字；本次未审这些尚在变化的测试为最终结果。

剩余：Table groups 的真实下载→重开往返、003/005 共 16 张实际图及真实浏览器、004 非布局案例的失败纠正/后续真实结果、最终相关共享 delta 与单一完整验收过程。高级筛选上述 8 张图的本次视觉观察可复用；相关产品若再变须按精确 delta 补审。

## 真实截图及新测试精确补审

2026-10-21，完整重读最新 index、007 最后新增委派入口及 003/004/005/007 报告，复用已关闭的 UI-DATA-01 和已看过的 004 八图。本次只读现存完整 PNG、原始 JSON/trace、准确测试 delta 及必要既有契约；只写本文，未改产品、未运行或等待浏览器、未重跑专项/Cargo/WASM，未派 agent。**本次范围无新增 Critical / Important / Minor，不改变整版未完成状态。**

### 003/005 十六张原图已逐张实际打开

通过 `rg --files` 发现实际 hash 子目录，再分别用图片查看工具打开全部 16 张；没有以 007 已看、文件存在或 DOM 无 overflow 代替观察。下表路径均相对原始证据根：

| 图片路径 | 实际观察 |
| --- | --- |
| `007-e2e-impact-r2/formula-arguments-layout-a-b8927-d-controls-fit-en-at-1280px/formula-arguments-en-1280-{top,footer}.png` | 两张均已看。LET 签名、英文长说明、组内 name/value 必填、固定 calculation、红色重复组错误和蓝色输入焦点清楚；取消/生成及 Enter/Escape 后续提示完整 |
| `007-e2e-impact-r2/formula-arguments-layout-a-a0441-d-controls-fit-zh-at-1280px/formula-arguments-zh-1280-{top,footer}.png` | 两张均已看。中文说明、必填标记、组框、固定尾参和底部两动作完整；错误不与按钮重叠 |
| `007-e2e-impact-r2/formula-arguments-layout-a-47c03-nd-controls-fit-en-at-390px/formula-arguments-en-390-{top,footer}.png` | 两张均已看。约 12px 外侧边距；表达式/参数长说明及错误正常折行；字段、Add argument group、calculation 与取消/生成均无横向裁切。帮助摘要中的长实现限制只露出首段，是独立帮助滚动区，不把本图称为全文已展开 |
| `007-e2e-impact-r2/formula-arguments-layout-a-bbd33-nd-controls-fit-zh-at-390px/formula-arguments-zh-390-{top,footer}.png` | 两张均已看。中文组内说明/错误、固定尾参、底部按钮及公式栏交接提示均可读，输入焦点未被边界裁切 |
| `007-e2e-impact-r3/advanced-formatting-layout-86191-glish-and-Chinese-at-1280px/advanced-formatting-{text,comparison}-en-1280.png` | 两张均已看。英文通配符/Unicode/~ 转义和保空格说明、基础显示比较说明正常换行；两个字段状态的范围、选择器、Stop、颜色和取消/添加完整 |
| `007-e2e-impact-r3/advanced-formatting-layout-86191-glish-and-Chinese-at-1280px/advanced-formatting-{text,comparison}-zh-1280.png` | 两张均已看。中文通配符及基础显示比较标签与解释均可读，控件列对齐、底部动作不遮挡 |
| `007-e2e-impact-r3/advanced-formatting-layout-74ae0-nglish-and-Chinese-at-390px/advanced-formatting-{text,comparison}-en-390.png` | 两张均已看。窄屏英文说明多行仍完整；比较依据、Stop 提示、颜色输入与取消/添加均在窗口内，无横向溢出。原生 Rule type 选中项长文本有选择器内缩略，不影响所拍新字段标签/说明 |
| `007-e2e-impact-r3/advanced-formatting-layout-74ae0-nglish-and-Chinese-at-390px/advanced-formatting-{text,comparison}-zh-390.png` | 两张均已看。中文说明/比较选择器换行正常，左右留白与控件边界清楚，底部取消/添加完整 |

上述 PNG 都实际为 1280×850 或 390×850。排序相对路径后按 `SHA256(relativePath + NUL + bytes + NUL)` 得 16 图快照指纹 `685156f7857349dc7eed17e4c6a9e5633c6a1d33d6dcd79f4d98d96f73315f29`。

003 的四个对应 layout case 在 r2 原始 JSON 均 actual passed；已读用例保留首焦点、Shift+Tab/Tab 循环、必填错误聚焦、全可见取消/生成、Escape 返回触发器以及零 Undo/未写值断言。005 两个双语 layout case 在 r3 JSON 均 actual passed，并保留无 pageerror、无横向 overflow 和邻格检查。003 的 `formula-parameter-help.is-compact` 仍沿已有 `overflow-y:auto`，本域只限制其 160px 高度；本次静态 PNG 未实测帮助区滚动，不声称英文实现限制全文已在图中可见。两组 top/footer 在窄屏实际相同画面，不能冒充新增长多组表单的不同滚动位置。

结论仅覆盖所拍 LET 单组必填错误与条件格式两类字段排版，不以截图推断 1,000 候选/预算、保护、busy、所有函数或结构生命周期都已通过；未运行不存在的 `.shared` 视觉工具或数值对比度 lint。

### 四个冻结新测试 delta：准确行为断言保留

已逐行读当前文件，并在内存逆替换获准的精确修改；四项逆替换后的 SHA-256 **全部精确等于修改前指纹**（004 原 `source.sha256`、005 原 `005-source-fingerprints.txt`、003 报告所留修改前单文件 SHA），没有写回文件。当前指纹也全部等于各 owner 的冻结交付：

| 文件（相对 `excel/react-excel/e2e/`） | 当前 SHA-256 |
| --- | --- |
| `advanced-filter/clear-search.spec.ts` | `d300ad766880bd5c7be24a579c54b674d7cd7053fb313c921a948c7aa3747450` |
| `advanced-filter/select-search.spec.ts` | `edacaf3c4c50e0a720cdcaaefb7a993d9c57daa3baa2ceeef6ff2591e3817a74` |
| `advanced-formatting/display-duplicates.spec.ts` | `61bf0485d4e240ffb934ab65915036fd0b2a096a8e87c717ff5081f4a64bc13f` |
| `formula-arguments/native-calls.spec.ts` | `6cf4f4a1a5106a3770d5885218c0d8326b4675a3a066cffcc133c9062445df67` |

- **004 搜索数量与页首修正可接受。** 已读旧 `import-seed.ts:94`：第 3 个 dataRow 的编号始终为文本 `00123`，因此 SO-10003 不存在；SO-10=998、SO-100=98，差集仍为 900。第一页 50 个候选跨过缺号后止于 SO-10051，第二页应从 SO-10052 起。测试仍精确核对 998、900、第二页 checked、远端 SO-10999 checked、Apply 隐藏尾行以及一次 Undo/Redo，未改主标题或调宽计数。
- **004 等全选结算后换查询可接受。** 实际读取 r1 390 trace：`bzts@71` click 在 15462.019 结束，`bzts@73` fill 在 15464.309 开始，相差 2.290ms；click action snapshot 仍 `0 selected`、`998 search matches`。已读原 `filter/values.ts:60,98`：换 search 会换 browser 身份，旧 pending 返回必须被丢弃。新增的是换 search 前自动等待精确 `998 selected`，且换完仍断言 `998 selected`；没有 sleep/retry 或移除异步身份保护。原超预算拒绝/保草稿/缩小查询纠正 case 未改。
- **005 活动格前置修正可接受。** 旧 `go-to/index.ts:333` 的范围选择为 anchor=start/focus=end，A1:A8 活动格本就 A8；在八格显示高亮已逐一验证之后显式真实 GoTo A1，再保留原值 `1` 断言，符合既有契约。八格高亮、邻格、改回 value 比较的精确高亮集合 `[0,6]`、A3 原数值与 A4 原公式均未放宽。
- **003 FARG-003 现已有最终指纹，纳入本轮。** 只把 lookup/return 的字面数组改为既有 `Summary!A47:A49` / `Summary!B47:B49` 两个真实引用，并同步精确公式字符串。已读原公开 XLOOKUP limitation 及 native 成对区域收集确实要求 reference-backed；既有 Summary seed 对应 A47:A49=1/2/3、B47:B49=10/20/30，plain fixture 保留非 orders chunks，无需 seed 或 helper 写值。`if_not_found` 仍空，必须生成 `=XLOOKUP(2,Summary!A47:A49,Summary!B47:B49,,0)`、原生结果仍为 20；未把结果改成错误或放宽精确空位。`commitArguments` 的写前 Northwind/Undo 禁用、FormulaBar 焦点、Enter 后结果/邻格、一次 Undo 到基线、Redo 与原公式断言保持。SUM case 仍保留数组常量与嵌套表达式，不借此删掉表单表达式覆盖。**新 FARG-003 尚无修改后的真实浏览器结果，不能签绿。**

现存 r3 原始 JSON 中，004 两个更正 spec 的两宽共 4 项、005 更正 AFMT-003 两宽共 2 项均 actual passed；这只补足对应新测试纠正的真实证据，不与 r1/r2 拼成一次完整验收。

### 已补足的文件证据与剩余边界

F-02 原“缺少 Table groups 下载→重开”证据缺口现已补足一个真实 case：已读 `next-version-integration/table-groups-file.spec.ts`，通过真实 DOM 给 DemoTable 建两组 OR、给 CalculatedOrders 保旧 flat min=2；下载同一文件检查 `rules=[]`/groups 长度/hiddenRows 和另一表 min，真实清除两表后再 Open 原下载字节，重开检查两组原值、两表各自隐藏结果、总计 30 与 Undo 禁用。r2 该项为未执行，**r3 原始 JSON actual passed**；不是以 Core mock 或克隆快照替代新增 Table wire。此项只关闭原证据缺口，不对最终变更快照提前签字。

本次读取时 r3 已自然结束并有完整 JSON：**113 passed / 4 failed / 0 未执行**；r2 为 **80 passed / 8 failed / 43 未执行**。两者 forbidOnly=true、workers=1、retries=0，均为诊断影响集，非最终完整 E2E。005 `wildcard scope follows row insertion and history without changing neighboring values` 两宽在 r3 仍 actual failed，不能因为其它格式 case/布局绿而签该 case；root 已核其满画布插行前置，准确纠正及后续真实绿证仍待原 owner/007。

当前仍待：003 更正后 FARG-003 的真实执行；005 row-insertion 前置修正的精确补审及真实结果；最终相关共享/source/test delta、统一门禁和单一 source/test/WASM/config 冻结后的完整 JSON/覆盖校验。003/004/005 的 24 张已看图和 UI-DATA-01 关闭可复用，相关产品/样式若再变按准确 delta 补审。**本轮补审完成，释放执行槽，不等待下一浏览器过程。**
