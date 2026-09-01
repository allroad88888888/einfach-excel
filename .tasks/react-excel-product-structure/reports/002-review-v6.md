APPROVED

# 002 R5 独立复审

## 三个阻塞逐项关闭

1. ✅ **失效 ESLint project 已关闭。** `rules/.eslintrc:9-13` 的 active
   `parserOptions.project` 只保留根 tsconfig、包 tsconfig 与现存 demo tsconfig glob，已不再引用删除的
   `excel/excel-site/tsconfig.react-island.json`。本轮对此文件的 diff 仅删除该一项，没有改 parser、rule
   或 lint 覆盖范围；根 `pnpm lint:check` 独立通过。
2. ✅ **活文档 React adapter 语义漂移已关闭。**
   - 根英中 README 现在都明确：React 是独立私有 Vite 产品、只接 Rust/WASM worker、无 public
     adapter entry、无文档站 live demo；Vue 才保留私有 adapter 与站内 demo
     （`README.md:76-80`、`README.zh-CN.md:76-80`）。
   - Astro recipe 的示例与实配置一致保留 Solid/Vue integrations，并明确站点不注册
     `@astrojs/react`、不提供 React demo（`docs/recipes/astro.md:42-71`；实配置见
     `excel/excel-site/astro.config.mjs:12-38`）。
   - article5 正文在首屏标注 2026-08-14 历史时点和 2026-09-01 移除事实，并在结尾给出当前替代关系
     （`docs/content/article5-framework-adapters.md:1-6,45-71`）；配图同样先给当前关系，再将原四图逐一
     标为历史图（`docs/content/article5-diagrams.md:1-16,35-38,58-82`）。历史事实与现行产品口径不再混写。
   - 排除任务/历史账本后，活代码及现行产品说明没有旧 React island、旧 demo route、旧 package import
     或 React Astro integration 消费。其余命中是明确的历史文章、冻结目标范围或发布素材条件句，不是
     当前可运行 API 声明。根 `pnpm check:docs` 独立通过：385 份活文档零死链、2856 份文件无失效路径。
3. ✅ **AD-395 缺负向合同已关闭。** 新测试明确锁定：catalog 不得恢复 React demo id；DemoPage
   不得恢复 island/raw-source/route branch；Astro config 不得恢复 React integration；site manifest 不得
   恢复 React package、React runtime/types 或 Astro React dependency；typecheck 不得恢复 island tsconfig
   （`excel/excel-site/scripts/ad395-framework-demo-contract.test.mjs:77-97`）。原 Solid worker-WASM 与 Vue
   controlled-projection 正向合同仍在（同文件 `:53-75,99-111`），没有以“只测缺席”削弱剩余框架。
   独立执行结果为 5/5 通过。

## 范围与回归

- ✅ R5 的修复面与三个阻塞一一对应：ESLint 配置、根双语 README、Astro recipe、article5 正文/配图、
  AD-395 contract 及执行报告；没有扩入 React 产品行为、Vue/Solid 实现或 package/lock 依赖。
- ✅ 当前 site manifest 只保留 Solid/Vue integrations 与依赖，typecheck 只覆盖主 tsconfig 和 Vue island
  （`excel/excel-site/package.json:6-15,17-40`）；DemoPage 只保留 Vue 专属分支与 Solid 默认分支
  （`excel/excel-site/src/components/DemoPage.astro:1-15,33-41,67-72`）。
- ✅ `rules/.eslintrc` 是存量超限文件：323 行减为 322 行，本轮只是删除一条失效 project 引用。
  按“路过存量超限小改”规则记录为存量债务，不要求在本修复中顺手拆分；新增/大改的 AD-395 测试
  为 131 行，所审活文档最大 274 行，均未触线。
- ✅ 执行报告对 R5 的改动、测试数量、文档数量、40-page 构建与 322 行例外记录准确
  （`.tasks/react-excel-product-structure/reports/002-report.md:23-26,81-86`）。

## 独立验证

- ✅ `node --test excel/excel-site/scripts/ad395-framework-demo-contract.test.mjs`：5/5 通过。
- ✅ `pnpm lint:check`：通过。
- ✅ `pnpm check:docs`：通过，385 份活文档零死链；2856 份文件无失效路径。
- ✅ `pnpm --filter @einfach/excel-site typecheck`：通过。
- ✅ `pnpm --filter @einfach/excel-site build`：通过，生成 40 pages；无 React demo route，Vue demo 与
  英中 React 产品文档仍生成。
- ✅ `pnpm install --lockfile-only --frozen-lockfile --offline --filter @einfach/excel-site`：通过。
- ✅ `git diff --check`：通过。

## 结论

R5 已逐项关闭 v5 的三个阻塞，修复范围窄且表述、合同与实际站点接线一致；未发现新 regression。
