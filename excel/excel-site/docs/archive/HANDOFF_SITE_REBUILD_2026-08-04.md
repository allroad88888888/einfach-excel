# 交接：excel-site 完全重构的执行（2026-08-04）

> 冻结记录（2026-08）。写给**接手执行重构的 agent**，自包含——不依赖产生它的那次会话。
> 执行中发现与现状不符时，以代码与提案为准，不要回改本文档。

## 0. 一句话任务

按提案 [`SITE_REBUILD_PLAN_2026-08-04.md`](../SITE_REBUILD_PLAN_2026-08-04.md) 分期执行
excel-site 重构（P0 起步），以 [`mockups/`](../mockups/) 十页设计稿为视觉与交互验收基准。

## 1. 必读（按顺序，读完再动手）

1. 仓库根 `CLAUDE.md` —— monorepo 结构、三层架构、测试与构建命令。
2. [提案](../SITE_REBUILD_PLAN_2026-08-04.md) —— 诊断、目标、形态决策、P0–P6 分期与
   每期验收条。**分期细节一律以它为准，本文不复述**（避免两处漂移）。
3. [`../mockups/`](../mockups/) 的 `index.html` —— 浏览器打开逐页点一遍，10 页都有
   可交互的引导步骤（steps 打勾）。
4. `CONTRIBUTING.md` §文档规则 —— 四类文档的生命周期；改公共 API 必须同 PR 更新契约文档。
5. [ADR 0001](../../../../docs/decisions/0001-solid-js-single-instance.md) —— solid-js
   单实例不变式，本次重构头号技术风险（Astro 依赖树不得带进第二份 solid-js）。
6. `excel/spreadsheet-ui-core/src/backend/types.ts` —— backend port 契约（三个必选方法）。

## 2. 已发生的事（时间线）

1. **提案两轮成稿**：第一轮定骨架诊断与 Astro 化路线；第二轮应用户要求把 demo 层单列
   诊断（六个可 grep 的病灶）、demo 原则与 14→8 阵容表、P3 内容打磨期。之后对照用户在
   luckysheet 仓 atom 分支新增的 demo collection（lazyArea 家族 / 公式边界 / metaOnly
   加载 / 编辑撤销 / 导出协作 / 性能监控，见该仓 `demo-local/`），补了 `lazy-area` 一行。
2. **设计稿十页落地**（`../mockups/`）：landing + 9 个 demo。覆盖提案阵容里的旗舰两页
   （viewport-projection / lazy-formulas）与 lazy-area、动态数组 #SPILL!、异步自定义公式
   #BUSY!、协作模拟、编辑撤销、冻结窗格、导出回灌。未做：bring-your-own-backend、workbench。
3. **设计稿经过浏览器实测**：Playwright 逐页过 console 与交互，修了 17 处 bug。
   教训：生成后的自查与 grep 兜不住，**浏览器实测是必要工序**。

## 3. 设计稿的地位与设计系统

mockups 是**视觉/交互基准，不是生产代码**。生产实现按提案 P1 走 Astro 静态壳 +
Solid 岛屿 + 真 worker/WASM 引擎；mockups 的数据与计数是页内模拟（每页 ribbon 有
诚实标注），实现时必须替换为引擎真实计数（提案 P2 的计数端口）。

可直接搬运的设计系统（都在每页 `<style>` 里，同一套）：

- **Token**：`:root` CSS 变量三段主题覆盖（`@media (prefers-color-scheme: dark)` +
  `:root[data-theme="dark"]` / `[data-theme="light"]`）。主色 viridian（浅 `#17754f` /
  深 `#43c78f`），中性色全部带绿灰偏置。
- **纸张隐喻**：表格表面在两个主题下都保持纸白（`--paper` 族）——这是提案裁定的
  刻意设计语言（chrome 暗色主题是库的欠账，站点不 hack）。
- **仪表盘**：HUD 深色面板 + 等宽表格数字（`tabular-nums`）大字上屏；
  文案原则「数字上屏，拒绝形容词」。
- **引导步骤**：steps 卡片可点击执行、完成自动打勾（badge 变实心），
  同一份步骤文案必须同时静态渲染（AI/爬虫可读）。
- **诚实标注**：任何模拟/降级都在 ribbon 或说明卡里写明，不冒充真实现。

## 4. 待执行工作

= 提案的 P0–P6，从 P0（Pages 部署管线 + Astro spike）开始。提案之外的增量决定只有：

- 阵容表已含 `lazy-area` 行（滚到哪加载哪）。
- mockups 十页是 P1（骨架）/P2（性能叙事）/P3（内容打磨）的视觉验收基准；
  P1 落每页时以对应 mockup 为准迁移文案与交互设计。
- mockups 目前未提交 git，处置（入仓位置/是否入仓）问用户。

## 5. 工作方式约束（用户明确要求过的，必须遵守）

1. **分级派模型，主 agent 只编排**：haiku 干批量/机械生成（给足契约：参考文件、
   可用类清单、输出路径、行数上限、自查清单、回复格式）；sonnet 干集成与 QA
   （浏览器实测、跨文件一致性、修 bug）；opus 干复杂逻辑。共享部分（CSS/骨架）抽模板、
   脚本拼装，子模型只写差异片段——本次 mockups 就是这么做的，单任务从 ~380 行降到 ~200 行。
2. **交付物一律本地文件，禁止擅自发布到线上**（Artifacts/gist 等）。本地 HTML 带完整
   `<!doctype html>` 外壳。
3. **文件 ≤300 行、单一职责**（复杂核心 ≤500 且要说得出理由）；生成代码/fixture 豁免。
4. **验收跑命令不跑感觉**：`npm run check:docs`、
   `grep -oE 'solid-js@[0-9.]+' pnpm-lock.yaml | sort -u`（必须单行）、
   提案 §8 的整套；页面类改动必须浏览器实测。

## 6. 已知坑

- Playwright MCP 打不开 `file://`，测静态页先起本地静态服务器。
- Pages workflow 里的 Rust/wasm-pack/cargo 缓存配方直接抄 `.github/workflows/e2e.yml`。
- `DemoShell.tsx` 的 view-source 链接指向拆分前老仓（`allroad88888888/einfach`），P1 修。
- 提案 P2 依赖整列惰性求值 / range-gate 合入 main；截至本文，它们还在
  `e2e/feature-folder-plan` 分支的未提交改动里（engine 侧文件，**不属于站点工作，别动**）。
- 站点从未上线过，无历史 URL 兼容负担。

## 7. 当前 git 状态（截至本文冻结时）

分支 `e2e/feature-folder-plan`。工作区有两组互不相干的未提交内容：
引擎侧改动（criteria 家族 / range-gate 等，另一条工作线的）；站点侧新文件
（`docs/SITE_REBUILD_PLAN_2026-08-04.md`、`docs/mockups/`、本文）。
站点工作请开独立分支，从 main 拉——不要基于这条引擎分支。
