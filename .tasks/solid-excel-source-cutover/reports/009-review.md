# 009 独立审查：切换 Solid 包公开入口契约

结论：**APPROVED**。未发现阻断发布契约的缺陷；任务 009 的四项验收与 C-006/C-007/C-008/C-009/C-014 均有充分证据闭环。

## 验收逐条判定

1. **通过。** 不重跑测试；采用执行报告记录的指定 Jest 结果（3 suites / 7 tests 全绿）。三份测试的静态内容与任务契约一致：根/current/legacy 隔离、四组 worker canonical/vnext 路径逐对象相等、两条 CSS 路径均进入 production tree-shaking consumer。
2. **通过。** 不重跑 build；采用报告中的 `npm run build:publish` 成功证据。当前磁盘产物也与配置一致：`esm/src/index.mjs`、`public.mjs`、四个 worker leaves、demos/i18n 及 `esm/legacy/index.mjs` 均存在。
3. **通过。** 不重跑 pack；报告给出 2848 项 tarball、分类计数、必需文件、排除目录与 packed consumer probes。`package.json#files` 明确纳入 `src`、`legacy`、`esm`、`@types/src`、`@types/legacy`，未纳入顶层 `demo`、`bench`、`test`、`e2e`。`src/demos` 必须随公开 `./demos` 子路径发布，不属于被排除的顶层 demo 应用。
4. **通过。** 不重跑检查；采用报告中的 `git diff --check` 零错误证据。范围 diff 仅涉及任务卡列出的文件及编排者明确授权的 `legacy/demos/index.ts` 最小修正；未见 009 自行扩张产品范围。

## 发布契约与覆盖矩阵

- **C-006：通过。** 根的 `solid/types/import/default` 分别闭合到 `src/index.ts`、`@types/src/index.d.ts`、`esm/src/index.mjs`；`main`/顶层 `types` 同步。`./vnext` 四条件闭合到 `src/public` 的同一实现面。`src/index.ts` 仅 re-export `public`，生成的 root/public ESM 导出面一致。根不导出 `Table`、legacy namespace、demos 或 worker factory；`src/adapter/index.ts` 又显式排除了含 `import.meta` 的 factory。
- **C-007：通过。** `/worker-factory`、`/worker-runtime`、`/worker-runtime-full`、`/worker-runtime-core` 的每个 `solid/types/import/default` 都指向存在且同 stem 的 source/declaration/ESM；每条 `/vnext-worker-*` alias 与 canonical 对象逐字段完全相同。报告中的 packed factory 同函数引用 probe、其余 worker leaves 的相同 resolved URL probe补足了发布态证据。
- **C-008：通过。** `/styles.css` 与 `/vnext-styles.css` 精确指向同一 `src/styles/index.css`；`sideEffects: ["**/*.css"]` 保证消费者不会把显式 CSS import 当成纯模块删除。Rollup 对 CSS 设置 `moduleSideEffects` 并复制 source/legacy CSS 到相同 ESM 相对布局；两条导出均有 production tree-shake 测试与 packed resolver 证据。
- **C-009：通过。** `/demos`、`/i18n` 的四条件均一致指向 current `src` 树及对应 `@types/src`/`esm/src` 产物。demos barrel 同时保留 canonical 名称和指向相同组件的 VNext 名称别名；i18n 有实际加载 probe，demos 有 packed Vite build probe。
- **C-014：通过。** Rollup input 覆盖 legacy、current root/public、demos/i18n、四个公开 worker leaves，以及 factory 引用但不公开的 TS worker entry。`preserveModules` 输出路径与 exports 完全对应。worker URL rewrite 同时把 factory 中的 `worker-runtime.ts`、`worker-entry-ts.ts` 改成同目录 `.mjs`，现有生成文件可见改写结果。两套声明树均在发布清单和产物中。

## Legacy、文档与版本语义

- `legacy/index.tsx` 与切换前 `src/index.tsx` 的 value/type 导出逐项一致，唯一预期差异是内部 `vNext` 指向迁移后的 `../src/public`；因此旧根 API 经 `/legacy` 完整保留。
- `legacy/demos/index.ts` 只把原有两个 current-demo bridge 从已消失的 `src-vnext` 改到 `src/demos`，没有扩大兼容面，是修复 build 的最小改动。它没有必要补齐另外两个 current demos：旧 bridge 原本只承诺这两个导出，公开 current demos 已由 `/demos` 完整提供。
- ADR 0020 准确记录 root breaking cutover、legacy 迁移、canonical/vnext aliases、worker `import.meta` 隔离和双形态产物。changeset 明确提示旧根消费者迁到 `/legacy`。包仍为 `0.1.0`，以 minor 表达 pre-1 breaking change符合本仓库 changeset/semver 语义。

## 质量发现

- **低：** `package-css-side-effects.test.ts` 的回调函数体缩进少一级，影响可读性但不影响语义、执行或验收，不应阻断。
- **低：** `src/adapter/index.ts` 注释仍只举旧的 `/vnext-worker-factory` 路径，未同时提 canonical `/worker-factory`；代码导出边界正确，ADR 与 package contract 也准确，属于后续注释清理。
- **提示：** 三份 package Jest 使用相对源码而非 workspace 包名，不能单独证明 Node/Jest self-reference resolution；报告已明确该限制，并用真实 tarball 的 import/resolve/Vite probes覆盖发布态，因此不构成缺口。
- **文件职责/行数：** 本叶新增或大改文件均低于 300 行；入口、manifest、构建配置、测试、ADR 与 changeset 各自职责清晰，未发现机械拆分或大杂烩问题。

**APPROVED**：009 的公开入口、兼容别名、legacy、CSS、构建与 tarball 契约均闭环，只有两项非阻断的低级可读性问题。
