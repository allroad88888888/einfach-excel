# ADR 0014：`@einfach/excel-core-ts` 公开发布

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-100：让人装得上（发布链路）](../adoption-issues/AD-100-publish-pipeline.md)（D1 → AD-115、AD-119）

## 背景

`@einfach/solid-excel` 在 `dependencies` 里声明 `"@einfach/excel-core-ts": "workspace:*"`，
而该包是 `"private": true`、`"version": "0.0.0"`。workspace 内能解析，npm 上不存在：
外部 `npm install @einfach/solid-excel` 必然失败。

四种出路各有代价：公开发布要长期承担对外 API 承诺；随包内联会让 TS 引擎消失在
`solid-excel` 的产物里；移除会砍掉纯 JS 部署路径；做成显式可选后端仍然要先把它发布出去。

## 决策

公开发布 `@einfach/excel-core-ts`：移除 `private`，纳入首发包集合，作为
`@einfach/solid-excel` 的普通 `dependencies`（不是 optional peer）。

理由：TS 引擎同时承担两个不可替代的职责 —— 双引擎 parity 的参照系（e2e 双后端跑同一批
用例），以及不依赖 WASM 的纯 JS 部署路径。内联会让第一个职责在产物中不可寻址，移除会
让第二个职责消失。公开发布是唯一同时保住两者的形态。

同一条约束适用于 `@einfach/solid-excel` 的其余 `workspace:*` 依赖：
`@einfach/spreadsheet-ui-core` 与 `@einfach/spreadsheet-ui-styles` 也必须在首发包集合内，
否则外部安装同样断在解析阶段。本 ADR 只裁决"哪些包必须存在于 npm"，不裁决它们的产物形态。

## 后果

- `@einfach/excel-core-ts` 从"私有 parity 参照"变成对外包：版本号、破坏性变更与 issue
  都按公开包对待，不能再随手改导出面。
- AD-119 的完成判定相应变为"外部安装时该依赖可从 npm 解析"，而不是"把它移出依赖表"。
- AD-120（`workspace:*` 替换为真实版本号）覆盖全部三个内部依赖，不止 `excel-core-ts`。

## 不在范围

- 该包公开 API 面的收敛或裁剪，属于独立叶子。
- 双 worker runtime 的选择逻辑与 parity 矩阵，不因发布形态改变。
- 是否与其它包同属 changeset fixed 组，由 AD-130 裁定。
