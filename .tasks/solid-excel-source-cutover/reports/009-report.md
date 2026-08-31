# 009 执行报告：切换 Solid 包公开入口契约

四态：`DONE`。

## 结果

- 包根 `.` 已切到 `src/index.ts`，只转发现役 `public.ts`；旧 `Table`/store API 仅由 `/legacy` 提供。
- `/demos` 与 `/i18n` 已切到 `src` 现役实现。
- 新增 canonical `/worker-factory`、`/worker-runtime`、`/worker-runtime-full`、`/worker-runtime-core` 与 `/styles.css`；全部既有 `/vnext*` 路径保留且指向同一 source/types/ESM/CSS 实现。
- Rollup 统一产出 `esm/src/**`、`esm/legacy/**`；worker URL 重写和 CSS 复制仍保持独立。
- 删除旧 `src/index.tsx`（它同时导出 demos），以一行 `src/index.ts` 明确根入口职责；根 barrel 不含 demos、worker factory 或 `import.meta`。
- `legacy/demos/index.ts` 的现役 Demo 兼容导出改为直接消费 `../../src/demos`。这是构建发现的 008 遗漏，经编排者授权加入 009 files 后完成的最小修正。
- 新增 ADR 0020 与 `@einfach/solid-excel` minor changeset；旧根消费者迁移指引为 `/legacy`。
- package `files` 明确同时包含 `@types/src`、`@types/legacy`，pack 已验证两树实际存在。

## 逐条验收

1. **通过**：指定 Jest 命令，3 suites / 7 tests 全绿。
2. **通过**：`npm run build:publish`；tsc composite 与三条 Rollup 构建全部成功，Solid 产物入口为 legacy、current root/public/demos/i18n、worker leaves。
3. **通过**：`pnpm --filter @einfach/solid-excel pack --pack-destination <temp>`；tarball 2848 项，包含 `src`、`legacy`、对应 `esm` 与两套 `@types`，不含顶层 `demo`、`bench`、`test`、`e2e`。
4. **通过**：`git diff --check` 零错误。
5. **通过**：新增/大改文件 `wc -l` 均小于 300；根入口 1 行，三份测试 76/39/58 行，Rollup 127 行，ADR 35 行。

## 覆盖矩阵

| 覆盖项 | 状态 | 证据 |
|---|---|---|
| C-006 包根与 `/vnext` | 通过 | root source/types/ESM 指向 `src/index`；实际测试确认 current API 存在、legacy `Table` 不在 root；`/vnext` 指向同一 current 实现树。 |
| C-007 worker 子路径 | 通过 | 四条 canonical 路径新增；测试逐对比较 canonical/vnext exports 完全相等；packed factory canonical/alias 实际 import 同一函数，其余 runtime alias 用 packed resolver 验证同 URL。 |
| C-008 样式子路径 | 通过 | `/styles.css` 与 `/vnext-styles.css` 指向同一 CSS；两条路径分别通过 Vite production tree-shaking 测试，packed resolver 同 URL。 |
| C-009 demos 与 i18n | 通过 | exports 的 source/types/ESM 均指向 `src/demos`、`src/i18n`；i18n 实际加载探针通过；demos 由 packed Vite consumer 完成解析/构建。 |
| C-014 构建与发布产物 | 通过 | build:publish 成功；tarball 清单、必需文件、排除目录与 packed consumer probes 全通过。 |

## tarball contents 与 import probes

- tarball 分类计数：`src` 555、`legacy` 36、`esm` 493、`@types/src` 1653、`@types/legacy` 108。
- 必需文件逐项存在：`package/src/index.ts`、`package/legacy/index.tsx`、`package/esm/src/index.mjs`、`package/esm/legacy/index.mjs`、`package/@types/src/index.d.ts`、`package/@types/legacy/index.d.ts`。
- 明确不存在旧 `package/src/index.tsx`，也不存在顶层 `package/demo/`、`bench/`、`test/`、`e2e/`。
- packed worker factory canonical 与 vnext alias 通过 Node 实际 import，导出函数引用相同。
- packed root、legacy、vnext 与 canonical CSS 由临时 Vite consumer 从 tarball 解包后的 package 完成 production build；root 不导出 `Table` 的静态访问产生预期 Rollup warning，但构建退出 0，且源码/Jest 断言已直接验证 `Table` 不存在。
- worker runtime/full/core 不在 Node 主线程执行（它们依赖 worker global）；对 packed exports 执行 `import.meta.resolve`，每组 canonical/vnext URL 完全相同。
- 临时 probe 目录已移出工作区到 `/tmp`，未污染交付文件。

## 未验证、发现与疑虑

- 未运行全量 Jest、全量 lint/cycle 或浏览器 E2E；它们超出本叶四项强制验收。完整 composite type/build 已由 `build:publish` 覆盖。
- Jest 当前不能通过 workspace package 名自引用解析 root/legacy/vnext；定向测试使用相对源码实际加载，并独立断言 package exports。packed import/Vite probes补足发布解析证据。
- 第一次 build 暴露 `legacy/demos/index.ts` 仍从根 barrel取现役 demos；在编排者明确扩展 files 后修正并重跑成功，不存在未解决阻塞。
- Node 原生加载 packed root 会因 CSS 扩展不受 Node loader 支持而失败，因此 root/legacy/current 使用 Vite production consumer 验证；这符合浏览器 UI 包的实际消费形态。
- 未迁移 `excel-site` 或 starter；留给任务 010。

## 范围确认

- 未派子 agent，未 commit，未回写任务卡或 index。
- 产品改动限 009 files 与编排者新增授权的 `legacy/demos/index.ts`；范围外只记录，未修改 site/starter。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`；009 package contract 已原子切换并通过 Jest、build、pack、packed consumer probes 与 diff 检查。
