# AD-514：WASM 瘦身可行性评估

父节点：[AD-500：可验证的性能证据](adoption-issues/AD-500-performance.md)。

## 结论

当前构建链已经支持两条可评估的 WASM 瘦身路径：为交付物保留 custom-section
strip，以及在功能允许时由宿主选择 lite 变体。这是对已有构建分支的可行性判断，
不产生体积结果、性能结论或交付承诺。

## 已有构建边界

[`@einfach/solid-excel` 的构建脚本](../excel/solid-excel/package.json)把 lite 和
full 分为独立路径：`build:wasm` 生成 lite，`build:wasm:full` 生成带
`regex-formulas` feature 的 full；两条交付路径都会在保留名称的构建之后执行各自的
strip 脚本。`build:wasm:both` 只是顺序执行这两条路径。

full 入口静态导入 `wasm-pkg-full/`，且只有显式选择该入口的宿主才会拉入 full
变体，见 [`runtime-full.ts`](../excel/spreadsheet-ui-core/src/rust-worker/runtime-full.ts)。
因此，变体选择是宿主入口的构建图选择，而不是可在同一运行时无代价切换的选项。

## 可行路径

| 路径               | 现有脚本支持                                                  | 采用前提                                                            | 主要风险                                                                                       |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 交付 stripped 产物 | lite 与 full 的标准构建都会在生成后调用对应 strip 脚本。      | 目标必须是交付构建，而非需要可读符号信息的调试构建。                | 去除调试用 custom section 会降低故障定位时可获得的符号信息；调试流程必须保留带名称的构建入口。 |
| 选择 lite 变体     | `build:wasm` 不启用 `regex-formulas`，full 是独立的显式构建。 | 宿主的公式需求经功能验收，确认不需要 full 变体提供的 REGEX\* 内建。 | 变体会改变公式能力；错误地把需要 full 的宿主改接 lite 会产生功能回归。                         |

这两项的共同前提是先明确某个候选交付入口实际导入哪一个 worker 运行时，并在
该入口上验证构建产物可加载、所需公式行为仍成立。验证应当固定源码修订和构建输入；
在没有独立的产物口径与记录之前，不得由此推导可比较的大小结论。

## 不可由本评估推出的事项

- 不把 `build:wasm:both` 是否执行、生成目录是否保留，表述为某个对外产物已经变小；
  分发形态仍受 AD-100 的决策约束。
- 不将 wasm-opt、依赖删减、代码重写、拆包或压缩策略列为已支持方案；当前脚本没有
  为它们提供这里可直接采用的交付路径。
- 不规定 raw、gzip 或其他体积披露的定义、命令或结果；该边界属于 AD-511。
- 不修改构建脚本、worker 入口、WASM 产物、CI 或发布配置，也不承诺后续发布。

## 证据与表述边界

本文件不是基准、优化实现或公开性能材料。任何未来对外体积结果都仍需遵循
[ADR 0008](decisions/0008-public-performance-evidence-scope.md)、
[ADR 0009](decisions/0009-public-performance-measurement-methodology.md)、
[ADR 0010](decisions/0010-public-performance-non-guarantees.md) 与
[ADR 0011](decisions/0011-public-performance-environment-record.md)：在可检查的实现、
测量口径、环境记录和复跑材料齐备前，只能说明存在待验证的构建路径，不能暗示
取得了公共性能证据或产品保证。
