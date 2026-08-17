# 发布流程

对外发布的包共五个（changeset fixed 组，版本永远同升）：
`@einfach/spreadsheet-ui-core`、`@einfach/spreadsheet-ui-styles`、
`@einfach/excel-core-ts`、`@einfach/excel-wasm`、`@einfach/solid-excel`。
其余包（site、react-excel、vue-excel）为 `private`，不发布。

## 谁能发

发布只走 CI（[ADR 0016](decisions/0016-ci-only-npm-publish.md)），**不接受本地
`npm publish`**。发布权限等价于「能配置仓库 secret 并触发 `Publish` workflow」——
即仓库 admin。npm 侧需要 `@einfach` scope 的发布权。

## 凭据

- npm token 存放在仓库 secret `NPM_TOKEN`，由维护者手动填入
  （Settings → Secrets and variables → Actions）。
- CI 只在 publish job 读取它；日志不回显。
- 轮换：npm 侧吊销旧 token → 生成新 token → 更新 secret，全程不进 git。
  怀疑泄漏时先吊销再排查。

## 怎么发

1. 日常变更随 PR 附 changeset（`npx changeset`）。
2. changesets/action 在 main 上聚合出 Release PR；合并该 PR 即触发发布。
   在 push 触发恢复前（见 `publish.yml` 头注），发布 = 手动跑 `Publish` workflow
   （Actions → Publish → Run workflow）。
3. 发布命令是 `pnpm run release:publish`（`pnpm publish -r` + `changeset tag`）。
   **必须走 pnpm 路径**：只有 pnpm 在打包时把 `workspace:*` 重写为真实版本号，
   `npm pack/publish` 会原样保留、产物不可安装（实测见
   [dry-run 观察记录](AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md)）。

## 首发的特殊约束（ADR 0017）

首发必须以 **`0.1.0`** 出场：

- 首发**不需要也不允许**先跑 `changeset version` —— 五包当前版本就是 0.1.0，
  `pnpm publish -r` 直接发布现版本。
- 仓内若有在途 changeset（会把 fixed 组推过 0.1.0），必须**先发布 0.1.0 再合并
  Release PR**；顺序颠倒即违反 ADR 0017，需要维护者以新 ADR 裁决。

## 发布前自检

- `npm run build` 绿（含 WASM lite）；full 变体：`npm run build:wasm:full -w @einfach/excel-wasm`。
- 想在真发布前彩排：按 [dry-run 观察记录](AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md)
  的步骤起 verdaccio 走一遍全链路。
- Node 基线：发布环境钉在 `22.12.0`（[ADR 0018](decisions/0018-node-baseline-22-12.md)）。
