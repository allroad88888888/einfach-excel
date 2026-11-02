# 发布流程

当前公开发布（`private: false`）的包分为两组（见 [`.changeset/config.json`](../.changeset/config.json)）：

1. **Changeset `fixed` 同步版本组（当前 `0.2.0`）**：
   - `@einfach-excel/spreadsheet-ui-core`
   - `@einfach-excel/spreadsheet-ui-styles`
   - `@einfach-excel/excel-core-ts`
   - `@einfach-excel/excel-wasm`
2. **独立版本公开包（当前 `0.1.0`）**：
   - `@einfach-excel/react-excel`（见 [React 组件包发布检查单](../excel/react-excel/docs/package/release.md)）
   - `@einfach-excel/canvas`

其余工作区包为 `private: true`，不发布到 npm：
- 已暂停的历史包：`@einfach-excel/solid-excel`、`@einfach-excel/excel-site`
- 独立实验包：`@einfach-excel/vue-excel`
- 仓内组合/按需包：`@einfach-excel/xlsx`、`@einfach-excel/react-cells`、`@einfach-excel/canvas-cells`、`@einfach-excel/canvas-demo`

## 谁能发

发布只走 CI（[ADR 0016](decisions/0016-ci-only-npm-publish.md)），**不接受本地
`npm publish`**。发布权限等价于「能配置仓库 secret 并触发 `Publish` workflow」——
即仓库 admin。npm 侧需要 `@einfach-excel` scope 的发布权。

## 凭据

- npm token 存放在仓库 secret `NPM_TOKEN`，由维护者手动填入
  （Settings → Secrets and variables → Actions）。
- CI 只在 publish job 读取它；日志不回显。
- 轮换：npm 侧吊销旧 token → 生成新 token → 更新 secret，全程不进 git。
  怀疑泄漏时先吊销再排查。

## 怎么发

1. 日常变更随 PR 附 changeset（`npx changeset`）。
2. `changesets/action` 在 `main` 上聚合出 Release PR；合并该 PR 即触发发布。
3. CI 发布构建执行 `pnpm run build:publish`（编译 Rust WASM `lite`/`full`、`xlsx` WASM、UI Core、Rollup 产物以及 `@einfach-excel/react-excel` 的 `build:lib`）。
4. 发布命令是 `pnpm run release:publish`（`pnpm publish -r --access public --no-git-checks && pnpm changeset tag`）。
   **必须走 pnpm 路径**：只有 pnpm 在打包时把 `workspace:*` 重写为真实版本号，
   `npm pack/publish` 会原样保留、产物不可安装（历史实测见已归档的
   [dry-run 观察记录](archive/AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md)）。

## 历史首发记录

最早的 `0.1.0` 首发（[ADR 0017](decisions/0017-initial-release-version-0-1-0.md)）
已于 **2026-08-17** 经 `Publish` workflow 完成。此后 `solid-excel` 已暂停并转为私有，
`@einfach-excel/react-excel` 与 `@einfach-excel/canvas` 作为主线公开包加入发布矩阵，
版本流转全部走常规 changesets 流。`first-publish` 档保留仅作应急
（如某包被撤后按当前版本重发）；日常发布**不要**用它。

## 发布前自检

- `npm run build:publish` 绿（含 `@einfach-excel/excel-wasm` 的 `lite`/`full` 产物与 `@einfach-excel/react-excel` 库构建）。
- React 组件包消费者冒烟：见 [`excel/react-excel/docs/package/release.md`](../excel/react-excel/docs/package/release.md)（`pnpm --filter @einfach-excel/react-excel package:prepare` + Vite/Next.js E2E 门禁）。
- 想在真发布前用本地 registry 彩排：可参考已归档的 [dry-run 观察记录](archive/AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md) 起 verdaccio 验证安装链路。
- Node 基线：消费包兼容基线为 `>=22.12.0`（[ADR 0018](decisions/0018-node-baseline-22-12.md)）；仓库 CI 构建与发布运行在 `22.19.0`。
