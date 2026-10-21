# 001 手动非连续选区

## 设计与共享接线请求（已实现，待统一浏览器验收）

- 最短链：React `useGridPointerSelection` DOM 修饰键 → `startPointerSelectionAtom` / `updatePointerSelectionAtom` → Core `selection/multi-range/` 追加语义 → 既有 selection authority → 既有 React 多区投影；格式/清除/统计继续走既有 Rust 命令。
- 状态所有者：selection authority 唯一持有区域；pointer 继续持有本次锚点/焦点/append；新 Core 原子仅持有拖动的 authority witness、区域数量、workspace witness、结构交互身份等 UI 会话凭证与预算反馈，不保存选区镜像。React ref 只保存 DOM pointerId/capture target。
- `StartPointerSelectionInput` 新增 `readonly append?: boolean`。React 传 `event.ctrlKey || event.metaKey`；公式引用优先，格式刷启用时仍单区域，Shift 优先于追加（保持原锚点扩选）。
- 拟定重复/重叠：重复的相同矩形点击激活已有区，不切换取消；部分重叠的不同矩形仍独立保留，计数/统计采用既有 union 去重。拖动从重复格离开时才增加新区域，原区域不变；结束时相同矩形合并且保留本次主焦点。普通点击恢复单区域。
- 007 最小共享接线请求：导出既有 `MAX_SELECTION_REGIONS`；在 `selection/index.ts` 增加 `setMultiRegionSelectionWithAuthorityReceiptAtom`，复用 `snapshotSetMultiRegionSelectionInput`、authority guard、`commitMultiSelectionState`、`createSelectionAuthorityReceipt`，返回 `SelectionAuthorityReceipt | null`。非空合法 input 一次提交所有区后返回最终 merged primary 的 receipt；无需改现有 `setMultiRegionSelectionAtom` 返回类型。新 writer 由领域直接从 `selection/index` 引用，无需公共 package barrel。
- 007 反馈 UI 请求：最终导出 `multiRangeSelectionFeedbackAtom`（`selection/multi-range/pointer-append.ts`，只读 string，空串无反馈），Footer 使用既有 error note + `role=alert` 呈现并 translateFeedback；新消息 `Selection area limit reached. Keep the current selection or start a new selection.`。领域会在完整接口确定后补充。
- Escape 仍按既有编辑/引用优先级处理；导航 Escape 清非主区时需在既有 `selection.clearNonPrimary` 分支先调用 `endPointerSelectionAtom(true)`，避免晚到 move 重新扩选；单区追加起点下 Escape 也须结束活动 pointer（由007最小 keyboard 接线，具体请求待领域会话命令落地）。

## 最终交付与文件职责

- `spreadsheet-ui-core/src/selection/multi-range/pointer-append.ts`（127行）：modifier追加的去重、预算及拖动所有权语义。只记录witness/count/ownsRegion/workspace/connection/sheet凭证；区域来自原authority。每帧仅扫描矩形，不展开单元格。
- `spreadsheet-ui-core/src/selection/pointer-selection-commands.ts`（156行）：既有指针命令接入append；新增`append?: boolean`、`area-limit` / `selection-changed`拒绝原因。直接消费同事务receipt，合并区锚点与pointer保持一致。
- `react-excel/src/workbook/selection/use-grid-pointer-selection.ts`（139行）：传递Ctrl/Meta；只在Core接受后capture；Core取消或换表时释放capture。`onPointerDown`返回boolean，007的grid事件仅在true时启动自动滚动，避免预算拒绝仍滚动。
- 没有新增React multi-range包装文件：这项能力不需要新的DOM抽象。现有多区渲染、计数、清除、格式、Rust聚合全部复用。
- 新增3个Core专项（127/112/48行）、1个React专项（153行）；新增8个持久E2E spec与1个鼠标helper（均≤86行），用户语义文档`react-excel/docs/multi-range-selection/manual-selection.md`。
- 007已完成最小共享接线：multi receipt writer与预算常量；format-painter state精确提取防新环；feedback barrel/Footer；navigation Escape先结束pointer；grid取消后停止选择自动滚动。现有超大selection/index仅共享接线，没有重写。

## FEATURES精确注册建议（007唯一写入）

以下是8个新增实际用户操作，每项有独立primary；390px是对应variant。领域未执行浏览器，不能先填passed。

| ID | 用户操作 | E2E文件（相对react-excel/e2e） | exact primary title |
| --- | --- | --- | --- |
| MRSEL-001 | Ctrl点击追加单元格 | multi-range-selection/modifier-click.spec.ts | Control click appends a disjoint cell and keeps the gap unselected at 1280px |
| MRSEL-002 | Command点击追加单元格 | multi-range-selection/modifier-click.spec.ts | Meta click appends a disjoint cell and keeps the gap unselected at 1280px |
| MRSEL-003 | 修饰键拖动追加矩形 | multi-range-selection/modifier-drag.spec.ts | modifier drag appends a rectangle without replacing previous cells at 1280px |
| MRSEL-004 | 普通点击退出多区 | multi-range-selection/exit.spec.ts | ordinary click replaces manually appended areas with one cell at 1280px |
| MRSEL-005 | Escape保留主区退出 | multi-range-selection/exit.spec.ts | Escape exits manual multi-area selection and keeps only the primary rectangle at 1280px |
| MRSEL-006 | 格式化手动追加的所有区域 | multi-range-selection/multi-format.spec.ts | formatting manually appended areas changes every target and preserves the gap at 1280px |
| MRSEL-007 | 清除手动追加的所有区域 | multi-range-selection/multi-clear.spec.ts | clearing manually appended areas preserves gap values and undoes in one step at 1280px |
| MRSEL-008 | 查看重叠多区的去重统计 | multi-range-selection/overlap-statistics.spec.ts | overlapping manual areas count and aggregate each cell once at 1280px |

补充E2E覆盖：相同单元格再次点击激活；原区域/间隙不变；格式/清除一次Undo；合并格追加和多区格式；冻结格跨pane追加；真实edge自动滚动+按住鼠标Escape后停止并拒绝晚到move；Shift+Meta、公式引用、格式刷、现有Ctrl/Command超链接优先。均含1280/390两宽。截图用Playwright `info.outputPath`持久输出，由007逐张看。

## 验证证据（2026-10-21）

基线revision `b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb`；未commit/push。下面仅声明实际执行的专项Vitest，JSON位于固定证据根。

1. `pnpm --filter @einfach/spreadsheet-ui-core exec vitest run test/multi-range-selection test/pointer-selection-commands.test.ts test/formula-reference-input.test.ts test/format-painter.test.ts test/keyboard.test.ts test/selection-multi-range.test.ts --reporter=json --outputFile=/Volumes/work/self/excel/.codex-artifacts/react-excel-next-version.11oYiO/001/core-vitest.json`
   - **8文件109项通过，0失败**。含既有keyboard/pointer/format-painter/formula-reference/multi-range专项，新增22项。
2. `pnpm --filter @einfach/react-excel exec vitest run test/workbook/multi-range-selection test/workbook/selection/pointer-selection.test.tsx --reporter=json --outputFile=/Volumes/work/self/excel/.codex-artifacts/react-excel-next-version.11oYiO/001/react-vitest.json`
   - **2文件11项通过，0失败**；新增9项DOM适配验证，包含预算拒绝不capture/不启动scroll的返回契约。
3. 已跟踪的独占hook/command `git diff --check` 无告警。所有新增领域源/单测/E2E/文档逐文件 `git diff --no-index --check /dev/null <file>` 输出为空（exit1仅表示新增文件存在差异，不是空白错误）。所有新增/大改源与测试≤300行。

领域源SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| selection/multi-range/pointer-append.ts | ec5125b9b9576d9816ca1cdd5fb3e3d34cc0882991c2e5f624b2cd332ca0aea6 |
| selection/pointer-selection-commands.ts | cef32a6d92050e3a4b81795a90fd09a8427bbaaec2fe016e4c5f3b925581633c |
| workbook/selection/use-grid-pointer-selection.ts | a708a0ef653ac7f25c1edbd5335cfbcb0ab6583f1f82c0c93ededcb45d9a7394 |

## 待007统一验收与边界

- 持久E2E、真实Worker/WASM浏览器、两语言1280/390截图、FEATURES注册核对、typecheck/build/lint/cycles等全仓门禁均尚未由领域执行，交007统一验收。当前8个spec包含30个真实浏览器case。
- 不改原955绑定或旧预期；沿用原普通pointer bounds shrink的既有行为，新append receipt在bounds/structure/worksheet/selection身份变化后拒绝继续写入。
- 新Lingui反馈仅一条：`Selection area limit reached. Keep the current selection or start a new selection.`，007统一翻译/extract/strict compile。
- 纯选区是会话态，不申称文件持久化；选择本身没有Undo条目。功能不增加Rust/WASM API，格式/清除/统计才调用已有Rust实现。

## r3 overlap 定位与局部前置修正（2026-10-21，待007 r4实跑）

- 007明确确认r3 PTY12236自然退出exit1后才写入；r3共117项，113通过/4失败/0skip/0flaky，其中001为28通过、overlap两宽失败。root随后批准仅修正本新spec的DOM前置。领域未启动浏览器、未重跑Core/native、未派agent。
- 证据根：`.codex-artifacts/react-excel-next-version.11oYiO/007-e2e-impact-r3/`。只读解包以下`trace.zip`的`1-trace.trace`，对照同目录`error-context.md`以及真实`use-grid-drag-autoscroll.ts`（48px边缘区、每帧最大18px、滚动后更新pointer），不是从最终报错猜测union算法。
- 1280目录`multi-range-selection-over-3863a-te-each-cell-once-at-1280px`：`jqdw@7784`快照为A93、scrollTop2063；`jqdw@7798/7800/7802`真实鼠标从(283,761)拖至(483,761)，move快照scrollTop2071→2167、name=A93:B97；`jqdw@7804`mouseup后scrollTop2175。第二次`jqdw@7816/7818/7820`从(483,649)至(603,649)，primary=B93:C93但原区仍A93:B97，因此几何union确为11格；`jqdw@7836/7838/7840`的数值count3/sum6/avg2通过并不证明只有3格（额外行不是数值）。
- 390目录`multi-range-selection-over-70d50-ate-each-cell-once-at-390px`：`dslo@55`快照为A93、scrollTop2121、scrollLeft0；`dslo@69/71/73`从(169,718)至(369,718)触发纵/横边缘滚动，`dslo@75`mouseup后为A93:B98、scrollTop2249、scrollLeft36。第二次`dslo@87/89/91`从(333,590)至(453,590)，目标x453超过390视口；move结束scrollLeft192，`dslo@93`mouseup后scrollLeft228、primary=B93:D93。该失败由真实边缘自动滚动扩大选区，非产品去重错误。
- 唯一修改：`react-excel/e2e/multi-range-selection/overlap-statistics.spec.ts`局部`dragSummaryPair`，先通过DOM滚动将本对相邻格的公共边界居中，再取边界两侧±12px的真实鼠标点；两点必须距滚动视口各边≥56px且连续两rAF滚动/几何一致。append按下鼠标后再次等待布局稳定，以容纳多区Footer note引起的高度变化。没有固定时间sleep，没有出屏click，没有写selection或源数据。
- 保留所有原严格断言：最终B93:C93、A/B/C已选、D未选、count3/sum6/avg2、union3格、D93值20；另新增第一拖必须A93:B93。未改共享`pointer.ts`、旧support、产品源码、源数据、预期、专门autoscroll交叉。
- 该spec为76行；逐文件`git diff --no-index --check /dev/null`输出为空。冻结SHA-256：`8d9732aea95837cbf778be58c78ed7dfb2ffce9739d1e7e76f2bb2093ab1c145`。已交007 r4必要影响集，尚不申称浏览器通过；此节为r3证据和纯前置修正记录，不替代007的实际绿证。
