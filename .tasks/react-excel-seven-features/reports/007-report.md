# 007 线程批注交付报告

状态：DONE_WITH_CONCERNS（R2 焦点修复静态 lint 已通过，专项与完整门禁待 008 统一执行；R1 E2E 准备保持冻结，不能标完整验收通过）。

## 2026-10-21 R2 lint 与焦点收尾

本轮仅修改 `src/workbook/comments/CommentTools.tsx`、`test/workbook/comments/comments.test.tsx` 及本报告，008 已排除这两个文件的并发机械修改。没有改英文文案内容、E2E、Core、Rust 或共享文件，没有添加 state、ref 缓存、atom 或 lint 禁用。

`CommentTools` 的焦点 effect 仍只在 open/loaded/phase 变化时执行，但从当前作者输入框的 DOM `value` 决定聚焦作者或可编辑正文，不再读取 `state.author`。这样空作者首次加载完成聚焦作者，有作者重开聚焦正文，作者输入首字符与后续字符不会触发跳焦点；保存成功或失败后的 phase 收尾仍走原来的焦点选择。DOM 只用于焦点，不保存业务数据。其它改动仅为 import、JSX 和测试长行换行，原文案不变。产品 88 行、测试 140 行，均低于 300 行。

测试候选从原 5 项增为 6 项，以下三项有新增断言或异步场景调整，其余测试仅机械换行：

- 新增 `author typing keeps focus and a retained author focuses the body on reopen`：延迟读取完成后空作者获焦，输入 `A`、`Alice` 均保持作者焦点，关闭恢复工具焦点，重开保留作者并聚焦正文，正文输入继续保持焦点。
- `invalid identity and text retain editable draft; native failure can retry`：保留身份/正文校验与失败重试，改用明确延迟的保存拒绝，断言保存时正文禁用、失败后草稿保留并恢复正文焦点。
- `deferred native reads expose cancellable loading and saving forbids duplicates or Escape`：保留取消慢读、saving 禁重复/取消和真实命令结果断言，新增保存完成后正文获焦断言。

实际静态命令：`pnpm exec eslint --config rules/.eslintrc --ignore-path ./rules/.eslintignore excel/react-excel/src/workbook/comments/CommentTools.tsx excel/react-excel/test/workbook/comments/comments.test.tsx`，最终候选 exit0、无诊断。没有运行 Vitest、browser、native、WASM 或 full 检查；上述新断言尚未执行，008 需统一跑 `pnpm exec vitest run test/workbook/comments/comments.test.tsx` 与完整门禁。

冻结 SHA-256：

- `CommentTools.tsx`：`b8a397977fd6fc09b04149ae57e4ecb0f3877a9236c94237797851022e78b3cc`
- `comments.test.tsx`：`b530b30dcd1ad5138533692877ece3f4ebde468b387b4102c3138e649684ce60`
- R1 `boundaries.spec.ts` 保持 `24248177e4d5e4f5618ff2780fd9f1cd857bb63a98fca5aa63343da04363359f`；下节领域聚合是 R1 当时指纹，不代表 R2 后聚合，最终候选由 008 统一冻结。

## 2026-10-21 R1 精确收尾

原负责人重启后停在 pending_init，root 已 interrupt；本轮接手时补丁已在，没有并发写。仅核对 `excel/react-excel/e2e/comments/boundaries.spec.ts` 并更新本报告，未改产品、共享 fixture、seed 或测试标题。旧 `/tmp` 现场已丢失，本轮未读取旧 trace，不把历史专项结果或静态收集当作当前浏览器通过。

- 空白/公式格：先保留 G2 的 `=E2*F2` 与结果 79；确认 K3 原日期 `2026-09-04` 后通过真实 `Clear contents` 清空，等待空值、`data-projection-retained=false` 与按钮恢复可用，再创建空白格线程。读取正文后第一次 Undo 只移除线程且 K3 仍空，第二次 Undo 才恢复日期；G2 线程、公式、79 和邻居断言保留。
- 合并锚点：确认 K3 日期及 L3 `Express`，通过真实 `Merge cells` 入口，确认 `Merge these cells?` 对话框的 `Merge cells` 按钮，等待合并投影。保留锚点日期、一个 marker、原普通 marker 消失、L3 清空和原线程读取；Undo 恢复 K3 日期、L3 `Express`、普通 marker 与原线程。
- 上述已存在补丁满足交接要求，本轮没有追加源码改动。其它批注操作与 30 条历史已通过组合用例不重写；历史结果不代表新候选已通过。

直接影响文件为 `comments/boundaries.spec.ts`，精确标题如下，交由新 008 `/root/seven_acceptance` 统一实跑：

| 完整标题 |
| --- |
| 1280px comment boundaries › blank and formula cells retain comment markers without replacing content at 1280px |
| 390px comment boundaries › blank and formula cells retain comment markers without replacing content at 390px |
| 1280px comment boundaries › merged anchor displays one comment marker and retains the thread at 1280px |
| 390px comment boundaries › merged anchor displays one comment marker and retains the thread at 390px |

本轮实际命令 `pnpm exec playwright test e2e/comments --list`（react-excel）exit0，采集 **51 tests in 6 files**；其中 boundaries 20 条，直接影响 4 条。未启动 browser、cargo、WASM、full JS 或其它全量检查；list 不证明交互通过。`git diff --check -- <这两个文件>` exit0。两文件当前均未跟踪，因此分别追加 `git diff --no-index --check /dev/null <文件>`；均无空白诊断，exit1 是 no-index 检出新增内容的差异状态，未隐去非零退出码。

另用 `pnpm exec playwright test e2e/comments/boundaries.spec.ts --grep 'blank and formula|merged anchor' --list` 精确收集上述影响集，exit0，**4 tests in 1 file**。

冻结指纹：`boundaries.spec.ts` SHA-256 `24248177e4d5e4f5618ff2780fd9f1cd857bb63a98fca5aa63343da04363359f`。本任务全部业务目录按下文相同方法重新聚合（路径按 `LC_ALL=C` 排序，不含报告自身）为 `896949aefe41120bd41e8bc3c489617918beb8b355894ab59e10a0b0c5dea8c2`。本轮交付是 E2E 准备就绪，没有新增浏览器通过证据；无 commit/push。

## 准确接线契约（供 008）

主线：`CommentTools` → `runNativeCommentAtom` → `comments.read/comments.change` → 当前 Rust Worker → `read_comment/change_comment` → 原生 Sheet/WorkbookHistory → 返回投影 → Core → React。

- Core 新文件 `src/comments/native/types.ts`：`NativeCommentEntry { kind: 'message' | 'resolve' | 'reopen'; author: string; body?: string; createdAt: number }`、`NativeCommentThread { entries: readonly NativeCommentEntry[]; resolved: boolean }`、`NativeCommentChange = { action: 'create' | 'reply'; author: string; body: string } | { action: 'resolve' | 'reopen'; author: string }`。
- Rust `comments/mod.rs` 导出同名 serde 数据（`created_at` 对应 `createdAt`）；Sheet 新字段 `pub(crate) comments: HashMap<CellAddress, crate::comments::NativeCommentThread>`，构造默认空。`comment(addr)`、`comments_in_range(range)`、`comment_cells_in_range(range)->Vec<CellAddress>`（marker不克隆正文）、`restore_comments(range, entries)`、`validate_comment_shift(edit)`、`shift_comments(edit)`；`comments::retained_bytes(&[(CellAddress,NativeCommentThread)])` 计预算。文件安装入口是 `Workbook::restore_comment_thread(&mut self,sheet:usize,addr:CellAddress,thread:NativeCommentThread)->Result<(),&'static str>`，先调用真实权限守卫，公开 Sheet 没有安装入口。
- `comments/history.rs` 作为 `workbook_history.rs` 的 `#[path = "comments/history.rs"] mod comments;`；`WorkbookHistory::change_comment(&mut self, workbook: &mut Workbook, sheet: usize, addr: CellAddress, change: crate::comments::NativeCommentChange, now_ms: i64) -> Result<bool, &'static str>`。调用 `ensure_range_editable` 后生成一个 content=false 历史；WASM 边界用 `js_sys::Date::now()` 传本机毫秒时间，原生验证日期范围并按最后事件时间夹紧回拨；Undo/Redo 不重新取时间。非认证/服务端时间。
- HistorySnapshot 增 `pub(crate) comments: Vec<(CellAddress, crate::comments::NativeCommentThread)>`；capture 调 `sheet.comments_in_range(range)`；retained_bytes 加 `crate::comments::retained_bytes(&self.comments)`；两处 history restore 与 Sheet restore 均调用 `restore_comments`。Sheet history budget 计入 `metadata_bytes(&self.comments)`。
- Sheet structural validate/shift 在 notes 相邻处调用 `validate_comment_shift(edit)` / `shift_comments(edit)`。常规 set/clear value 不清批注；合并不丢数据，非锚点的写入明确拒绝。
- `excel/rust/wasm/src/comments/mod.rs` 使用 include 注册（与 notes 相同），导出 `read_comment(sheet,row,col) -> Result<String,JsValue>`（JSON thread 或 `null`）、`change_comment(sheet,row,col,change_json:&str) -> Result<bool,JsValue>`。
- WASM 持久字段 `#[serde(default)] comments: Vec<CommentJSON>`，其中 `CommentJSON { sheet: usize, row: u32, col: u32, thread: NativeCommentThread }`；helpers snapshot `comments: self.comments_json()`；restore `Self::restore_comments_json(&mut workbook, payload.comments)?`，必须在临时 workbook 完成验证。旧 snapshot literals 补 `comments: vec![]` 归 008。
- `CellSnapshotJSON` 加 `#[serde(rename = "commentIndicator", skip_serializing_if = "Option::is_none")] comment_indicator: Option<bool>`；所有既有 literal 补 None，由 008；正常及 frozen 投影的 notes append 相邻调用 `append_comment_cells`。只传 boolean，完整线程显式读取。仅批注空格必须生成 snapshot。Core RustCellSnapshot/投影 cell/clone/cell-io 增 `commentIndicator?: boolean`；renderers 复用 metadata 入口消费这个 boolean（旧 commentThread 未必是当前数据）。已发现 008 初接漏 rename，008已确认修正；真实WASM marker仍待验。
- Core `src/rust-workbook/comments/command.ts` 导出 `WasmCommentQueries`、`RustCommentCommands`、`readComment`、`changeComment`；WasmWorkbook extends WasmCommentQueries，RustWorkbookCommands extends RustCommentCommands。read payload `{sheetId,row,col,revision}`，result `{thread: NativeCommentThread|null,revision}`。change payload 追加 `{change: NativeCommentChange, projection: VisibleProjectionRequest}`，result `{changed:boolean,thread:NativeCommentThread,projection:VisibleProjectionResult}`。runtime read 用当前 revision，change 成功按 changed 推进 revision并返回同次投影与 `readComment` 当前线程。
- Core barrel export `nativeCommentPanelAtom/runNativeCommentAtom`（来自 comments/native/command）、`COMMENT_BODY_MAX/COMMENT_AUTHOR_MAX` 与 NativeComment 类型（来自 comments/native/types）。mutation-gateway ContentMutationKind 加 `'change-comment'`。
- React `CommentTools(): React.JSX.Element` 来自 `src/workbook/comments/CommentTools.tsx`；008 放主 ribbon 与 NoteTools 相邻。工具名 `Comments`，对话框名 `Cell comments`。
- seed 建议在 plain demo 之外原示例空 H84 建一个 message（通过 `change_comment`，初始化结束 history clear），作者 `Workbook example`，正文 `Review this workbook cell.`；seed 若复用新输入字段由 008 决定最小接线。

## 文件职责清单

- Rust comments/types.rs：线程数据与纯文本校验；mod.rs：Sheet 稀疏数据操作；history.rs：原生历史事务；structure.rs：线程坐标迁移。
- WASM comments/mod.rs：原生读写出口；persistence.rs：文件及轻量投影；tests.rs：原生文件安全回归。
- Core comments/native/types.ts：传输数据契约；command.ts：当前格编辑命令；rust-workbook/comments/command.ts：Worker 原生边界。
- React CommentTools.tsx：对话框 DOM；CommentTimeline.tsx：作者时间与线程事件；comments.css：现有 token 下的响应式排版。
- 各自 test/e2e 文件：按原生、命令、DOM、浏览器操作职责划分。所有普通文件≤300行。

## 实现与验收覆盖

- Rust 创建、回复、解决、重开每次生成一条 content=false 历史。纯文本验证、Unicode scalar 限长、作者去空白、拒绝控制字符/空内容、线程1000事件上限、严格文件状态机验证。回复必须先重开；同格仅一个线程。
- Core 当前格 read 加 revision 检查；cancelled read/换连接/跨表晚到结果丢弃；保存拒绝重复/关闭；异步微任务发布 loading/saving；失败保留草稿。响应须保留完整旧事件前缀并准确追加本次 action/author/body，不能用合法但无关的线程当成功。
- React 使用 useAtomValue/useSetAtom；dialog 原生模态与既有 focus cycle；关闭/取消恢复工具焦点；线程作者、消息、状态事件与本地时间纯文本渲染；窄屏宽度 min(500px,100vw-24px)，长文本换行。
- 无外部身份/网络/通知；时间为浏览器设备本机时间，作者是本文件内显示名。跨 notes+comments 同格操作真实 E2E 由008负责。

## 初始领域专项历史证据

以下是原交付记录；2026-10-21 重启后旧 `/tmp` 原始现场已丢失，本轮未重跑，不能作为当前可复核的最终验收证据。新的原生、WASM、浏览器与全量门禁由 008 在持久验收目录统一补证。

| 命令 | 实际结果 | 适用范围 |
| --- | --- | --- |
| `cargo test --test comments`（excel/rust/excel-core） | 最终当前候选 exit0，8/8（含容量、Unicode作者、公开安装越界） | 原生作者/时间/CRUD状态/每步历史/结构/跨表/notes共存/保护/合并锚点/边界 |
| `pnpm exec vitest run test/comments`（spreadsheet-ui-core） | 最终当前候选 exit0，44/44；其中新增9例+既有comments-notes35例 | command状态、真实传输参数、Unicode、无关响应拒绝；mock传输不算native通过 |
| `pnpm exec vitest run test/workbook/comments`（react-excel） | 最终当前候选 exit0，5/5 | 真实DOM纯文本/时间/焦点/create/reply/resolve/reopen/error/retry/deferred loading+saving/cancel规则 |
| `pnpm exec playwright test e2e/comments --list`（react-excel） | exit0，实际采集51条/6个spec | 仅编译/采集，未执行浏览器，不计E2E通过 |
| `git diff --check -- <本领域路径>` | exit0 | 当前领域文件空白检查 |

WASM 文件三例已落 `excel/rust/wasm/src/comments/tests.rs`：事件/空白格marker/legacy往返，重复/越界/损坏线程拒绝，损坏文件保持当前工作簿；尚未运行。测试通过显式native now_ms构造，不在native平台调用js_sys::Date。普通新增源码最大160行，全部≤300。

初始领域候选历史 SHA-256 聚合：`60746cac80216ca5faa8a68b00077e771bb8dab420e82fa520a58989f8873ba7`。生成方法：对本任务全部业务目录（React src/test/e2e/docs、Core comments/native与rust-workbook/comments及test/comments、Rust core comments与tests/comments含顶层comments.rs、WASM comments）`rg --files`，路径排序，逐个`shasum -a 256`，再对清单做`shasum -a 256`；不包含报告自身。该旧指纹不代表上方 R1 冻结候选；最终共享候选需008统一验证。

## FEATURES.md 登记行（008合并）

当前持久Playwright共51例；以下28个主操作登记，390px作为等价变体。尚未执行，不能标通过。文件均相对于 e2e/。

| ID | 操作 | 文件 | 主测试精确标题 |
| --- | --- | --- | --- |
| COMMENT-001 | 新建线程 | `comments/actions.spec.ts` | new comment retains author and local time through undo and redo at 1280px |
| COMMENT-002 | 查看线程纯文本 | `comments/actions.spec.ts` | view thread is read only and displays plain text at 1280px |
| COMMENT-003 | 回复线程 | `comments/actions.spec.ts` | post reply retains both authors and undo restores original thread at 1280px |
| COMMENT-004 | 解决讨论 | `comments/actions.spec.ts` | resolve discussion records actor and prevents replies at 1280px |
| COMMENT-005 | 重新打开讨论 | `comments/actions.spec.ts` | reopen discussion appends history and permits a later reply at 1280px |
| COMMENT-006 | 关闭丢弃草稿 | `comments/actions.spec.ts` | close comments discards a reply draft and restores trigger focus at 1280px |
| COMMENT-007 | Escape取消 | `comments/actions.spec.ts` | Escape dismisses a new discussion without saving at 1280px |
| COMMENT-008 | 对话框键盘焦点 | `comments/actions.spec.ts` | comment dialog traps focus and fits viewport at 1280px |
| COMMENT-009 | 空作者修正 | `comments/input.spec.ts` | reject blank display name and recover at 1280px |
| COMMENT-010 | 超长作者修正 | `comments/input.spec.ts` | reject long display name and recover at 1280px |
| COMMENT-011 | 空正文修正 | `comments/input.spec.ts` | reject blank comment and recover at 1280px |
| COMMENT-012 | 超长正文修正 | `comments/input.spec.ts` | reject long comment and recover at 1280px |
| COMMENT-013 | 插行迁移 | `comments/boundaries.spec.ts` | native insert-rows carries comment history at 1280px |
| COMMENT-014 | 删行历史恢复 | `comments/boundaries.spec.ts` | native delete-rows carries comment history at 1280px |
| COMMENT-015 | 插列迁移 | `comments/boundaries.spec.ts` | native insert-columns carries comment history at 1280px |
| COMMENT-016 | 删列历史恢复 | `comments/boundaries.spec.ts` | native delete-columns carries comment history at 1280px |
| COMMENT-017 | 普通值写入共存 | `comments/boundaries.spec.ts` | ordinary input preserves independent comment metadata at 1280px |
| COMMENT-018 | 跨表线程归属 | `comments/boundaries.spec.ts` | sheet switching keeps discussions attached to the correct native sheet at 1280px |
| COMMENT-019 | 空白与公式格 | `comments/boundaries.spec.ts` | blank and formula cells retain comment markers without replacing content at 1280px |
| COMMENT-020 | 合并锚点 | `comments/boundaries.spec.ts` | merged anchor displays one comment marker and retains the thread at 1280px |
| COMMENT-021 | 冻结滚动 | `comments/boundaries.spec.ts` | frozen pane retains the comment marker while scrolling at 1280px |
| COMMENT-022 | 保护与允许区 | `comments/boundaries.spec.ts` | protected cells reject comments while an editable range accepts them at 1280px |
| COMMENT-023 | 下载完整线程 | `comments/persistence.spec.ts` | downloaded workbook preserves comment authors timestamps messages and status events |
| COMMENT-024 | 打开恢复完整线程 | `comments/persistence.spec.ts` | opening workbook restores the complete thread and keeps formulas and neighbors |
| COMMENT-025 | 错误文件恢复 | `comments/persistence.spec.ts` | invalid comment file leaves the currently open workbook intact |
| COMMENT-026 | 旧文件无批注 | `comments/persistence.spec.ts` | legacy workbook without comments restores no thread and preserves ordinary data |
| COMMENT-027 | 中英切换 | `comments/localization.spec.ts` | Chinese comments retain authored text when switching to English at 1280px |
| COMMENT-028 | 原生种子例 | `comments/seed.spec.ts` | native comment example on Summary reads without adding history or altering the Orders demo |

## 中英文文案（008合并Lingui/反馈）

| English source | 简体中文 |
| --- | --- |
| Comments | 批注 |
| Cell comments | 单元格批注 |
| Discussion for cell {address} | 单元格 {address} 的讨论 |
| No comments yet. Start a discussion about this cell. | 暂无批注。开始讨论这个单元格。 |
| Comment history | 批注历史 |
| Resolved | 已解决 |
| Open discussion | 讨论中 |
| Resolved this discussion | 已解决此讨论 |
| Reopened this discussion | 已重新打开此讨论 |
| Workbook display name | 工作簿内显示名 |
| A name stored in this workbook, not an authenticated identity. Up to {COMMENT_AUTHOR_MAX} characters. | 此名称保存在工作簿中，并非已认证身份，最多 {COMMENT_AUTHOR_MAX} 个字符。 |
| Reply text | 回复内容 |
| Comment text | 批注内容 |
| Plain text. Times use this device's local clock. | 仅纯文本，时间使用此设备的本机时钟。 |
| Loading comments… | 正在加载批注… |
| Saving comment… | 正在保存批注… |
| Reopen discussion | 重新打开讨论 |
| Resolve discussion | 解决讨论 |
| Close comments | 关闭批注 |
| Post reply | 发表回复 |
| New comment | 新建批注 |
| Reply to comment | 回复批注 |
| Resolve comment | 解决批注 |
| Reopen comment | 重新打开批注 |
| Enter a workbook display name. | 请输入工作簿内显示名。 |
| Display name cannot exceed 100 characters. | 显示名不能超过100个字符。 |
| Display name cannot contain control characters. | 显示名不能包含控制字符。 |
| Enter comment text. | 请输入批注内容。 |
| Comment text cannot contain a null character. | 批注内容不能包含空字符。 |
| Comment text cannot exceed 32767 characters. | 批注内容不能超过32767个字符。 |
| A comment thread must contain 1 to 1000 entries. | 一个批注线程必须包含1至1000条记录。 |
| A comment thread cannot exceed 1000 entries. | 一个批注线程不能超过1000条记录。 |
| Invalid comment display name. | 批注显示名无效。 |
| Invalid comment timestamp. | 批注时间无效。 |
| Comment text is missing. | 缺少批注内容。 |
| Invalid comment line endings. | 批注换行符无效。 |
| Invalid comment thread history. | 批注历史无效。 |
| Invalid comment thread status. | 批注状态无效。 |
| The comment cell is outside the worksheet. | 批注单元格超出工作表范围。 |
| The comment worksheet no longer exists. | 批注所在工作表已不存在。 |
| Select the anchor cell before changing its comments. | 请先选择合并区域的起始单元格再修改批注。 |
| This cell already has a comment thread. | 此单元格已有批注线程。 |
| The comment thread no longer exists. | 此批注线程已不存在。 |
| Reopen the thread before replying. | 请先重新打开讨论再回复。 |
| The insertion would move a comment outside the worksheet. | 此插入操作会将批注移出工作表。 |
| Duplicate comment cell in workbook file. | 工作簿文件中有重复的批注单元格。 |
| The workbook changed. Reopen the comment editor. | 工作簿已更改，请重新打开批注编辑器。 |
| Finish the current operation before changing comments. | 请先完成当前操作再修改批注。 |
| Rust comment editing is unavailable. | 原生批注编辑不可用。 |
| Rust returned an invalid comment thread. | 原生引擎返回的批注线程无效。 |
| Invalid comment projection request. | 批注投影请求无效。 |
| Rust returned a mismatched comment result. | 原生引擎返回的批注结果不匹配。 |

## 待集成验证

008统一执行真实Worker/WASM、文件3专项、51条Playwright、中英文1280/390截图、presentation/typecheck/build/API snapshot。领域不运行全量、不重建WASM、不改共享文件。最终交付不含commit/push。
