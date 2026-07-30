# worker-backend（worker RPC / 后端桥）— e2e cases

> 功能源码：excel/solid-excel/src-vnext/adapter/（worker-workbook-backend.ts、worker-runtime.ts、
> worker-runtime-ts.ts、worker-protocol.ts、worker-factory.ts、worker-entry-ts.ts）；
> 契约：excel/spreadsheet-ui-core/src/backend/types.ts（requestId / revision / cancelToken）；
> 旧壳 worker：excel/solid-excel/src/wasm-workbook-proxy.ts。
> 存量 spec 行数超限登记：worker-workbook.spec.ts 1484 行、vnext-worker-backend.spec.ts 527 行
> （历史文件，只登记不拆，拆分另立专项）。

注：本文件夹存量 spec 大量使用 `?debug=1` + `__einfachWorkbookDebugClient` 内部探针，属历史
口径原样保留；按计划 §5，本轮新增 spec 只断言用户可观察面（单元格文本 / DOM），内部探针类
新用例一律归 perf-virtual/。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| WB-01 | worker 水合后种子值可见 | 打开 Worker demo | A1/B1 文本、D2/D6 公式结果 | ✅ 存量 | worker #"seed values become visible after the worker hydrates" |
| WB-02 | 输入立即显示（乐观写） | B2 输入 5 | 显示 5 | ✅ 存量 | worker #"typing into a primitive cell shows up immediately" |
| WB-03 | 写原始值经 worker 重算依赖公式 | B2=4 | D2=6、D6 级联 29 | ✅ 存量 | worker #"writing a primitive recomputes a dependent formula via the worker" |
| WB-04 | 公式源码显示在公式栏 | 点 D2 | 公式栏 =B2*C2 | ✅ 存量 | worker #"clicking a formula cell shows the formula source in the formula bar" |
| WB-05 | 3-sheet 依赖链求值与失效（RPC 层） | 直连 worker workbook RPC | 链式值、失效重算 | ✅ 存量 | worker-workbook #"evaluates and invalidates a 3-sheet dependency chain in the real worker" |
| WB-06 | 循环/畸形公式权威拒绝 + 水合后回滚 | 提交坏公式 | 返回 false、store 回滚 | ✅ 存量 | worker-workbook #"returns authoritative false for a formula cycle" 等 4 条 |
| WB-07 | 分块/稀疏导入不预热公式、null 终写序、issue 上报 | beginImport/importChunk/commitImport | eval 计数不增、读后才算 | ✅ 存量 | worker-workbook #"commits chunked import without hydrating formulas before read" 等 6 条 |
| WB-08 | 快照往返（sparse / persistence v1）与导入会话上限 | snapshot → import round-trip | 数据一致、超限报错 | ✅ 存量 | worker-workbook #"round-trips a sparse snapshot…" 等 3 条 |
| WB-09 | range TSV 导出不触发求值（单发 + 分块） | export_range_tsv(_chunks) | 公式源码导出、eval 不增 | ✅ 存量 | worker-workbook #"exports range tsv…" 2 条 |
| WB-10 | 大范围清除 + undo 不在主线程扩张 | clear_range → undo | 主线程无逐格展开 | ✅ 存量 | worker-workbook #"clears a large sparse range…" 等 2 条 |
| WB-11 | vNext 3-sheet 懒链 cache 状态（wasm-only） | vNext Worker demo + debug 探针 | C5 dirty→clean、eval 计数 | ✅ 存量 | vnext-worker-backend #"renders the Rust worker-backed 3-sheet dependency chain lazily through vNext" |
| WB-12 | 稀疏快照分块流式 + 会话取消 | snapshotRangeSparseChunks / cancelSnapshot | chunk 数、会话计数归零 | ✅ 存量 | vnext-worker-backend #"streams sparse range snapshots…" |
| WB-13 | 大 TSV 粘贴走 bulk import 协议 | 右键粘贴 10k 行 | beginImport/importChunk/commitImport、无 setCell | ✅ 存量 | vnext-worker-backend #"pastes large clipboard TSV…" |
| WB-14 | Ctrl+Arrow 数据感知跳转经 worker | A4 + Ctrl+→ | 落 C4、状态栏一致 | ✅ 存量 | vnext-worker-backend #"resolves data-aware ctrl arrow movement…" |
| WB-15 | sheet 拖拽重排经 metadata adapter | 拖 Sheet3 到首位 | tab 顺序 + sheetList + 投影 | ✅ 存量 | vnext-worker-backend #"reorders sheet tabs…"（sheets/CASES.md MS-12 同引） |
| WB-16 | 行高/列宽 sparse facts 持久化 | 拖 resize 手柄 | bounding box + persistence v1 facts | ✅ 存量 | vnext-worker-backend #"persists row and column size metadata…" |
| WB-17 | 列 autofit 持久化；行 autofit 缺失 | dblclick resize 手柄 | 列宽保持 + facts；行向不生效 | ⚠️ 存量 fixme | vnext-worker-backend #"autofits visible column size…" + fixme #"autofit on a compacted row grows it back to fit content" |
| WB-18 | TS worker SUM/UPPER/IF 种子回环 | vNext Worker TS demo | B5=60、C2=NORTH、D2=low | ✅ 存量 | vnext-worker-ts #"TS worker serves the seeded SUM / UPPER / IF round-trip…" |
| WB-19 | TS worker 实时公式编辑重算 | A6==B5*2 | 120、B5 不变 | ✅ 存量 | vnext-worker-ts #"live formula edit recalculates…" |
| WB-20 | TS worker 兼容性回归（RATE / #VALUE! / #NUM!） | 输入回归公式 | 各错误码/数值 | ✅ 存量 | vnext-worker-ts #"formula compatibility regressions…" |
| WB-21 | SEQUENCE spill 投影过 worker 边界 | A7==SEQUENCE(2,2) | A7..B8 = 1,2,3,4 | ✅ 存量 | vnext-worker-ts #"SEQUENCE spill projects 1,2,3,4…" |
| WB-22 | TS worker LAMBDA 注册（历史 fixme，已被 WB-24 覆盖） | — | — | ✅ 存量（fixme 壳保留） | vnext-worker-ts fixme #"LAMBDA registration round-trips…"（实际覆盖见 WB-24） |
| WB-23 | TS worker 启动/编辑无 console 错误 | 编辑后查错误守卫 | 无泄漏 | ✅ 存量 | vnext-worker-ts #"no console errors leak…" |
| WB-24 | Name Manager 定义 LAMBDA → =DOUBLE(5)=10 | 对话框 kind=lambda 保存 | A6=10 | ✅ 存量 | vnext-worker-ts-lambda #"define DOUBLE LAMBDA via dialog…" |
| WB-25 | kind 切回 range 隐藏 params 输入 | 切换 kind 下拉 | params 输入显隐 | ✅ 存量 | vnext-worker-ts-lambda #"switching kind back to range hides the params input" |
| WB-26 | 快速连续编辑最终一致、无旧值回闪 | B4 连提交 11..15，MutationObserver 记 C2 重绘序列 | C2 终值 18、观测序列单调不减、公式栏=15 | 🆕 本轮 | stale-request-consistency.spec.ts |
| WB-27 | 快速连续切 sheet 无陈旧投影串页 | 连点 Sheet2/3/2/1 不等待 | 终态整窗属 Sheet1（A1/A2/C2/B4），再切 Sheet3 干净落位 | 🆕 本轮 | stale-request-consistency.spec.ts |
| WB-28 | worker 崩溃/重启恢复 | — | — | ⏳ P2 延后 | —（adapter 无 terminate/restart 入口，需先加 debug 钩子才能注入崩溃） |
| WB-29 | cancelToken 主动取消的用户可观察面 | — | — | ⏳ P2 延后 | —（cancelToken 仅在 projection 请求内部流转，无 UI 直接触发口；快照会话取消已由 WB-12 覆盖） |

统计：存量 25（WB-01..25，其中 WB-17 为存量 ⚠️ fixme、WB-22 为历史 fixme 壳）/
本轮新增 2（WB-26..27，1 个新 spec 文件，wasm 全绿）/ 延后 2（WB-28..29）。
