# 002 交付报告：宿主环境与实例展现隔离

当前结论：`DONE_WITH_CONCERNS`。独审两项 Important 的 R1 修复、26 项单测、8 项宿主 DOM 回归及截图路径迁移后 10 项定向 DOM 均完成，待独立复审；详见末尾 R1 节。以下原交付记录保留为首轮历史：18/18 浏览器、59/59 语言/包入口单测、35/35 交互单测不等于 R1 全量重跑。完整发行物消费者与 003 新宿主协议统一重建仍归 004；HOST_* 拒绝入口 DOM 仍待 004，不虚报已通过。

基线 HEAD：`08caefbce8cb4934ceea4f0c26115d910569a47c`。日期：2026-10-22。工作目录：`/Volumes/work/self/excel`。未 commit、push、publish；保留 001 与并行 003 的现有工作区产品改动，没有编辑 Core/Rust。

## 实现与所有权

最短数据链保持为 `React DOM -> UI Core command atom -> Rust Worker/WASM -> atom 结果 -> React`。本任务没有新建工作簿 atom、controller、业务 Store 镜像或 React useState/useReducer。

- `src/page/WorkbookPresentationProvider.tsx` 只装配 Lingui 实例与 renderer Context。这个上下文是每挂载的展现配置，既不持有工作簿值，也不调度命令。
- 两个公开 Provider 和 `Spreadsheet` 均接受 `locale?: 'en' | 'zh'`、`i18n?: I18n`、`renderer?: 'dom' | 'canvas'`。默认每次挂载自己的英文词典实例与 DOM renderer。受控 locale 禁用 LanguageSelect，prop 变化用同一个 I18n 激活新语言，不重建 runtime。显式宿主 I18n 且省略 locale 时保留实例当前语言，包含 fr 等未知语言；不覆盖宿主词典。只有显式传入同一个 I18n 才共享语言。
- `src/i18n/runtime.ts` 只保留纯语言规范化与词典工厂。`src/page/demo/demo-presentation.ts` 单独拥有 URL > 保存偏好 > 浏览器语言 > en 的 demo 策略，以及语言变化后的保存/已有 locale query 同步。两个 demo 页面继续调用原 Provider / WorkbookView，没有复制工作簿。
- `CellRenderer` 只消费显式 renderer Context。demo 在自己的模块中读取 `?renderer=canvas` 后传入，公开库导入与默认组件不读取 URL / storage / navigator。
- `src/style.css` 提供 `.einfach-spreadsheet` 根主题、局部 reset 和默认 100% 尺寸。Spreadsheet 保留 className/style，WorkbookView 自带同一根标记，因此 Provider + WorkbookView 也有隔离域。`app/app.css` 原有全屏布局仅由 demo 的 main 导入，未进入库 CSS。
- 所有 workbook CSS 及私有 react-cells CSS 选择器加组件根作用域。原窄屏规则改按组件容器宽度判断，桌面窄嵌入容器能得到原有窄屏工具栏布局。最终发行 CSS 共 855 个选择器，全部含 `.einfach-spreadsheet`，无 html/body/#root/:root 规则。
- FormulaAssist 的独占 DOM portal 容器在 ref 提交后附着到所属组件根，cleanup 移除容器和窗口监听；浮层使用根内绝对坐标与根边界。这个 DOM 容器解决首次挂载已有草稿时 ref 尚未提交的问题，没有新状态或第二个 React root。候选列表只滚动自己的列表。
- WorkbookSheetTabs 原 `scrollIntoView` 会连带滚动宿主，现只调整自己的页签列表 scrollLeft。实际 DOM 在桌面和手机加载后均断言 window.scrollY 为 0；工作表滚动也不移动宿主或兄弟实例。
- 原硬编码公式输入/反馈、文件标题、合并/删除标题与说明、页签错误 ID 改用 useId。四份现有 E2E 仅按主代理扩展的 files 授权迁移为 data 属性定位，保留测试标题与原断言；页签错误继续正确绑定 aria-describedby。
- 主代理追加的三个已知宿主错误码仅在 feedbackMessages 精确映射为可读 Lingui 消息：HOST_READ_ONLY、HOST_BUSY、HOST_STRUCTURE_DISABLED；en/zh 词典与三条参数化单测已补齐。未知 HOST_UNKNOWN 仍原样保留诊断。

文档：`excel/react-excel/docs/package/README.md` 已补尺寸、实例语言、受控下拉、宿主 I18n 字典责任、共享实例约束、renderer 与 demo 偏好策略。

## 逐条验收与覆盖矩阵

| 条目 | 结论 | 证据与精确边界 |
|---|---|---|
| 1. 默认实例语言独立、显式共享、库无偏好副作用、demo 偏好仍有效 | 通过 | test/package/presentation.test.tsx 的 5 个场景；test/i18n/workbook-language.test.tsx 的编辑草稿/焦点及独立 ribbon 场景；public-entry poison demo module 与 storage spies；真实 DOM 独立/共享/受控语言三个独立主用例；原 localization 3 场景通过。注入 fr 保留与 I18n prop 替换由 React 单测验证。 |
| 2. i18n 源文案门禁与词典编译 | 通过 | 9 文件/59 tests 包含 source-copy.test.ts；`lingui compile --strict` 退出 0。新增三条宿主提示都使用 msg 与 en/zh catalogs，不改未知码兜底。 |
| 3. 带宿主控件/表格/可滚动文档的双工作簿真实 DOM | 通过 | 持久 fixture e2e/package-embedding/host.html 与 host.tsx，动态导入公开根源码入口前先记录宿主样式。比较 html/body/宿主 button/input/table/cell/content 共 7 元素的 12 项 computedStyle；加载后完全相同。真实双击编辑、Enter、鼠标 wheel、host unmount 按钮、Undo、合并锚点和未改邻格断言通过，没有以 atom 调用冒充用户动作。 |
| 4. 中英 1280/390、嵌入尺寸、默认 demo/合并/编辑 | 通过（本域） | 最终 6 个布局场景 + 原 localization 3 场景。页面 scrollWidth 等于 viewport；嵌入根不产生宽度溢出，ribbon tab/file 文案没有内部裁切；截图全部实际查看。38 项既有名称框/页签/历史场景全部通过，见下方历史组合命令证据；完整既有 E2E 仍由 004 统一跑。 |
| 5. FEATURES 行与真实 DOM 主用例 | 本叶完成，表格合并归 004 | 下方提供 9 行独立主用例，最终 acceptance-results.json 均恰一次成功。布局变体为附加回归；未越界修改 FEATURES.md。新增 HOST_* 提示的宿主锁 DOM 行明确待 004，不虚报完成。 |
| PKG-04 | 本叶通过 | style.css、workbook CSS、react-cells CSS、WorkbookView、FormulaAssist、WorkbookSheetTabs；5 个 host-isolation 主场景与 6 个 layout 场景。 |
| PKG-05 | 本叶通过 | 纯 runtime / demo-presentation / PresentationProvider / LanguageSelect / CellRenderer；4 个 presentation 主场景、语言单测及原 localization。 |

## 命令与自然退出结果

所有命令 cwd 均为仓库根。Playwright 仅运行定向目录/文件，workers=1；各次前一进程自然结束才启动下一次，从未并发运行完整 E2E，也未因工具 yielding 重启进程。下列每个非零结果均已保留原因，不能把组合命令局部成功记成整体退出 0。

| 命令 / 阶段 | 退出 | 实际结果 |
|---|---:|---|
| `pnpm --filter @einfach/react-excel test -- test/i18n test/package/spreadsheet.test.tsx test/page/workbook-runtime-provider.test.tsx` | 0 | 初轮 6 文件 / 48 tests。 |
| `pnpm --filter @einfach/react-excel test -- test/package test/i18n test/page/workbook-runtime-provider.test.tsx` | 0 | 扩展隔离后 9 文件 / 56 tests；追加 HOST_* 后最终语义候选为 9 文件 / 59 tests，2.73s。之后仅 lint 换行和移除测试未用 import，无断言或运行逻辑变化，复用此证据。 |
| `pnpm --filter @einfach/react-excel i18n:check` | 0 | 新词典后 strict compile 完成，678ms。 |
| `pnpm --filter @einfach/react-excel exec tsc -p tsconfig.package-test.json` | 0 | 公开声明输入、Provider 与包测试定向类型检查；最终运行时语义候选通过，无输出。 |
| `pnpm --filter @einfach/react-excel exec playwright test e2e/package-embedding e2e/workbook/localization.spec.ts --reporter=list,json --output=.../test-results` 初轮 | 1 | 14 项中 13 通过；宿主 content-box 容器高度测试误写 556，实际正确为 560。修正测试预期。 |
| `PLAYWRIGHT_JSON_OUTPUT_FILE=.../final-results.json pnpm --filter @einfach/react-excel exec playwright test e2e/package-embedding e2e/workbook/name-box-scroll.spec.ts e2e/workbook/sheet-tabs.spec.ts e2e/workbook/sheet-history.spec.ts e2e/workbook/sheet-rename-recovery.spec.ts --reporter=list,json --output=.../final-test-results` | 1 | 49 项中 48 通过，1.6min。四份旧场景 38/38 通过。唯一失败为测试错误假设 UA button 的 box-sizing 为 content-box，实际 UA 前后都是 border-box，完整前后样式比较本已通过。删除该浏览器默认值硬编码。JSON 为历史证据，文件名 final 不代表最终验收。 |
| `PLAYWRIGHT_JSON_OUTPUT_FILE=.../repair-results.json ... playwright test e2e/package-embedding/host-isolation.spec.ts ...` | 1 | 3 项中 2 通过；测试先 wheel 文档后鼠标位置下方变成网格，反向 wheel 被网格 overscroll containment 接收，因此宿主仍 y=500。将真实鼠标移至始终位于组件外的 x=2 页边，不改产品滚动逻辑。 |
| `PLAYWRIGHT_JSON_OUTPUT_FILE=.../host-final-results.json ... playwright test e2e/package-embedding/host-isolation.spec.ts ...` | 0 | 修正鼠标目标后 3/3，通过 7.0s；含带 translate 宿主中公式浮层定位、文档滚动后仍保留编辑焦点。 |
| `PLAYWRIGHT_JSON_OUTPUT_FILE=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/acceptance-results.json pnpm --filter @einfach/react-excel exec playwright test e2e/package-embedding e2e/workbook/localization.spec.ts --reporter=list,json --output=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/acceptance-test-results` | 0 | **最终 18/18 通过，24.0s，无 skipped/retry/flaky。** 将编辑/滚动/卸载及独立/受控/共享语言拆成独立主标题后执行；冻结这次输入直至自然结束。 |
| `pnpm --filter @einfach/react-excel test -- test/workbook/editing/formula-completion.test.tsx test/workbook/editing/formula-bar-focus.test.tsx test/workbook/workbook-file-tools.test.tsx test/workbook/sheet-tabs.test.tsx test/workbook/ribbon/merge.test.tsx` 首次补充回归 | 1 | formula-completion 4 条失败，原因是 jsdom 旧 fixture 只 mock viewport 和 textarea，新根局部几何为 0 导致 popup 隐藏；真实浏览器公式帮助已通过。补 mock 组件根的真实布局边界，未放松任何断言。 |
| 同上 5 文件命令，fixture 修正后 | 0 | **5 文件 / 35 tests 通过，6.63s**。单独 formula-completion 也为 4/4 通过。 |
| `pnpm --filter @einfach/react-excel build:lib` | 0 | 最终候选：200 modules、JS 432.31kB、CSS 93.78kB、Worker 5685.03kB；7 份公开声明闭包与 artifact 检查通过，Vite 267ms。未重跑 pack/真实安装，其最终验收归 004。 |
| `pnpm exec eslint ...` 未指定仓库 config | 2 | 初次发现项目配置在 rules/.eslintrc，改用显式配置。 |
| `pnpm exec eslint --config rules/.eslintrc --ignore-path rules/.eslintignore --ext=.ts,.tsx <本任务改动的 TS/TSX>` | 0（分组复查最终结果） | 首轮 max-len 换行错误与测试未用 act import 已修；产品组、fixture/旧 E2E/其他测试组最终各通过，未执行全仓 lint。 |
| 发行 CSS PostCSS AST / 主 JS 静态扫描 | 0 | 855 个选择器均含组件根；unscoped=[]。主 JS 无 localStorage、URLSearchParams、demo storage key。 |
| `git diff --check -- excel/react-excel packages/react-cells/src` | 0 | 最终无空白错误。 |
| `wc -l` 新增/大改文件 | 0 | 新 PresentationProvider 27 行、demo 策略45行、style56行、FormulaAssist169行、WorkbookSheetTabs202行、新测试及fixture各不超过115行。普通源文件均≤300；既有 feedback-messages.ts 为423行（本次仅加3条），属于 i18n 词典资源，不顺手重构。 |

ESLint 最后一组仅移除了 workbook-language.test.tsx 的未使用 act import，未改变测试语义。未运行全仓 tests、完整 E2E、check:cycles、根 lint/build 或最终包消费者；遵守交给 004 的分工。

浏览器服务：Playwright 通过原配置创建 `http://127.0.0.1:5191` 的 Vite dev server，使用真实模块 Worker 与 Rust/WASM。最终进程自然退出 0 后 `lsof -nP -iTCP:5191 -sTCP:LISTEN` 无输出、退出 1，表示端口已无 listener；未遗留本任务服务。没有终止其他用户进程。

## 截图与实际目视结论

路径前缀均为 `.codex-artifacts/react-excel-package-002/`。截图来自真实 Chromium；7 张均通过 view_image 实际查看，最后又复查窄嵌入与公式帮助，非仅检查文件存在。

| 截图 | 实际观察 |
|---|---|
| demo-en-1280.png | 原侧栏、单行工具栏、公式栏、合并格与双页签保持完整；英文标题、语言框、File 无新增裁字。 |
| demo-zh-1280.png | 中文状态/工具栏/文件入口完整，数据仍为原始业务文案；无页面横向溢出。 |
| demo-en-390.png | 工具栏分类单独一行、工具横向滚动，文件与语言选择在可视区；网格在自身视口内裁切列，状态栏折行，未撑宽页面。 |
| demo-zh-390.png | 同一紧凑布局，中文分类和界面语言可见；页签/状态栏未产生新的遮挡。 |
| embedded-1280.png | 宿主 Georgia 字体、棕色文字、按钮、输入框及表格保持自身样式；两张约618×560工作簿并排，按各自容器宽度使用两行工具栏，左英文右中文互不影响。 |
| embedded-390.png | 宿主控件自然换行，两个约360×560工作簿上下排列；标题、语言与文件入口完整，页签与统计位于各自边界内，宿主正文仍在工作簿下方可滚动。 |
| embedded-formula-help.png | 第二实例正在编辑 =SU，候选列表紧贴其输入框、白底与本实例主题正常；未出现在第一实例或 body 根，列表限定在第二根边界内。截图中函数说明按既有设计省略号截断，完整选项有可访问名称。 |

技能要求的 `.shared/visual-runtime` 与对应 capture_page / visual_lint 脚本在仓库和已安装技能目录中均不存在，未虚报执行。使用持久 Playwright 布局检查替代：viewport/page scrollWidth、嵌入 root scrollWidth、ribbon tab/file trigger 文案内宽、语言框在视口内、pageerror 收集与宿主 computedStyle 对比；再逐图目视。未重做既有字体/图标系统，原有工具横向滚动及单元格省略号仍保留。

## FEATURES.md 待 004 合并行

以下 ID 使用仓库的 `ABC-001` 形态，各行主绑定不同；全部来自最终 acceptance-results.json。不要把一个综合标题重复绑定给多个功能。

| 编号 | 功能点 / 用户动作 | E2E 文件（相对 e2e） | 完整主用例标题 |
|---|---|---|---|
| EMBED-001 | 内嵌工作簿加载后宿主控件样式与文档 wheel 滚动保留 | package-embedding/host-isolation.spec.ts | embedded workbook styles preserve host controls and document scrolling |
| EMBED-002 | 双击编辑一个实例并保留兄弟数据与未改邻格 | package-embedding/host-isolation.spec.ts | editing one embedded workbook leaves its sibling data unchanged |
| EMBED-003 | wheel 滚动一张表不移动兄弟或宿主 | package-embedding/host-isolation.spec.ts | scrolling an embedded worksheet leaves its sibling and host stationary |
| EMBED-004 | 宿主卸载一实例后继续编辑/撤销兄弟工作簿 | package-embedding/host-isolation.spec.ts | unmounting one embedded workbook preserves sibling editing and history |
| EMBED-005 | 在宿主偏移/滚动布局里点击公式候选并保留所属输入焦点 | package-embedding/host-isolation.spec.ts | formula assistance keeps its instance theme geometry and editing focus |
| EMBED-006 | 语言下拉仅切换所属实例且保留 URL/存储 | package-embedding/presentation.spec.ts | embedded language selection is independent and never changes host preferences |
| EMBED-007 | 宿主更新受控 locale 后仅禁用所属下拉并保留数据 | package-embedding/presentation.spec.ts | host locale control disables only its own language selector |
| EMBED-008 | 显式注入共享 I18n 后语言联动，业务/ribbon 状态仍独立 | package-embedding/presentation.spec.ts | explicit shared I18n injection shares language while retaining independent workbook state |
| EMBED-009 | 宿主显式切换单实例 Canvas 且保留工作簿数据 | package-embedding/presentation.spec.ts | host renderer prop selects canvas independently of the URL and sibling |

附加布局用例：layout.spec.ts 的 `demo retains en/zh layout and merged cells at 1280/390px` 与 `embedded English and Chinese fit their host sizes at 1280/390px`；它们是上述嵌入布局功能的多尺寸回归，不重复占据一个新功能主绑定。既有 localization / 名称框 / 页签 / 历史行标题全部保留。

HOST_READ_ONLY / HOST_BUSY / HOST_STRUCTURE_DISABLED 的可读反馈由主代理明确要求接线，正式宿主锁 DOM 验收交 004；004 应在 003 能力的每个具体 UI 拒绝入口主用例中断言中英文可读提示，不为三个错误码复用一个笼统成功用例。本报告不虚构其 FEATURES file/title 或执行结果。

## 未验证、疑虑与 004 交接

- 最终浏览器使用 Vite 源码 alias 与现有预编译 WASM；这是 002 的真实 Worker/WASM 宿主隔离证据，尚非 npm tarball、无 alias 的 Vite/Rspack 证据。004 必须在 003 收敛后重建 Core/WASM/React 库并跑独立安装消费者。
- 本次发行 Worker 的 SHA 与 001 一致，仍为此前 Core 发行版预构建输入；不能用它声称已经验证新 host 原生协议或策略。新增 HOST_* 文案只经 Lingui 单测，UI 拒绝流程交 004。
- CSS 使用容器查询，已在本仓 Chromium 验证；未额外验证 Firefox/Safari、旧浏览器、SSR、React19、CSP、CDN/子路径或任意 scale/rotate 变换。普通 offset、translate 与宿主文档滚动下的公式帮助已真实验证。
- 作用域 CSS 隔离向外的样式规则；它不是 Shadow DOM，不承诺抵御宿主任意高优先级 `!important` 对组件内部的覆盖。私有 react-cells 样式现在也要求位于组件根内，当前 WorkbookView 已提供根。
- FillHandle / GridResizeHandle 的 document/window 键盘监听只在本实例实际拖动、有效 pointerId 存在时注册，cleanup 取消本实例 command / pointer capture；FormulaAssist 监听只做本浮层几何更新。没有发现常驻的跨实例 workbook 键盘命令监听；同时多指拖动、复杂 pointer-capture 中断矩阵未在本叶扩跑。
- 一 Store 同时只归属一个工作簿的原模型不变；共享 I18n 不等于共享 Store。宿主向同一个共享 I18n 传互相矛盾的受控 locale 属于冲突配置，接入文档已要求一致。
- 未修改 FEATURES.md、根 README、lockfile、CI、发布保护或版本；这些由 004 收尾。所有新增主用例与结果都已可供合并，报告不是整包可发布结论。

## 首轮候选输入与源码指纹（历史，R1 当前输入见末节）

以下 tree 指纹计算方式完全相同：递归收集该目录所有普通文件，路径按 JS `.sort()` 排序；每项为 `sha256(file bytes) + 两空格 + 仓库相对路径 + LF`；再对整份 manifest 的 UTF-8 字节求 SHA-256。目录树可直接重算，覆盖所有作用域 CSS 与词典，避免只列入口漏掉依赖输入。

```text
e735dd63d135a5bac87eb273086c218b14362bbfbf14ddc9e5f51569bf78d13a  excel/react-excel/src (191 files)
a1e46ab4fdaeb373e65f9e90ec7e46e864c1eaadd2c1e743fe0d7f1999f6fb95  packages/react-cells/src (17 files)
97f91c6266805ff5f0a81e2a234c3be44f6bb80e420fbfed25ed1fc2d99b7dc7  excel/react-excel/test (132 files)
5cada6242b98e37b0a0e7864290a76471e04147ccaf8b0815aab3c273939da2b  excel/react-excel/e2e/package-embedding (5 files)
3623f969018a8471e1d31e934c44d7f7eb03d7cdbe31ab4c5b1495d59349568e  excel/spreadsheet-ui-core/src (537 files; 只读记录并行输入)
```

关键文件与产物：

```text
84ad68e5d081d0555a2931e777479eebb81dad3b58dda22a63fa749d51195136  excel/react-excel/src/Spreadsheet.tsx
6e96a9dda0f73329103f12610bac136ec29694be197946555460a4076ebf6981  excel/react-excel/src/page/WorkbookPresentationProvider.tsx
12b09d09b9ed6a2d41c19a907741c969eb549f5f0488c29d3626d6cb68e44e67  excel/react-excel/src/page/WorkbookRuntimeProvider.tsx
80072b455d037cc29ff9565e51c148f8d64b8313bcd9c73dc2858600d3c8ff0c  excel/react-excel/src/page/WorkbookStoreProvider.tsx
775eee25ff79e29170587d5496f39049c8fddc9f86ac38ad9881d8401a9862e3  excel/react-excel/src/page/demo/demo-presentation.ts
94fa93c199560028a2e7ca1616a8de26ac5d7c5eb6fc25397870f209334fe681  excel/react-excel/src/workbook/formula/FormulaAssist.tsx
53fd813dbc1db847ed59f19300e95429c299bfbbc707d16d4d5cdf3c200792d3  excel/react-excel/src/style.css
f6b6f169c8a82d5d7f5ad2bedde8aa77a53d2e9e2e3c86dbb296ca1523bdfbb4  excel/react-excel/src/i18n/runtime.ts
6f1acc82f49f142fcbb503479dd855b01abdf82687f2cf9c007397559b7b3100  excel/react-excel/src/i18n/feedback-messages.ts
0407ad8191b99b830a4a38ebb13e754cf9e3ed56f8d7d5d64e35679c3e39889d  excel/react-excel/docs/package/README.md
f1bd65d0f7f56421f2c7d8dbb188ac760ea933cb38d19c83c6d2f90662cebc61  excel/react-excel/e2e/workbook/name-box-scroll.spec.ts
31fd49160ccc8bfdbb276f415153b32a1cbaa031626ce2e070b9d090a512abef  excel/react-excel/e2e/workbook/sheet-tabs.spec.ts
f2882f195cdeb9c8fbf7bf9734430695e3a72f5aca345845e38b937276e2c627  excel/react-excel/e2e/workbook/sheet-history.spec.ts
6b1e02631bd917b0c859bb5679786ff5093aeb700af4fdda950ba011eb40e4a6  excel/react-excel/e2e/workbook/sheet-rename-recovery.spec.ts
112b4f177131bc268fb2a14f55e81c1d5a99f43211941b27979fe1da51cfc919  excel/react-excel/vite.config.ts
8e4d214f5069adca7050220a2b879a883df585ccba92ba476283621c037b7930  excel/react-excel/vite.lib.config.ts
8dc6e2ddf3b3966e81ef349be46e6b00537155db93e385d5f8f0fa58b0d38ef9  excel/react-excel/src/worker/workbook.worker.ts
653de28b85d5564ae9ac172a4d9e5ff10fef2698ee6a5443bf54456ac531b3a1  excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts
5af7a17e00fcf91de62a8f6356892a60153bad0bd2d6a2b40d2936a931b2f0e2  excel/spreadsheet-ui-core/src/rust-worker/transport.ts
bd6b9abb7eca0336b542a4e88d04b5ce4ebe363d3eb346954ae7ee65f501de58  excel/excel-wasm/lite/einfach_wasm.js
adccb69f0e9951d845a96b7d4a18bea1044b734d49f802bb425270c5cc1741dc  excel/excel-wasm/lite/einfach_wasm_bg.wasm
4af1176b036c1f544bf325665a96861e85749c7b8848ffd811729e7362634893  excel/react-excel/dist/index.js
fcb6e9c79353da3dbe56aa4500fb23a54a8a79214e95f4547fec1ef16a918c4c  excel/react-excel/dist/style.css
2e954de87f310de8288373f15fcc0e23cc8c146ce3a68e395b402d8a0d29e24e  excel/react-excel/dist/assets/workbook.worker-DisuxwQ0.js
4fe88979fc01244d7d680dffaa663bb905a899a3e333812fc668d34de963c1f4  excel/react-excel/dist/artifact-manifest.json
87785928dbd78cce80b19b3d9395256a1e4f5a0a4e188de50f44c6fd3d093ecd  .codex-artifacts/react-excel-package-002/acceptance-results.json
aa8cc5827424e8907de2ece7c9861641107a0317bcb81706b1504b86aef0199a  .codex-artifacts/react-excel-package-002/final-results.json (历史49项)
```

截图指纹：

```text
de99c9c4a90e2d0d2660a189d152f9659128cd6803fde3d6657a81f60e4ccab0  demo-en-1280.png
dbaf84b5c34341fac620374a3d1b797f18be9fefaf31152b5d76d93e9963671f  demo-en-390.png
8f4b8f20c4865a1c870b32490560faf4edeb49bdcfdb0456c592721c1ea6f811  demo-zh-1280.png
2f07ab803fc5bb3d72a76af43c9f508d578d7f68656f88812a8b2c0b1994d4f4  demo-zh-390.png
e1e9f7512870da46b85224aabb6aa41e41c54df3dc9f350cfd43832bb503a5b2  embedded-1280.png
7151589a1b8b246cf6590be03129304a9a5beacb279819cfe7f9f7a89cc5dfce  embedded-390.png
64f4790a01249a55273434a46ad31276e3d6f545eb6cb8127402281dd51d4b0c  embedded-formula-help.png
```

## 修复 R1：实例编辑器身份与宿主动态尺寸

已完整重读 index、002 任务、原报告、002-review 与四份必需 skills。只改 2 个产品文件、3 个编辑单测文件、新增 editor-isolation.spec.ts；另按根审追加要求，仅迁移 layout.spec.ts / host-isolation.spec.ts 的截图路径。没有编辑其他叶、002-review、FEATURES 或 Core/Rust；没有 commit/push/publish。

最短调用链仍是 `React DOM -> UI Core command atom -> Rust Worker/WASM -> atom result -> React`。新增身份和几何都归 React DOM，不新增 atom、业务状态、定位状态系统或 controller。

| 复审条目 / 覆盖面 | 修复与真实断言 | 结论 |
|---|---|---|
| Important R1 / PKG-04 同坐标错误编辑器 | CellEditor 的 useId 前缀隔离挂载实例，坐标后缀仍参与原 restoreFocus 异步身份比较；textarea id/name、feedback id、aria-describedby 共用该身份。旧单测仍断言具体 r0-c0 / r1-c1 坐标和 name=id。双实例 A2 各自 Enter 拒绝后，断言全局 ID 唯一、说明目标位于自身最近根、英文/中文 accessible description 正确、两份草稿及邻格均保留。 | 修复并通过，待独审 |
| Important R2 / PKG-04 父容器缩放 | FormulaAssist 在原 effect 里新增仅观察所属根的 ResizeObserver，回调复用原 position，cleanup disconnect；原窗口 resize/scroll 监听不变。1280/390 浏览器里保持 =SU 和焦点，单独将宿主高 560→400，再宽缩至 360/280；每次断言浮层四边在本根内，viewport 尺寸不变，兄弟及宿主 scroll 不变；实际点击 SUM、输入完整公式并提交得到 3，兄弟 Original/邻格 Neighbor 保留。 | 修复并通过，待独审 |
| 观察器资源所有权 | 新单测核对只 observe 本根一次，人工扰动 popup left 后触发回调恢复原定位；Escape 后 disconnect 一次、portal 消失、草稿和焦点保留。原连续异步提交 / 拒绝 / 公式栏焦点场景同时通过。 | 通过 |
| 截图路径可移植性 | 三份 embedding spec 用 fileURLToPath(new URL(仓内相对路径, import.meta.url))，不再硬编码本机 /Volumes 路径；截图位置、断言及主标题不变。 | 10 个对应截图场景通过；未在 Linux 执行 |
| PKG-05 与既有 CSS | i18n / renderer / 词典 / scoped CSS 未变；发行 CSS 及 Worker 指纹仍与首轮一致。复用原语言与作用域证据，不重复跑未改领域。 | 维持原独审通过结论 |

### R1 命令与过程

cwd 均为仓库根；所有 Playwright 都 workers=1，前一个自然退出才启动下一个。最终 DOM 期间冻结的是 002 产品/测试与现有 WASM，不宣称并行 003 的全仓源码冻结。

| 命令 / 阶段 | 退出 / 实际结果 |
|---|---|
| `PLAYWRIGHT_JSON_OUTPUT_FILE=.../r1-before-results.json pnpm --filter @einfach/react-excel exec playwright test e2e/package-embedding/editor-isolation.spec.ts --reporter=list,json --output=.../r1-before-test-results` | 1；修复前 3/3 如实复现：31 个 ID 只有 29 个唯一值；1280/390 均在仅缩高后浮层越界。保留 trace/JSON。 |
| 同新文件、输出 `r1-fixed-results.json` | 1；身份用例通过，两个 resize 用例的四边/草稿/焦点/滚动已过，但候选 click 同时匹配工具栏 Quick formula 的原生 SUM option。仅把 locator 限定到 Formula functions listbox，不放松断言。 |
| `pnpm --filter @einfach/react-excel test -- test/workbook/editing/cell-entry.test.tsx test/workbook/editing/cell-commit.test.tsx test/workbook/editing/continuous-cell-editing.test.tsx test/workbook/editing/formula-completion.test.tsx` | 0；初轮 4 文件 / 15 项，确认原异步焦点保护。 |
| `pnpm --filter @einfach/react-excel test -- test/workbook/editing/cell-entry.test.tsx test/workbook/editing/cell-commit.test.tsx test/workbook/editing/continuous-cell-editing.test.tsx test/workbook/editing/formula-completion.test.tsx test/workbook/editing/cell-retry.test.tsx test/workbook/editing/formula-bar-focus.test.tsx` | 最终 0；6 文件 / 26 项，7.36s。新增 observer 单测中间两次失败：继承 spy 计量为 2 而非 1、jsdom 实际 left=8px 而非假设 100px；改为记录初始定位→扰动 DOM→回调恢复的行为断言，并保留 observe/disconnect 精确次数。产品未因此再改。 |
| `PLAYWRIGHT_JSON_OUTPUT_FILE=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/r1-acceptance-results.json pnpm --filter @einfach/react-excel exec playwright test e2e/package-embedding/editor-isolation.spec.ts e2e/package-embedding/host-isolation.spec.ts --reporter=list,json --output=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/r1-acceptance-test-results` | 0；8/8，10.6s，无 skipped/unexpected/flaky/retry；新增 3 项及原宿主 5 项。 |
| `PLAYWRIGHT_JSON_OUTPUT_FILE=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/r1-portable-results.json pnpm --filter @einfach/react-excel exec playwright test e2e/package-embedding/editor-isolation.spec.ts e2e/package-embedding/layout.spec.ts e2e/package-embedding/host-isolation.spec.ts --grep 'same-coordinate\|host-only resizing\|retains .* layout\|fit their host sizes\|formula assistance keeps' --reporter=list,json --output=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/r1-portable-test-results` | 0；截图路径迁移后的最终 10/10，12.0s，无 skipped/unexpected/flaky/retry。另 4 个无截图宿主用例只复用前次 8/8 行为证据，其源未变。 |
| `pnpm --filter @einfach/react-excel exec tsc -p tsconfig.package-test.json` | 0；公开实现与包测试的定向类型检查。 |
| `pnpm --filter @einfach/react-excel build:lib` | 0；200 modules、JS 432.41kB、CSS 93.78kB、Worker 5685.03kB；7 份声明与产物检查通过。没有重建 WASM。 |
| `pnpm exec eslint --config rules/.eslintrc --ignore-path rules/.eslintignore --ext=.ts,.tsx <本节 8 个改动 TS/TSX>` | 最终两组均 0；中间新增单测两条 max-len 已换行修复。 |
| `git diff --check -- <本节改动文件>` / `wc -l` | 0；CellEditor232、FormulaAssist173、3 份单测114/72/142、3 份 E2E105/111/40 行，均≤300。 |

服务与浏览器：仍为 Playwright 自启 `http://127.0.0.1:5191` Vite、真实 module Worker/WASM。最终进程自然退出 0；随后 `lsof -nP -iTCP:5191 -sTCP:LISTEN` 无输出、退出 1，没有遗留自有服务或终止其他进程。

### R1 截图实际目视与 FEATURES 交接

路径前缀 `.codex-artifacts/react-excel-package-002/`。新三张均已 view_image 实际打开，路径迁移重拍后 SHA 不变。原七张也全部重拍且 SHA 与首轮完全一致，复用已经实际查看的结论。共享 visual-runtime 仍不可用，继续使用真实 DOM 边界/焦点/滚动/文案断言及目视回退；没有虚报 visual_lint。

| 截图 | 实际目视结论 |
|---|---|
| r1-rejected-editors-1280.png | 两张 A2 同时显示 =SUM(；左英文、右中文失败反馈各在自身输入下方，参数帮助不挡错误；宿主控件与相邻数据保持原貌。可访问说明归属由 DOM 断言而非截图证明。 |
| r1-container-resize-1280.png | 左根缩为约360×400，候选列表四边完整在根内，右根大小/网格不变。浮层按原策略向上贴根边避开底部裁切，覆盖部分工具区；这是狭小根内的既有避让方式，候选完整可点击。 |
| r1-container-resize-390.png | 手机 viewport 内左根缩为约280×400，列表仍完整、函数名清晰，描述沿用省略号；兄弟根在文档下方，宿主可继续滚动，没有新页面横向外溢。 |

| 编号 | 功能点 / 用户动作 | E2E 文件（相对 e2e） | 完整主用例标题 |
|---|---|---|---|
| EMBED-010 | 双实例同坐标 Enter 拒绝后仅朗读自身中英反馈 | package-embedding/editor-isolation.spec.ts | same-coordinate rejected editors describe only their own instance feedback |
| EMBED-011 | 宿主只缩小父容器时继续点击自身公式候选 | package-embedding/editor-isolation.spec.ts | formula assistance follows host-only resizing without moving sibling or document at 1280px |

390px 为 EMBED-011 的附加回归，不复用标题登记第二功能。以上由 004 合并 FEATURES，未直接改表。

### R1 当前输入与指纹

tree 算法沿用首轮定义；以下覆盖当前 R1 输入，取代前文相应历史指纹。Core 只列本轮读取的边界输入，不把其并行整树冒充冻结；列出的三个 Core 入口在本轮运行前后指纹一致。旧 Worker/WASM 仍不验证 003 新原生协议，完整整仓冻结、匹配 WASM 重建、Linux/安装包/Rspack 消费者与 HOST_* DOM 仍交 004。

```text
a0b46c0cee6623a959525798240ffd5bbbd3f66105703874d1bf5e7032783bab  excel/react-excel/src (191 files)
342c6bf0d7e7d2aa6b3fc74b724946eb04b596e22279cbfcc27c1d0a3080431f  excel/react-excel/test (132 files)
fed8e15200146fe1b8119bafcbfcbe33e79772bbe48d6c789df6c222e09ee0b8  excel/react-excel/e2e/package-embedding (6 files)
9485b32b2737c14c4fc69edf3ea5c1c4a07b8831747ce9cd1335a99d6d08a5ea  excel/react-excel/src/workbook/grid/editor/CellEditor.tsx
a9a6107f225828baa56656aad8998d455f23883347d69b80015bf144e64d0239  excel/react-excel/src/workbook/formula/FormulaAssist.tsx
700de9e102125b016124c25301523d82384346541164886880240d44c02ad661  excel/react-excel/test/workbook/editing/cell-entry.test.tsx
0b3b946966c5bdfd97b042d7579f28e0381f3a34dcd2c5c5eff7e557c029087d  excel/react-excel/test/workbook/editing/cell-commit.test.tsx
96ff67171e2c7cf3371333f5cf1b20b6957f5e6a62f2ad1f235d7a3792830e46  excel/react-excel/test/workbook/editing/formula-completion.test.tsx
73553f6d02e4446d41a6058eeae45ae1f09e97e91a58b92fc46425acaabbeca5  excel/react-excel/e2e/package-embedding/editor-isolation.spec.ts
40c54d9fc48aa8771700d0c5089d3bd12081e5e681ef2fc19f521abe4905fe55  excel/react-excel/e2e/package-embedding/host-isolation.spec.ts
cde83f6aea2805ff00c7b942696f47a61ca9e76aee6f86a30dd71278c75fa2ed  excel/react-excel/e2e/package-embedding/layout.spec.ts
8dc6e2ddf3b3966e81ef349be46e6b00537155db93e385d5f8f0fa58b0d38ef9  excel/react-excel/src/worker/workbook.worker.ts
9c9dae483e9823437ec67a8bd114950e7f366d0842df6dd626ad9d800b5b8ce0  excel/spreadsheet-ui-core/src/runtime/rust-workbook-runtime.ts
653de28b85d5564ae9ac172a4d9e5ff10fef2698ee6a5443bf54456ac531b3a1  excel/spreadsheet-ui-core/src/rust-workbook/runtime.ts
5af7a17e00fcf91de62a8f6356892a60153bad0bd2d6a2b40d2936a931b2f0e2  excel/spreadsheet-ui-core/src/rust-worker/transport.ts
bd6b9abb7eca0336b542a4e88d04b5ce4ebe363d3eb346954ae7ee65f501de58  excel/excel-wasm/lite/einfach_wasm.js
adccb69f0e9951d845a96b7d4a18bea1044b734d49f802bb425270c5cc1741dc  excel/excel-wasm/lite/einfach_wasm_bg.wasm
c67ee9ad18af5f4a9ae7b7d3938dc831a23ca6037ebb4f6309f8918a7d27a405  excel/react-excel/dist/index.js
fcb6e9c79353da3dbe56aa4500fb23a54a8a79214e95f4547fec1ef16a918c4c  excel/react-excel/dist/style.css
2e954de87f310de8288373f15fcc0e23cc8c146ce3a68e395b402d8a0d29e24e  excel/react-excel/dist/assets/workbook.worker-DisuxwQ0.js
4fe88979fc01244d7d680dffaa663bb905a899a3e333812fc668d34de963c1f4  excel/react-excel/dist/artifact-manifest.json
53f74093a8d871ec1c278beed693ec952155e64abdc46e793df13aeceb655276  .codex-artifacts/react-excel-package-002/r1-before-results.json
c0d630a9582e8ddb265b251ddf959e1d716291a0b633372861065f3ea7e13aaf  .codex-artifacts/react-excel-package-002/r1-fixed-results.json
fb84b3eb00108a90973d65d2367ca34b04b2cc60ce9cc9d4e800b08a69d5e006  .codex-artifacts/react-excel-package-002/r1-acceptance-results.json
93cc319a256f29652a98b0e530134d960f295d3a4f71ec1c54a96fb9a8bb8e9d  .codex-artifacts/react-excel-package-002/r1-portable-results.json
5e921511abdadc396825d7d6afcd5e164cfb3055543aa8d17375b46d2935c622  .codex-artifacts/react-excel-package-002/r1-rejected-editors-1280.png
528fb5a9ce85187544db90d0ebb33c1e725f5f404e0a267241f81682df59e646  .codex-artifacts/react-excel-package-002/r1-container-resize-1280.png
eea8480a0dcc5d999b8b679ed0e41a6305f6c70baae7b4b767d164b1c9ac1c9d  .codex-artifacts/react-excel-package-002/r1-container-resize-390.png
```

## 集成回修 R2：旧演示夹具显式注入展现配置

结论：本域修复完成。仅迁移 `e2e/fixtures/plain-sales-orders/main.tsx` 和 `e2e/fixtures/cross-sheet-cut/main.tsx`，每份新增一个 demoPresentation import，在现有 WorkbookRuntimeProvider 上加 `{...demoPresentation()}`；git diff 合计 4 added / 2 removed。不改产品、spec 标题/断言/超时、FEATURES、其他报告或产物，不新增功能 ID。原 002 R1 已独审通过，本次不重审/重跑不变隔离实现。

修前先完整读当前 index/002 任务及必需 skills，只读审计；收到根明确解除冻结后才编辑。根已停止 004 首次完整尝试并保留 `react-excel-package-004/full-attempt1-results.json`：270 passed、4 failed（批注及自定义公式各 1280/390）、1 interrupted，其余未执行；launcher exit1 / child130。批注失败停在中文名称框，自定义公式停在中文入口，均是夹具默认英文，不是语言切换末尾丢数据。原 6268 输入旧 freeze verify 为 changed:[]。该尝试是确定失败后的主动终止，**不是自然完成/全量通过，也不是因工具 timeout 重启**；本叶没有重跑整体 6496 项、Rust、build/repack，004 另行重新冻结验收。

审计结果：`e2e/fixtures/` 只有这两个 Provider 装配入口，均漏注入；真实 PageSalesOrders / PageAsyncFormulas 已正确传 demoPresentation。plain 的中文 URL 调用来自 comments、notes、custom-formulas localization（各两宽）；cross-sheet 原语言场景在 UI 下拉切换中英。现有 Canvas specs 走正确产品首页，package-embedding 的 URL 忽略则是库隔离主用例，不能一起改成演示策略。最短链仍为 fixture 显式展现 props → 原 Provider/View → Core command → 真实 Worker/WASM，公共库继续默认 en/DOM、无 URL/storage 初始化副作用。

### R2 定向命令与结果

cwd 为仓库根；仅一次单 worker Playwright 运行，退出后再顺序启动 Canvas 探针，无并行浏览器。

| 命令 / 范围 | 实际结果 |
|---|---|
| `PLAYWRIGHT_JSON_OUTPUT_FILE=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/r2-fixture-results.json pnpm --filter @einfach/react-excel exec playwright test e2e/comments/localization.spec.ts e2e/notes/localization.spec.ts e2e/custom-formulas/localization.spec.ts e2e/cross-sheet-cut/language-layout.spec.ts e2e/cross-sheet-cut/move.spec.ts --reporter=list,json --output=/Volumes/work/self/excel/.codex-artifacts/react-excel-package-002/r2-fixture-test-results` | exit0；12/12，17.3s，无 skipped/unexpected/flaky/retry。覆盖原四个确定失败、备注中文两宽、跨表中英两宽及键盘/工具栏剪切移动与 Undo/Redo；没有放宽原断言或超时。 |
| `pnpm exec eslint --config rules/.eslintrc --ignore-path rules/.eslintignore --ext=.ts,.tsx excel/react-excel/e2e/fixtures/plain-sales-orders/main.tsx excel/react-excel/e2e/fixtures/cross-sheet-cut/main.tsx` | exit0，无输出。 |
| `pnpm --filter @einfach/react-excel exec node --input-type=module -`：TypeScript API 读取原 tsconfig.json options，createProgram roots 仅两 fixture main.tsx 与 src/i18n/catalogs.d.ts，noEmit:true，检查 parsed.errors + getPreEmitDiagnostics | exit0；diagnostics:0。只检查两入口的实际类型闭包，不运行其他测试或修改 tsconfig。 |
| `pnpm --filter @einfach/react-excel dev --host 127.0.0.1 --port 5191 --strictPort` 后，`pnpm --filter @einfach/react-excel exec node --input-type=module -` 内联 Chromium/expect Canvas 探针 | 两场景全过：plain 1280/A2/SO-10001、cross-sheet 390/A1/4；均使用 `?locale=zh-CN&renderer=canvas`。断言中文语言值、Canvas 可见/真实 fillText 原值、DOM td 为0；真实名称框→F2→编辑→Enter→回到原坐标读公式栏→撤销恢复原值。每页 1 个真实 Worker、pageerror=[]；只读运行探针，不创建新持久功能用例。 |
| `git diff --check -- excel/react-excel/e2e/fixtures/plain-sales-orders/main.tsx excel/react-excel/e2e/fixtures/cross-sheet-cut/main.tsx` / `wc -l` | exit0；两文件各23行。 |

12 项由原配置的 Vite 5191 / 包消费者服务 5193 承载，进程自然退出0。随后 Canvas 探针 browser 在 finally 关闭；所属 Vite session95582 主动停止、exit0。最终两次 `lsof -nP -iTCP:5191/5193 -sTCP:LISTEN` 均无输出/exit1；未留浏览器或监听服务，不占用 004 下一轮端口。

### R2 截图实际目视

以下四张均实际 view_image 打开。原共享 visual-runtime 缺失情况未变；没有新增视觉设计、token 或 CSS，沿用既有布局与 DOM 断言验证。本轮其余自动截图只作为结果附件，不声称逐张目视。

- `.codex-artifacts/react-excel-package-002/r2-plain-sales-orders-canvas-1280.png`：中文工具栏/名称框与真实 Canvas 订单网格完整，A2 撤销后恢复 SO-10001，页签和底部统计仍在视口内。
- `.codex-artifacts/react-excel-package-002/r2-cross-sheet-cut-canvas-390.png`：中文紧凑工具栏、A1=4 和跨表页签完整，Canvas 自身裁列、不撑宽手机页；长页签保持原省略样式。
- `r2-fixture-test-results/comments-localization-Chin-5a4a9-tching-to-English-at-1280px/comments-zh-1280.png`（同上目录前缀）：中文批注弹窗、张三及双语多行正文可见，标题/输入/按钮无新裁切。
- `r2-fixture-test-results/comments-localization-Chin-5116d-itching-to-English-at-390px/comments-zh-390.png`：弹窗在窄视口内完整，正文保留换行/emoji，底部操作可见；对应原失败入口现在已真正完成创建及后续切英文断言。

### R2 精确指纹与未变输入

修前→修后 SHA-256（只发生上述 import / props 迁移）：

```text
dfdfde57a6eab43b6400750251373ea5b69599a0ebf57545c074cbdf16c68380 -> d64c8369777191c21d0e83d4d46ae24c0ec3669e689d8b9ae24bf2c9048955c1  excel/react-excel/e2e/fixtures/plain-sales-orders/main.tsx
19f43e53ac09110371449f3ea0eb3fdb037d2b134fe7f7570cec5e4107869b80 -> c5082bdd3896888202cd44377cc53d4206d3485598b415cc4aa1f94683186cbd  excel/react-excel/e2e/fixtures/cross-sheet-cut/main.tsx
```

本轮实际测试输入/输出：

```text
775eee25ff79e29170587d5496f39049c8fddc9f86ac38ad9881d8401a9862e3  excel/react-excel/src/page/demo/demo-presentation.ts
bc08c1a42a83eacc48addc56f60bff4d16b93b315532933a309af762de9bfbf8  excel/react-excel/e2e/comments/localization.spec.ts
722625898772c78cf389f89d251108ae622b5d5c01fa53166a124390a91a33b9  excel/react-excel/e2e/notes/localization.spec.ts
a6bffbc2e94833566277a7f12417125504111407f10d9fcfbd66910dd89f322a  excel/react-excel/e2e/custom-formulas/localization.spec.ts
ecc17a4947c9265bec7c2540c6078ee1715352bd09fd73b21b650e39cb685e0f  excel/react-excel/e2e/cross-sheet-cut/language-layout.spec.ts
33595d779ddc62edc0a7a1a2563ad46a822454ee14c533e3505e24a4fc224b6a  excel/react-excel/e2e/cross-sheet-cut/move.spec.ts
da8d103fb6111dd2ec5fe7f0b62dbb7bd947c7cc196ef6f0a8d42ced25f6cd4e  excel/excel-wasm/lite/einfach_wasm.js
b90750bbc09d7d97885f3c04fef259bd7488bfd50d14505897ec08f9e7612804  excel/excel-wasm/lite/einfach_wasm_bg.wasm
c9dafaa6ba670d4c5d3792b34307f06beb1c4a110cb19c693d450288c8b9e563  .codex-artifacts/react-excel-package-002/r2-fixture-results.json
859059091bd270283b43f4bc1ae3f645ccc85d33ab8136b16e7c2dca7aaaaf98  .codex-artifacts/react-excel-package-002/r2-plain-sales-orders-canvas-1280.png
5535f3a5e2fb7cccd4ccde207f7de209d9534861588cb7bfb3d21eb389cc3b00  .codex-artifacts/react-excel-package-002/r2-cross-sheet-cut-canvas-390.png
fae5a2af1e82c8c071252119a387be64bcc8092f5c7b5731fe9823220b9295f2  .codex-artifacts/react-excel-package-002/r2-fixture-test-results/comments-localization-Chin-5a4a9-tching-to-English-at-1280px/comments-zh-1280.png
b4c920430dbf627b7bf4bd5545ce1ab4f226381adaaeaa0d7e53afbc48338f13  .codex-artifacts/react-excel-package-002/r2-fixture-test-results/comments-localization-Chin-5116d-itching-to-English-at-390px/comments-zh-390.png
```

这里 WASM 为 004 已统一重建的当前实物，不再沿用 R1 旧预编译哈希；本叶没有重建或改写它。原产品 en/DOM 默认及 URL/storage 隔离证据继续有效；本次夹具迁移不改公开库能力，不新增 FEATURES 行。Linux、全量 E2E 与新冻结闭合仍由 004 负责，本报告不把本域 12+2 定向通过扩称全量通过。
