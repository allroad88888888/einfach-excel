# ADR 0016：发布只走 CI，凭据由维护者填入仓库 secret

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-100：让人装得上（发布链路）](../adoption-issues/AD-100-publish-pipeline.md)（D3 → AD-132、AD-133、AD-137）

## 背景

`.changeset/config.json` 已写明 `"access": "public"`，发布意图是公开的，但发布身份是空的：
没有确定 npm 账号/组织归属，没有确定 CI 用什么凭据，也没有确定凭据存放位置。
在此之前发布 workflow 无法恢复。

## 决策

发布由 CI workflow 执行，这是**唯一**的发布路径；不接受从维护者本地机器执行 `npm publish`。

npm token 由维护者手动填入仓库的 CI secret，CI 在发布 job 中只读该 secret。本 ADR 不记录
token 值，也不固定 secret 的具体名称 —— 那属于 AD-133 的发布流程文档。

发布权限因此等价于"对仓库 secret 与发布 workflow 有写权限"，不再是"谁本地登录过 npm"。

## 后果

- AD-132 的完成判定是 workflow 在 secret 就位后能真实跑通，而不是 workflow 文件语法正确。
- AD-137 的全链路 dry-run 走本地 registry（verdaccio 或等价方案），不消耗真实 token，
  也不会在 npm 上留下部分发布。
- 本地构建产物永远不会成为发布物，这与 [ADR 0015](0015-wasm-distribution-single-package.md)
  要求 WASM 由 CI 预构建是同一条约束的两面。
- 凭据轮换、吊销与泄漏响应都落在维护者手上，需在 AD-133 中写明。

## 不在范围

- 迁移到 npm trusted publishing / OIDC 免 token 发布。它能消除长期 token 的保管问题，
  但需要另一份 ADR 裁决，且不阻塞首发。
- 具体 CI 平台的 job 编排与触发条件（AD-132）。
- 谁有权成为维护者。
