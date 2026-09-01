# 002 执行报告：把现役 bridge 内部化并删除旧 adapter

## 结果

- 产品不再 self-import `@einfach/react-excel`，全部改为产品目录内的精确相对 import，未新增 barrel。
- 8 个现役 bridge surface 已按职责内部化并改为产品命名：runtime provider/context、store value、
  selection、pointer selection、viewport、editing session 与 grid view。
- 删除 root `src/index.ts` 与 9 个未消费旧 surface：frozen grid、grid geometry、keyboard、IME、
  formula bar、name box、sheet tabs、clipboard、history；`src/` 根仅剩 `main.tsx`。
- 删除全部旧 adapter tests，只保留 `test/workbook/` 的 3 个产品测试文件。
- 删除 `e2e/`、Playwright 配置、scripts/devDependency，以及 ignored 的
  `e2e/tsconfig.tsbuildinfo`、`test-results/.last-run.json`、根 `tsconfig.tsbuildinfo` 旧产物。
- `package.json` 已是私有 app：无 exports、`sideEffects:false`、React peer；React/ReactDOM 归入
  dependencies；scripts 仅为 dev、build、typecheck、test。
- R1 已同步 `pnpm-lock.yaml` 的单一 `excel/react-excel` importer：React/ReactDOM 归入
  dependencies，`@playwright/test` 已移除；没有改动其他 importer。
- README 已改为当前产品能力、Rust-only runtime 边界、产品目录与启动/验证命令。
- 未修改 UI-core、Solid backend 或 Rust；没有 fallback，也没有 UI/功能变更。
- R2 为临时单元格编辑 input 增加坐标派生的稳定 `id`/`name`，消除 Chrome 对匿名 form field
  的 issue；未改变编辑状态、写回链或布局。
- R3 同步框架后端 E2E 证据矩阵：React adapter E2E 明确降为 2026-08-14 历史结果，移除已删除
  spec/CASES 的死链及已不存在的 typecheck/e2e 可执行命令；未伪造 archive 路径。
- R4 清除介绍站对旧 React public API 的最后消费：React 现为独立私有 Vite 产品，介绍站不再
  挂载或生成旧受控投影 demo；Vue/Solid 介绍站功能保留。
- R5 移除 ESLint 对已删 React island tsconfig 的引用；同步根双语 README、Astro recipe 与 article5
  正文/配图的当前口径，并以 AD-395 负向合同锁定旧 React 站点接线不得回归。

## 最终产品树

```text
excel/react-excel/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── src/
│   ├── main.tsx
│   ├── app/{App.tsx,app.css}
│   └── workbook/
│       ├── Workbook.tsx
│       ├── backend/{rust-backend.ts,rust-seed.ts}
│       ├── chrome/**
│       ├── data/sales-orders.ts
│       ├── editing/{use-cell-edit.ts,use-editing-session.ts}
│       ├── grid/{CellEditor.tsx,SpreadsheetGrid.tsx,WorkbookGrid.tsx,*.css}
│       ├── projection/{use-grid-window.ts,use-workbook-viewport.ts}
│       ├── runtime/{WorkbookRuntimeProvider.tsx,use-store-value.ts,use-workbook-runtime.ts}
│       └── selection/{use-grid-pointer-selection.ts,use-workbook-selection.ts}
└── test/workbook/{rust-backend.test.ts,projection.test.tsx,cell-editing.test.tsx}
```

## R4 介绍站依赖收尾

- 删除 5 个 React-only 文件：`ReactAdapterDemoIsland.tsx`、`react-adapter-demo.css`、
  `tsconfig.react-island.json` 与英中 `react-controlled-projection.md`。
- 修改站点接线：`package.json`、`astro.config.mjs`、`tsconfig.json`、`DemoPage.astro`、
  `demo-catalog.ts`、`ad395-framework-demo-contract.test.mjs`；移除 React island integration、
  catalog/route branch、raw source 与对应 contract assertions。
- 修改站点内容：英中 `docs/react.astro`、英中 `docs/getting-started.astro`、`ai-content.ts`、
  `home-content.ts`、`home-framework-content.ts`、site-smoke `CASES.md` 与 spec 注释。
- 修改关联活文档 `docs/ARCHITECTURE.md`；React 边界改为私有 Rust/WASM Vite 产品。
- `pnpm-lock.yaml` 删除 excel-site importer 的 `@einfach/react-excel`、React/ReactDOM、React types、
  `@astrojs/react`，并清理不再被其他 importer 消费的 Astro React resolution。

## 验证

- `pnpm --filter @einfach/react-excel typecheck`：通过。
- `pnpm --filter @einfach/react-excel build`：通过，373 modules；Rust worker 与 WASM 进入产物。
- `pnpm --filter @einfach/react-excel test`：3 suites、12 tests 通过。
- `pnpm exec tsc -b --pretty false`：通过。
- package source 与 `test/workbook` ESLint：通过。
- R2 重跑 package test/typecheck 与定向 CellEditor/editing test ESLint：均通过；编辑测试断言
  `r0-c0`、`r1-c1` 两个坐标分别生成合法且不同的 `id`/`name`。
- R3 `pnpm check:docs`：通过，385 份活文档零死链；证据矩阵 `wc -l` 为 64。
- R4 excel-site typecheck/build 通过，构建 40 pages 且不再生成 React demo route；AD-395 contract
  4 tests 通过；react-excel 3 suites/12 tests 通过。
- R4 excel-site docs check 与根 `pnpm check:docs` 通过（384 份活文档零死链）；定向 frozen-lockfile
  校验与根 `pnpm exec tsc -b --pretty false` 通过。excel-site 旧 island/route/config 名称及仓库活代码
  旧 React package import 均零命中。
- R5 AD-395 contract 5/5 通过；负向断言覆盖 catalog id、DemoPage island/raw-source branch、
  Astro React integration、package React dependencies 与 typecheck script。
- R5 excel-site typecheck/build、根 `pnpm lint:check`、根 `pnpm check:docs`（385 份活文档零死链）、
  定向 frozen-lockfile 与 diff check 通过；构建仍为 40 pages 且无 React demo route。
- R5 contract 131 行、5 份活文档均 ≤274 行。`rules/.eslintrc` 是存量 323 行文件，本轮只删除一行
  失效 project 引用后为 322 行，未在配置清理中扩大范围重构。
- 合同静态扫描通过：`demo/`、`e2e/`、`test-results/` 与两个指定 tsbuildinfo 均不存在；
  `src/` 根只有 `main.tsx`；旧 public surface/self-import 零命中；旧 adapter test 零残留。
- scripts 精确为 build、dev、test、typecheck；package 无 exports、禁用 sideEffects 标记或 peer。
- `pnpm install --lockfile-only --frozen-lockfile --offline --filter @einfach/react-excel`：通过；
  manifest 与 lockfile 一致，定向 lock 更新 diff 只落在 `excel/react-excel` importer。
- 剩余 source/test 普通文件全部 `wc -l` ≤300；最大为 viewport 299 行。
- `git diff --check` 与 staged diff check：通过。

## Chromium 产品验收

- 使用本机 Google Chrome 151 headless、桌面 1440×1000 与移动 390×844 真实加载当前 Vite 入口。
- 两种 viewport 均出现 `Rust/WASM ready`；桌面同时回读 `1,000 rows`、`1,000 records`，初始
  投影为 256 cells（32×8）。
- 滚至底部后点击 `data-cell="1000:7"`，selection 回读为 `H1001`。
- 连续双击编辑 `1:1` 与 `1:2`，分别写入并从 Rust 刷新投影回读
  `QA Customer One`、`QA Region Two`。
- 桌面与移动截图已人工检查，目录迁移前后的布局/视觉无非预期变化；两者 document width 均等于
  viewport width，缺 alt 图片为 0。临时证据位于 `/tmp/react-excel-002.InNIWG/`。
- 无 page error、request failure 或 HTTP ≥400 app response。控制台仅记录浏览器自动请求缺失
  `/favicon.ico` 的既有 404 噪声；产品脚本与 worker 请求无错误。

## 偏差与疑虑

- 无产品偏差。`/favicon.ico` 噪声不属于本叶允许改动的产品入口闭包，且不影响功能或外观。
