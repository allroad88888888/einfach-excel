# 008 独立审查

结论：`REJECTED`。

未重跑报告中的 tsc、lint、cycles、Jest 或 E2E；本审查仅核对任务、执行报告、当前工作树、rename summary、范围 diff 与必要实体路径。

## 阻断发现

### High — 发布清单漏掉 legacy declarations

`excel/solid-excel/package.json:76-82` 的 `files` 同时列了两次 `@types/src`，没有列 `@types/legacy`；但包根、`./legacy`、`./demos`、`./i18n` 的 `types` 均指向 `@types/legacy/**`（同文件第 7、11、47、53、59 行）。因此 pack 后这些已公开的声明入口会缺失。正确边界应同时包含 `@types/legacy` 与 `@types/src`。这直接使 C-014 不通过，也说明报告中“最终 tarball 属于 009”不能覆盖当前 manifest 自身已确定的漏发缺陷。

### High — package-entry 测试断言了不存在的、提前切换的 ESM 路径

`excel/solid-excel/test/package-entry.test.ts:34-39` 期待 `/vnext` 的 import/default 为 `./esm/src/public.mjs`；当前 package manifest 在 `excel/solid-excel/package.json:15-20` 保持 `./esm/src-vnext/public.mjs`，Rollup 也明确以 `src/**` 为输入、以 `src-vnext/**` 为兼容输出（`rollup.solid-excel.mjs:26-31,69-70`）。后两者符合 008 “兼容产物 alias 保留，009 再切公开契约”的边界，测试断言不符合。

因此 package-entry 失败不能只归类为 workspace self-reference resolver 环境警告：resolver 确实是加载前的环境阻塞，但一旦 resolver 可用，该断言仍会失败。报告将它描述成唯一环境限制，遗漏了确定性的测试/manifest 契约冲突。C-012、C-014 尚不能判通过。

## 逐项验收与覆盖矩阵

- 验收 1 / C-001：通过。物理 `src-vnext/` 不存在，`src/public.ts` 存在，现役 `src/` 有 555 个文件。
- 验收 2：按要求不重跑；接受执行报告的 tsc 零错误记录，但不据此消除上述静态契约缺陷。
- 验收 3 / C-015：按要求不重跑；配置路径已切到 canonical `src`。`.dependency-cruiser.cjs`、root scripts、tsconfig 均无物理 `src-vnext` source include。`rules/.eslintrc:305-306` 重复列出同一 `src/**`，属 Low 级无功能影响清理项。
- 验收 4：静态复核指定范围无 `src-vnext` 结果；通过。但 package-entry 测试为满足该文本门禁而改成错误 ESM 断言，门禁通过不等于契约正确。
- C-012：不通过，package-entry 断言与当前兼容产物契约冲突；其余 test/E2E 深层物理 import 已迁到 `src`。
- C-014：不通过，`files` 漏发 `@types/legacy`；Rollup 的 `esm/src-vnext` 仅作为产物 alias、没有物理 source，设计正确；包根仍是 legacy，没有提前切成现役 API。
- C-018：通过。普通现役 TS/TSX 最大 300 行；超过 300 的仅登记的三项复杂豁免：`renderRangeAsImage.ts` 399、`sheet-tab-controller.ts` 343、`wasm-workbook-surface.ts` 303，分别是单一渲染算法、交互状态机、协议面，符合复杂资格；`i18n/locales/en.ts` 924 与 `zh.ts` 883 是 index 明示的 i18n 资源豁免。

## rename、legacy E2E 与范围

- `git diff --cached --name-status --find-renames=50%` 核得 498 个 `src-vnext/** -> src/**` rename，全部 `R100`，主体实现历史得到保留。
- `src-vnext/index.tsx` 因 `src/index.tsx` 目标冲突表现为删除加改写，未形成可 follow 的 rename；当前 `src/index.tsx` 通过 `public` 与 `demos` barrel 保留旧 vnext index 的导出语义。此单文件历史例外已在报告披露，不构成额外阻断。
- 两条 legacy E2E 的浏览器动态 import 已全部改到 `/legacy/wasm-*`，没有误指 canonical `src`。
- `demo-remote`、vanilla readonly POC、site TypeDoc/Astro alias 与源码链接的调整均是物理路径变化所必需；未观察到把 site/POC 的 `@einfach/solid-excel/vnext` 消费迁到包根，未提前执行 010 的 npm API 迁移。

## 修复后复审条件

1. `files` 将重复的一个 `@types/src` 改为 `@types/legacy`。
2. package-entry 在 008 状态下断言真实的 `esm/src-vnext/**` 兼容输出，或明确留到 009 再同步切换；不要把 resolver 环境警告当作该断言的豁免。

一句话回执：REJECTED — canonical source rename 合格，但 package 发布清单漏发 legacy declarations，且 package-entry 测试提前断言了 009 才应切换的 ESM 路径。

---

## R1 复审

结论：`APPROVED`。

本轮仅静态核对指定的三个修复点；未重跑 tsc、lint、cycles、Jest 或 E2E。更新报告所记命令行 mapper probe（1 suite / 2 tests 通过）可采信。

1. **package `files`：通过。** `excel/solid-excel/package.json:76-82` 现在分别且仅一次包含 `@types/src` 与 `@types/legacy`，同时保留 `src`、`legacy`、`esm`；原 High 级 legacy declarations 漏发问题已修正。
2. **008 阶段 package-entry 契约：通过。** `excel/solid-excel/test/package-entry.test.ts:15` 由两个稳定片段构造 `./esm/src-vnext/public.mjs`，第 35-40 行用它断言 `/vnext` 的 import/default。该值与 `excel/solid-excel/package.json:15-20` 一致，也与 `rollup.solid-excel.mjs:26` 的 `src-vnext/public` 输出键一致；Rollup 输入仍为 canonical `src/public.ts`。因此兼容产物 alias 得以保留，没有提前执行 009。
3. **ESLint include：通过。** `rules/.eslintrc:303-308` 仅保留一次 `excel/solid-excel/src/**`，原 Low 级重复项已清理。

原审查的两个 High 阻断均已关闭，指定 R1 范围未见新问题。

一句话回执：APPROVED — package 声明发布清单、008 兼容 ESM 断言与 ESLint include 三项修复均正确且相互一致。
