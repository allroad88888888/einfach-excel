CHANGES_REQUESTED

# 002 R4 excel-site React adapter 消费清理独立复审

## 阻塞项

1. ❌ 活跃 ESLint 配置仍引用已删除的 React island tsconfig：
   `rules/.eslintrc:9-14` 的 `parserOptions.project` 仍含
   `./excel/excel-site/tsconfig.react-island.json`，而 R4 已删除该文件。根 `package.json:16,19`
   明确以 `rules/.eslintrc` 运行 lint，因此这不是任务/历史账本，可豁免不了。虽然当前定向 lint
   因其它 project 已覆盖 site source 而退出 0，该引用仍是失效的活配置，并与报告“旧 config 名称
   零命中”（`.tasks/react-excel-product-structure/reports/002-report.md:76-78`）矛盾。需同步移除。
2. ❌ 活文档仍把 React 说成已删除的 adapter/demo，而非独立 Rust-only Vite 产品：
   - 根英中 README 仍称仓库包含“React and Vue controlled-projection reference packages and live demos”
     （`README.md:76-78`、`README.zh-CN.md:76-78`）；React 现既不是受控投影参考包，介绍站也已删除
     其 live demo。
   - Astro recipe 仍说实文件带 react/vue integrations、本站同时演示 React/Vue adapter
     （`docs/recipes/astro.md:68-69`），但当前 `astro.config.mjs` 只有 Solid/Vue integration。
   - 当前内容稿仍以现在时声称 React/Vue adapter 目录镜像、React 拥有十余个 public hook、两个包各有
     Playwright e2e 与站点 demo（`docs/content/article5-framework-adapters.md:43-59,61-63`）；配图同样把
     `react-excel` 画成现役 adapter（`docs/content/article5-diagrams.md:16-25,45-60`）。这些文件不在
     archive，且没有“截至 2026-08-14/已移除”的历史标记，不能按任务/历史账本豁免。需改为当前产品
     口径，或明确归档/标注其历史时点与现状替代关系。
3. ❌ AD-395 contract 只删除了 React demo 的正向断言，没有把 R4 的删除边界锁成负向合同。
   `excel/excel-site/scripts/ad395-framework-demo-contract.test.mjs:61-84` 现在只验证 Solid/Vue 仍存在；
   即使以后重新把 `react-controlled-projection` 放回 catalog、DemoPage branch 或 content，4 个测试仍可
   全绿。R4 的核心就是“不再挂载或生成旧 React demo”，应至少断言 React demo id 不在 catalog、
   DemoPage 不含 React island/raw-source branch，并对 Astro integrations/package dependency 的 React
   专属项保持缺席。否则 site contract 没有覆盖本轮最重要的回归方向。

## 已通过项

- ✅ 删除边界本身准确：被删的 island、CSS、双语 demo content 与专用 tsconfig 只服务旧 React
  4×4 controlled projection；`DemoPage.astro`、catalog 和 Astro integration 的窄 diff 只拆 React 分支。
  Vue island、Vue catalog/content/source list、`client:only="vue"` 分支，以及 Solid 默认 island 与 10 个
  Solid demo 均保留（`excel/excel-site/src/components/DemoPage.astro:1-15,33-41,67-72`、
  `excel/excel-site/src/data/demo-catalog.ts:20-127`）。
- ✅ 站点英中 React guide、英中 getting-started、首页 framework 文案、AI 文案与 architecture 已改为
  私有根级 Vite 产品、Rust/WASM worker、无 TS/static/fallback、无 public package entry 的准确口径；
  没有继续宣传 React adapter API/e2e。
- ✅ site package/Astro/主 tsconfig/lock 的本轮 diff彼此一致：excel-site importer 删除
  `@einfach/react-excel`、React/ReactDOM/types 与 `@astrojs/react`；Astro 仍配置 Solid/Vue，主 tsconfig
  回归单一 Solid JSX source，frozen-lockfile 定向验证通过。除阻塞项 1 外未发现配置消费残留。
- ✅ site-smoke 的 CASES 与 spec 注释只把 React 改为独立产品，同时保留 Vue e2e 归属及全部 Solid
  页面行为；没有减少 smoke 的 10 个 Solid demo、中文 workbench、首页、暗色与按需公式断言。
- ✅ 活代码中已无 `from '@einfach/react-excel'`、旧 React island、demo route/catalog branch 或 raw source
  消费；`.tasks/**`、`.project-lines/**`、AD issue/证据矩阵中的历史账本命中不作为残留缺陷。

## 独立验证

- ✅ `pnpm --filter @einfach/excel-site typecheck`：通过。
- ✅ `pnpm --filter @einfach/excel-site build`：通过，40 pages；无英中 React demo route，英中 Vue demo、
  英中 React docs 与 10 个 Solid demo routes 均生成。
- ✅ `node --test excel/excel-site/scripts/ad395-framework-demo-contract.test.mjs`：4/4 通过；但覆盖缺口见
  阻塞项 3。
- ✅ `pnpm --filter @einfach/excel-site check:docs`：通过。
- ✅ `pnpm check:docs`：384 份活文档零死链；2855 份文件无失效路径。它不检查上述语义漂移或 JSON
  project 引用，因此不能关闭阻塞项 1/2。
- ✅ `pnpm install --lockfile-only --frozen-lockfile --offline --filter @einfach/excel-site`：通过。
- ✅ 定向 excel-site source ESLint 与 `git diff --check`：通过。

## 结论

React site 消费的运行时拆线正确，Vue/Solid 未受损；清理活 lint 配置与活文档残留，并为 AD-395 增加
React demo 缺席合同后再复审。
