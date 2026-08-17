# ADR 0017：首发版本为 `0.1.0`

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-100：让人装得上（发布链路）](../adoption-issues/AD-100-publish-pipeline.md)（D4 → AD-129~131）、[AD-700：承接进来的人](../adoption-issues/AD-700-community.md)（AD-712）

## 背景

`@einfach/spreadsheet-ui-core`、`@einfach/solid-excel`、`@einfach/spreadsheet-ui-styles`
当前都是 `0.1.0`，`@einfach/excel-core-ts` 是 `0.0.0`，新增的 `@einfach/excel-wasm` 还没有版本。
首发要回答：沿用 `0.1.0`，还是因为这次要改 `exports` 面与产物形态而升到 `0.2.0`。

## 决策

首发对外版本是 `0.1.0`，全部待发包对齐同一版本号出场。不升 `0.2.x`。

理由：这些包从未发布到 npm，`0.1.0` 这个号在公开 registry 上没有被占用过，也没有任何外部
使用者。把"破坏性变更"记在一个没有受众的版本上，只会让读者误以为存在过 `0.1.x` 用户群，
反而降低版本号的信息量。破坏性变更的语义从**首发之后**开始生效。

## 后果

- 待发包集合（`spreadsheet-ui-core`、`solid-excel`、`spreadsheet-ui-styles`、
  `excel-core-ts`、`excel-wasm`）首发号统一为 `0.1.0`。
- AD-131 的首条 changeset 不得把任何包推过 `0.1.0`。
- AD-134 的稳定性声明按 `0.x` 口径写：次版本号可以包含破坏性变更，消费者应锁定次版本。
- AD-712（向使用者解释多包版本协同策略）的前置条件由此满足。

## 不在范围

- `0.1.0` 之后的升级节奏与何时进入 `1.0`。
- changeset fixed 组的最终成员（AD-130）。
- 各包的 changelog 生成方式。
