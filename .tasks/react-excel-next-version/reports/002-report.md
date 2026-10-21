# 002 跨表剪切

状态：领域实现及专项验证完成；真实 Worker/WASM 浏览器与全仓门禁等待 007 合流执行，未声明 E2E 通过。

## 共享契约（首轮）

- 沿用 `WasmWorkbook.paste_clipboard`、`ClipboardPasteOptions`、`clipboard.capture/finishCapture/paste`，无需新增 WASM export、命令或 TypeScript 数据镜像。
- 原生入口在 `clipboard_paste.rs` 对异表 cut 分派到 `clipboard/cross_sheet_cut`（物理目录 `src/cross_sheet_cut/`），模块由本人在独占 `clipboard.rs` 注册。沿用 `WorkbookHistory::begin_ranges` + `finish`，现有 Cells history 已支持多表内容快照，因此当前不需要共享 history 枚举改动。
- 异表 cut 计划将源、目标、实际受影响依赖公式与边框邻格均纳入一条原生历史；Stop/Warning 校验在同一 store.batch 内失败回滚，保留 redo 与 Rust 剪切槽。
- 本版跨表遇到源/目标合并或 Table 相交明确原子拒绝；旧同表合并/Table 政策不变。新增错误文案由本人接入独占 system-clipboard-command.ts；Lingui 新消息如有会另列。
- 007 已确认 Worker 切表走 projection，不改 clipboard 身份，不需要新增协议；本域 Core runtime 专项也验证 pending/confirmed cut 切表不失效。
- 集成验收请求：在所有 owner 合流后运行本域 `e2e/cross-sheet-cut/`，重建 WASM 与全仓 gates 仍由 007 独占；Cargo 窗口另行预约。

## 实现职责

- `cross_sheet_cut/mod.rs`：异表 cut 原生预检与历史目标规划。
- `cross_sheet_cut/rewrite.rs`：A1 引用跨表身份转换。
- `cross_sheet_cut/apply.rs`：发布或回滚多表原子移动。
- Core `clipboard/cross-sheet-cut/`：跨表领域错误呈现。
- 专项 Rust/Core/React/E2E：分别验证事务语义、命令边界、真实 DOM 入口。

原有调用链保持为 React clipboard 事件/工具栏 → `runSystemClipboardAtom` → Worker `clipboard.paste` → `WasmWorkbook.paste_clipboard` → `cross_sheet_cut::paste` → 原生单次投影。未新增 React 产品组件、运行时副本、命令协议或 WASM export。独立 Core 文件仅保存本域原生拒绝的错误说明。

`rewrite.rs` 保留跨表静态 A1 单格/完整范围身份和绝对标记；移出公式未移动的本地引用补原表名，所有源侧完整引用换为目标表名。受影响 DynamicRange 或 OFFSET 原子拒绝，避免递归挪端点把源剩余范围换到目标表；无关动态范围不阻止移动。INDIRECT 文本沿既有字符串语义不改写；无参 ROW/COLUMN 在新位置求值。依赖上下文的隐式 Table 引用或 ThisRow 移出公式明确拒绝。对应原生专项都有覆盖。

权限与提交：预检源/目标实际范围、被改写的依赖公式和两端边框邻格；目的表 `unlockedRanges` 不套用源坐标。任一失败在 `begin_ranges` 前拒绝，候选值校验失败则在一次 store.batch 发布之前通过 `finish(false)` 恢复全部表。无宿主 history 的调用也用临时原生 history 保证回滚；成功的宿主 history 只记一条 Move cells。Stop 不可继续，Warning 继续重试同一快照。

## 007 注册与验收清单

无需共享 Rust module/history/WASM/command 接线。007 已提供 `/e2e/fixtures/cross-sheet-cut/` 专属三表 seed，沿初始化清空历史。两条新错误已发 007 加 Lingui：

- `Unmerge the source and destination before moving cells between sheets. No cells were moved.`
- `Move cells outside Excel Tables before cutting between sheets. No cells were moved.`

| ID | 文件（e2e/cross-sheet-cut/） | 精确 test 标题 |
| --- | --- | --- |
| XSCUT-001 | move.spec.ts | XSCUT-01 keyboard cut across tabs retargets mixed references in three sheets with one undo |
| XSCUT-002 | move.spec.ts | XSCUT-02 toolbar cut across tabs moves formatting hyperlinks and blank payloads |
| XSCUT-003 | recovery.spec.ts | XSCUT-03 partial range rejection preserves data redo and the same cut for a corrected retry |
| XSCUT-004 | recovery.spec.ts | XSCUT-04 stop validation rolls back the cross-sheet cut and permits a corrected destination |
| XSCUT-005 | recovery.spec.ts | XSCUT-05 warning cancel keeps the cut and explicit continue moves it with one history entry |
| XSCUT-006 | recovery.spec.ts | XSCUT-06 merged destination rejects atomically and the same cut can move to an ordinary cell |
| XSCUT-007 | protection.spec.ts | XSCUT-07 protected third-sheet dependents block a cross-sheet cut until explicitly unprotected |
| XSCUT-008 | browser-failure.spec.ts | XSCUT-08 failed browser cut write leaves the source untouched and preserves the previous copy across tabs |

007 已按 FEATURES 解析器要求用三位数字 ID 登记；真实 test 标题保留原两位前缀，绑定使用上表精确标题。

附加 language-layout.spec.ts 的 en/zh × 1280/390 四个真实页面截图，由 007 实际运行及逐张审图；本 owner 未运行浏览器。截图文件 `cross-sheet-cut-${locale}-${width}.png`。现有 copy/paste modes 的浏览器回归仍由 007 完整验收。

## 验证

源基线 b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb；工作树未提交。证据根 `/Volumes/work/self/excel/.codex-artifacts/react-excel-next-version.11oYiO/`。

- `002-rust-clipboard-regression.log`：`cargo test --manifest-path excel-core/Cargo.toml --test cross_sheet_cut --test clipboard_history --test data_validation_paste --test merged_clipboard_options --test protection`，21 新专项 + 39 原回归，60/60 passed。
- `002-rust-cross-sheet-cut-final.log`：最终补齐隐式/ThisRow Table 公式拒绝边界后，仅新增一个测试，22/22 新专项 passed；产品代码与60项回归输入相同。
- `002-rust-clipboard-lib.log`：`cargo test --manifest-path excel-core/Cargo.toml --lib clipboard`，47/47 passed，覆盖原同表重叠剪切、粘贴模式、转置、skip blanks 与超链接。
- `002-core-clipboard-regression-r2.log`：`pnpm --filter @einfach/spreadsheet-ui-core test test/cross-sheet-cut/ test/system-clipboard-command.test.ts test/system-clipboard-settlement.test.ts test/rust-clipboard-runtime.test.ts test/rust-clipboard-capture.test.ts`，6 files、85/85 passed，含本域7专项。
- `002-react-clipboard-regression.log`：`pnpm --filter @einfach/react-excel test test/workbook/cross-sheet-cut/ test/workbook/editing/system-clipboard.test.tsx`，2 files、19/19 passed，含本域2真实DOM专项。
- 旧断言无迁移。新增 runtime 测试随 006/007 明确的异步初始化契约补空队列与 `read_custom_formulas` stub，没有放宽断言；早期失败与编译修复日志一并保留。
- 新源/测试文件均 ≤300 行（最大 rewrite.rs 252行）；存量 system-clipboard-command.ts 原已超300，本次仅必要 import/错误表接线，当前311行，未扩大为无关重构。
- `002-source-fingerprint.txt` 保存全部本域产品源/专项测试的 SHA-256；已跟踪小接线 `git diff --check` 通过，新文件另做空白检查。

待 007：WASM 重建、真实 E2E、4截图、类型/构建/统一门禁。源文件与测试已准备交接；后续改动只响应实际验收问题。

## 独立风险审查修复第1轮：命名范围

已完成 root 授权的最小原子拒绝修复，等待独立补审及 007 真实浏览器验收，状态不声明 done。未提交代码、未自行运行浏览器或重建 WASM；Cargo 窗口已向 007 释放。

真实红证：先仅新增原生测试再运行 `cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test cross_sheet_cut named_ranges`（cwd 仓库根）。`002-risk1-named-ranges-red.log` 保留原始 exit 101：6 项中 2 项安全放行通过、4 项预期拒绝失败。复现输出为移动成功、源 `Null`、目标 `4`、`SUM(Sales)` 从 `4` 变为 `0`，不是静态推断或修改旧断言。

最小修复：`cross_sheet_cut/mod.rs` 在任何写入和 `begin_ranges` 前，使用现有公开 `Workbook::snapshot_named_ranges()` 纯元数据查询。当前稳定工作表身份解析后的有效 `NamedDefinition::Range` 与源剪切范围相交时返回 `CLIPBOARD_CROSS_SHEET_NAMED_RANGE`；完整/部分交集均拒绝。无效原始定义不会绑定同名新表，重命名/重排仍识别正确源表。无关范围、值/表达式名称、LET/LAMBDA 局部变量不误拒绝。未扩充命名范围搬迁历史、共享 API、状态镜像或公式重写框架；同表剪切入口不变。

本轮精确变更：

- Rust `src/cross_sheet_cut/mod.rs`：新增上述预检；`tests/cross_sheet_cut.rs` 注册 `tests/cross_sheet_cut/named_ranges.rs`，6 个新增专项覆盖真实静默错算、完整/部分交集、稳定身份、失效同名重建、无关名称、捕获后新增名称，以及源/目标/依赖/名称定义/redo/快照失败保持和同快照修正重试。
- Core `src/clipboard/cross-sheet-cut/errors.ts`：新增用户可纠正错误；`test/cross-sheet-cut/command.test.ts` 增加该映射断言。精确英文已报 007 集中 Lingui：`The cut cells overlap a named range. Change or remove that name in Name manager before moving cells between sheets. No cells were moved.`
- React `e2e/cross-sheet-cut/named-range-recovery.spec.ts`：补充真实 DOM 分支，不新增 primary ID、不改原绑定。精确标题 `named range overlap rejects the cross-sheet cut and the same snapshot retries after name repair`。真实创建 CutSales→A1、第三表 SUM 依赖、造 redo、跨表拒绝、检查数据与 redo、名称管理器改指 F1、同一剪切快照重试并 Undo；截图输出 `named-range-rejection.png`。仅准备脚本，实际运行及审图由 007 提供。
- `docs/cross-sheet-cut/contract.md`：记录命名范围边界与修正方式。007 经 root 授权删除旧 `dom.test.tsx` 的三个 Testing Library 无效 `exact:true` 类型选项；本轮 owner 未并发编辑该文件，最新指纹纳入集成后的实际内容。

绿证（同一证据根）：

- `002-risk1-named-ranges-green.log`：`cargo test --manifest-path excel/rust/excel-core/Cargo.toml --test cross_sheet_cut --test named_range_reactivity --test clipboard_history`（cwd 仓库根），28 + 9 + 7 = 44/44 passed。
- `002-risk1-core-clipboard.log`：原 6 文件剪贴板影响集同命令（cwd `excel/`），86/86 passed，含本域 8 项。首次运行测试已通过但相对 tee 路径写错；已用绝对证据路径完整复跑并保存真实成功日志，没有将记录错误算成产品失败。
- `002-risk1-source-fingerprint.txt`：当前全部本域源/专项测试/契约文档 SHA-256，清单本身 SHA-256 为 `1a9b798a351a56f747b950fc58e450e2ebff11a5f51b9cd74df53c7782dd063d`；原首轮指纹和真实红证保留。新增文件最大 143 行，变更原生入口 163 行，未触发拆分豁免。本轮 8 个变更/新增文件逐一 `git diff --no-index --check /dev/null` 无空白诊断，已跟踪接线的 `git diff --check` 亦通过。

剩余仅 007 的共享 Lingui/WASM/真实 E2E/统一门禁与独立 reviewer 补审；不以本轮原生/Core 绿证替代浏览器通过。
