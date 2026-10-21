# 007 集成与整体验收报告

状态：六域已合流，独立风险/UI数据审查无剩余阻断；最终单一完整E2E2617/2617、998主绑定、完整Vitest6425/6425及全部规定门禁通过，4236运行输入结束后0指纹差异。仅文档收尾，未commit/push，5191测试服务已停止。由root统一决定7任务与14矩阵完成状态，007不代签。下方早期实施账本保留历史，以文末最新结果为准。

## 基线与运行配置

- 工作目录：`/Volumes/work/self/excel`。
- 初次核对 HEAD：`b2ab6a1a0287cf6f0123ce3d7d55c07180264cfb`，分支 `main`；仅本次 `.tasks/react-excel-next-version/` 未跟踪，产品工作区初始干净。
- Node `v24.14.0`；pnpm `9.15.6`；cargo/rustc `1.95.0`；wasm-pack `0.14.0`。
- 持久证据根：`.codex-artifacts/react-excel-next-version.11oYiO/`。
- Playwright 项目当前端口 `5191`，真实 Vite Worker/WASM，workers=1；本地 retries=0，最终命令另显式 `--forbid-only --workers=1 --retries=0` 并输出完整 JSON。
- `.shared` 不存在；浏览器证据使用现有 Playwright，逐张查看实际截图，不声称运行不存在的视觉工具。
- 未运行全量基线检查：按 root 指示复用前版 `b2ab6a1a` 的既有证据。旧 2474 E2E / 955 绑定 / 6264 Vitest 只作为基线身份，非本版通过声明。
- 最终E2E自然exit0后已核对5191无监听，Vite测试服务停止；未commit/push。

初始 WASM SHA-256（重建前）：

| 文件 | SHA-256 |
| --- | --- |
| lite/einfach_wasm.js | `857c4ee07d0a37c39baa37665bf97632d0c10546afca8bcb61b6a72302b9b69d` |
| lite/einfach_wasm_bg.wasm | `105b67983b4f7f6d30d6a511c47fb92343373b596ea1849ea4d0ad9383d1eedd` |
| full/einfach_wasm.js | `86f9c31304bc6bc5a679dba3dbd86b8da9a96c169f940288e7916c662a3494a8` |
| full/einfach_wasm_bg.wasm | `4ecb0ab565fc48d8fa42a490c4e7520edc74d4089fb337b4f1efb43f82dec34a` |

## 技能与边界

已完整读取 `excel/react-excel/SKILL.md`、`excel/react-excel/skills/react-excel-feature-wave/SKILL.md`、`/Users/dol/.codex/skills/one-file-one-thing/SKILL.md`、`/Users/dol/.codex/skills/frontend-design-codex/SKILL.md`。index 中省略前缀的 feature-wave 路径实际按前者相对目录解析。

固定最短链：React DOM → UI Core command atom → 既有 Worker request/response → Rust/WASM → 返回 projection → React。状态所有权：Rust 拥有工作簿语义/事务/历史/持久化；Core 拥有 UI 草稿/命令状态；React 拥有 DOM、焦点与指针；transport 仅请求关联、错误和释放。

## 共用构件盘点与接线缺口

| 接线位置 | 已有构件 | 本版待收精确契约 |
| --- | --- | --- |
| Core 公共边界 | `src/index.ts`、`selection/index.ts` | 001 selection exports；003/004/005/006 public atom/type exports |
| Worker 命令 | `rust-workbook/commands.ts` 继承领域 command maps；`runtime.ts` 直接 dispatch | 各领域 command map、处理函数、revision/projection 返回约束 |
| WASM 原生边界 | `wasm-types.ts`，Rust `lib.rs` include 模块与 export | 002/004/005/006 准确 API/module/DTO 注册请求 |
| 生命周期 | `runtime/rust-workbook-runtime.ts` 已有 session/connection 所有权、候选文件替换、旧连接 dispose | 006 root 批准后的最短异步请求/结算方案 |
| 历史与文件 | 现有 Rust history + persistence 快照与 Core `history-apply.ts`/`file-io.ts` | 002 跨表事务、004 筛选分组、005 比较模式、006 定义持久化字段 |
| UI 入口 | 既有 grid pointer hook、InsertFunctionTools、FilterTools、ConditionalFormatTools、ribbon | 对应领域组件/hook 精确挂载路径与 props/atoms |
| Demo | `page/demo/demo-registry.ts` 注册 Sales Orders；sheet seed 位于 `page/demo/sales-orders/data/` | 新示例空白坐标或独立 page；保留 66 合并、128 列、Summary |
| Lingui / E2E | 既有 PO、feedback 与 `e2e/FEATURES.md` | 领域消息与稳定 ID/精确 primary title；007 独占 extract/strict compile/注册 |

首组 owner：001 `/root/next_multi_range`，002 `/root/next_cross_sheet_cut`，006 `/root/next_async_formulas`；契约直接互通并抄 root。

已接线：001 `selection/index.ts` 导出既有 `MAX_SELECTION_REGIONS`，新增 `setMultiRegionSelectionWithAuthorityReceiptAtom`，合法非空区域一次 commit 后返回最终 merged primary receipt；无效、空数组或写权限身份已变返回 null。复用既有输入快照/authority guard/normalize/commit/receipt，未改原 writer 返回类型。该存量文件原本已超 300 行，本次仅必要接线，不扩为重构；领域专项将覆盖事务内 receipt 消费。

002 契约：复用 `paste_clipboard`、现有 Core clipboard command 与多表 cells history，不新增 export/command/history 枚举。Worker 切表仅请求投影，不改已完成 capture 的 token；双方核对无需共享新协议。异表源/目标 merge 或 Table 相交明确原子拒绝，旧同表政策保持。

root 已授权并完成：001 navigation 非 composing Escape 在原 intent 判定前结束活动 pointer，保留编辑/公式引用优先级；为消除 `format-painter/index.ts → pointer-selection-commands.ts → format-painter/index.ts` 新环，把现有 painter 状态原样移到 `format-painter/state.ts`，index 保持 re-export。新 state 文件职责：格式刷 UI 模式状态，28 行，无新事实。

001 feedback 已从 package 边界导出并在 Footer 复用现有 error note、`role=alert` 与 `Selection change error` 标签。root 查明通用 autoscroll hook 被 FillHandle 复用，未修改该通用 hook；在既有 `grid/viewport/use-workbook-grid-events.ts` 读取 pointer 状态，非 drag-selection 时 effect 调用原 stop，enabled 保持 activeSheet，避免破坏填充。

006 root 已批准单挂起 await RPC 与 scoped 原生失败重试方案。已按准确契约接 Worker IO owner/constructor 注册/dispatch finally drain/awaitAsync/replace dispose-before-free；真实 settlement 回调只推进原 revision。commands/WASM types 继承领域接口，Core 两处当前连接发布后启用领域 waiter；native recalculate 在 callback/sheet 校验后调用 `retry_failed_async_custom_calls(sheet)`。未增加 Undo 或 dirty。

006 接线发现旧测试模拟对象缺契约：`rust-number-format-preview.test.ts` 4 项均在 initialize 返回 ok:false，原始日志 `007-async-runtime-mock-red.log`。旧 self 无 location.origin，旧 fakeWasm 无三个 async API；root 审红证后授权精确迁移。实际 28 个初始化 mock 仅补 origin 并继承 6 行的空原生队列 stub；所有旧断言保持。`rust-function-catalog.test.ts` 不初始化工作簿，未修改。受影响集命令 `pnpm exec vitest run $(rg -l 'installRustWorkbookRuntime' excel/spreadsheet-ui-core/test)` 一次 **29 文件 / 212 测试通过**，原始 `007-runtime-mock-migration.log`；不当作全仓通过。

迁移文件（均在 `spreadsheet-ui-core/test/`）：`rust-aggregate-runtime.test.ts`、`rust-calculated-column-input.test.ts`、`rust-calculation.test.ts`、`rust-clipboard-runtime.test.ts`、`rust-conditional-format-runtime.test.ts`、`rust-cross-sheet-edit.test.ts`、`rust-data-validation-runtime.test.ts`、`rust-fill-runtime.test.ts`、`rust-filter-runtime.test.ts`、`rust-find-runtime.test.ts`、`rust-freeze-worker.test.ts`、`rust-history-runtime.test.ts`、`rust-locate.test.ts`、`rust-merge-worker.test.ts`、`rust-named-range-runtime.test.ts`、`rust-number-format-preview.test.ts`、`rust-outline-runtime.test.ts`、`rust-quick-formula-runtime.test.ts`、`rust-remove-duplicates-runtime.test.ts`、`rust-sheet-history-runtime.test.ts`、`rust-sheet-runtime.test.ts`、`rust-size-runtime.test.ts`、`rust-sort-runtime.test.ts`、`rust-spill.test.ts`、`rust-structure-worker.test.ts`、`rust-table-runtime.test.ts`、`rust-text-columns-runtime.test.ts`、`rust-visibility-runtime.test.ts`。

006 已修复 007 指出的初次 watcher 事务内派生 connection 缓存边界（一次 microtask 后读身份）；原生专项已证明先读 #NAME? 后可信 registry 注册使缓存失效，真实 openFile 仍待浏览器证据。

006 后续 root 批准的最终契约增加严格 `read_custom_formulas()`，用于 FETCHJSON 与文件表达式重名预检；统一空队列 stub 已补 `'[]'`。成功结算使用 `{json: scalar|2D}` 字面值 envelope，失败保留 `{error}`，旧直接 token/array 语义保持；无新 export/签名。Worker initialize/openFile 在 IO 构造拒绝时 free 候选且保留旧 owner/book，007 新 `async-candidate-ownership.test.ts` **1/1 通过**，原始 `007-async-candidate-ownership.log`。后续受影响 runtime 重跑的旧 29 文件 / 212 项保持通过，新纳入的 002 runtime mock 曾因新 read 契约缺失红证 3 项（`007-runtime-final-contract.log`），已回 owner 精确修复，其相关 Core 85 项通过；不拼接冒充整仓结果。

Demo/fixture 已建：`?demo=async-formulas` 独立双表，`public/demo/async-formulas/result.json` 为公开标量/矩阵样例；原 Sales Orders/Summary 不改。002 `e2e/fixtures/cross-sheet-cut/{index.html,main.tsx}` 两入口获 root 精确授权，纯定义放 `src/page/demo/cross-sheet-cut/`，三表公式、Stop/Warning/合并拒绝样本按领域契约，未注册 demo 菜单。新文件职责分别为静态 JSON 数据、异步原生种子、异步工作簿定义、异步 demo 挂载、跨表原生 fixture 定义及两薄入口，无复制运行层。

003 已按报告准确接 package atoms/type、无 props 的 `FormulaArgumentsDialog`、picker 外挂载、`Fill arguments` 按钮与 trigger DOM 焦点标记。先打开参数表单成功才关闭 picker；保留原 `Insert draft`、搜索和帮助。领域实现仍在其目录，007 未搬入 UI 命令语义。

004 已按准确契约接两层 groups DTO、FilterSortState 深拷贝/效果识别、普通与 Table projection 校验、初始 Table filterGroups 深复制冻结及 Worker 原样命令；Rust module/SheetFilterState/ Table metadata history/reapply/with_filter_groups、WASM applyFilter/table action/getFilter/sheet_visibility/文件 Table wire 保留分组。旧 rules 与 groups 非空互斥，不把 OR 复制成权威 flat AND。004 的现有条件字段组件复用，007 只加 indices/grouped 适配；完整面板挂高级分组、列面板保旧，候选页挂全部搜索匹配操作，busy 不允许提交。

上述 004 跨共享额外文件已逐项获 root 精确授权。`engine_owned_filter.rs` 两个旧 DTO 构造只补 `groups: Vec::new()`，原断言不动；不为制造已知编译红证重复 Cargo。其它 filter*.rs、wire helper 与语义均由 004 独占。

005 确定共享已接新增 text wildcard 条件、可选 duplicate compareBy（省略不补写），snapshot/editor 错误委托领域 helper，既有字段块换领域组件。Rust workbook module 注册、Duplicates statistic 与 base format 投影参数按领域准确签名接线；不在 TS 计算匹配，不改样式存储。原 picker 操作区仅加 flex-wrap，三按钮窄屏实际布局仍待浏览器审图。

当前 001/002/006 独立风险审查快照位于证据根 `007-review-{001,002,006}-manifest.txt`、对应 `-tracked.patch` 与 `-new-files.patch`，含精确文件与 SHA-256。补充 `007-review-shared-registries-and-runtime-mocks-manifest.txt` / `.patch` 含 28 旧 runtime mock、feedback/FEATURES 注册。均明确标当前快照，不是最终全版冻结；共享 barrel/types 可能含后到领域的独立小 hunk。

FEATURES 已登记 MRSEL-001..008、XSCUT-001..008、AFORM-001/002、FARG-001..008。现有脚本只接受三位数字 ID，因此把领域原建议的二位数 XSCUT/AFORM 规范为三位，真实 test title 保持未变，已通知 owner 同步报告；未改脚本。登记不是 passed 声明。初次原绑定静态身份核对 **955/955 原 file/title 保留**，原始 `007-original-bindings-initial.log`（当时共 973 条，后续再加 FARG 八条）。

## Cargo 与验收计划

最新登记状态：MRSEL 8、XSCUT 8、AFORM 2、FARG 12、AFILT 8、AFMT 5，共新增 43 个主绑定，原 955 未迁移。005 原建议 CFADV2 前缀不符合既有 checker；root 裁决合法 AFMT 三位 ID，领域已同步准确 test title，未改全局脚本。

既有 `architecture_invariants::wasm_public_api_signatures_unchanged` 已执行 **1/1 通过**，`007-api-signatures.log`；未改快照。随后 root 独立审查发现 002 named-range 跨表移动错算与 006 HTTP 提前返回未 cancel body 两处 Important，WASM build 尚未启动，待修复关闭。当前 Cargo 窗口转交 002，按真实红→最小拒绝→原生影响集绿修复；005 已以 32/32 原生影响集交付，004 已以 67/67 原生影响集交付并释放窗口。

Lingui 首次 extract 得 en/zh 各 1441，34 个新 zh 空项已补译；004 后续 8 个新 feedback 已登记，待 002 审查修复文案后最终 extract/strict compile。不把首次提取当最终词典通过。

React 类型诊断初次失败保存 `007-react-typecheck-red.log`。自有 fixture 用 `satisfies RustWorkbookDefinition` 保留 validation 字面量类型；root 精确授权四个新 React 测试的类型迁移：003/004/002 删除 TestingLibrary 不支持且运行时忽略的 `exact:true`（字符串 name 默认精确匹配），001 的 `kind:'cell'` 仅加 `as const`。全部业务断言/流程不变，不为此重跑稳定领域专项，统一门禁随后覆盖。

这四文件修改后的 SHA-256：004 fixture `42c5b8aff46542faae3d33e82641a98382a04690ec3586b60dad7e4108ce0fc1`；002 dom `404b8d6860c8c98263fa9b59ab05128b317ac1a03d2ced326e652c7e18759b97`；003 dialog `986529068cdd8b4d5e4a06a990b5d5641ab8634532bda017af9e540949dd837a`；001 pointer `6c808961f3d5dae41f119181693fb3a269ca495f0529b9ed9b913686e47dcf77`。

007 新增 group shared 接线测试 **1 文件 / 5 项通过**，`007-filter-groups-wiring.log`；Core source `tsc --noEmit` 诊断 exit0（首次误带 `--incremental false` 被 composite 配置拒绝，去掉该选项后正常）。这些是局部诊断，非最终全仓 gate。

当前 Cargo 窗口交给 005 四个原生专项（正确 manifest 路径已告知），004 尚未启动。下述首组结果复用，不重复运行。

- Cargo 窗口由 007 串行管理，当前空闲。002 最终领域 22/22、相关原生 60/60 + lib clipboard 47/47；006 async/manual 首批 9+6，通过重名追加专项后 async 为 10/10。结果原始日志分别由领域报告登记，007 不重复领域专项全仓。001 复用 109 Core / 11 React；002 复用 85 Core / 19 React；006 当前专项以其最终报告为准，均不当作浏览器通过。
- 未全领域合流前不重建 WASM、不跑 full gates。原生 API 可编译后先运行既有 `wasm_public_api_signatures_unchanged`，审精确签名差异，再统一 `build:wasm:both`。
- 最终一次完整 E2E 冻结 source/test/WASM/config 至自然结束；原始完整 JSON + `check:e2e-features --results` 为整版证据。
- 真实 E2E、双语 1280/390 截图与逐图审查、全仓门禁、独立审查均尚未执行。

## 功能链路与证据账本

| 矩阵 | 实际入口 / 原生行为 / 恢复 | 主绑定 / 结果 |
| --- | --- | --- |
| M-01 | Ctrl/Meta 点击与拖动 → 既有 pointer atom → 唯一 Core selection；重复区激活、重叠保留 | MRSEL-001..005；109 Core/11 React；最终同一JSON含本域30/30严格通过 |
| M-02 | 多区格式/清除/union 统计 → 既有 Rust 操作；Escape/合并/冻结/滚动保旧优先级 | MRSEL-006..008及旧填充回归最终全绿；中英两宽实际图审，budget复用真实Core/React证据 |
| C-01 | 系统/工具栏 cut → 原 clipboard command/token → Rust 多表 cells 事务；三表公式与一次 Undo/Redo | XSCUT-001/002；原生44/Core86；最终同一JSON本域13/13真DOM通过 |
| C-02 | 原生写前权限/部分引用/合并/Table/命名范围拒绝；Stop 回滚、Warning 取消/重试不耗快照 | XSCUT-003..008及named-range修复重试最终通过；双语两宽4图及错误图实际查看 |
| A-01 | ƒx → Fill arguments → Core 原生签名草稿 → 既有 formula-bar Enter → Rust | FARG-001..006、009/010；17 Core/5 React；最终同一JSON本域19/19，完整Vitest真实502签名断言绿 |
| A-02 | 表单/生成草稿取消零写、必填错误纠正、保护与目标身份守卫、DOM 焦点循环 | FARG-007/008/011/012最终全部通过；8张中英两宽图实际独审 |
| F-01 | 原筛选面板 → Core 分组草稿/全部搜索查询 → 原 filter/table Worker → Rust AND/OR 扫描 | AFILT-001..008；67 Core/15 React/67原生；最终同一JSON本域24/24真DOM通过 |
| F-02 | 普通/Table 各自原生条件快照，显式 Reapply；history/file 保 groups，旧 flat AND 兼容 | 最终真实Table groups下载/清除/重开且另一Table独立保持；8图独审，兼容Important关闭 |
| S-01 | 原条件格式面板 → Core wire 草稿 → Rust 通配符/基础显示文本判重 → 原生显示投影 | AFMT-001..004；6 Core/3 React/32原生；最终同一JSON本域22/22真DOM通过 |
| S-02 | Sheet 基础样式事实 → 每规则/显示快照一次稀疏 format-input → 既有 derived 统计；原 history/file | AFMT-005及lifecycle最终全部通过，8图实际独审；无TS匹配器/样式镜像 |
| Q-01 | 原公式栏 → Rust memo/queue → Worker 同源 HTTP → 旧 resolveAsyncCustomCall → 原生依赖/array | AFORM-001；53 Core、原生10+manual6；最终同一JSON本域28/28真实DOM/HTTP/lite+full wire通过 |
| Q-02 | 单 settlement latch waiter 推原 revision；换实例 dispose-before-free，失败候选保旧；Recalculate scoped retry | AFORM-002及lifecycle/wire最终通过；8张中英两宽BUSY/settled图实际独审 |
| X-01 | 六域真实入口及旧955绑定、原Sales Orders/Summary/66合并/128列保持 | 单一完整2617/2617，998主绑定均恰一次成功，955原file/title与旧E2E源码无迁移 |
| X-02 | 共享 schema/history/persistence/Worker/UI/Lingui；统一构建/原生/WASM/图审/覆盖 | 全部规定门禁/独立审查绿；最终JSON、998 --results及4236输入0差异审计通过，见文末证据 |

## 统一构建与浏览器影响集启动快照

上文 Cargo/构建段为实施过程账本，以本节最新状态为准。002 命名范围拒绝与 006 HTTP body 清理两 Important 已经原风险 reviewer 第1轮精确补审关闭；root 放行统一构建。004 当前仅修 TS 旧 flat list 兼容契约，不影响 native 输入。

- `pnpm --filter @einfach/excel-wasm build:wasm:both` **exit0**，完整日志 `007-wasm-build-both.log`；lite/full 各自编译并按原脚本剥离 names。没有改签名快照或构建脚本。
- native 输入所有 rs/toml/Cargo.lock 文件与 aggregate 位于 `007-wasm-build-native-input.sha256`；产物 SHA 位于 `007-wasm-build-output.sha256`。lite WASM `adccb69f0e9951d845a96b7d4a18bea1044b734d49f802bb425270c5cc1741dc`，full WASM `9d1f258a7ca35485d4682c2b2c16cf2f30a4a9ef972e9c596ae3b9dbbf65a2e5`。
- `pnpm exec tsc -p excel/react-excel --noEmit --pretty false` **exit0**，`007-react-typecheck-green.log`。最后 TS2742 仅按 root 授权在 003 harness 的 showArguments 加 `ReturnType<typeof setupArguments>`；不改运行流程。该文件 SHA 见上述输出指纹文件。
- 新自有 `e2e/next-version-integration` 三个 spec：001 中文正常修饰键追加/多区状态两宽；006 en/zh 两宽实际 BUSY/settled 两时点；Table groups 下载→清除→真实文件重开，并检查另一 Table 旧 flat 条件/隐藏结果独立保持。均走现有页面、DOM 与 runtime，不新建测试写值通道，不新增主 ID。root 明确预算反馈只复用真实 Core/React 拒绝及 Lingui strict，不造假 alert 或大体量浏览器粘贴。
- 三个自有新 spec 的 scoped ESLint（root 配置显式路径）exit0。首次误从包目录运行未给 root 配置，ESLint 报缺配置；未改配置，按仓库命令入口后通过。
- 影响集 `--list` 为 **177 tests /49 files**，仅代表成功收集，未当 passed：六域目录、自有交叉，以及既有 drag autoscroll/capture recovery、fill-handle 与 reverse-scroll。等 004 product/test 冻结即单进程 workers1/retries0/forbidOnly 真实执行。尚不是最终整版 source/test/WASM/config 冻结。

### 浏览器诊断 r1（真实红证，非整版结果）

`007-e2e-impact-r1.{log,json}` 与同名原始 output 目录保留。单进程 `--forbid-only --workers=1 --retries=0 --max-failures=5` 自然结束：**20 passed /5 failed /152 未执行**；JSON 的 skipped 是 max-failures 后未运行项，不是新增 skip/fixme。5 红分别为 004 搜索全选/清除两宽的错误数量假设（真实 SO-10=998，原 seed 第3条订单ID既有强制文本00123）及 005 AFMT-003 的多格 GoTo 后活动格值假设。已交原 owner/root确认最小修正，不改原 seed、旧955绑定或调宽断言。高亮匹配等已通过段不当完整 case 通过。

实际逐图查看 r1 的 **8 张 advanced-filter en/zh×1280/390 top/footer**：组框层次、搜索按钮换行与所有底部动作可读；窄屏内部纵向滚动，不出现横向裁切。root 独立实际查看的范围仅 zh390 top/footer 两张，结论一致，不能据此冒充其它图已独立审阅。截图精确路径在 r1 输出目录相应 layout case 中。其它领域尚未生成图，本轮未执行不签绿。

### 浏览器诊断 r2 与真实 DOM 漏接修复

`007-e2e-impact-r2.{log,json}` 自然 max8fail 结束：**80 passed /8 failed /43 未执行**。002 全部13真实 case（含 named-range 修改后同快照重试）通过；003 18/19通过；006 24/28通过；原填充柄21个两宽/方向/取消交叉通过。尚未运行项不当 passed，不与其它诊断轮拼成最终完整结果。

001 三条实际红精确定位到 007 所有共享文件 `use-workbook-grid-events.ts` 的 `getGridKeyboardInput()` 白名单缺少 Escape。Core dispatch 的取消/清区专项正确，但真实 DOM 键从未送到 Core。最小修复只在已有 F2/Backspace/Delete 分支加入无修饰 Escape，保持 composing、编辑、引用和格式刷优先级；该文件 SHA `1e3a966c30544a7bec00d98ea9de92f37c0b8101491b84c190be149d2d2ba105`，scoped ESLint exit0。未改领域001测试或调宽选区预期；原持久失败用例作为真实回归，r3将重跑001与旧选区/填充自动滚动。

其余真实红已交 root/原 owner：006 两处空 customFormulas 字段假设、原生改名规范化公式括号、跨表滚动时以 overscan DOM 不存在推断可见性；003 FARG-003 生成空位精确 draft 已过但原生 XLOOKUP 计算 #VALUE! 而非20，需区分既有引擎限制与实现语义，不擅自改预期。

实际查看 r2 的002双语两宽4图及 named-range-rejection 图：底栏错误换行可读、源/目标及命名管理修复提示不裁切。003 en/zh两宽top/footer8图已逐张查看：必填错误、聚焦输入、参数组/固定尾参和底部取消/生成按钮可读；英文窄屏长说明正常折行，footer在窗口内。旧填充预览两宽图另作交叉查看。其它001/006布局仍待实际执行与审图。

### 浏览器诊断 r3 与静态收尾

PTY12236 已自然退出 exit1：`007-e2e-impact-r3.{log,json}` **113 passed /4 failed /0 skipped /0 flaky**，共117项，不是最终全量。004全部24、00128/30（含Escape三项）、00520/22、自有交叉7项和旧选区/填充34项通过。四红仅005满1048576行画布直接插行的两宽前置，以及001 overlap 两宽（1280状态计11但数字统计3；390实际范围B93:D93），均回原owner核查，不擅改预期。

root 已授权共享 keyboard 消环：navigation 且非 composing 的 Escape 直接调用既有 `cancelPointerAtom` 与 `resetAppendPointerAtom`，再走原 clearNonPrimary；编辑/公式引用优先级不变。`check:cycles` **exit0，829模块/2444依赖**，原始 `007-cycles-green.log`；精确 Core keyboard+cancel/limit **2文件55项通过**，`007-escape-cycle-core.{log,json}`。原37 lint红证中007精确授权项只断行/brace/静态type，不改控制流或断言；006 IO闭包由原owner处理。

已逐张实际查看 r3 **28张PNG**：001英文点击/拖拽/冻结/合并十图、中文追加两图；006中英两宽BUSY/settled八图；005文字/比较中英两宽八图。精确路径与观察边界在 `007-visual-review-impact-r3.txt`。窄屏选区反馈折行可读；异步B3结果与底栏可读，390视图真实水平滚到B列，原公式输入展示其水平滚动后的长表达式尾段，不声称长公式/屏外C3同时完整可见。格式字段/长说明/底部动作可达。图片不是完整E2E通过声明。

完整静态 `check:presentation`、`check:docs` 已exit0（`007-presentation.log`、`007-doc-links.log`）；`test:scripts` **17/17通过**（`007-test-scripts.log`）。`lint:check` 原37红正在获准精确收尾；root mainline types/full Vitest/build、Rust default/lite/core/WASM及真实Chrome harness、最终单一完整E2E仍以实际后续结果为准。README/FEATURE_PROGRESS/current-capabilities/FEATURES引言已区分前版2474/955历史与当前998登记/集成验收中，不提前声称当前全量绿。

### r4 必要回归与完整门禁首轮

r4 PTY46779 自然结束 exit1，`007-e2e-impact-r4.{log,json}`：**87 passed /3 failed /0 skipped /0 flaky，共90项**。001 overlap真实指针居中前置两宽严格通过（name/union3/stats/未选D93全部保留），Escape/引用/格式刷优先级14项、003原生调用6项（含FARG003引用）、006全部28项（含IO闭包和lite/full wire）、旧选区/填充34项通过。005390四个生命周期及1280 literal通过；1280另三个均30秒总超时，trace持续成功走到末尾Undo/尺寸恢复，仍保红证，需无竞争原样复验，不改超时或断言。

原生完整 default **3711 passed /0 failed /10既有ignored，282结果段**，`007-native-default-full.log`；lite完整随后串行执行中。统一WASM的1157个native输入再次只读核对 **0 mismatch**，未重建或改API。root `typecheck:mainline`、完整 `build`（Rollup+Vite699模块）及 `lint:check` **exit0**，分别 `007-mainline-types.log`、`007-root-build.log`、`007-lint-check-green.log`。新162个未跟踪文件无>300行源文件、无尾空白（TSV不规范化）；`git diff --check` exit0，`007-untracked-quality-audit.log`。

完整Vitest首轮 PTY45520 自然 exit1：**464文件、6425项，6363 passed /62 failed**，原始 `007-vitest-full-red.log` / `007-vitest-full.json`。54项为5秒超时，余8项含3个旧runtime命令列表新增awaitAsync、export一次mock被新waiter消耗、003新metadata测试cwd路径错误和3个React失败。已报root精确迁移请求，未私改旧断言。首轮同时跑Cargo lite编译/全Vitest/build/lint，10核16GiB机器出现资源竞争；这只是超时成因假设，必须以串行/低CLI worker原样复验核实，不当成通过或改全局时限。

### 重门禁串行与精确测试契约迁移

lite 完整 PTY40024 已自然 exit0：**3671 passed /0 failed /10既有ignored，282结果段**，`007-native-lite-full.log`。无并行重算后，原三个 React 非timeout及page-key诊断保持源/断言不变，**4文件9项全部通过**，`007-react-failure-diagnostic.{log,json}`；005原1280三条生命周期保持spec不变，r5 **3/3通过**（22.0/25.8/23.7秒），`007-e2e-impact-r5.{log,json}`。这些是真实影响集绿证，仍不替代完整Vitest或单一最终E2E。

root 审阅首轮真实红后，只授权三个旧 Core runtime mock 挂起已记录的 `formula.awaitAsync`，精确命令顺序追加该唯一请求，不过滤命令、不让waiter消耗export一次mock；原Table次序、文件错误/不丢文档/重试/销毁断言全部保留。003 metadata测试只由cwd路径改文件相对URL；直接 `new URL(..., import.meta.url)` 被Vite静态asset重写而出现非file scheme真实红，改用 `node:url` 的 `NodeURL` 别名保持同一路径，原502全部签名断言未变。四文件最终影响集 **31/31通过**，`007-runtime-await-path-migration-green.{log,json}`；中间30/31红保留 `007-runtime-await-path-migration{.json,-red.log}`。

完整Vitest按CLI单worker/no-file-parallelism独立运行，PTY47599自然 **exit0：464文件、6425/6425项通过**，201.12秒，`007-vitest-final.{log,json}`。无Cargo/build/浏览器并跑，生产及其它测试冻结，不增加timeout/retry或改全局配置。四迁移文件scoped ESLint随后exit0，`007-runtime-await-path-scoped-eslint.log`；其最小diff/指纹为 `007-runtime-await-path-migration.patch` / `.sha256`。

后续串行原生补验：`cargo test --manifest-path excel/rust/core/Cargo.toml -j 1` **64/64通过**（19+4+7+34，含10万依赖链与反向依赖接口），`007-primitive-core-full.log`；`cargo test --manifest-path excel/rust/wasm/Cargo.toml -j 1` **205 passed /0 failed /1既有ignored**，`007-wasm-native-full.log`。原生0项的wasm32门控web测试未冒充真实浏览器已跑。真实Chrome harness PTY28945随后单独自然 **exit0，7/7通过**（lib1+web6），`007-wasm-chrome-harness.log`；两个只配置Node的custom formula suites按既有harness配置不在Chrome执行，未冒称它们有浏览器结果。

### 最终单一完整E2E：自然结束并核验通过

实际完整收集 **2617项/362文件**，998主绑定无错误，原955 file/title没有迁移，`007-final-e2e-collection.json`。全部tracked/untracked非文档输入及生成lite/full包、Lingui编译消息共 **4236文件**，`007-final-inputs.sha256`；aggregate `4a3f88e5bc34e6571e78de98e1b2fd2035ea626b66383c9c5b8f4691835ba402`，运行前0mismatch。文档/任务报告不作为运行输入，FEATURES登记文件包含在冻结清单。

唯一完整过程PTY **68998** 已自然 **exit0**：`PLAYWRIGHT_JSON_OUTPUT_FILE=<证据根>/007-e2e-final.json pnpm exec playwright test --forbid-only --workers=1 --retries=0 --reporter=list,json --output=<证据根>/007-e2e-final`，cwd为`excel/react-excel`。**无max-failures、无重门禁并跑、source/test/config/WASM全程冻结**。完整命令/计划数/指纹见`007-final-run-identity.txt`，完整原始stdout/JSON为`007-e2e-final.{log,json}`。

最终JSON：**2617 expected /0 unexpected /0 skipped /0 flaky，362文件，errors=[]**，5447356.792ms（90分47.357秒）；每项expectedStatus均passed、结果恰一次passed/retry0，workers1/retries0/forbidOnly=true/maxFailures0。六域分别30/13/19/24/22/28，加自有集成交叉7，共143个新增case，全部在这一次完整运行通过；不拼接r1–r5诊断结果。正式`pnpm check:e2e-features --results <证据根>/007-e2e-final.json` **exit0，998/998**，`007-e2e-features-final.log`。

结束后、任何文档编辑前重新逐文件核验 **4236/4236一致、0 mismatch**；原955主绑定file/title及旧E2E源文件0迁移。`007-final-result-audit.json`同时保存冻结清单aggregate、严格JSON/config/每项次数审计、955身份、998结果和464文件6425/6425 Vitest复核。5191端口已无监听，测试Vite服务停止；所有执行session均自然结束。

独立`007-review-risk.md` R2及`007-review-ui-data.md`均无剩余阻断；复用已实际审阅的稳定源码delta和中英两宽截图，不再重复全域审查。root已独立读取本次最终JSON、955/998绑定及原始build尾。build存在既有>500k chunk warning，不宣称零warning。Chrome harness只宣称实际7项，不把Node-only或wasm32门控原生0项冒充浏览器通过。

交付边界保持：跨表剪切源命名范围重叠、源/目标合并或Table等不安全情况写前原子拒绝；FETCHJSON是只允许同源JSON的项目扩展，须手填，不伪装Office内置函数或原生目录/参数表单元数据。未实现远程协作/自动保存等不在范围的服务，不新增运行fallback。未commit/push。

最后只更新README、FEATURE_PROGRESS、current-capabilities和FEATURES引言及本报告，不变更任何绑定行、源码、测试、配置或WASM，稳定产品不重跑。`007-final-documentation-audit.json`证明其余4235冻结输入完全一致，FEATURES唯一差异为引言结果一行，逆向恢复旧引言后SHA与冻结清单一致；998绑定仍精确成功。四文档前后SHA、相对base完整文档diff分别在`007-final-documents-before.sha256`、该审计及`007-final-documentation-vs-base.patch`。

收尾`check:docs` **exit0：473份活文档、4430文件零失效路径**，`007-final-docs-check.log`；`git diff --check` exit0。这些只是文档轻量校验，不重跑稳定产品。最终源码/测试/config/WASM无新增delta，所有临时服务已停止，无剩余执行session、未提交或推送，交root统一关闭任务与14矩阵。
