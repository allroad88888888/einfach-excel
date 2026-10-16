# React + UI Core 覆盖缺口审计

日期：2026-10-14。范围为两个包的完整 src，不包括 Solid、Vue；缩放不改。
本报告是测试缺口清单，不是功能完成证明，也不是全项目逐分支语义验收。
下文基线和分轮记录按时间保留；最新结果及边界见末尾“本轮验收结论”。

## 完整基线

| 包 | 用例 / 文件 | V8 报告文件数 | 行 | 分支 | 函数 |
| --- | --- | --- | --- | --- | --- |
| React | 453 / 96 | 106 | 94.59%（6953/7350） | 88.80%（2474/2786） | 85.07%（496/583） |
| UI Core | 3353 / 230 | 441 | 90.46%（38182/42205） | 83.34%（13026/15629） | 92.41%（1352/1463） |

两次完整带覆盖率运行均退出 0。基线在新增 Worker 11 条用例之前；不能将专项结果冒充更新后的全量百分比。
原始报告位于各包 coverage/coverage-summary.json、coverage/coverage-final.json（生成物，不提交）。
行数是 V8 插桩口径，不等于源码物理行数；类型文件可能出现 1 行 empty-report，桶文件也可能不进入报告。
未人为排除低覆盖模块。React 单测使用 UI Core 源码，但本次 React 覆盖率 include 仅统计自己的 src。
E2E 与 Rust 不计入这些百分比；没有因为这次只改测试而重复跑它们。

复现（分别在对应包目录执行）：

```sh
pnpm exec vitest run --coverage --coverage.include='src/**/*.{ts,tsx}' --coverage.reporter=json-summary --coverage.reporter=json
```

UI Core 本次实际 include 为 src/**/*.ts，结果文件路径相同。
不要合并两包百分比来证明 Rust 正确，也不要把行覆盖率当成产品可用率。

## 按风险处理

| 优先级 | 边界 | 已有证据 / 确认的缺口 | 下一步验收 |
| --- | --- | --- | --- |
| P0，单测已补 | Worker 故障结算 | 原 transport 的 fail 函数未执行；rust-worker-boundary 只覆盖入口、同步响应、释放形状 | 新增 rust-worker-recovery.test.ts：11/11；崩溃、messageerror、全部等待拒绝、失败后禁止继续发送、显式新连接、乱序、发送异常、释放幂等；定向四项覆盖率 100% |
| P1 | Runtime 挂载失败与替换 | React workbook-runtime-provider.test.tsx 只有正常启动/卸载 1 条；Core runtime 与文件命令已有失败恢复测试，不能代替真实组件反馈 | 加 loading→error UI、失败后换 definition、新旧初始化交错、未完成时卸载；断言旧结果不挂回、Worker 只释放一次；不添加自动重试功能 |
| P1 | 拖拽中止 | use-workbook-grid-events 的 onPointerMove/onPointerCancel 未执行；GridResizeHandle 的 cancel、onLostPointerCapture 等回调未执行 | 指针取消/丢失捕获/卸载必须停自动滚动，不能继续改选区或提交尺寸；用真实事件加可控 RAF/计时器 |
| P1 | 冻结视图组合 | FrozenGrid 行覆盖 7.33%；已有 freeze-ui、freeze-cross-features、freeze-editor-scroll、freeze-interactions 等 E2E，不是冻结功能完全未测 | 组件验证 top/left/corner、滚动偏移、非默认尺寸、冻结占满视口、切表后旧投影；保留真实浏览器几何验收 |
| P1 | 自动尺寸 DOM 测量 | readAutoFitLayout 未执行，header-resize 单测整模块 mock；已有 e2e/format/auto-fit.spec.ts | 测量默认临时格而非选中格；缺 surface 返回 null；成功及异常都清除临时 DOM；真实 CSS 仍由 E2E 验证 |
| P2 | 弹窗与键盘一致性 | 多个 onCancel、工具栏 pointer、分页点击回调未执行；conditional-format 已有 cancel/错误可继续用测试，不能笼统记成只测成功 | 逐个核对 Escape/取消、焦点返回、提交中关闭、过期响应；RibbonTabs 点击/方向键已有 E2E，补组件断言用于快速定位 |
| P2 | 原生面板错误分支 | native-table change 分支 73.33%，native-panel 类通常约 82%–89%；文件大多有主链成功覆盖，也已有部分拒绝测试 | 逐分支核对保护拒绝、选区/连接变化、关闭重开、错误 ACK；先证明现有测试缺场景，再补，不按百分比机械重复 |
| P3，待确认用途 | 未被 React 调用的公共能力 | rules-load 3.22%、size-projection 11.90%、print-config-hydration 26.31%、旧 filter-sort refresh 等公开导出存在；对精确公开符号搜索未见 React 调用 | 单列 API 契约欠账；先确认保留范围再决定补测或另提删除，不为拉覆盖率接回旧 backend 路径 |

P0 此处表示优先验证故障风险，不表示发现了生产缺陷。
Worker 专项证明传输能失败并关闭；不证明界面崩溃后有自动重连或草稿持久化能力。
本轮没有新增产品层、atom、重试器或业务镜像，也没有修改生产实现。

## 整包模块清单

下表覆盖报告内全部文件，按所属目录归组；用于定位，不作为覆盖率门禁。
分支低于 80% 的文件 React 13 个、UI Core 113 个（含类型报告噪声）。
行低于 80% 的文件 React 6 个、UI Core 54 个。

### react-excel

| 目录 / 入口 | 报告文件 | 行覆盖 | 分支覆盖 |
| --- | ---: | ---: | ---: |
| main.tsx | 1 | 0.00% | 0.00% |
| app | 1 | 100.00% | 100.00% |
| page | 15 | 98.73% | 77.97% |
| workbook/chrome | 57 | 97.58% | 90.82% |
| workbook/clipboard | 2 | 96.36% | 97.73% |
| workbook/formula | 1 | 100.00% | 94.74% |
| workbook/grid | 25 | 88.45% | 87.03% |
| workbook/projection | 1 | 90.12% | 86.96% |
| workbook/selection | 2 | 89.83% | 72.34% |
| workbook/shell | 1 | 83.72% | 70.83% |

### spreadsheet-ui-core

| 目录 / 入口 | 报告文件 | 行覆盖 | 分支覆盖 |
| --- | ---: | ---: | ---: |
| createSpreadsheetUi.ts | 1 | 100.00% | 100.00% |
| index.ts | 1 | 100.00% | — |
| rust-runtime.ts | 1 | 0.00% | 0.00% |
| auto-fill | 8 | 85.30% | 80.78% |
| backend | 23 | 38.83% | 63.64% |
| calculation | 2 | 100.00% | 86.96% |
| clipboard | 4 | 97.11% | 84.38% |
| comments | 11 | 82.00% | 75.60% |
| conditional-formatting | 19 | 75.97% | 74.07% |
| copy-as | 6 | 98.11% | 89.12% |
| custom-formulas | 3 | 99.44% | 91.07% |
| data-validation | 18 | 92.27% | 82.17% |
| diagnostics | 1 | 92.86% | 69.70% |
| editing | 13 | 95.38% | 86.20% |
| filter | 5 | 97.45% | 84.83% |
| filter-sort | 22 | 85.32% | 74.31% |
| find-replace | 4 | 98.57% | 86.01% |
| format-cells | 4 | 82.27% | 66.04% |
| format-painter | 1 | 100.00% | 92.68% |
| formula-bar | 2 | 100.00% | 82.76% |
| formula-functions | 7 | 100.00% | 93.82% |
| formula-reference | 6 | 97.07% | 86.21% |
| go-to | 6 | 90.23% | 85.22% |
| history | 5 | 93.35% | 82.11% |
| internal | 1 | 100.00% | 92.00% |
| keyboard | 5 | 93.15% | 89.45% |
| menu | 2 | 92.34% | 83.02% |
| menu-bar | 2 | 98.41% | 100.00% |
| name-box | 5 | 100.00% | 89.77% |
| named-ranges | 22 | 92.76% | 77.07% |
| operations | 4 | 91.48% | 80.86% |
| outline | 4 | 98.35% | 88.34% |
| paste-special | 9 | 89.21% | 81.11% |
| pointer | 2 | 92.16% | 81.21% |
| presence | 2 | 89.32% | 87.18% |
| print | 8 | 75.95% | 57.60% |
| projection | 11 | 90.22% | 94.36% |
| protection | 2 | 97.96% | 87.10% |
| quick-formula | 1 | 100.00% | 90.38% |
| remove-duplicates | 15 | 91.23% | 82.87% |
| rich-types | 2 | 100.00% | 100.00% |
| runtime | 9 | 96.75% | 86.53% |
| rust-workbook | 53 | 97.66% | 88.48% |
| rust-worker | 3 | 86.67% | 60.87% |
| selection | 6 | 94.44% | 87.41% |
| shared | 5 | 100.00% | 100.00% |
| sheet-tabs | 13 | 81.57% | 76.15% |
| sort | 2 | 99.11% | 85.06% |
| spill | 4 | 96.80% | 90.00% |
| status-bar | 5 | 98.99% | 88.00% |
| structural-commands | 4 | 90.64% | 77.14% |
| tables | 8 | 90.39% | 80.71% |
| text-to-columns | 15 | 89.65% | 83.75% |
| toolbar | 18 | 96.34% | 85.62% |
| viewport | 25 | 87.60% | 89.63% |
| workspace | 1 | 93.69% | 79.84% |

## 低行覆盖文件定位

保留所有行覆盖低于 80% 且 V8 计数大于 1 行的文件；1 行类型噪声仍包含在上述原始总计。
“未被当前 React 调用”不等于可以直接删除；“有 E2E”也不等于单测应追到 100%。

### react-excel

| src 下路径 | 行覆盖 | 分支覆盖 |
| --- | ---: | ---: |
| main.tsx | 0% | 0% |
| workbook/chrome/ribbon/RibbonTabs.tsx | 63.88% | 100% |
| workbook/grid/viewport/FrozenGrid.tsx | 7.33% | 66.66% |
| workbook/grid/viewport/ResizeGuide.tsx | 61.53% | 10% |
| workbook/grid/viewport/read-auto-fit-layout.ts | 6.25% | 100% |
| workbook/grid/viewport/use-workbook-grid-events.ts | 76.84% | 73.97% |

### spreadsheet-ui-core

| src 下路径 | 行覆盖 | 分支覆盖 |
| --- | ---: | ---: |
| rust-runtime.ts | 0% | 0% |
| backend/projection-helpers.ts | 29.88% | 66.66% |
| comments/editor-atoms.ts | 75.29% | 88.23% |
| comments/mutation-reservation.ts | 74.6% | 73.33% |
| conditional-formatting/acknowledgement.ts | 75.72% | 56% |
| conditional-formatting/mutation-reservation.ts | 75.5% | 66.15% |
| conditional-formatting/mutation-settlement.ts | 75.75% | 76% |
| conditional-formatting/rules-load.ts | 3.22% | 100% |
| conditional-formatting/snapshot-format.ts | 62.44% | 53.26% |
| conditional-formatting/state.ts | 72.93% | 78.26% |
| editing/cell-keyboard-commands.ts | 62.26% | 63.63% |
| filter-sort/basic-commands.ts | 79.39% | 73.77% |
| filter-sort/filter-sort-mutation-ticket-control.ts | 64.86% | 75% |
| filter-sort/mutation-command.ts | 77.39% | 68.05% |
| filter-sort/refresh-retry-command.ts | 64.41% | 71.42% |
| format-cells/preview.ts | 69.13% | 11.76% |
| named-ranges/primitives.ts | 72.72% | 50% |
| named-ranges/registry.ts | 75.14% | 76.66% |
| print/page-setup-domain.ts | 70.52% | 44.26% |
| print/print-config-hydration.ts | 26.31% | 100% |
| projection/apply-visible-projection.ts | 56.6% | 86.66% |
| projection/editable-source-text.ts | 63.63% | 90.9% |
| remove-duplicates/dialog-commands.ts | 62.72% | 58.82% |
| remove-duplicates/domain.ts | 75.41% | 97.56% |
| rust-workbook/command-atoms.ts | 77.77% | 50% |
| sheet-tabs/basic-commands.ts | 71.42% | 75% |
| sheet-tabs/initialize-command.ts | 47.41% | 56.25% |
| sheet-tabs/mutation-commands.ts | 71.14% | 52.17% |
| sheet-tabs/mutation-runner.ts | 73.64% | 73.17% |
| text-to-columns/entrypoint-command.ts | 76.06% | 72.97% |
| text-to-columns/session-command.ts | 76.06% | 69.56% |
| viewport/range-rectangle.ts | 8.69% | 100% |
| viewport/scroll-anchor.ts | 17.07% | 100% |
| viewport/scroll-placement.ts | 13.33% | 100% |
| viewport/size-projection-validation.ts | 23.48% | 100% |
| viewport/size-projection.ts | 11.9% | 100% |

## 收尾与继续方式

- 已完成：两包全量覆盖扫描、全部模块指标归档、高风险缺口初筛、Worker 边界补强。
- 尚未完成：P1/P2 场景逐项补齐、所有未覆盖分支逐条确认可达性、跨浏览器与异常真实 Worker 的端到端恢复。
- 下一小批只做 Runtime 失败反馈、拖拽取消、自动尺寸测量三项；冻结组合单独一批，避免混成大改。
- 每项先用现有调用链复现，必要时修生产代码，再补回归。只有错误断言不够，能重试的场景必须证明重试成功。
- 本报告和测试未 commit；无新增功能、无缩放改动。

## 第五轮：组件生命周期与 DOM 边界

新增 React 23 条，全部通过：Runtime 6、测量 4、自动滚动生命周期 6、尺寸拖拽取消 4、
真实网格结束事件 3。只 mock Worker / RAF / 浏览器几何，不替换 command atom。
Runtime 验证实际 loading/error/ready 反馈、替换时迟到成功或失败、初始化中卸载；
自动尺寸验证无格式临时首格、像素解析、异常清理；拖拽验证取消后旧事件不能写入、可重新拖动。

新测试实际抓到网格漏接 lostpointercapture：pointerSession 仍 active，RAF 未取消。
WorkbookGrid 仅新增一行事件绑定，复用已有 onPointerCancel，无新增状态或控制层。
新增真实浏览器 drag-capture-recovery.spec.ts：主动调用 releasePointerCapture，
验证停止双轴滚动、保持选区、可以继续定位，已通过。

验证：React 全量 **476/476**（99 文件）、类型、两包构建、边界、lint、diff 检查通过。
浏览器交叉 **10/12**，不是全绿：原 auto-fit 的 Enter 后焦点及第 90 行表头点击失败。
隔离复测两条为 **1/2**：焦点本次通过，但不能视为已修复；表头失败再次复现。
没有修改这些测试的等待时间、交互方式或断言。

### 新确认的 P1：公式栏高度与可见窗口循环

复现：Summary → 名称框 F90 → 点击行 90 表头。即使不点击，只观察布局也可看到循环。
真实浏览器连续 12 帧记录：scrollTop 始终 2085，clientHeight 在 447/417 间交替，
投影末行在 89/90 间交替，第 90 行按钮反复挂载/卸载。

证据链：FormulaBar 的 rows 取决于 activeCellInputTextAtom；后者只读当前可见投影。
F90 多行文本使公式栏增高 → 网格缩短 → F90 离开投影 → sourceText 变 undefined →
公式栏缩回一行 → 网格变高 → F90 再次进入投影。缺口是“内容驱动布局 × nearest 定位”。
焦点偶发失败可能受此影响，但尚未独立证明同因。该循环尚未修复，不将本批列为全面验收。
下一步先消除该布局反馈循环并补稳定性回归；不能以固定延时、强制点击或缓存一份 cell 值绕过。

## 第六轮：布局反馈循环修复与回归

上述布局循环已修复。setViewportSizeAtom 在缩小视口时，用既有 nearest 算法保住原本可见的
活动格；切表首次测量、其它工作表、隐藏格、冻结区遮挡的格、用户已手动滚离的格都不追踪。
原有贴底/贴右规则优先，扩大视口不跳回去。仍由 UI Core 持有几何状态，React 只上报 DOM 尺寸；
不新增 atom、单元格缓存、请求或重试，公式栏多行展示规则未变。

新增 10 条 Core 单测：双轴缩小、部分可见的自定义行高、原地不变/扩大不回跳、四种不追踪边界、
冻结角与冻结行/列遮挡、可见非冻结格。两个正向用例在修复前失败，修复后 15/15 专项通过。
新增 1280px/390px 两条真实浏览器回归：定位 F90 后连续 16 帧公式栏值、rows、视口高度及
行 90 表头保持稳定，并能点击该表头，没有通过固定延时或强制点击跳过问题。

最终验证：UI Core **3374/3374**（231 文件）、React **476/476**（99 文件）、
浏览器名称框/自动尺寸/冻结/拖拽专项 **20/20**；类型、两包构建、边界、循环依赖、lint、diff 通过。
上轮两条 auto-fit 失败用例原样通过；原生源码未变，没有重复 Rust 全量。
本轮 metric-commands.ts 100 行，扩展后的单测 199 行。未提交。

当前审计余项：冻结组件组合（已有 E2E）、弹窗/键盘未触达回调、原生面板错误分支逐项核对、
未被 React 调用的公共 API 用途核对。两包全面语义覆盖仍未验收，不用最新通过数替代剩余审计。

## 第七轮：冻结窗格、标签键盘与分列恢复

新增 React **22 条**，没有修改生产实现：

- FrozenGrid 10 条：三个窗格的真实几何、非默认轴尺寸、双轴滚动、表头去重、
  冻结占满视口、单轴冻结、切表/清空投影/取消冻结时旧内容清除。
- RibbonTabs 9 条：点击、方向键环绕、Home/End、单一 Tab 停留点、ARIA 关联、
  未处理按键不拦截、多个工作簿的选择及焦点隔离。
- 分列恢复 3 条：预览失败后重试、提交未确认必须重新预览及再次授权覆盖、
  提交中禁用取消/重复提交；验证最终成功及焦点返回，不只断言错误提示。
- 加强既有 Core Table 用例：Overlap 后改草稿，真正再次提交成功并清空错误；
  条件格式已有错误后成功重试/断连隔离/提交中阻止关闭测试，核对后没有机械重复添加。

验证：新冻结/标签专项 **19/19**，两组件 V8 行/分支/函数/语句定向 **100%**；
分列专项 **10/10**、Core Table 专项 **17/17**；React 全量 **498/498**（101 文件）。
类型、两包构建、展现层边界、lint、diff 检查通过。Core 本轮只加强一个既有用例，
不把 17 条专项结果冒充重新跑过 3374 条；Rust/E2E 沿用未改生产源码的上一轮证据。
新增测试分别 122/67 行，扩展的分列/Core Table 测试分别 222/263 行，未增加测试控制框架。

首批 P1 的组件测试缺口已补（Runtime、拖拽、自动尺寸、冻结）。余项仍是其余面板异常分支、
公共未接入 API 的契约范围核对，以及整包审计收尾；原始覆盖率基线未被专项数据替换。未提交。

## 第八轮：剩余面板与公共 API 核对

新增数据验证写入断连的迟到成功/失败 2 条；加强数据验证、去重、普通筛选三条已有测试，
验证改正草稿或重新预览/确认后确实成功，不以“面板还开着”代替恢复。
专项 **55/55**；本轮只改测试。

| 面板 | 核对的真实测试与边界 | 处理 |
| --- | --- | --- |
| 数据验证 | native-data-validation：保护/范围拒绝、原生错误、读写断连、旧读取不能覆盖新选择 | 补真实重试及写入断连 |
| 去重 | native-duplicates-panel：零重复不写入、关闭后旧预览、选区漂移、保护、提交中重复/取消、分页旧响应 | 失败后重新预览及重新授权，再成功提交 |
| 普通筛选 | native-filter-command：拒绝/错误投影保留旧结果、并发门禁、断连、滚动/刷新/切表竞争 | 补错误后成功重试及反馈清理 |
| 筛选候选页 | native-filter-values：关闭/换列/新搜索丢弃旧响应、失败重试、选择数量上限、工作簿版本变化 | 已有断言，未重复添加 |
| 名称管理 | native-name-manager：重复名错误后重试、提交中门禁、断连、同 sheetId 换工作簿、错误目录/范围/投影 | 已有断言，未重复添加 |
| 条件格式 | native-conditional-format：非法值后重试、错误规则投影、断连、管理动作保护门禁 | 已有断言；第七轮已核对组件层 |
| Table | native-table-panel：保护/过期草稿、提交中门禁、替换工作簿、列/总计/范围身份 | 第七轮补实际重试 |
| 分列 | text-columns-panel：过期预览、选区/连接变化、目标保护、重复提交、类型/数字选项失效 | 第七轮补对应组件错误恢复 |

公共 API 用途核对使用精确符号搜索，范围为 React src、UI Core src/test；不将没有引用等同于可删除：

| 低覆盖 API | 当前证据 | 结论 |
| --- | --- | --- |
| loadConditionalFormatRulesAtom | 仅定义/导出；React ConditionalFormatTools 调用 runNativeConditionalFormatAtom | 独立 read-port 公共能力无当前 React 调用方，单列契约测试欠账 |
| hydrateViewportSizeProjectionAtom | 仅定义/导出；React useWorkbookViewport 调用 runVisibleProjectionAtom，尺寸随原生投影发布 | 不给 React 重接独立尺寸读取链 |
| hydratePrintConfigAtom | 仅定义/导出；React src 无打印视图模块 | 公开读取配置的完整契约测试仍欠缺，不宣称打印产品已完成 |
| retryFilterSortRefreshAtom | 无 React 引用；filter-sort.test/physical-sort.test 已调用 | 旧 source-port 流程已有部分恢复测试，但不等于当前 Rust 原生筛选链 |
| planAnchorPlacement/planSnappedScrollPlacement | 仅定义及二者相互调用，没有 React 使用 | 保留 API，不借审计擅自删除或接入 |
| backend/projection-helpers | cloneFilterSortRule 由 rust-workbook-definition 使用；其它多个辅助函数低覆盖 | 不能把整个文件视为无用，也不能据此扩展为 backend 重构 |

## 本轮验收结论

按用户确认的范围，已完成两包全部 src 的覆盖扫描、分模块缺口归档、主线高风险用例补强、
剩余原生面板异常用例核对及公共 API 使用情况核对。本轮不是“所有可想象分支都达到 100%”的任务。
审计揭示的未接入 API 契约欠账、低风险未触达回调保留；没有把它们算成已补齐。

最终同一工作树完整带 V8 运行（日志为 /tmp/excel-unit-final-coverage-{react,core}.log）：

| 包 | 完整用例 / 文件 | 行 | 分支 | 函数 |
| --- | --- | --- | --- | --- |
| React | 498 / 101 | 97.41%（7161/7351） | 89.09%（2548/2860） | 87.15%（509/584） |
| UI Core | 3376 / 231 | 90.50%（38218/42226） | 83.45%（13074/15666） | 92.48%（1353/1463） |

最终报告在各包 coverage/final-audit/ 下，使用基线命令额外指定
--coverage.reportsDirectory=coverage/final-audit 生成；基线报告仍保留，不用专项覆盖率覆盖整包数字。
从单测补强开始时的 React 429 + UI Core 3264 到当前 498 + 3376，净新增 **181 条**；
多条旧用例另加强恢复断言，不重复计数。目标期间另新增 3 条 E2E（捕获丢失 1、布局稳定性 2）。

| 原要求/约束 | 验收证据 |
| --- | --- |
| React + UI Core 全范围缺口审计 | 两包完整 include、全部模块指标、低覆盖文件及公共 API 分类均在本报告 |
| 已有功能交叉与交互一致性 | 冻结/尺寸/标签/拖拽/编辑/投影的真实组件测试；修复后浏览器交叉 20/20 |
| 错误恢复，不只测试成功路径 | 剪贴板、文件、编辑、投影、历史、格式、Worker 和上述八类面板的失败/恢复/迟到结果断言 |
| 借鉴上游测试场景 | FEATURE_PROGRESS 的固定 Univer 提交及三个测试源链接；未复制框架实现 |
| 不堆生产层，不接 TS 核心 | 保持 React → UI Core command → Rust；新增测试仅控制外部边界；展现层与循环依赖门禁通过 |
| 有失败证据再修实现 | 捕获丢失先失败后绑定已有取消逻辑；布局循环先复现再修现有尺寸命令 |
| 验证与可复查记录 | 最终全量测试、两包构建、React 类型、边界、循环依赖、lint/diff/文档检查均通过 |
| 缩放不动、无自动提交 | 未修改缩放；HEAD 仍为 5e38d559，改动未 commit/push |

浏览器 20 条是修复相关交叉专项，不是全量 E2E；Rust 源码在本次单测目标期间未改，
不重复先前原生验收，也不把单测替代跨浏览器、Worker 崩溃自动重连或刷新持久化的产品验收。
后续低风险回调按功能修改时补；公共 API 若要继续维护或移除，应另行确认范围，不让本轮无限扩张。

