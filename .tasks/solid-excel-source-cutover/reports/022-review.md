# 022 独立审查报告

## 结论

**APPROVED**

未发现阻断或需要返修的问题。两份新测试提供了 F-012-2 精确缺失的 registry contract 与 `/?bench=1` 正向浏览器证据，足以关闭 C-005；整棵任务树仍需按 012 的要求复跑最终覆盖审计。

## Findings

1. **registry 测试不是 tautology。** `bench-registry.test.ts` 从生产 `bench/registry.ts` 调用 `listBenchScenarios()` / `getBenchScenario()`，没有 mock registry。期望数组只固定对外的 id/category/data-scale 契约；实际断言同时覆盖登记顺序、三个场景的真实元数据、真实 `run` 函数、列表对象与按 id 查询的同一性，以及未知 id 的负向行为。registry 丢场景、换顺序、改公共 id/分类/档位、元数据缺失或 lookup 脱节都会使测试失败。

2. **Jest mock 边界合理。** 唯一 mock 是 `bench/fixture`，它属于场景执行时的浏览器/worker/WASM 挂载设施，不是 registry 登记契约。`registry.ts` 与 `scenario-scroll.ts` / `scenario-recalc.ts` / `scenario-first-screen.ts` 仍真实加载，场景对象及其公共元数据也未被伪造。该隔离只避免 Jest 继续加载 `src/adapter/worker-factory.ts` 的 `import.meta.url`，不会让被测层短路。

3. **E2E 正向证明真实 benchmark 表面。** `index.html` 真实入口是 `/demo/main.tsx`；smoke 导航到 `/?bench=1`，断言 query 仍为 `bench=1`，并命中只由 `BenchRoot` / `BenchApp` 生成的基准页标题、stage、三个真实 registry id 卡片及可用运行按钮。因而它不是只证明 URL 参数或 legacy helper 会处理 `bench`。

4. **E2E 断言稳定且范围恰当。** 测试使用公开场景 id、专用 `data-testid`、部分匹配标题与控件可用性；没有执行耗时性能场景，也没有断言时间、样本数或结果数值。`guardConsoleErrors` 在导航前安装，并在页面断言后检查未许可的 console error。

5. **文件职责、行数与任务范围合规。** registry Jest 文件 45 行，只负责 registry contract；Playwright 文件 27 行，只负责 benchmark route smoke。两者均远低于 300 行上限，无空泛 helpers/common 或机械拆分。022 产出物只落在白名单的两份测试与执行报告，未见本叶对 benchmark 产品实现的修改。

## 验证与注记

- 审查中轻量复跑 `npx jest excel/solid-excel/test/bench-registry.test.ts --runInBand`：1/1 suite、2/2 tests 通过。
- 按审查约束未重复重型 E2E；022 执行报告记录指定 wasm Playwright smoke 1/1 通过，本审查已独立静态追踪其真实入口、路由、DOM 与 registry 数据链。
- 信息项：因任务文件当前是 untracked，单独的 `git diff --check` 对它们本质上不做 whitespace 检查；审查中另用 no-index check 检查两份测试与 022 报告，均无 whitespace error。这不影响验收结论。

## C-005 关闭裁决

F-012-2 要求的两个缺口已同时填补：真实 registry 有稳定公开契约测试，真实 `/?bench=1` 有正向可达且场景可运行的浏览器 smoke。**C-005 可关闭。**
