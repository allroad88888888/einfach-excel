# 010 执行报告：迁移可运行消费者

四态：`DONE`。

## 结果

- 官网源码、首页展示片段、中英文 getting-started 片段与全部 demo seed 均从 `/vnext` 改由 `@einfach/solid-excel` 根入口消费。
- worker factory 改为 canonical `@einfach/solid-excel/worker-factory`，样式改为 `/styles.css`；Astro alias 与两份站点 Vite `optimizeDeps.exclude` 同步使用该 canonical 子路径。
- Vite starter、Quickstart、Astro/Vite/webpack 配方同步到同一套入口；WASM README 的 runtime/full/core 示例也改为 canonical runtime 子路径与 `src/` 实体路径。
- R1：Astro 配方的 `optimizeDeps.exclude` 现与真实站点一致，显式排除 canonical `/worker-factory`；Next/Nuxt 配方与 WASM fallback 路径的遗漏文字也已收口。
- 未改 archive、日期化 observation 或 011 的全局架构文档。

## 逐条验收

1. **通过**：`npm run typecheck -w @einfach/excel-site && npm run check:docs -w @einfach/excel-site`；三份 TypeScript 检查与 docs source projection 均通过。
2. **通过**：`npm run build -w @einfach/excel-site`；Typedoc 与 Astro 静态构建成功，42 个页面完成生成。
3. **通过**：分别用当前工作树生成 solid-excel 与 spreadsheet-ui-styles tarball，随后在 starter 执行 `npm install --ignore-scripts --no-package-lock --no-save <solid-excel.tgz> <spreadsheet-ui-styles.tgz>`。`npm --prefix templates/vite-starter run build` 成功：Vite 转换 886 modules，产出 canonical root/factory 的 worker、WASM 与 CSS chunks；未写 `package-lock.json` 或 `package.json`。
4. **通过**：`git grep -n '@einfach/solid-excel/vnext' -- excel/excel-site/src templates/vite-starter docs/QUICKSTART.md docs/recipes` 零结果。
5. **通过**：扩展扫描 `rg "@einfach/solid-excel/(vnext[^'\"[:space:]]*|vnext-worker[^'\"[:space:]]*|vnext-styles[^'\"[:space:]]*)|src-vnext"` 覆盖任务路径（官网 src/config、starter、Quickstart、全部 recipes、WASM README）为零；`git diff --check` 为零错误。

## 覆盖矩阵

| 覆盖项 | 状态 | 证据 |
|---|---|---|
| C-010 官网消费者 | 通过 | 官网 typecheck、docs check、Astro build 通过；真实源码、alias、首页与同页示例均使用 canonical root/worker-factory/styles。 |
| C-011 starter 消费者 | 通过 | `templates/vite-starter/src/main.tsx` 已用 canonical 三入口；当前 workspace 的 solid-excel 与 styles tarball 安装后，Vite production build 成功（886 modules）。 |
| C-013 双后端浏览器路径 | 通过（本叶编译证据） | 官网生产构建已编译包含 WASM/TS backend 消费链的 islands；`measured-worker-backend.ts` 与 `backends.ts` 均从 canonical root/factory 引入。未运行浏览器 E2E（不属本叶验收）。 |

## 残留扫描

- `@einfach/solid-excel/vnext*`、`/vnext-worker*`、`/vnext-styles*` 与 `src-vnext` 在任务路径均为零；扫描包含此前遗漏的 Next/Nuxt 配方与 site config。
- `excel/rust/wasm/README.md` 的 `/vnext-worker-runtime*`、`/vnext-worker-factory` 与 `src-vnext` 也已切换；该 README 是可复制 worker runtime 配方，故一并收口。
- 全局仍可见的历史 `/vnext*` 文字位于兼容 exports、archive/日期化 observation 或本任务范围外的历史材料；按任务约束保留，未修改。

## 未验证、发现与疑虑

- 首轮仅安装 solid-excel tarball 时，registry 的 `@einfach/spreadsheet-ui-styles@0.1.0` 缺少 `features/filter-dropdown.css`；该文件在当前 workspace styles 包与其 tarball 中存在。将当前 styles tarball 一并安装后 starter production build 通过，确认问题是 workspace 包集合与 registry 同版本混用，而非 canonical consumer。未改 starter/package 的依赖清单。
- 官网构建仅输出既有 Vite deprecation 与大 chunk warning，命令退出 0；本叶未处理这些范围外告警。
- R1 后重跑 site typecheck、docs check 与 production build，均通过；未重跑 starter tarball build，因为代码消费者未变，保留上述当前 workspace tarball build 证据。
- 工作树原本已有其他任务的未提交改动（包括本叶部分 site 文件）；本叶仅进行了 canonical consumer/recipe 迁移，验证针对合并后的工作树。

## 范围确认

- 未派子 agent、未 commit、未回写任务卡或 index。
- 新增/大改文件不存在；所编辑普通文件均不超过 300 行（WASM README 295 行）。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`；官网与当前 workspace 包集合下的 starter production build 均通过，registry 同版本混用风险已记录。
