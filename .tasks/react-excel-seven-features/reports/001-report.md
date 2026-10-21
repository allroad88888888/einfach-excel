# 001 备注交付报告

状态：DONE_WITH_CONCERNS（领域实现待独立审阅；真实 Worker/WASM E2E、截图与共同边界由 008 待验）。未将 mock/未执行浏览器用例算作原生端到端通过。

## 本次 E2E 准备修复 R1（2026-10-21 冻结）

接手时两指定 E2E 的 R1 源补丁已在工作树；本轮仅核对并补此报告，未再修改 E2E、产品、共享 seed、helper、标题或 WASM。以下首版领域验证及旧待验项是当时记录；旧 `/tmp` 原始现场已丢失，本轮未读取现场，也没有新增浏览器、native 或完整 JS 检查通过证据。实际验收交 `/root/seven_acceptance`（008）统一执行。

- `actions.spec.ts`：两宽同一公式/空白用例先经 Name box 选择 K3，确认原日期 `2026-09-04`，在真实 `Active cell value` 输入框清空并 Enter；等待 K3 空白投影及网格 `data-projection-retained=false` 后才新增备注。保留 G2 公式 `=E2*F2` / 结果 `79`、K3 空白格新增/读取/Undo/marker 和邻居断言；准备清空产生的历史留在备注历史之前。
- `persistence.spec.ts`：先真实打开 B2 读取非空且与 `First line\n第二行` 不同的种子备注，再沿原插行/Undo/删列路径验证。删除 A 列后确认原 B2 的 `Acme Co.` 和种子备注一起移到 A2；Undo 后分别打开 A2、B2，验证原值、两个 marker 及各自备注原文恢复。

受影响精确标题（标题保持原样）：

| 文件 | describe / 完整 title |
| --- | --- |
| `e2e/notes/actions.spec.ts` | `1280px notes` / `note on formula and blank cell preserves native content at 1280px` |
| `e2e/notes/actions.spec.ts` | `390px notes` / `note on formula and blank cell preserves native content at 390px` |
| `e2e/notes/persistence.spec.ts` | `native row and column edits move notes and restore them through undo` |

静态检查（本轮实际执行）：

| cwd / 命令 | exit | 结果 |
| --- | --- | --- |
| `excel/react-excel`: `pnpm exec playwright test e2e/notes/actions.spec.ts e2e/notes/persistence.spec.ts --list --grep 'note on formula and blank cell preserves native content\|native row and column edits move notes and restore them through undo'` | 0 | `Total: 3 tests in 2 files`；仅收集，不代表执行成功 |
| 仓库根：`git diff --check -- excel/react-excel/e2e/notes/actions.spec.ts excel/react-excel/e2e/notes/persistence.spec.ts .tasks/react-excel-seven-features/reports/001-report.md` | 0 | 无输出 |
| 仓库根：`rg -n '[ \t]+$'` 上述三文件 | 1 | 无命中；另查 untracked 文件尾随空白 |
| `wc -l` 两个指定 E2E | 0 | actions 131 行、persistence 100 行 |

冻结 SHA256（仓库根路径）：

| 文件 | SHA256 |
| --- | --- |
| `excel/react-excel/e2e/notes/actions.spec.ts` | `bad927003eae40cb66ce2ad78b9170acf45a9504e54c86afaeff71650b1f85d6` |
| `excel/react-excel/e2e/notes/persistence.spec.ts` | `20c48c3846c71c88b6ef2815183549d2e696fe1afdc4e0b7aa2867fdcc8f36a5` |

两文件聚合 SHA256：`15b0e131862abf5927bf30e5cde81357b647991ed97f1258ee27b74a2daa16f6`。算法为在仓库根按上表顺序运行 `shasum -a 256 <actions路径> <persistence路径> | shasum -a 256`；不含报告、共享文件或 WASM。本轮已冻结就绪，三例真实浏览器结果及最终完整验收仍待 008，不以历史通过数替代。

## 接线契约

调用链：`NoteTools → runNoteAtom → notes.read / notes.change → Worker readNote / changeNote → WasmWorkbook.read_note / change_note → Sheet.notes + WorkbookHistory → noteIndicator 投影 → React marker`。

- Rust `lib.rs`: `pub mod notes;`；`Sheet` 添加 `pub(crate) notes: HashMap<CellAddress, String>` 并初始化空 map。
- `notes/mod.rs` 提供 `Sheet::note(addr) -> Option<&str>`、`notes_in_range(range) -> Vec<(CellAddress,String)>`、`set_note(addr, Option<&str>) -> Result<bool,&'static str>`、`restore_notes(range, &[(CellAddress,String)])`、`shift_notes(ShiftEdit)`、`validate_note_shift(ShiftEdit) -> Result<(), &'static str>`。所有备注为纯文本；CRLF/CR 归一 LF；拒绝仅空白、NUL、超过 32767 Unicode scalar 的文本；空白保存明确报错，删除只能显式 remove。
- `workbook_history.rs` 按现有 hyperlink/history 注册 `#[path = "notes/history.rs"] mod notes;`，提供 `WorkbookHistory::change_note(&mut self, &mut Workbook, usize, CellAddress, Option<&str>) -> Result<bool,&'static str>`。保护写入钩子由 008/002 接入该入口；备注只改元数据，不应激活 Table 待输入行。
- `HistorySnapshot` 添加 `pub(crate) notes: Vec<(CellAddress,String)>`，capture/retained_bytes 同 hyperlink；`workbook_history_restore.rs` / `sheet_history_restore.rs` 每处 `restore_hyperlinks` 附近调用 `restore_notes`。Sheet 整体归档已保存原对象，因此工作表 rename/move/delete+undo 直接随原对象保留。`sheet_history_budget.rs` 纳入 notes 字符串预算。
- `sheet_structural.rs`: validate 阶段调用 `self.validate_note_shift(edit)?`；apply_structural_shift 内调用 `sheet.shift_notes(edit)`。不要在 `drop_cells_in` 删除备注：该函数也用于覆盖值/公式，普通内容清除必须保留备注；shift_notes 自己删除结构删除带的备注。
- WASM `lib.rs` include `notes/mod.rs`；新增公开 `read_note(&self,sheet:u32,row:u32,col:u32)->Result<Option<String>,JsValue>` 与 `change_note(&mut self,sheet:u32,row:u32,col:u32,text:Option<String>)->Result<bool,JsValue>`。
- 原生 v1 文件添加可选 `notes: Vec<NoteJSON>`（serde default/skip empty），条目 `{sheet,row,col,text}`。`wasm_workbook_helpers.rs` 以 `self.notes_json()` 导出；restore 在替换当前 workbook 前以 `Self::restore_notes_json(&mut workbook,payload.notes)?` 校验。所有现有 `WorkbookPersistenceV1JSON` 字面量须补 `notes: vec![]`。不升 version；旧文件缺省空备注。
- `CellSnapshotJSON` 添加可选 `note_indicator: Option<bool>`，serde rename `noteIndicator`；现有构造器填 `sheet.note(addr).map(|_|true)`，notes 的空值投影函数补 blank 元数据格。`read_sparse_range` 在现有 append_empty_hyperlink_cells 后调用 `self.append_note_cells(sheet_idx,range,&mut out)`，该函数也补已有 hyperlink-only 格的 marker。
- TS `RustCellSnapshot` 添加 `readonly noteIndicator?: boolean`，`cell-io.ts` 空格过滤需保留 noteIndicator，映射 `cell.noteIndicator = true`。现有 `DisplayCell.noteIndicator?: boolean` 可直接复用。格子共享入口由 008 在 react-cells / Canvas 上渲染 `data-cell-note` 标记（避免共享包倒依赖应用）。
- WASM 类型接口扩展本任务 `WasmNoteQueries`；命令 union 扩展 `RustNoteCommands`（均在 `src/rust-workbook/notes/command.ts`）。`notes.read` payload `{sheetId,row,col,revision}` → `{text:string|null,revision}`；`notes.change` payload `{sheetId,row,col,text:string|null,revision,projection:VisibleProjectionRequest}` → `{changed:boolean,projection:VisibleProjectionResult}`。
- runtime 导入 `readNote, changeNote`；read 分支 `return {text:readNote(current,sheetsById,input,revision),revision}`；change 分支 `return projectChange(changeNote(current,sheetsById,input,revision),input)`。
- public core barrel 导出 `notePanelAtom,runNoteAtom`（`./notes/command`），`NOTE_MAX_CHARACTERS, validateNoteText`（`./notes/text`），以及类型 RustNoteCommands/WasmNoteQueries。
- `WorkbookRibbon.tsx` 导入并放置无 props `NoteTools`，位于现有元数据工具邻近位置。共享 renderer 加 `data-cell-note` 与可访问标记，文本建议 `Cell has a note`。
- mutation gateway 如继续使用 TS gate，ContentMutationKind 新增 `'change-note'`。Rust 原生保护仍必须在 change_note 边界执行，不能只靠 TS。
- `dialog-focus.ts` 的现有 focus selector 必须加入 `textarea:not(:disabled)`；目前只有 input/select/button/a，无法循环备注首控件。

## 文件职责清单

`rust/excel-core/src/notes/mod.rs`：备注存储语义；`notes/history.rs`：备注事务；`notes/tests.rs`：存储规则测试；`tests/notes.rs` + `tests/notes/history.rs`：公共历史/结构验证。

`rust/wasm/src/notes/mod.rs`：WASM 备注接口；`notes/persistence.rs`：文件及稀疏投影；`notes/tests.rs`：文件校验。

`spreadsheet-ui-core/src/rust-workbook/notes/command.ts`：Worker 命令契约及转发；`src/notes/command.ts`：弹窗状态与命令；`src/notes/text.ts`：文本输入规则；`test/notes/*`：专项状态/传输测试。

`react-excel/src/workbook/notes/NoteTools.tsx`：备注对话框；`notes.css`：既有 token 下的尺寸；`test/workbook/notes/*`：DOM专项；`e2e/notes/*`：真实入口验收；`docs/notes/README.md`：功能规则。最初独立 NoteIndicator 已移除，统一由共享 renderer 实现。

## 种子请求

在原 Sales Orders B2 增加备注 `Customer account review\n客户资料已核对`，不改任何原单元格内容、格式、合并或画布。线程批注可选择同格以便展示共存；A2/G2/K3 留给独立 CRUD E2E，不种备注。若原生 seed 从 Core 输入导入，给 RustWorkbookSheetInput 新增 `notes?: readonly {row:number;col:number;text:string}[]`，在现有初始化处调用 change_note，清理历史保持原 demo初始 Undo disabled。

## 中英文字符串清单（交 008 合并）

| English msgid | 中文 |
| --- | --- |
| Note | 备注 |
| Edit note | 编辑备注 |
| Insert note | 新增备注 |
| Note for cell {address} | 单元格 {address} 的备注 |
| Note text | 备注内容 |
| Plain text, up to {NOTE_MAX_CHARACTERS} characters. Use Delete note to remove it. | 纯文本，最多 {NOTE_MAX_CHARACTERS} 个字符。请使用“删除备注”移除。 |
| Loading note… | 正在加载备注… |
| Saving note… | 正在保存备注… |
| Delete note | 删除备注 |
| Save note | 保存备注 |
| Cancel | 取消（已有） |
| Enter note text. Use Delete note to remove an existing note. | 请输入备注内容。要移除已有备注，请使用“删除备注”。 |
| Note text cannot contain a null character. | 备注内容不能包含空字符。 |
| Note text cannot exceed 32767 characters. | 备注内容不能超过 32767 个字符。 |
| The note cell is outside the worksheet. | 备注单元格超出工作表范围。 |
| The note worksheet no longer exists. | 备注所在的工作表已不存在。 |
| The workbook changed. Reopen the note editor. | 工作簿已更改，请重新打开备注编辑器。 |
| Finish the current operation before changing a note. | 请先完成当前操作，再更改备注。 |
| Rust note editing is unavailable. | 原生备注编辑暂不可用。 |
| Rust returned a mismatched note result. | 原生备注结果与请求不匹配。 |
| Invalid note projection request. | 备注投影请求无效。 |
| Invalid note text. | 备注内容无效。 |
| Select the anchor cell before changing its note. | 请先选择合并区域的锚点单元格，再更改备注。 |
| The insertion would move a note outside the worksheet. | 插入操作会将备注移出工作表。 |
| Duplicate note cell in workbook file. | 工作簿文件包含重复的备注单元格。 |

## FEATURES 登记行

主登记下列 1280px 实例，390px 为同操作额外覆盖，均在真实 DOM 入口实施，不从浏览器写 Core atom。

| ID | 操作 | E2E 文件 | 完整 primary title |
| --- | --- | --- | --- |
| NOTE-001 | 新增多行备注 | e2e/notes/actions.spec.ts | insert multiline note preserves values and undoes once at 1280px |
| NOTE-002 | 查看已有备注 | e2e/notes/actions.spec.ts | view existing note reads saved text without creating history at 1280px |
| NOTE-003 | 修改备注 | e2e/notes/actions.spec.ts | edit note preserves original through native undo at 1280px |
| NOTE-004 | 删除备注 | e2e/notes/actions.spec.ts | delete note ignores unsaved draft and restores with undo at 1280px |
| NOTE-005 | 取消草稿 | e2e/notes/actions.spec.ts | cancel note draft retains saved text and focus at 1280px |
| NOTE-006 | Escape取消 | e2e/notes/actions.spec.ts | Escape dismisses note draft without saving at 1280px |
| NOTE-007 | 空白文本恢复 | e2e/notes/actions.spec.ts | blank note text keeps a retryable draft at 1280px |
| NOTE-008 | 公式/空格备注 | e2e/notes/actions.spec.ts | note on formula and blank cell preserves native content at 1280px |
| NOTE-009 | 焦点循环/响应布局 | e2e/notes/actions.spec.ts | note dialog traps focus and fits viewport at 1280px |
| NOTE-010 | 文件往返 | e2e/notes/persistence.spec.ts | note file roundtrip restores multiline metadata and leaves cell formulas intact |
| NOTE-011 | 错误文件/旧文件 | e2e/notes/persistence.spec.ts | invalid note file keeps open workbook and legacy file restores no notes |
| NOTE-012 | 原生结构随动 | e2e/notes/persistence.spec.ts | native row and column edits move notes and restore them through undo |
| NOTE-013 | 内容编辑隔离 | e2e/notes/persistence.spec.ts | ordinary cell input preserves note independently of value undo |
| NOTE-014 | 超限文本恢复 | e2e/notes/actions.spec.ts | over-limit note text keeps a retryable draft at 1280px |
| NOTE-015 | 中英文切换 | e2e/notes/localization.spec.ts | Chinese note editor preserves text through language switching at 1280px |

## 截图计划

actions.spec.ts 焦点/尺寸用例已持久化 `notes-1280.png`、`notes-390.png` 截图；localization.spec.ts 补 `notes-zh-1280.png` / `notes-zh-390.png`。008 重建构件后执行真实 Playwright并检查截图；当前不得宣称视觉验证已通过。

## 验证

首版历史领域文件 SHA256 聚合指纹：`0ba7365568cf06bc860ba2f8322028fa2de7a541e3825ab8550a1e0207ef7b8f`；不是本次 R1 候选指纹，当前两指定 E2E 的冻结指纹见上节。
算法：对本任务所有产品/测试/功能文档文件路径 `rg --files … | sort | xargs shasum -a 256 | shasum -a 256`，不含此报告与其他共享文件；最终候选中共享输入由 008 统一另采指纹。基线 HEAD：`1c47e6439657ee18d66db1d194d61dfa44bdf103`。

| 范围 | cwd / 命令 | exit | 实际结果 |
| --- | --- | --- | --- |
| Rust 原生公共命令 | excel/rust/excel-core: `cargo test --test notes` | 0 | 4/4，CRUD 单条历史、值/公式/格式隔离、结构/工作表历史、Unicode/换行、原生保护范围 |
| Core 状态及 Worker转发 | excel/spreadsheet-ui-core: `pnpm exec vitest run test/notes` | 0 | 2 files / 9 tests；真实Rust语义不由mock声称，仅验证UI状态/传输契约 |
| React DOM | excel/react-excel: `pnpm exec vitest run test/workbook/notes` | 0 | 1 file / 5 tests；打开/焦点/取消/Escape、原生command入参、错误草稿、loading取消与saving防重复 |
| 行数/职责 | `wc -l` 本领域新增文件 | 0 | 所有文件≤300；最大138行（Core command）；无复杂豁免 |
| whitespace | `git diff --check -- <本任务目录>` | 0 | 无报告；新增文件为untracked，另用rg核对尾随空白（无命中） |
| 原生文件专项 | WASM notes/note_tests 3条 | 未运行 | 完整v1往返、空格marker/旧字段缺省、重复/空白/越界拒绝、失败不替换当前工作簿；008完成WASM共享字面量后执行 |
| Rust 存储内部专项 | notes::tests 3条 | 未运行 | 供008全Rust验证；公共测试4条已含关键文本/结构语义 |
| Playwright | e2e/notes 三个spec，26条（20桌面/窄屏操作+4文件/结构+2中英文） | 未运行 | 等008真实构件与统一进程；不声称页面质量/端到端成功 |

开发中发现并修复：Einfach async command 同步批次结束前不会向 React 发出 loading/saving 通知。沿用已有 hyperlink 的 `request → await Promise.resolve → publish pending → await reply`，新增 DOM 延迟请求测试后证明 loading 可取消、saving 禁重复与 Escape；修复后的 Core9/9、React5/5重新通过。

历史失败记录：第一次 cargo 在错误 cwd（excel/rust）未找到 manifest，exit101；修正 cwd 后曾被并行 protection/structure.rs 未完成的 shift_interval 参数阻挡，exit101，002修复后最终4/4通过。第一次 React 在008尚未导出barrel时因 undefined atom失败，barrel接线后通过；新增busy专项曾复现通知问题，修复后最终5/5通过。以上失败均不计通过证据。

## 要求与证据边界

| 要求 | 已交付 | 尚需共享整体验证 |
| --- | --- | --- |
| 新增/查看/修改/删除、多行/取消/空白/超限 | NoteTools + Core + Rust完整命令；Rust4/Core9/React5 | 真实DOM→Worker/WASM→标记，26条E2E待跑 |
| Undo/Redo与值/公式/格式邻居隔离 | Rust公共命令实测；每个操作独立主E2E | 浏览器历史及相邻格完整断言待跑 |
| 行列与工作表结构随动 | 原生insert/delete、rename/move/delete+undo实测 | 浏览器行列用例待跑 |
| 原生文件往返/旧文件/错误文件 | Rust所有权、WASM序列化恢复实现及持久测试 | WASM3条与浏览器文件用例待跑 |
| 中英文/390px/1280px/焦点/错误/忙碌 | Lingui文案表、token界面、真实DOM忙碌专项、持久双尺寸/语言用例 | 008合并翻译、截图检查、视觉lint |
| 备注与同格线程批注共存 | notes独立字段与只写notes的事务，互不覆盖的结构设计 | 007未交稳定接口前不猜测；已请求root将联合真实UI用例交008/007 |
| 保护边界 | Core gate + 原生begin_ranges保护，锁定拒绝/允许区成功已Rust实测 | 008共同功能E2E |
| 保留原demo | 本任务未改原种子/画布；B2备注请求已交008 | 008种子接入与基线防退化 |

未启动全仓build/typecheck/lint、全量Vitest/E2E、wasm-pack，按任务分工留给008。不commit/push；未修改其他领域/共享产品文件。

## 最终交接

唯一状态是当前弹窗草稿；无工作表备注镜像、backend、bridge、controller props或新生命周期。新增Worker层负责现有transport的坐标/版本校验，WASM层负责调用Rust接口，Rust层负责校验/历史/持久数据，各层都有当前职责。

008后续新增线程批注字段到CellSnapshotJSON时，请同步协调 `notes/persistence.rs` 的blank-cell构造器缺省字段（不得为了编译丢掉noteIndicator），避免Rust struct新增字段使备注构造器漏接。合流测试或独立审查发现问题后可按本任务目录回派修复。
