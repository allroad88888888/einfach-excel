# 006 执行报告：清空旧 src 的非 legacy 职责

## 结论

四态：`DONE`。

已把唯一 Vite app 入口迁到 `excel/solid-excel/demo/`，benchmark 迁到 `excel/solid-excel/bench/`，共享 i18n 实体迁到 `excel/solid-excel/src-vnext/i18n/`。默认 `/` 只提供 current demos，`/?legacy=1` 提供旧 Demo parity 导航，`/?bench=1` 仍进入 benchmark。未开始 007/008 的 legacy/src-vnext rename。

## 逐条验收

1. `npm run build -w @einfach/solid-excel`：通过。Vite 转换 1014 modules 并产出 `dist/index.html`、JS/CSS/worker/WASM assets；无路径解析错误。
2. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts e2e/demos/demo-budget.spec.ts --project=wasm`：R1 重跑通过，`26 passed (24.7s)`。原 25 条全部通过，另新增 1 条冲突路由参数回归测试。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`：通过，零输出、退出码 0。
4. demo 文件行数：全部低于 300 行：`main.tsx 11`、`LocaleSwitcher.tsx 33`、`import-toolbar.css 63`、`navigation.css 77`、`app-shell.css 85`、`App.tsx 136`、`legacy-table.css 164`。
5. `git diff --check -- excel/solid-excel`：通过，零输出。
6. R1 CSS 语法结构检查：对 `demo/*.css` 逐文件统计花括号净值，四个文件均为 0；Vite 对 1016 modules 的 production build 进一步验证 CSS 可解析。

## 覆盖矩阵证据

### C-003 默认本地 Demo

- `index.html` 唯一 module script 已切到 `/demo/main.tsx`。
- `demo/App.tsx` 的默认组只包含 canonical barrel `src-vnext/demos/index.ts` 导出的 `SpreadsheetSmokeDemo`、`SpreadsheetWorkerDemo`、`SpreadsheetTsWorkerDemo`、`SpreadsheetWorkbenchDemo`，以及现役 remote backend demo；legacy tabs 不在默认组。
- wasm smoke 的 “app boots directly into the Wave 5 demo by default” 通过。

### C-004 legacy parity Demo

- `demo/App.tsx` 仅在 `legacy=1` 时选择四组既有 legacy demos，保留原 tab id、i18n label key 和组件名称。
- `e2e/helpers.ts::gotoDemo` 使用 `URLSearchParams` 规范合并：强制 `set('legacy', '1')`、删除冲突 `bench`，再交给既有 locale/backend 合并逻辑。
- `withEnglishLocale` 与 `gotoRoot` 未追加 legacy 参数，因此 current helper 语义保持 current。
- Budget legacy suite 7/7 通过；新增用例从 `legacy=0&bench=1&locale=en&backend=wasm` 启动，断言最终 `legacy=1`、无 `bench`，且 locale/backend 保持正确。

### C-005 公共性能基准

- 原 `src/bench/**` 已整体迁到 `bench/**`，`src/bench` 不存在。
- `demo/main.tsx` 仍以 `bench=1` 选择 `bench/BenchRoot.tsx`；BenchRoot 保留 embed 分支。
- `bench/registry.ts` 仍登记 `scrollScenario`、`recalcScenario`、`firstScreenScenario`，registry/types 未改语义。
- Vite production build 已解析并打包该入口。仓内未发现独立 benchmark registry test，因此没有可追加的专门测试命令。

### C-009 demos 与 i18n 子路径

- app 直接消费任务 005 的 canonical `src-vnext/demos` barrel，不再从宽泛 root barrel 获取 canonical demo 名称。
- i18n 实体及 `locales/{en,zh}.ts` 已迁到 `src-vnext/i18n/`；所有现役 `src-vnext` 组件改为从 `../i18n` 消费。
- `src/i18n/index.ts` 仅保留一行兼容 re-export，供尚待任务 009 切换的 package export 和存量测试使用；没有保留 catalog 或状态实现。

### C-013 双后端浏览器路径

- 指定 wasm current + legacy E2E 共 26/26 通过（原 25 条回归全绿，加 1 条 helper 冲突参数测试）。
- `backendQueryFromProject`、`withEnglishLocale`、`gotoRoot` 的 backend 合并逻辑保持不变；`gotoDemo` 只额外加入 legacy flag。
- 本叶验收只要求 `--project=wasm`，未执行 TS backend；TS backend 路径由 helper 静态保持，列入未验证项。

## 文件职责与迁移说明

- `demo/App.tsx`：只负责 current/legacy Demo 导航壳。
- `demo/main.tsx`：只负责 `bench=1` 与 app 的顶层选择。
- `demo/LocaleSwitcher.tsx`：只负责语言切换控件。
- `demo/app-shell.css`：只负责页面、header（含 subtitle）与 Demo 内容壳。
- `demo/navigation.css`：只负责 locale/tab 导航（含 group separator）。
- `demo/import-toolbar.css`：只负责 import toolbar、file input、cancel、status/error 的完整状态样式。
- `demo/legacy-table.css`：只负责旧表格 DOM 样式。
- `bench/**`：保持原场景、registry、types 和执行职责边界，仅修正迁移后的相对路径。
- `src-vnext/i18n/**`：共享 locale store、翻译函数与 catalog 的唯一实体。
- `src/App.tsx`：两行 legacy demos barrel 兼容桥，等待 007 搬迁该 barrel；不再承载 app 壳。

## 未验证

- 未运行 `--project=ts` E2E；任务验收命令只指定 wasm。
- 未运行全量 Jest/package-entry contract；C-009 的公开 exports 最终切换属于任务 009。
- 未对 benchmark 执行长耗时性能采样；本仓未发现 registry 专门测试。

## 发现与疑虑

- Build/E2E 均重复输出既有 `@jsxImportSource solid-js` / automatic transform 警告，但构建成功、E2E 全绿；本叶未修改 JSX 工具链。
- Rust WASM build 输出既有 unused variable/dead code 警告；不在本叶范围。
- Vite 输出大 chunk 警告（主 JS 约 2.29 MB）；不影响本叶路径迁移验收。
- 为遵守任务边界，没有修改不在 files 内的 `src/demos/index.ts`、测试 imports 或 `package.json`。因此 `src/App.tsx` 与 `src/i18n/index.ts` 暂留极薄兼容桥；007/009 应分别移除它们。它们不包含 app/i18n 实现职责。
- 工作树已有 001/003/004/005/013–019 的未提交改动；本次保留且未回退。范围外的 `test/vnext-menu-bar.test.tsx` 等既有变更未触碰。

## R1 审查修复

- 修复 `app-shell.css` 未闭合 `.app-title` 与 `navigation.css` 孤立 `}`；各 CSS 文件现在独立语法完整。
- 将 `.app-subtitle` 归回 app shell，将 `.nav-group-sep` 归回 navigation。
- 新建单一职责 `import-toolbar.css`，完整收拢 toolbar/disabled/cancel/status/error 规则；`legacy-table.css` 只从 Excel table 规则开始，不再跨职责。
- `gotoDemo` 不再字符串拼接，caller 的 `legacy=0` 会被覆盖，`bench=1` 会被删除，避免 benchmark 顶层路由抢占 legacy demo。

## 范围确认

- 产品改动仅位于任务声明的 `files` 范围。
- 未派子 agent，未 commit，未修改任务状态/index。
