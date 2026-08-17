# 决策记录（ADR）

每份 ADR 记录**一次技术裁决及其理由**。格式沿用 Nygard 的 ADR 惯例。

规则：

1. 文件名 `NNNN-kebab-case-title.md`，编号只增不复用。
2. **状态为 `accepted` 后不再修改内容。** 结论变了就写一份新 ADR，并把旧的状态改成
   `superseded by ADR-NNNN`（这是唯一允许的事后编辑）。
3. ADR 记的是「为什么」，不是「怎么用」。用法属于契约文档，放在贴码的 README 里。
4. 值得写 ADR 的：会约束后续所有人的选择、或者「看起来该那样做但我们刻意没那样做」的地方。

| #                                                         | 标题                                             | 状态     |
| --------------------------------------------------------- | ------------------------------------------------ | -------- |
| [0001](0001-solid-js-single-instance.md)                  | 进程内只允许一份 solid-js                        | accepted |
| [0002](0002-upstream-core-via-npm.md)                     | 上游 `@einfach/core` 走 npm，不做 workspace 依赖 | accepted |
| [0003](0003-engine-owns-filter-sort.md)                   | 影响计算的状态归引擎：隐藏行与筛选可见性下沉     | accepted |
| [0004](0004-worker-factory-out-of-barrel.md)              | worker 工厂不进 vnext barrel，走独立子路径导出   | accepted |
| [0005](0005-e2e-feature-folders.md)                       | e2e 按功能点分目录，每目录一份 CASES.md          | accepted |
| [0006](0006-spill-region-write-semantics.md)              | 溢出区的写入语义以 Excel 为准                    | accepted |
| [0007](0007-astro-static-site-with-solid-wasm-islands.md) | 文档站采用 Astro 静态壳与 Solid/WASM islands     | accepted |
| [0008](0008-public-performance-evidence-scope.md)         | 公共性能证据范围                                 | accepted |
| [0009](0009-public-performance-measurement-methodology.md) | 公共性能测量方法                                | accepted |
| [0010](0010-public-performance-non-guarantees.md)         | 公共性能表述的非承诺边界                         | accepted |
| [0011](0011-public-performance-environment-record.md)     | 公共性能环境记录                                 | accepted |
| [0012](0012-ui-core-extraction-target.md)                 | UI-core 下沉目标                                 | accepted |
| [0013](0013-community-conduct-scope.md)                   | 社区行为准则的采用边界                           | accepted |
| [0014](0014-publish-excel-core-ts.md)                     | `@einfach/excel-core-ts` 公开发布                | accepted |
| [0015](0015-wasm-distribution-single-package.md)          | WASM 以单包双入口分发，产物由 CI 预构建          | accepted |
| [0016](0016-ci-only-npm-publish.md)                       | 发布只走 CI，凭据由维护者填入仓库 secret         | accepted |
| [0017](0017-initial-release-version-0-1-0.md)             | 首发版本为 `0.1.0`                               | accepted |
| [0018](0018-node-baseline-22-12.md)                       | 对外 Node.js 基线为 `>=22.12.0`                  | accepted |
| [0019](0019-solid-excel-dual-form-artifacts.md)           | `@einfach/solid-excel` 以双形态交付              | accepted |
