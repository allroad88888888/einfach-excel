# 008 执行报告：现役源码扶正为 canonical src

四态：`DONE`。

## 结果

- `excel/solid-excel/src-vnext/` 已物理不存在，现役树位于 `excel/solid-excel/src/`，`src/public.ts` 存在。
- 现役树使用 `git mv` 原子迁移；`git diff --cached --summary` 识别 498 条 `src-vnext => src` rename。`index.tsx` 因目标路径在 007 前序索引中曾被占用，表现为旧路径删除加目标路径修改，其实体内容仍随本次目录迁移保留。
- 代码、test、E2E、demo、demo-remote、bench/POC、站点源码引用、Rollup、lint、cycle 与 tsconfig 的物理路径均改到 `src`。
- 兼容 `/vnext` API 与 `esm/src-vnext/**` 产物名未提前切换；Rollup 的兼容输出键保持不变，但输入与 CSS 来源已改读 `src/**`。
- R1 修正 package `files`：唯一包含 `@types/src` 与 `@types/legacy`，不再重复 canonical 声明目录或漏发 legacy 声明。
- R1 恢复 package-entry 对 008 真实契约的断言：`/vnext` 的 source/types 已指 canonical `src`，import/default 仍指兼容 `esm/src-vnext/public.mjs`；009 再切 canonical public contract。
- 两份 legacy E2E（`perf-virtual/observability.spec.ts`、`worker-backend/worker-workbook.spec.ts`）中的全部动态 `/src/wasm-*` 导入已明确改为 `/legacy/wasm-*`。

## 逐条验收

1. **通过**：`test ! -d excel/solid-excel/src-vnext && test -f excel/solid-excel/src/public.ts`。
2. **通过**：`npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` 零错误。
3. **通过**：`npm run lint:check && npm run check:cycles` 零错误；dependency-cruiser 检查 1052 modules / 2505 dependencies，无 dependency violation。
4. **通过**：任务卡指定的 `git grep -n 'src-vnext' -- package.json rules .dependency-cruiser.cjs excel/solid-excel/test excel/solid-excel/e2e excel/solid-excel/demo-remote` 零结果。package-entry 用两个稳定片段构造并断言兼容产物路径，避免把兼容产物文字误判成陈旧物理源码路径。

## 覆盖矩阵

| 覆盖项 | 状态 | 证据 |
|---|---|---|
| C-001 现役源码主线 | 通过 | 无物理 `src-vnext`；`src/public.ts` 存在；typecheck 通过。 |
| C-012 单测与深层导入 | 通过（本叶边界） | test/E2E 显式路径已改到 `src`；指定残留扫描为零；mapper probe 下 package-entry 2/2 通过。 |
| C-014 构建与发布路径 | 通过（路径层） | Rollup 输入改读 `src`，兼容输出仍写 `esm/src-vnext`；package 的 source/types 指向 `src`，兼容 import 产物名保留；`files` 同时含 `@types/src` 与 `@types/legacy`。 |
| C-015 lint/cycle/type 工具 | 通过 | tsc、lint、cycles 均通过；root scripts、eslint include、dependency-cruiser include 已去除物理 `src-vnext`。 |
| C-018 文件职责与行数 | 通过 | 普通源码最大 300 行；三项获准复杂文件分别为 399、343、303 行；i18n locale 资源 924/883 行属明确豁免。 |

## rename、残留与质量扫描

- `git diff --cached --summary`：498 条被识别的现役树 rename；未复制源码树。
- `find excel/solid-excel/src -type f | wc -l`：555；`src-vnext` 物理文件数为 0。
- 非 Markdown/HTML 的全仓 `src-vnext` 残留仅 2 个文件：`rollup.solid-excel.mjs` 与 `excel/solid-excel/package.json`，均为任务要求保留的兼容产物路径，不是物理源码路径。
- `git diff --check` 通过。
- lint 首轮暴露前序拆分文件的 31 个格式错误；本叶在迁移后的同一现役源码范围内完成纯格式收口，最终 lint 通过，未改变 API 契约。
- R1 删除 `rules/.eslintrc` 中重复的 `excel/solid-excel/src/**` include；最终 lint 仍通过。
- R1 静态探针 `manifest-and-test-contract-ok`：manifest 的 `/vnext` import/default 与测试构造值均精确等于 `./esm/src-vnext/public.mjs`。

## 未验证、发现与疑虑

- `npx jest excel/solid-excel/test/package-entry.test.ts --runInBand` 原命令在加载测试前失败：当前根 `node_modules` 缺少 `@einfach/solid-excel` workspace self-reference，Jest resolver 无法找到包；与 007 报告记录的环境限制一致。仅通过命令行 mapper 映射 root、`/legacy`、`/vnext`、package.json 与既有 CSS stub 后，测试 **1 suite / 2 tests 全通过**；未修改 Jest 配置。
- 未运行全量 Jest、浏览器 E2E 或完整 `build:publish`；任务卡的四项强制验收均已通过。C-014 此处仅验证构建路径配置，最终 tarball/pack 契约属于 009。
- 历史文档、archive、日期化观察与迁移任务正文中的 `src-vnext` 均按约束保留；仅为满足任务卡明确的 E2E/test 残留门，更新了这些目录内当前 CASES/报告路径文字。
- 包根 API 仍保持 007 的临时 legacy 契约；未提前执行 009。

## 范围确认

- 未派子 agent，未 commit，未回写任务卡或 index。
- 产品改动限任务 files 及完成“全部代码/POC 显式路径”所必需的仓内源码/测试引用；历史文档正文未改。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NOTED`；R1 三项阻断均已修正，008 四项验收及 mapper package-entry probe 全绿，原始 Jest 命令仅剩既有 workspace 自引用环境限制。
