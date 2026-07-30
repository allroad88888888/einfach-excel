# perf-virtual（虚拟化 + 性能观测）— e2e cases

> 功能源码：excel/solid-excel/src/（旧壳 Table 虚拟化 + demos/DemoMillion.tsx、DemoLarge.tsx、
> sheet-store.ts 的 debug 探针）+ excel/spreadsheet-ui-core/src/viewport/（visible-window 契约）。
> 探针口径：本文件夹是**唯一**允许 `?debug=1` 内部探针断言的文件夹
> （`__einfachStore.activeSubscriptionCount` / `data-render-count` / `__einfachWorkbookDebugClient`）。
> 存量 spec 行数超限登记：million-demo.spec.ts 434 行、file-import.spec.ts 315 行
> （>300 但 ≤500 的历史文件，只登记不拆）。

1M Cells demo 版图（DemoMillion.tsx）：1000×1000，列宽 100px、行高 26px；种子 ≈2002 格
（A1=1、A2..A50 公式链、每 500 平铺地址一个数字、远角锚点 AAA500 / ALL999）。
列 AAA = 0 基 702 列 → scrollLeft ≈ 70200。

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| PV-01 | 1M demo 加载 A1 可见 | 打开 demo | A1 可见（30s 内） | ✅ 存量 | million-demo #"million_demo_loads_and_a1_visible" |
| PV-02 | 走 worker workbook RPC 协议 | 打桩 Worker.postMessage | 含 initWorkbook/beginImport/…、不含旧命令 | ✅ 存量 | million-demo #"million_demo_uses_worker_workbook_rpc" |
| PV-03 | 列向滚动订阅有界 | scrollLeft 50000 | after-before < 200 | ✅ 存量 | million-demo #"column_scroll_subscriptions_bounded" |
| PV-04 | 大选区删除走 range-native clear | 打桩 clear_range | 单次 [0,0,999,999]、不物化 selectionAddrs | ✅ 存量 | million-demo #"delete_large_selection_uses_range_native_clear" |
| PV-05 | 大选区格式走 range-native format | 打桩 set_format_range + Bold | 单次带 {bold:true} | ✅ 存量 | million-demo #"format_large_selection_uses_range_native_format" |
| PV-06 | 键盘导航穿越虚拟视口 | 18×→ + 28×↓ | S29 选中、DOM < 1500 | ✅ 存量 | million-demo #"keyboard_navigation_crosses_virtual_viewport" |
| PV-07 | 大选区复制走分块 TSV 导出 | copySelectionTextAsync | 只走 export_range_tsv_chunks、origin 标记 | ✅ 存量 | million-demo #"copy_large_selection_does_not_materialize_selection_grid" |
| PV-08 | selectionAddrs 大选区返回 null | 1000×1000 选区 | addrs === null | ✅ 存量 | million-demo #"selectionAddrs_large_selection_returns_null_without_materializing" |
| PV-09 | 选中单元格恢复进虚拟 DOM | setSelectionAnchor 远格 | AE51 可见且选中、DOM < 1500 | ✅ 存量 | million-demo #"selection restores the selected cell into the virtualized DOM" |
| PV-10 | 视口外粘贴往返 | 复制 B2 → 远行粘贴 → 回看 | 目标格有值、原格不变 | ✅ 存量 | million-demo #"paste_outside_viewport_round_trip" |
| PV-11 | 初始 DOM 行数远小于 1000 | Large Grid | row-header < 100、A500 不在 DOM | ✅ 存量 | virtualize #"initial DOM holds far fewer than 1000 rows" |
| PV-12 | 滚动水合视口外行 | scrollTop 13000 | A500 可见、A1 卸载 | ✅ 存量 | virtualize #"scrolling hydrates rows that were out of view" |
| PV-13 | 总滚动高度跟踪未窗口化行数 | 读 offsetHeight | 25000..28000 | ✅ 存量 | virtualize #"total scroll height tracks the un-windowed row count" |
| PV-14 | 行向视口 churn 订阅跟随视口 | 深滚往返 + 订阅计数 | after ≤ initial+100 | ✅ 存量 | virtualize #"viewport churn — subscriptions track the viewport, not scroll history" |
| PV-15 | 宽网格列 DOM 有界 | 1M demo 初载 | cell 数 < 1500、ALL1 不在 DOM | ✅ 存量 | virtualize #"column virtualization — wide grid keeps col DOM bounded" |
| PV-16 | render-count 探针开启 | Blank + debug=1 | renderCount 是数字 | ✅ 存量 | render-counter #"debug probe is on: renderCount returns a real number" |
| PV-17 | 精确订阅：无关格不重渲染 / 单依赖单更 / 三写三更 / 同值不更 / 仅依赖者更 | Blank demo 写入矩阵 | 各 renderCount 严格相等断言 | ✅ 存量 | render-counter 其余 5 条 |
| PV-18 | 滚动后 DOM cell 数视口有界（y 后 x） | 两轴分别滚动 | 每步 cell 数 < 2200 | ✅ 存量 | observability #"1M demo keeps DOM cell count viewport-sized after scroll" |
| PV-19 | worker 导入 lazy until read | 直连 proxy 导入 | 读前 eval=0、读后 clean | ✅ 存量 | observability #"worker workbook import stays lazy until formula is read" |
| PV-20 | 小 CSV/TSV 文件导入且公式懒 | 上传 mini 文件 | 值落位、公式读时才算 | ✅ 存量 | file-import #"imports small csv/tsv file and keeps formula lazy until read" |
| PV-21 | 取消长导入回零会话 | 上传大文件即取消 | 取消状态、importSessionCount 归零 | ✅ 存量 | file-import #"cancels a long-running import and returns to zero import sessions" |
| PV-22 | 远列（AAA）编辑视口往返后值与选区标记保持 | setSelectionAnchor 到 AAA1 编辑 → 回家 → 再出去 | '21' 仍在、cell-selected 落回、回家时 AAA1 卸载 | 🆕 本轮 | far-viewport-editing.spec.ts |
| PV-23 | 首屏公式引用远列格、远列编辑后重算 | B1==AAA2*2，远列改 21→30 | B1 42→60 | 🆕 本轮 | far-viewport-editing.spec.ts |
| PV-24 | 对角远角编辑持久 | 锚到 AAB500 写 7 → 回家 → 回访 | '7' 仍在、A1 种子=1 不变 | 🆕 本轮 | far-viewport-editing.spec.ts |
| PV-25 | 编辑中滚动后提交落在锚定单元格（纵向） | B2 开编辑 → scrollTop 52 → Enter | B2='123'，位移位 B4 仍空 | 🆕 本轮 | scroll-edit-commit.spec.ts |
| PV-26 | 编辑中滚动后提交落在锚定单元格（横向） | B2 开编辑 → scrollLeft 200 → Enter | B2='456'，位移位 D2 仍空 | 🆕 本轮 | scroll-edit-commit.spec.ts |
| PV-27 | 对角深位视口 DOM 与订阅有界、远角锚点可见 | setSelectionAnchor 到 AAA500 往返 | AAA500 锚文本可见、cell 数 < 2200、订阅 after-before < 200 | 🆕 本轮 | diagonal-scroll-bounds.spec.ts |
| PV-28 | 编辑中深滚至编辑格卸载的提交语义 | — | — | ⏳ P2 延后 | —（行为未定义：commit vs cancel 需产品决策后再钉；PV-25/26 只覆盖 overscan 内滚动） |
| PV-29 | 滚动进行中（惯性/连续 wheel）提交 | — | — | ⏳ P2 延后 | —（Playwright 难以稳定模拟惯性滚动，易 flake） |
| PV-30 | 裸滚动离开选中格后位置保持（不回弹） | scrollLeft/scrollTop 直写离开选区 | 滚动位置保持 | ⏳ P2 延后 | —（实测 2026-07-29：1M demo 上把选中格滚出视口的裸滚动会被 keep-selection-in-view 回弹，如 x=0 → 回 69226；million-demo 粘贴存量 spec 早已按此绕行。是否算产品 bug 需产品决策——本轮新增 spec 一律经 setSelectionAnchor 导航） |

统计：存量 21（PV-01..21，多 test 合并行按文件计全覆盖）/ 本轮新增 6（PV-22..27，
3 个新 spec 文件，wasm 全绿）/ 延后 3（PV-28..30）。
