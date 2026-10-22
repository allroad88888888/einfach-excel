# 002 独立审查：宿主环境与实例展现隔离

当前结论：`APPROVED`（R1 修复复审）。原两项 Important 均已关闭，新增截图路径的可移植性检查通过。PKG-04 / PKG-05 本叶通过；当前无 Critical / Important / Minor。完整包消费者与全仓门禁仍归 004。

以下首次审查正文保留原 `REJECTED` 的历史事实；当前修复、证据与逐项判定见文末“R1 修复复审”。

审查基线：`08caefbce8cb4934ceea4f0c26115d910569a47c`。日期：2026-10-22。

## 范围与证据有效性

- 完整读取 002 任务、index、002-report、001-review，以及 frontend-design-codex、React 架构、feature-wave、one-file-one-thing 规则。001 已审入口的既有生命周期与包构建实现不重复审查，只检查 002 对其展现配置与样式入口的变化。
- 按任务 files 查看基线 diff；直接读取未跟踪的 Spreadsheet、公开入口、PresentationProvider、demo 策略、style.css、package 测试、5 份 embedding 夹具/测试及 package 接入文档。Core/Rust 的 003 变更不作为本叶缺陷或修复范围。
- 重算 `src` 191 文件、react-cells/src 17 文件、React test 132 文件、package-embedding 5 文件的整树指纹，均与 002-report 完全一致；报告中可直接解析的 34 项文件指纹（含 7 张截图、浏览器结果及关键产物）全部一致。
- 复用未变输入的 9 文件 / 59 单测、5 文件 / 35 单测、package-test tsc、严格词典编译、build:lib、定向 ESLint 与 diff-check 证据，没有重复全仓构建、单测或既有浏览器套件。
- 独立解析 `acceptance-results.json`：18 expected、0 skipped/unexpected/flaky，每个场景只有一次 passed、retry=0。独立解析历史 `final-results.json`：整体仍是 48/49，不能记成整体成功；其中 4 份旧 E2E 的 38 个场景全部 passed。
- 只补做静态作用域/指纹检查及此前未覆盖的两类真实 DOM 探针。探针通过自有 `127.0.0.1:5192` Vite、Chromium、真实模块 Worker/WASM 和现有 host.html 操作，无 atom 直调。自有服务已通过所属 exec 会话停止；随后端口检查无 listener。未新增测试/产品文件，未 commit。

## 逐条验收

| 条目 | 判定 | 独立证据与边界 |
|---|---|---|
| 1. 默认实例独立、显式共享、无宿主偏好副作用、demo 偏好保留 | ✅ | `WorkbookPresentationProvider.tsx:17-25` 每挂载创建自己的 Lingui 实例，显式 i18n 优先；locale 由 layout effect 激活且下拉禁用。`runtime.ts:1-16` 只有纯规范化/词典工厂。`demo-presentation.ts:6-45` 独占 URL、storage、浏览器语言与 renderer 策略。presentation 单测覆盖 fr 保留、实例替换、受控变化及 storage/history spies；对应 4 个真实 DOM 主用例与原 localization 3 场景均成功。 |
| 2. 文案门禁与词典编译 | ✅ | 59 项证据包含 source-copy；strict compile 成功且词典输入指纹未变。3 条 HOST_* 是 msg 映射及 en/zh 词典，未知码仍保留。其宿主锁 DOM 入口明确交 004，未当成已有浏览器通过证据。 |
| 3. 真实宿主样式/滚动、双实例编辑/卸载 | ✅ 已执行的场景；❌ 全部实例隔离 | `host.tsx:5-16` 在动态 import 根入口前采样 7 个宿主元素的 12 项 computedStyle；host.html 未预载组件 CSS。`host-isolation.spec.ts:13-64` 比较加载前后样式并实际 wheel/双击/fill/Enter。卸载后继续编辑和 Undo、邻格及合并锚点均有断言。不过同时残留的编辑器/反馈存在跨实例 ARIA 绑定，见 Important R1。 |
| 4. 中英 1280/390、嵌入尺寸、demo/合并/编辑保持 | ✅ 固定尺寸证据；❌ 容器尺寸变化 | 6 个布局场景与 7 张实际查看的截图支持固定尺寸结论；旧 38 项定位/页签/历史证据保留。宿主只改变容器宽高时，现有公式浮层会被本根裁切，见 Important R2；现有布局测试未覆盖该变化过程。 |
| 5. FEATURES 独立行与真实 DOM 主用例 | ✅ 交接完整；❌ 缺陷回归未覆盖 | 002-report 提供 EMBED-001 至 EMBED-009 的互不重复主标题，均在最终 JSON 中恰一次成功；未越界写 FEATURES.md。R1/R2 必须补持久 DOM 回归并交给 004 登记，当前 idle ID 断言不能替代错误编辑态验收。 |

| 覆盖矩阵 | 判定 | 原因 |
|---|---|---|
| PKG-04：宿主样式/滚动/尺寸/多实例 | ❌ | 向外 CSS 作用域、固定尺寸及已测交互通过；重复编辑器/反馈 ID 和父容器 resize 浮层裁切仍违反本叶隔离/尺寸契约。 |
| PKG-05：中英/独立语言/无 URL-storage 副作用 | ✅ | 默认独立、受控下拉、注入共享/未知语言保留、demo 偏好分离均有源码与有效单测/DOM 证据。 |

## Critical

无。

## Important

### R1. 格内编辑器及反馈 ID 仍按坐标生成，第二实例会读取第一实例错误说明

位置：`excel/react-excel/src/workbook/grid/editor/CellEditor.tsx:77`、`:210-224`。`fieldIdentity` 是 `cell-editor-r${cell.row}-c${cell.col}`，同时用于 textarea id、异步焦点身份检查和反馈 id。两工作簿编辑相同坐标时必然重复。该文件虽然不是本次 tracked diff，但属于 002 的 src 全范围与明确的多实例/ARIA 验收表面，不能因原来只在单实例 demo 使用而豁免。

最小真实 DOM 复现（现有 `e2e/package-embedding/host.html`，1280×844）：

1. 把第二实例语言下拉切到 zh。
2. 双击第一实例 A2，输入 `=SUM(`，按 Enter，等待格内错误。
3. 点击第二实例公式栏，然后双击第二实例 A2，输入 `=SUM(`，按 Enter。第一实例的错误编辑态可正常保留。
4. 两个 textarea 的 id 都为 `cell-editor-r1-c0`；两个反馈的 id 都为 `cell-editor-r1-c0-feedback`。

探针实际输出：第一反馈为 `That edit was not saved.`，第二反馈为 `此次编辑未保存。`；第二 textarea 的 aria-describedby 经 `document.getElementById` 解析到 **first** 根内的英文反馈。Playwright 对第二个中文编辑器断言 `toHaveAccessibleDescription('That edit was not saved.')` 实际成功，证明不只是规范层面的重复 id，而是已发生跨实例可访问说明串用。

`presentation.spec.ts:35-36` 的唯一 ID 断言位于已提交、无格内编辑器的状态，因此没有覆盖本问题。FormulaBar、文件/合并/删除标题、页签错误迁移本身正确；`WorkbookSheetTabs.tsx:170,195` 仍使用同一个 useId 正确绑定 aria-describedby，4 份旧 E2E 也只是 `#id` 到稳定 data 属性的等价迁移，没有删除或放宽原断言。

修复要求：为格内编辑器身份加入实例唯一前缀，反馈及 ARIA 引用使用同一身份；保留现有“异步完成不能抢走下一单元格焦点”的坐标身份语义。新增双实例同坐标错误的真实 DOM 用例，断言全局 ID 唯一、每个 textarea 的说明目标属于自己的根，并验证第二实例中文 accessible description 与自身提示一致。

### R2. 公式浮层只监听 window resize/scroll，宿主容器自身改变尺寸后持续被裁切

位置：`excel/react-excel/src/workbook/formula/FormulaAssist.tsx:46-89`，尤其 `:82-83`；裁切边界来自 `src/style.css:8`。浮层现已正确放回所属根、按根边界定位，但 position 只在 effect 依赖变化、window resize 或 scroll 时重算。父布局改变宽高不会触发 window resize；无滚动时浮层仍保留旧 left/top。

最小真实 DOM 复现（同一现有夹具）：双击 first A2，输入 `=SU` 等候候选列表；通过宿主 DOM 将 `#first.style.height` 从 560px 改为 400px，不改变浏览器窗口。等待 12 个动画帧后：

| 状态 | 根 bottom | 浮层 top / bottom | 结果 |
|---|---:|---:|---|
| 初始根高 560 | 738.875 | 435.875 / 697.875 | 完整可见 |
| 仅宿主根高变为 400 | 578.875 | 435.875 / 697.875 | 底部约 119px 被 overflow:hidden 裁掉，后部候选无法点击 |
| 随后仅发 window resize | 578.875 | 186.875 / 448.875 | 立即正确挪到根内 |

宽度也可独立复现：同一 A2 候选打开时，仅将父容器宽从 615px 改为 360px；浮层仍保留 left=46px、right=401，而根 right=375，右侧约 26px 被裁切。随后 window resize 立即把 left 改为 12px、right=367。此处编辑器仍在可见范围、scrollTop=0，不是将输入滚到外面后的预期隐藏。

现有 `layout.spec.ts:5-36` 只设置 viewport 后加载页面，`host-isolation.spec.ts` 只测 translate 与文档 scroll，均不会捕获单独的父容器 resize。

修复要求：由本实例的 ResizeObserver 观察定位所依赖的根/必要 DOM 几何变化，调用同一定位逻辑并在 cleanup 断开，不新增工作簿状态。补充保持草稿/焦点的持久 DOM 用例：在 window 尺寸不变时缩放宿主父容器，断言浮层四边在本根内且候选仍能点击接受；同时断言兄弟实例和宿主滚动未变化。

## Minor

无新增 Minor。001 已记录的发行 README 旧 Worker 描述仍由 004 文档收尾，本叶不重复计数。

## CSS、资源与架构复核

- 重新以 PostCSS 解析实际 dist/style.css：855 个 selector 均以 `.einfach-spreadsheet` 或 `:where(.einfach-spreadsheet)` 开始，无裸宿主选择器。对 48 份 tracked CSS 做 AST 归一化比较，除前缀及 media→同名组件 container 查询外，仅 FormulaAssist 的 fixed→absolute、vw→根百分比变化。新 style.css 的 token/reset/减弱动画规则全部在根域；全局 app.css 仅 `main.tsx:4` demo 导入。
- 唯一 React portal 为 FormulaAssist，独占容器在 ref 提交后 append 到 `input.closest('.einfach-spreadsheet')`，cleanup 移除自身及窗口监听；不会挂到另一实例或 body。各 native dialog 在所属根的 DOM 子树，主题与 scoped selector 仍可匹配。下载临时 anchor 的 body append/remove 是既有显式下载动作，不属于样式或语言初始化副作用。
- 主 JS 静态扫描没有 localStorage、URLSearchParams、demo storage key、navigator.languages。源码中剪贴板 navigator 访问只服务显式复制粘贴，不是语言偏好读取。
- renderer Context 默认 dom，CellRenderer 不再读取 URL；demo 两页面继续共用原 Provider/WorkbookView 并显式传入 demoPresentation。真实 renderer 用例先编辑再切 Canvas，并通过公式栏证明数据保留，兄弟仍为 DOM。
- 本任务没有新增工作簿 atom、业务 useState/useReducer、Store 镜像或 controller。链路仍为 React DOM → Core command atom → Rust Worker/WASM → atom 结果 → React；PresentationProvider 仅持有 Lingui 与展现配置。FillHandle/GridResizeHandle 的全局键盘监听限于有效本实例拖动，cleanup 可见；未发现新增常驻跨实例命令监听。
- 新增/大改文件复查：PresentationProvider 27 行、demo 策略 45、style 56、FormulaAssist 169、SheetTabs 202、presentation 单测 71，embedding 文件 24–108，均小于 300。既有 feedback-messages 是翻译映射资源，本次只增加 3 条，不据此要求额外重构。

## 七张截图实际查看结论

均使用 view_image 实际打开；路径前缀为 `.codex-artifacts/react-excel-package-002/`。截图与报告指纹一致，它们证明的是捕获时的固定尺寸状态。

| 截图 | 独立目视结果 |
|---|---|
| demo-en-1280.png | 左侧原导航、英文标题/语言/File、单行 ribbon、公式栏、网格与双页签完整；底部统计在独立一行，无新增横向外溢。 |
| demo-zh-1280.png | 中文状态、分类、语言/文件入口清楚，业务网格文案保持原值；页签和统计未被挤出。 |
| demo-en-390.png | 侧栏收紧，ribbon 分类与横向工具分两行，英文语言/File 可见；网格在本视口裁切列，页签与三行统计留在边界内。 |
| demo-zh-390.png | 中文分类/文件/语言完整，公式栏与网格没有撑宽页面；页签、统计没有新增重叠。 |
| embedded-1280.png | 宿主棕色 Georgia 字体、按钮、输入框、表格与背景保留；两实例并排、各自两行 ribbon，左英右中，宿主底部正文仍在组件之外。 |
| embedded-390.png | 宿主按钮自然换行，两张固定高工作簿上下排列；各自标题/语言/File、页签和统计可见，底部正文可继续滚动到达。 |
| embedded-formula-help.png | 第二实例格内 =SU 的候选列表紧贴本输入，白底/蓝色函数名正确，列表位于第二根内，第一根没有候选。说明文本为既有省略号设计；此图不包含 R2 的后续父容器缩小。 |

frontend-design-codex 指定的共享 capture/visual_lint 脚本不存在，执行者已经明确披露，并以持久 Playwright 的溢出、文案内宽、控件在 viewport、pageerror 及逐图检查替代；此次审查没有虚报运行该脚本，也没有重做既有设计。

## 收敛与 004 交接

先由 002 原执行者修复 R1/R2，增加各自真实 DOM 回归及独立 FEATURES 交接行，再做相关定向验证与复审。既有成功证据的输入未变化时继续复用，不必重跑全仓。

完整 tarball、无源码 alias 的 Vite/Rspack、匹配 003 新协议的 Core/WASM/Worker、全仓门禁及 HOST_* 拒绝入口 DOM 仍归 004。003 的换簿权限时序问题是独立任务的 R1，此报告不把它并入 002，也未修改其实现。

## R1 修复复审

结论：`APPROVED`。本节取代首次审查中的未关闭判定，首次两项 Important 的复现过程保留作为历史证据。本轮只审 2 个产品文件、3 个编辑单测文件、editor-isolation.spec.ts 及 2 份既有截图 spec 的路径变化，没有重新扩大到已审语言/CSS领域或 003。

### 输入与执行证据

- 重新读取 index、002 任务的修复 R1 约束、002-report 末节与首次审查。按原基线核对 diff：CellEditor 的新增变化仅为实例 useId 前缀；FormulaAssist 在已审局部定位逻辑上仅增加本根 ResizeObserver 与 disconnect。没有新增业务状态、atom、controller 或第二套定位实现。
- R1 报告的 **28 项指纹全部匹配**：3 份当前整树指纹及 25 项源码/边界输入/产物/JSON/新截图文件。当前 src 为 191 文件、test 为 132、package-embedding 为 6。原 7 张截图重拍后的指纹也全部与首轮一致，复用此前逐图结论。
- 独立解析四份新 JSON：`r1-before-results.json` 是 0/3 成功、3 unexpected，错误确为 ID 31 个只有 29 个唯一值及 1280/390 容器缩高后的边界失败；`r1-fixed-results.json` 是 1/3 成功，另外两项确为 SUM 原生 option 与候选按钮的 strict locator 歧义，未误记为成功。
- `r1-acceptance-results.json` 的 **8/8** 和路径迁移后 `r1-portable-results.json` 的 **10/10** 均为 expected，每项只有一次 passed、retry=0，无 skipped/unexpected/flaky。后者包含 3 个新缺陷场景、原公式浮层场景及中英/嵌入布局 6 场景；另 4 个宿主交互从前一 8/8 复用，未将两轮说成一次全量验收。
- 复用当前输入的 6 文件 / 26 项编辑单测、定向 tsc、build:lib、ESLint 与 diff-check；未重复执行构建/单测/浏览器。旧 59 项语言/入口、未改交互与 scoped CSS 证据保持适用；发行 CSS 和旧 Worker 指纹未变，未借此声称 003 新协议已验证。
- 补做只读路径解析：三份 spec 均已无 `/Volumes/` 字面量；把相同 URL 相对式放在含空格的 Linux 风格临时仓库基址，均解析到该仓库自己的 `.codex-artifacts/react-excel-package-002`。这证明路径计算不依赖本机 checkout，不冒称实际执行过 Linux 浏览器。

### 逐项判定

| 复审项 | 判定 | 证据 |
|---|---|---|
| 原 Important R1：同坐标编辑器及 ARIA 错误说明 | ✅ 关闭 | `CellEditor.tsx:53,78-79,108,212-226` 在 hooks 固定位置取得 useId，生成实例前缀＋坐标后缀；textarea id/name、反馈 id、aria-describedby 使用同一身份，旧异步 restoreFocus 仍比较完整坐标身份。`editor-isolation.spec.ts:24-62` 重现双实例 A2 同时拒绝，断言全局 ID 唯一、说明目标属于自身最近根、分别为英文/中文 accessible description、两份草稿/原值/邻格保留。两份旧身份单测仍断言具体 r0-c0/r1-c1 后缀及 name=id，没有丢掉原坐标含义。 |
| 原 Important R2：父容器 resize 浮层裁切 | ✅ 关闭 | `FormulaAssist.tsx:81-91` 只观察所属 root，回调复用原 position，cleanup disconnect，并保留原窗口监听清理。`editor-isolation.spec.ts:65-103` 在 1280/390 窗口内只缩父容器高度至 400，再缩宽至 360/280；每步检查四边、草稿、焦点，窗口尺寸/宿主及两表 scroll 均不变，实际点击本 listbox 的 SUM 后提交结果 3，兄弟数据/邻格不变。该用例在修复前真实失败，修复后两轮均成功。 |
| 观察器资源与既有异步焦点 | ✅ | `formula-completion.test.tsx:108-142` 确认 observe 的是输入所属 root、次数为 1；扰动 left 后通知观察器恢复既有定位，隐藏后 disconnect 一次且 portal 移除，草稿/焦点保留。26 项编辑回归包含未改的连续异步提交、拒绝重试、公式栏焦点场景；useId 变更没有删除坐标变化保护。 |
| 三份截图 spec 路径 | ✅ | editor-isolation/layout 使用 `fileURLToPath(new URL('../../../../.codex-artifacts/react-excel-package-002', import.meta.url))`，host-isolation 使用相同相对文件 URL。既有截图断言/主标题未改变；最终 10/10 是迁移后实物证据。 |
| 代码职责与行数 | ✅ | CellEditor 232、FormulaAssist 173，相关单测 114/72/142，三份截图 spec 105/111/40 行，均≤300；新增代码继续归 DOM 身份、测量与资源所有权，没有虚假拆层。 |
| FEATURES 交接 | ✅ 本叶交接完成 | 报告新增 EMBED-010 对应同坐标错误反馈主用例、EMBED-011 对应 1280 宿主 resize 主用例，390 为同功能回归；标题互不复用，在最终 JSON 均恰一次成功，登记合并仍按授权归 004。 |
| PKG-04 | ✅ 本叶通过 | 先前已确认的样式/滚动/固定尺寸证据，加上本次两项缺陷的真实失败→成功回归，补齐多实例 ARIA 与动态尺寸边界。 |
| PKG-05 | ✅ 维持通过 | i18n/renderer/词典/偏好模块及其语义未改，复用首审证据。第二实例中文错误的实际 accessible description 此次也已覆盖。 |

### 三张新截图实际查看

本轮使用 view_image 逐张打开，不仅检查文件存在；路径前缀仍为 `.codex-artifacts/react-excel-package-002/`。

| 截图 | 独立目视结论 |
|---|---|
| r1-rejected-editors-1280.png | 两实例的 A2 同时保留 =SUM( 草稿，左英文/右中文红色反馈位于各自输入下方；参数说明接在错误之后，没有遮住错误，邻格 Neighbor 与宿主控件保留。ARIA 归属以真实 DOM 断言证明。 |
| r1-container-resize-1280.png | 左实例已缩至约 360×400，候选从根顶内侧向下完整显示，底部选项未被裁掉；右实例尺寸与网格保留。狭小根内向上避让会覆盖左侧标题/工具区，这是原定位策略的取舍，列表实际可点击已有断言。 |
| r1-container-resize-390.png | 第一实例约 280×400，全部候选函数名可见，说明按既有设计省略号；浮层四边在第一根内，兄弟位于文档下方，无新页面横向外溢。 |

当前没有新增 Critical / Important / Minor。此次复审未启动额外服务、未写产品或任务账本、未跑全量、未 commit。允许 004 消费当前 002 候选；最终匹配 WASM 重建、独立 tarball/Vite/Rspack、Linux 实机及全仓门禁仍须由 004 完成。
