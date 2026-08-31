# 022 执行报告：补齐 benchmark 表面覆盖

四态：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NONE`。

## 实现

- 新增 `excel/solid-excel/test/bench-registry.test.ts`：验证三条公开场景的稳定 `id`、`category`、`dataScaleId`，登记元数据完整，所有列表项均可按 id 取回，未知 id 返回 `undefined`。测试不执行场景，也不复制采样或性能实现。
- registry 单测只 mock 浏览器专属的 `bench/fixture`，规避 Jest 无法加载 worker factory 的 `import.meta.url`；registry 与三个场景模块及其公开元数据均使用真实实现。
- 新增 `excel/solid-excel/e2e/bench/bench-smoke.spec.ts`：正向打开 `/?bench=1`，断言 benchmark 标题、无缺失场景提示、stage 已挂载、三张真实登记卡片及其可用运行按钮，并检查无 console error。未运行性能场景，未断言耗时或结果数值。

## 六项验收与完整结果

1. `npx jest excel/solid-excel/test/bench-registry.test.ts --runInBand`
   - exit 0；`1 passed` suite，`2 passed` tests，0 snapshots；耗时 0.789s。
2. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/bench/bench-smoke.spec.ts --project=wasm`
   - exit 0；wasm project `1 passed (4.5s)`，测试本体 935ms。
   - web server 构建成功；输出包含既有 Rust unused/dead-code、npm unknown env config、`NO_COLOR` 与 Vite JSX transform warnings，无浏览器 console error，不影响退出码或断言。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`
   - exit 0；无 stdout，零诊断。
4. `npm run lint:check`
   - exit 0；执行根脚本 `npx eslint --config rules/.eslintrc --ext=.ts,.tsx --ignore-path ./rules/.eslintignore excel/*/src excel/*/test`，零 ESLint error。
5. `wc -l excel/solid-excel/test/bench-registry.test.ts excel/solid-excel/e2e/bench/bench-smoke.spec.ts`
   - exit 0；registry test 45 行，Playwright spec 27 行，总计 72 行；均不超过 300 行且各自只负责一个测试层。
6. `git diff --check`
   - exit 0；无 stdout，零 whitespace error。

## 过程中的非产品失败

- registry Jest 首次执行 exit 1：真实场景依赖链加载 `src/adapter/worker-factory.ts`，Jest 报 `SyntaxError: Cannot use 'import.meta' outside a module`，0 tests executed。
- 修正仅落在目标单测：mock 不属于 registry 契约层的 `bench/fixture`，未 mock registry 或场景模块；同一验收命令随后 2/2 全绿。产品实现未改。

## 范围与风险

- 仅新增任务白名单内的两份测试与本报告；未修改 benchmark 产品实现、任务定义或 index，未 commit、未派生 agent。
- E2E 信号来自现有真实 benchmark DOM 与公开场景 id；没有时间、性能值、样本数或动态结果断言。
- C-005 现在同时具备 registry contract 与 `/?bench=1` 正向路由证据；未发现新的阻断风险。

四态回执：实现 `DONE`，验证 `DONE`，范围 `DONE`，风险 `NONE`；六项验收全部通过。
