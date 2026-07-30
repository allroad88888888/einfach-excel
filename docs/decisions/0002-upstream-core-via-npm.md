# ADR 0002：上游 `@einfach/core` 走 npm，不做 workspace 依赖

<!-- doc-check: allow-stale-paths -->

- 状态：accepted
- 日期：2026-07-29（`66e0782` 独立成仓）
- 相关：[ADR 0001](0001-solid-js-single-instance.md)

## 背景

表格栈原先与 atom 引擎（`@einfach/core`、`@einfach/solid` 等）同处 einfach 主仓，互为 workspace
依赖。2026-07-29 表格栈拆成独立仓（`einfach-excel`）后，需要决定怎么消费上游引擎。

两个选项：

1. git submodule / workspace link —— 保持「改 core 立刻在表格栈生效」的开发体验。
2. 从 npm 安装已发布版本。

## 决策

**从 npm 安装。** 并且 jest 不再对 `@einfach/*` 做 `moduleNameMapper` 映射，走正常 node_modules 解析。

## 理由

表格栈必须能跑在**已发布**的 core 上，而不是某个只存在于某人工作区的版本。走 workspace link 时，
「core 的未发布改动」和「表格栈的改动」会混在同一次验证里，导致两类问题：发布后才暴露的
不兼容，以及无法回答「当前代码在哪个 core 版本上通过过测试」。

npm 路径让这个问题变成编译期可见的：版本号写在 `package.json` 里，lockfile 钉死解析结果。

## 后果

- 当前基线是 `@einfach/core@^0.4.0` + `@einfach/solid@^0.4.0`（实际版本查
  `grep '"@einfach/\(core\|solid\)"' excel/*/package.json`）。
- 需要改 core 时的流程变长了：在主仓改 → 发版 → 本仓抬版本号。这是刻意付出的成本。
- 本仓的文档**不应**再引用 `core/core/src/*` 这类路径 —— 那些源码不在本仓。要讲 core 的内部实现，
  链到主仓。
- 原仓仍留有一份 `excel/` 的历史副本，冻结在拆分时点，**不是**本仓的镜像。不要在那边改表格栈代码。
- 拆分口径的完整计划留在**主仓**的 `docs/REPO_SPLIT_PLAN_2026-07-28.md`，本仓不留副本以免两处漂移。
  该计划的 P5「原仓收口」尚未执行。
