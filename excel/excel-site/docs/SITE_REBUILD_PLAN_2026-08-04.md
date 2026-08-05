# excel-site 完全重构计划（2026-08-04）

> 提案（文件名带日期）。落地后按 [CONTRIBUTING §文档规则](../../../CONTRIBUTING.md) 归档：
> 结论上移进 excel-site README 与新 ADR，本体 `git mv` 进 `archive/`。

一句话：把 excel-site 从「JS 渲染的 SPA 展示页」重构为「**静态优先的文档 + 演示站**」——
Astro 静态壳负责所有可读内容（landing、文档、API），Solid 岛屿承载真引擎演示；
GitHub Pages 部署；「可视窗口投影 + 公式惰性求值」升格为整站主线叙事；
API 文档从代码契约生成，不手抄。**demo 层不原样迁移**——它自身的病灶（§2）不比骨架少，
迁移即重建。

## 1. 骨架诊断：效果差不是样式问题，是五个结构性缺陷

现有资产（`src/`）：landing 四节、demo gallery（registry 驱动，见
[`src/demos/registry.ts`](../src/demos/registry.ts)）、workbench、en/zh 双语、明暗主题、
静态/worker-ts/worker-wasm 三种后端接线。

1. **没有部署管线。** 四个 workflow（ci / docs / e2e / publish）没有一个发布站点，
   站点效果只存在于本地 dev。一切「效果糟糕」的讨论都发生在没有线上基准的真空里。
2. **叙事错位。** 本栈真正的差异化能力——可视窗口投影、整列公式的惰性求值——被埋在
   demo 列表**最后一项**（`performance`），且只有文字 tips，没有一个数字上屏。
   landing 首屏是静态文案 + 代码片段，和任何组件库官网无差别。
3. **对 AI / 爬虫整站不可见。** HashRouter + 纯客户端渲染：任何 URL 的 HTML 都是空壳，
   `#/demos/performance` 无法被抓取、无法被外部引用。对 AI 不可见 = 对搜索不可见。
4. **API 文档为零。** 三层架构的公共 API（backend port、`createSpreadsheetUi`、
   各 feature atoms）只存在于源码旁的 README；站点上没有入口，人和 AI 都只能翻仓库。
5. **维护成本花在壳上。** router / shell / i18n / 主题全部手写自维护。

1 是零，3、4 在 SPA 架构内无解——所以是重构而不是修补。

## 2. demo 层诊断：六个病灶（全部可 grep 复核）

demo 是站点的正文，它的问题比骨架更直接地决定「效果糟糕」：

1. **写死像素视口。** `viewportHeight: 380, viewportWidth: 720` 这类固定
   `ViewportMetrics` 字面量在 `src/` 里出现 16 处（`grep -rln viewportHeight`）——
   网格是大屏上一个不随容器伸缩的小盒子，这是观感差的第一元凶。
2. **样板 14 连抄。** 每个 demo 页一份长相相同的 `XxxGrid()` 包装组件
   （同一段 select-A1 握手 `createEffect`，注释自己写着 "Mirrors `FormulasGrid`"）、
   一份内联 `const copy = { en, zh }`。与 registry 走 locale 文件的
   `titleKey`/`blurbKey` 并存，i18n 双轨。
3. **10/14 个 demo 跑在 static 假后端上。** 站点的核心可信度主张是「真 Rust/WASM
   引擎」，但大多数 demo 根本没碰引擎。static 后端真正值得展示的是
   「backend port 可插拔、能力可降级」——现在它只是省事的默认，
   而「backend 徽章」把这个实现细节当卖点挂在标题旁。
4. **view-source 链接指向拆分前的老仓。** `DemoShell.tsx` 的
   `GITHUB_DEMO_PAGES_BASE` 指向 `allroad88888888/einfach`——拆仓后那是冻结副本，
   本仓是 `einfach-excel`。
5. **表格表面「永远浅色」硬编码。** `demo-shell.css` 注释自认：spreadsheet chrome
   没有暗色主题，只好让 demo 卡片永远浅色——暗色站点里嵌一块刺眼白盒。
6. **被动 tips + 功能清单式组织。** 「试试这个」是纯文字列表，用户读完自己照做，
   没有完成反馈；而 workbench 里已有 tour 引导机制（`src/workbench/tour/`）却没有
   泛化到 demo。14 个 demo 按内部 feature 目录平铺，是给自己看的功能核对单，
   不是给访客看的叙事。

## 3. 目标与非目标

目标（全部可验收，验收条写在各期末尾）：

- **G1 部署**：push main 自动发布到 GitHub Pages（`https://allroad88888888.github.io/einfach-excel/`）。
- **G2 性能叙事**：可视窗口投影 + 惰性求值成为首屏与旗舰 demo，且**数字来自真实计数**。
- **G3 AI 友好**：任何文档/演示页的正文在静态 HTML 里就有；提供 `llms.txt` / `llms-full.txt`；
  URL 语义化可引用。
- **G4 API 文档**：backend port 契约 + 公共 API reference 上站，单一事实源仍在代码旁。
- **G5 demo 重建**：§2 的六个病灶清零——验收全部可 grep（见 P1/P3）。

非目标：

- 不改引擎与组件包的功能。两个例外，均以独立 PR 上移、不与站点改动混编：
  P2 需要的诊断计数端口（走既有可选 port 模式）；若 DemoGrid 的响应式视口测量
  被证明对所有宿主通用，上移进 `solid-excel`。
- spreadsheet chrome 的暗色主题是库的工作，不在本计划内 hack。站点把浅色表格
  表面做成**刻意的设计语言**（纸张隐喻，含边界处理），同时给库开 issue。
- 不动 legacy `solid-excel/src/` 壳，不动 `solid-excel` 的 e2e 体系。
- 不做 SSR 服务器（纯静态产物），不做站内搜索/评论等站点功能（一期）。

## 4. 形态决策：Astro 静态壳 + Solid 岛屿（回退方案：双轨）

**推荐：单站 Astro。** 页面（landing、文档、demo 说明文）由 Astro 静态生成——G3/G4
的硬前提；交互演示是 `client:only="solid-js"` 岛屿。理由：

- Astro 官方 Solid 集成；vite 底座意味着现有 wasm / topLevelAwait / workspace-alias
  接线（`vite.config.ts`）可经 `vite` 透传延用。
- markdown 原生：P4 的契约摄取和 TypeDoc 输出直接成页。
- 顺手删掉整个手写壳：HashRouter、SiteLayout、路由表——路由交给文件系统。

**约束：solid-js 单实例不变式**
（[ADR 0001](../../../docs/decisions/0001-solid-js-single-instance.md)）。Astro 引入的
任何依赖不得带进第二份物理 solid-js；`grep -oE 'solid-js@[0-9.]+' pnpm-lock.yaml | sort -u`
单行仍是门禁。这是 P0 spike 要证伪的头号风险。

**回退方案（spike 失败才启用）：双轨。** Astro/Starlight 只管 `/`（文档静态站），
现有 SPA build 到 `/app/`，两份产物合成一个 Pages artifact。代价：两套壳、
两份主题与 i18n 同步成本。仅当岛屿方案跑不通 worker+WASM 时接受。

spike 结论落成一篇新 ADR（站点形态），不回写本提案。

## 5. demo 重构原则与新阵容

原则（对 §2 逐条对症）：

1. **一个 DemoGrid 基座。** 响应式视口（容器 ResizeObserver → `ViewportMetrics`）、
   select-A1 握手、Provider 装配收敛为一个组件；14 份样板归一。视口字面量只允许
   存在于基座一处。
2. **默认真引擎。** 所有 demo 跑 worker + WASM；static 后端只出现在
   「bring your own backend」一个 demo 里——在那里它是主角（port 可插拔、
   菜单项随可选 port 缺失而消失的能力降级），不是省事默认。backend 徽章取消。
3. **场景化数据。** 每个 demo 一个真实场景（预算、订单、排班……），seed 与说明文
   讲同一个故事；现有可用的 seed（如 formulas 的三表预测模型）保留进新场景。
4. **交互式引导。** 「试试这个」从文字清单改为可点击步骤（点击真的执行动作 /
   高亮目标 UI，有完成态），机制泛化自现有 tour；步骤文案同时以静态正文渲染
   （爬虫/AI 读文字版，人用交互版）。
5. **i18n 单源。** demo 说明文全部迁出组件内联对象，进 Astro 内容层（en/zh 各一份
   正文文件）；组件里不再有 `const copy`。
6. **源码直链修复。** view-source 指向本仓具体文件行（页组件 + seed 各一）。

新阵容——14 个功能页收敛为 8 个叙事页（旧 → 新映射）：

| 新 demo | 场景 | 吸收的旧 demo |
|---|---|---|
| 首页 hero 网格 | 10 万行即滚即用 | —（新） |
| viewport-projection ★ | 只画看得见的（HUD 计数） | performance |
| lazy-formulas ★ | 只算用得着的（整列公式 HUD） | —（新，依赖分支合入） |
| lazy-area | 滚到哪加载哪：远端分块 + 骨架态 + 失败重试 + 失效重载 | —（新，叙事参照 luckysheet atom 分支 lazyArea demo 家族） |
| formula-engine | 三表预测模型：跨表依赖、溢出数组、命名区域 | formulas、dynamic-arrays、named-ranges |
| custom-formulas | 宿主注册 JS 函数 + async `#BUSY!` | custom-formulas |
| clean-messy-data | 清洗一份脏数据：查找替换→分列→去重→筛选排序→撤销 | find-replace、data-tools、filter-sort、history |
| hand-off-a-form | 把表交给别人填：验证、锁定、条件格式高亮异常 | data-validation、protection-print、conditional-formatting |
| bring-your-own-backend | port 可插拔与能力降级（static 后端当主角） | basics 的后端故事 |
| collaboration | 在场光标 + 批注线程 | collaboration |
| workbench | 全 chrome 自由操作台（入门 tips 变引导步骤） | workbench、basics |

★ = 旗舰（P2 交付）。表格是内容设计起点，P1 定稿时允许微调，但**总数只减不增**、
合并理由须保留在各页「how it works」一节。

## 6. 分期计划

### P0 — 先上线，再重构（管线 + spike）〔S〕

重构的每一步都应该有线上基准可对照，所以第一步是把**现状**部署出去（丑，但在线）：

- 新增 `.github/workflows/pages.yml`：Rust toolchain + wasm-pack + cargo 缓存
  （配方照抄 [`e2e.yml`](../../../.github/workflows/e2e.yml)，那里已解决过一遍）→
  `pnpm install` → `build:wasm` → vite build → `actions/deploy-pages`。
  `on: push[main] + workflow_dispatch`，加 concurrency 组。
- 现有 SPA 是 hash 路由，`vite.config.ts` 补 `base: './'` 即可在子路径下工作。
- 一次性手工操作：仓库 Settings → Pages → Source 选 GitHub Actions。
- **Spike（与上并行）**：空白 Astro 项目 + Solid 集成，把现 `PerformanceDemo`
  （worker + WASM + Provider 全链路）作为岛屿跑通。产出 go/no-go：
  go → §4 主方案；no-go → 双轨回退。

验收：Pages URL 可打开且 performance demo 能滚动；spike 分支里岛屿 demo 能滚 5 万行；
lockfile solid-js 版本 grep 仍单行。

### P1 — 骨架 Astro 化 + demo 基座重建〔L〕

骨架与基座一起换血，**旧 demo 页不逐页迁移**——按 §5 新阵容重组，能复用的是
seed 与 `SpreadsheetChrome`/`ChromeDialogs` 这类装配件，不是 14 个页面本身：

- Astro 项目替换 vite SPA：文件系统路由（`/demos/<id>/` 真路径）、Astro i18n 路由
  承接 en/zh、主题切换移植（`data-theme` + CSS 变量）。
- DemoGrid 基座落地（§5 原则 1）；`SpreadsheetChrome` 迁移时吸收各页重复的
  Provider 装配。
- 新阵容路由与页面骨架建立：每页 = 静态说明正文（Astro 内容层）+ seed 源码片段
  （build 时 `?raw`）+ 岛屿。此阶段允许沿用旧 seed 数据，场景化打磨在 P3。
- 全部 demo 切到 worker + WASM 后端（§5 原则 2）；view-source 链接指向本仓。
- workbench 岛屿化。删除 `routes.tsx`、`SiteLayout`、DemoShell 及全部 SPA 壳代码。
- 站点 smoke e2e（Playwright，复用 solid-excel 的配置模式）：每个 demo 页可交互。
- 新文件全部遵守单一职责 ≤300 行（`one-file-one-thing`）。

验收（全部可 grep）：`grep -rln viewportHeight src/` 只命中 DemoGrid 基座一处；
`grep -rln 'const copy' src/` 零命中；registry（或其替代物）里 static 后端只剩
bring-your-own-backend 一项；对任一 demo URL `curl` 出的 HTML 包含正文说明；
站点 e2e 绿；hash URL 无需兼容（站点此前从未上线）。

### P2 — 性能叙事升主线〔L，本计划的核心交付〕

原则：**数字上屏，拒绝形容词**。

- **首屏即演示**：landing hero 换成一个可立即滚动的 10 万行级 grid 岛屿 + 计数 HUD，
  下接三段叙事（只画看得见的 / 只算用得着的 / 真引擎不是 mock），各自直达旗舰 demo。
- **旗舰 demo ①「只画看得见的」**：大表 + HUD 实时显示〔投影窗口 r₁..r₂ / 总行数〕
  〔本次滚动的 worker 消息数〕〔投影耗时 ms〕。数据源：
  [`diagnostics`](../../spreadsheet-ui-core/src/diagnostics/README.md) atoms +
  backend 显式 debug 计数（该 README 已预留「Backend reads: explicit debug counters only」）。
- **旗舰 demo ②「只算用得着的」**：稀疏百万行列上的整列公式
  `=SUMIF(A:A,…,B:B)` / `COUNTIFS`，HUD 显示〔名义区域 1,048,576 格〕vs
  〔实际遍历格数〕vs〔耗时〕。同页讲清两层机制（引源码而非转述）：
  稀疏孪生遍历（`runtime-ref.ts` 的性能偏好阈值）与物化闸门
  （[`range-gate.ts`](../../excel-core-ts/src/eval/range-gate.ts) 的不变式：
  「一个矩形物化得动，当且仅当它作为数组结果落得了地」）。
- **工程依赖**：〔实际遍历格数〕需要引擎侧新计数端口，链路为
  engine → [worker backend](../../solid-excel/src-vnext/adapter/worker-workbook-backend.ts)
  可选 port → diagnostics atom。这是 P2 最大工程量，跨包。
  **降级方案**：一期先上 wall-time + worker 消息数（现成可得），格数计数后补——
  叙事页结构不变，只是 HUD 少一格。
- 时序依赖：整列惰性求值与 range-gate 目前在 `e2e/feature-folder-plan` 分支，P2 前须合 main。

验收：HUD 全部数字来自运行时计数，代码评审确认无硬编码；Lighthouse performance ≥ 90；
hero 首屏可交互 < 3s（冷缓存 + Fast 4G 模拟）。

### P3 — 场景 demo 内容打磨〔M〕

P1 搭的是新阵容的骨架，本期把每页做成完整叙事：

- 场景化 seed（§5 原则 3）：clean-messy-data 的脏数据集、hand-off-a-form 的
  表单场景等；替换掉沿用的旧生成数据。
- 交互式引导（§5 原则 4）：tour 机制泛化为 demo 步骤组件；每页「试试这个」
  变为可执行步骤，同一份步骤文案静态渲染进正文。
- 每页「how it works」一节：链接对应 feature README / 引擎源码 / P4 的 API 页，
  并保留旧 demo → 新场景的合并说明。

验收：每个场景页的引导步骤可点击执行且有完成态；步骤文案在静态 HTML 中可
`curl` 到；无任何 demo 使用生成占位数据（Column1/Value1 式）。

### P4 — API 文档〔M〕

两层，都不手抄：

1. **契约摄取**：build 时读取贴码契约渲染成页——
   [`backend/types.ts`](../../spreadsheet-ui-core/src/backend/types.ts)（三个必选方法 +
   全部可选 port 的注释即文档）、各 feature `README.md`（atom 分类表）、
   [`CUSTOM_FORMULAS.md`](../../rust/excel-core/src/CUSTOM_FORMULAS.md) 与
   custom-formulas 的 JS 侧 README。单一事实源留在代码旁，站点只是投影，
   与 CONTRIBUTING「契约贴码、同 PR 更新」不冲突。
2. **生成式 reference**：TypeDoc（markdown 输出）覆盖公共入口
   `@einfach/spreadsheet-ui-core`（`index.ts`）与 `@einfach/solid-excel/vnext`。
   前置工作是公共 API 的 TSDoc 补注，范围收敛为：backend port 全量、
   `createSpreadsheetUi`、各 feature README 里点名的 atoms。

版面：`/docs/getting-started`（装包 → Provider → 第一个 grid）、`/docs/backend-port`、
`/docs/atoms/<feature>`、`/api/`（TypeDoc 输出）。语言决策：demo 层维持 en/zh，
文档/API 层一期 **en-only**（TSDoc 与 llms 生态均为英文），zh 按需后补。

验收：站内可链接到 `readVisibleProjection` 的契约页且内容生成自 `types.ts`；
`npm run check:docs` 绿（摄取管线产生的链接纳入同一门禁）。

### P5 — AI 友好层〔S，可与 P4 并行〕

- build 时生成 `llms.txt`（站点索引）与 `llms-full.txt`（契约 + API 全文拼接）。
- 每个文档页提供 `.md` 原文端点（同 URL 加后缀）。
- `sitemap.xml`、`robots.txt`、语义化 HTML（landmark/heading 层级）。
- demo 页「查看源码」已在 P1 修复指向；此期补 seed 文件直链。
- 仓库 README 与站点互链。

验收：`curl <site>/llms.txt` 返回索引；任一文档页 `.md` 端点可取原文；
**AI 冷启动测试**：新开一个 Claude 会话只喂站点 URL，问「backend port 的三个必选
方法是什么」与「整列 SUMIF 为什么不物化一百万格」，两问都能答对。

### P6 — 收口〔S〕

- 删除 SPA 壳与旧 demo 死代码；excel-site `README.md` 重写为现状契约。
- 站点形态 ADR 定稿（含 spike 结论）；本提案 `git mv` 进 `docs/archive/`、
  登记 `INDEX.md`、清扫反向引用。
- 根 `CLAUDE.md` monorepo 表格里 excel-site 一行的描述同步。
- 库侧上移项收尾：视口测量 helper 是否进 `solid-excel`、chrome 暗色主题 issue 状态。

## 7. 风险清单

| # | 风险 | 应对 |
|---|---|---|
| R1 | Astro 依赖树带进第二份 solid-js，复发 ADR 0001 | P0 spike 首要验证项；lockfile grep 门禁不变 |
| R2 | Pages workflow 里的 Rust/WASM 构建 | 照抄 e2e.yml 已验证配方，含 cargo 缓存 |
| R3 | 引擎计数端口跨四层（rust→wasm→worker→atoms），P2 工期失控 | 明确降级方案：wall-time + 消息数先行，HUD 结构不变 |
| R4 | 惰性求值/range-gate 尚未合 main | P2 显式依赖其合入；P0/P1 不受影响 |
| R5 | 全量切 WASM 后端后，某些 UI 功能在 worker 后端缺可选 port（此前只在 static 后端演示过） | P1 切换时逐 demo 核对可选 port 覆盖，缺口列表反馈给 solid-excel；确有缺口的功能留在 bring-your-own-backend 页并如实标注 |
| R6 | demo 合并（14→8）丢失某个功能的展示入口 | §5 映射表保证每个旧 demo 都有去处；workbench 兜底全功能 |
| R7 | 双语 × 文档层内容翻倍 | 已裁决：文档层一期 en-only |

## 8. 验收命令汇总

```bash
# 每期通用
npm run check:docs
grep -oE 'solid-js@[0-9.]+' pnpm-lock.yaml | sort -u   # 必须单行
# P1 起
grep -rln viewportHeight excel/excel-site/src/          # 只允许命中 DemoGrid 基座
grep -rln 'const copy' excel/excel-site/src/            # 必须零命中
npx playwright test                                     # excel-site e2e（工程建立后）
curl -s <pages-url>/demos/viewport-projection/ | grep -c '<main'   # 静态正文存在
# P5
curl -s <pages-url>/llms.txt
```
