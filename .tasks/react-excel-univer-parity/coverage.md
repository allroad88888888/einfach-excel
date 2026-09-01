# React Excel 全功能覆盖与合同就绪度

分类：`A` 当前 Rust/UI-core 合同可直接消费；`B` 先补 canonical/Rust/WASM 合同；`C` 依赖真实外部服务；`D` 明确 Deferred/范围外。

## 旧总账 #01–#41

| # | 功能点 | stage | readiness | 前置裁决 |
|---:|---|---|---|---|
| 01 | 工作表创建、切换、重命名、删除、排序 | S02 | A | Rust sheet ports |
| 02 | 行列插入、删除、清空 | S04 | A | Rust structure ports |
| 03 | 行高、列宽、隐藏、取消隐藏 | S04 | A | Rust size/hidden ports |
| 04 | 合并、取消合并 | S04 | A | adapter overlay contract |
| 05 | 冻结窗格 | S04 | B | Rust worker 尚无 freeze port，先补 canonical/RPC |
| 06 | 选区、多选区、名称框、定位 | S01/S02 | A | visible projection |
| 07 | 分组、大纲、折叠层级 | S05 | B | 冻结 outline canonical owner |
| 08 | 单元格直接编辑、提交、取消 | S01 | A | Rust cell input ACK |
| 09 | 公式栏输入、引用模式 | S02/S08 | A/B | A1 可做；R1C1/name 先补 dialect |
| 10 | 复制、剪切、粘贴、Copy As | S03 | A/B | 补 delayed-cut/undo 语义 |
| 11 | 选择性粘贴 | S03 | A/B | 补 comments/column-widths |
| 12 | 自动填充、序列 | S03 | A/B | 补 date/weekday/month/custom/formula |
| 13 | 分列 | S03 | A | Rust chunk import |
| 14 | 查找、全部查找、替换、全部替换 | S03 | B | 冻结 Rust search/replace CAS port |
| 15 | 撤销、重做、本地历史时间线 | S02 | A | Rust worker history ports |
| 16 | 富值、特殊单元格类型 | S05 | A | projection rich type |
| 17 | 工具栏常用格式 | S05 | A | Rust format port |
| 18 | 设置单元格格式会话 | S05/S06 | A | format lifecycle |
| 19 | 数字格式 | S05 | A | Rust effective format |
| 20 | 格式刷 | S06 | A | canonical capture/apply |
| 21 | 条件格式 | S06 | A | Rust/adapter rule projection |
| 22 | 数据验证 | S06 | A | adapter overlay/enforcement |
| 23 | border、rotation、完整格式投影 | S06 | B | shared-edge/diagonal/write-order |
| 24 | 公式解析、函数调用、引用解析 | S08 | A/B | A1 可做；R1C1/name live semantics 待补 |
| 25 | 函数目录、函数 atom | S08 | A | Rust catalog witness |
| 26 | 自定义公式 | S09 | A | Rust async custom pipeline |
| 27 | 命名区域、名称管理 | S09 | A/B | stored definition 可做；live range 待补 |
| 28 | 重算、异步公式、Rust parity | S08 | A/B | async 可做；manual/status/cancel 待补 |
| 29 | 排序、筛选 | S07 | A | Rust filter/sort |
| 30 | 删除重复项 | S07 | A | Rust exact mutation |
| 31 | 状态栏计数、求和摘要 | S07 | A | raw canonical projection |
| 32 | Excel Table、structured refs、totals | S09/S10 | A/B | CRUD/totals 可做；resize/style/filter 待补 |
| 33 | 外部数据、查询、连接 | S16 | D | canonical 文档仍为 Deferred |
| 34 | 批注线程、草稿、提交、刷新 | S15 | C | thread read/ACL/storage/events service |
| 35 | 备注、任务化、通知 | S15 | C | identity/notification service |
| 36 | 本地 undo/redo 历史 | S02 | A | Rust history ports |
| 37 | Show Changes | S16 | C | durable revision log service |
| 38 | 版本历史、快照、恢复 | S16 | C | durable snapshot service |
| 39 | Sheet Views、个人视图 | S10 | B/C | view context 先补；持久个人视图需服务 |
| 40 | 工作表/范围保护、解锁 | S15 | A | UI-core canonical；持久化单独门禁 |
| 41 | 工作区加载、投影、恢复、stale 防护 | S01/S11 | A/B | UI lifecycle 可做；authoritative restore 待补 |

## 新增交付面

| id | 功能点 | stage | readiness | 范围 |
|---|---|---|---|---|
| X01 | Rust-only neutral worker 包 | M0 | A | 首批为 private React workspace source package；无 TS/Solid runtime |
| X02 | Univer 风格 React shell | S01 | A | 不复制商标与受保护素材 |
| X03 | XLSX/CSV/workbook codec | S11 | B | Rust persistence/codec port |
| X04 | deterministic pagination/print | S12 | B | Rust page model + React preview |
| X05 | 主题、i18n、responsive | S13/S14 | A | 横切矩阵进入阶段时展开 |
| X06 | touch/mobile workspace | S14 | A | 390px、44px hit area |
| X07 | performance/a11y/browser RC | S14/S16 | A | audit 只报告，修复开 discovered leaf |
| X08 | charts/images/shapes/floating objects | — | D | UI-core 无 canonical module，范围外 |

## 当前阶段横切矩阵

`producer` 只产生合同/组件，`composition` 使其默认可达，`audit` 负责最终证据；当前 detailed 行与叶子双向对应。

| id | 子表面 | 精确路径 | producer | export | composition | audit | evidence |
|---|---|---|---:|---:|---:|---:|---|
| C00 | Univer design vocabulary | `react-excel/src/design/**` | 107 | 108 | 110 | 114 | token test + browser layout |
| C01a | Rust-only dependency boundary | `rules/react-rust-only-boundary.test.mjs`, package manifests | 001,002 | 015,017 | 017 | 020,114 | boundary test + bundle scan |
| C01b | exact RPC lifecycle | `excel-worker/src/protocol/**` | 003,004 | 015 | 011 | 019,114 | protocol/client/browser tests |
| C01c | Rust host/generation/manifest | `excel-worker/src/runtime/wasm-surface.ts`, `excel-worker/src/runtime/wasm-guards.ts`, `excel-worker/src/runtime/workbook-context.ts`, `excel-worker/src/runtime/handlers/workbook.ts` | 005,006,007 | 015 | 011 | 019,114 | host/context/manifest tests |
| C01d1 | sparse projection RPC | `excel-worker/src/runtime/handlers/projection.ts`, `excel-worker/src/runtime/cell-snapshot.ts` | 008 | N/A | 011 | 019,112,114 | handler + WASM E2E |
| C01d2 | projection backend port | `excel-worker/src/backend/projection/**` | 013 | 015 | 017 | 019,112,114 | port + browser tests |
| C01e1 | cell write RPC | `excel-worker/src/runtime/handlers/cell-input.ts` | 009 | N/A | 011 | 019,112,114 | handler + WASM E2E |
| C01e2 | cell-input backend port | `excel-worker/src/backend/cell-input/**` | 014 | 015 | 017 | 019,112,114 | port + browser tests |
| C01f | input classification/demo seed | `excel-worker/src/protocol/cell-input-classifier.ts`, `excel-worker/src/runtime/handlers/demo-seed.ts`, `react-excel/src/runtime/demo-seed.ts` | 003,010 | 015 | 011,017 | 019,112,114 | classifier/seed tests + 1000-row E2E |
| C01g | backend/runtime lifecycle | `excel-worker/src/backend/**`, `react-excel/src/runtime/**` | 012,013,014,016 | 015,017,108 | 017,111 | 019,114 | ready/error/retry/dispose tests |
| C01h | real browser infrastructure | `react-excel/e2e/**` | 018 | N/A | 019 | 020,114 | four-project Playwright gate |
| C02 | loading/error/retry | `react-excel/src/workspace/**` | 101 | 108 | 111 | 113,114 | workspace test + visible E2E |
| C03 | Header | `react-excel/demo/WorkbookHeader.tsx` | 110 | N/A | 111 | 113,114 | build + desktop/mobile E2E |
| C04 | Ribbon shell | `react-excel/demo/WorkbookRibbon.tsx` | 110 | N/A | 111 | 113,114 | focus/build/E2E |
| C05 | Formula Bar shell | `react-excel/demo/FormulaBar.tsx` | 109,110 | N/A | 111 | 113,114 | selection/draft E2E |
| C06a | visible-window grid | `react-excel/src/viewport/**`, `src/grid/SpreadsheetViewportGrid.tsx` | 102,103 | 108 | 109,110,111 | 112,114 | bounded DOM + scroll E2E |
| C06b | selection | `react-excel/src/selection/SpreadsheetSelectableGrid.tsx` | 104 | 108 | 109,110,111 | 112,114 | pointer/keyboard E2E |
| C06c | Rust edit/IME | `react-excel/src/editing/**` | 105,106 | 108 | 109,110,111 | 112,114 | ACK/projection E2E |
| C07 | Footer | `react-excel/demo/WorkbookFooter.tsx` | 109,110 | N/A | 111 | 113,114 | selection count/layout E2E |

## 后续阶段横切矩阵

| id | 表面 | stage owner | 必须证据 |
|---|---|---|---|
| C08 | dialog/menu/popover | S02–S16 | focus trap/restore/Escape/locale |
| C09 | file/print surfaces | S11/S12 | fail-closed/progress/print visual |
| C10 | mobile | S14 | touch E2E/no page overflow |
| C11 | external service unsupported | S15/S16 | zero fake ACK |
| C12 | RC audit | S16 | bidirectional row/leaf evidence |

## Contract-first backlog

- Border：新增 UI-core border edge contract、Rust diagonal facts、WASM wire、shared-edge DOM owner 规则。
- Formula：新增 dialect capability，A1/R1C1 parse-render-parse 与 live named reference Rust tests。
- Table v2：stable table/column id、resize/style/filter request/result、undo、persistence。
- Sheet Views：projection request 携带 view context；personal/temporary 不改 shared filter。
- Workbook codec：Rust snapshot replace 的 request/result/cancel/revision，全字段原子 roundtrip。
- Print：paper/margin/scale/content-range → deterministic pages；禁止 UI 从当前 DOM 推页。
- Calculation：mode/status/recalculate/subscription；async settle 保留 Rust 现有语义。
- Services：comments/presence/revisions 需 actor/ACL/idempotency/etag；无真实环境只验 unsupported。
