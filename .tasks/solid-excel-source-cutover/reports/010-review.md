# 010 独立审查

结论：**REJECTED**。官网与 starter 的真实源码已完成 canonical 入口迁移，既有构建记录也足以支持本叶的编译见证；但任务范围内仍有 current 文档残留旧命名，且 Astro 可复制配置与真实配置漂移，不能判定“配方全部迁移/残留为零”。

## 质量发现

### 重要：Astro 配方的 `optimizeDeps` 未同步 canonical worker 子路径

`docs/recipes/astro.md:57-59` 仍只排除 `@einfach/solid-excel`。同一配方声称片段来自站点真实配置，而真实 `excel/excel-site/astro.config.mjs:37-38` 与 `excel/excel-site/vite.config.ts:33-35` 均同时排除 root 和 `@einfach/solid-excel/worker-factory`。任务上下文明确要求 Astro/Vite `optimizeDeps` 使用 canonical 子路径，且配方属于可复制消费者路径，因此当前片段不满足验收目标。

### 重要：任务范围内仍有 `vnext` 残留，报告的零残留结论不实

- `docs/recipes/next.md:96`、`docs/recipes/nuxt.md:97` 仍写 `vnext-worker-factory`。两者都位于任务声明的 `docs/recipes/**` 范围，不是 archive 或日期化 observation。
- `excel/rust/wasm/README.md:215` 仍指向已迁走的 `src-vnext/adapter/excel-wasm-full-fallback.d.ts`；真实 current 路径为 `src/adapter/...`。
- 执行报告第 31 行明确声称 WASM README 的 `src-vnext` 已切换，与源码不符。报告使用的扫描模式只匹配 `@einfach/solid-excel/vnext`，不足以证明 `/vnext*`/`src-vnext` 全部清零。

## 逐条验收

1. site typecheck + docs check：**有条件通过**。按要求未重跑；最终报告记录三份 TypeScript/docs projection 均成功，未见反证。
2. site build：**通过本叶证据**。按要求未重跑；报告记录 Astro/Typedoc 42 页构建成功。真实消费链中 `DemoIsland.tsx:81-97` 同时实例化 static 与 WASM worker 后端，二者经 `backends.ts` 从 canonical root/worker-factory 导入，生产构建可作为两条消费链的编译覆盖，但不是 C-013 的浏览器行为/E2E 证明。
3. starter build：**通过**。报告给出了当前工作树 solid-excel 与 spreadsheet-ui-styles 双 tarball、`--no-save --no-package-lock` 安装、886 modules 及 worker/WASM/CSS chunk 的具体证据。当前仅 `templates/vite-starter/src/main.tsx` 有改动，package/lock 无 diff，目录内也无遗留 tarball 或 `node_modules`，未发现验证污染。
4. 精确命令 `git grep '@einfach/solid-excel/vnext'`：**通过但覆盖不足**。该模式当前为零；更宽扫描揭示上述 bare `vnext-worker-factory` 与 `src-vnext`。

## 覆盖矩阵

- **C-010 官网消费者：通过。** 真实 site 源码、首页/中英文示例、Astro alias、Astro/Vite `optimizeDeps` 均使用 canonical root 与 `/worker-factory`；样式示例使用 `/styles.css`。
- **C-011 starter 消费者：通过。** `src/main.tsx` 使用 canonical 三入口，当前 solid + styles tarball 构建证据充分，package/lock 未污染。
- **C-013 双后端浏览器路径：本叶编译覆盖通过，完整项不应在 010 宣称完成。** site build 覆盖 static TS 与 WASM worker 两条实例化链；浏览器行为仍应由矩阵指定的 014–019/006/012 targeted E2E 收口。

## 范围与文件规则

- 未发现 archive 或日期化 history/observation 被本叶修改；`seed-history.ts` 是 current site demo seed，仅迁 import，属于明确范围。
- `excel/rust/wasm/README.md` 为 295 个物理行，符合普通文件 300 行上限，职责仍聚焦 WASM 包说明。
- `git diff --check` 无错误。

一句话回执：**REJECTED — canonical 真实消费者与构建见证基本成立，但 Astro 配方漏掉 `/worker-factory` 的 `optimizeDeps` 排除，且 current recipes/WASM README 仍有三处 `vnext`/`src-vnext` 残留。**

## R1 复审

结论：**APPROVED**。本轮只复核原审查 findings，未重跑 site/starter 构建。

- Astro 配方已修复：`docs/recipes/astro.md:57-59` 的 `optimizeDeps.exclude` 现同时包含 `@einfach/solid-excel` 与 canonical `@einfach/solid-excel/worker-factory`，与真实站点配置一致。
- Next/Nuxt 遗留已修复：`docs/recipes/next.md:96` 与 `docs/recipes/nuxt.md:97` 均改为 `worker-factory`，旧 `vnext-worker-factory` 文本清零。
- WASM README 路径已修复：`excel/rust/wasm/README.md:215` 现指向 current `src/adapter/excel-wasm-full-fallback.d.ts`。
- 更宽 current 扫描覆盖官网源码与两份配置、starter、Quickstart、全部 recipes、WASM README；对 `@einfach/solid-excel/vnext`、`vnext-worker-factory`、`vnext-styles.css`、`src-vnext`、`/vnext-worker` 均为零结果。更新报告也已记录可复现的扩展扫描模式与覆盖路径，不再沿用上一轮过窄证据。

原两项重要 finding 均已关闭；未发现新增阻断问题。site/starter 的既有构建结论与 C-010/C-011/C-013 本叶编译覆盖判断保持不变。

R1 一句话回执：**APPROVED — Astro canonical `optimizeDeps`、Next/Nuxt factory 文本、WASM current 源码路径及宽残留扫描均已收口。**
