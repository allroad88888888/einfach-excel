# AD-100：让人装得上（发布链路）

父节点：[对外采用与推广：Issue 树](../ADOPTION_ISSUE_TREE.md)

本组把「npm 上没有可用包」这条断路接通。它仍是发布与上手路径的硬阻塞。

## 当前状态

状态：**口径已裁决（ADR 0014~0018）；AD-122、AD-123、AD-125、AD-126、AD-128 已完成并独立验收（提交号见 [Issue 树](../ADOPTION_ISSUE_TREE.md)）；其余叶子未开始**。

原先阻塞本组的五项决策已落成 [ADR 0014~0018](#已裁决的口径)，“该做什么”不再是未知数；
裁决本身不构成完成判定 —— 已完成的叶子各有独立验收的交付物。

- `675f991` 补充了 Solid/UI-core 的部分公开元数据（`types`、仓库链接、部分 `files`/`exports`/keywords）。其中 AD-125、AD-126、AD-128 后续已由 `20ff465` 完成并验收；AD-118、AD-127 仍未满足完整判定。它**不**满足本树 AD-101 的 WASM 新包骨架判定。
- `2fb2fe8` 给发布 CI 安装 Rust `wasm32-unknown-unknown` target 与 `wasm-pack`。它是后续构建的前置准备，但没有完成路径迁移或回归，故**不**满足本树 AD-103 或 AD-111 的完整判定。

## 已裁决的口径

原 D1~D5 已由维护者裁决，各自落成 ADR。裁决不构成任何叶子的完成判定；下表受影响的叶子截至本次更新仍未开始。

| 原编号 | 裁决                                                                                   | 影响的叶子             |
| ------ | -------------------------------------------------------------------------------------- | ---------------------- |
| D1     | [ADR 0014](../decisions/0014-publish-excel-core-ts.md)：`@einfach/excel-core-ts` 公开发布 | AD-115、AD-119、AD-120 |
| D2     | [ADR 0015](../decisions/0015-wasm-distribution-single-package.md)：`@einfach/excel-wasm` 单包双入口，CI 预构建 | AD-101~110             |
| D3     | [ADR 0016](../decisions/0016-ci-only-npm-publish.md)：只走 CI 发布，凭据填入仓库 secret | AD-132、AD-133、AD-137 |
| D4     | [ADR 0017](../decisions/0017-initial-release-version-0-1-0.md)：首发版本 `0.1.0`        | AD-129~131             |
| D5     | [ADR 0018](../decisions/0018-node-baseline-22-12.md)：Node 基线 `>=22.12.0`             | AD-121、AD-136~141     |

## 开工前事实

1. `@einfach/solid-excel` 尚没有经离体验证的库构建产物；当前导出仍指向源码形态。
2. `wasm-pkg/.gitignore` 会影响打包候选文件；必须用实际 `npm pack --dry-run` 验证，而不是假定产物会进 tarball。
3. `@einfach/solid-excel` 仍声明 `workspace:*` 依赖（`@einfach/excel-core-ts`、
   `@einfach/spreadsheet-ui-core`、`@einfach/spreadsheet-ui-styles`）；在 ADR 0014 落地并
   替换成真实版本号之前，外部安装不能视为可用。
4. 各包 `engines.node` 当前仍是未经验证的 `>=14.18.0`，与 ADR 0018 的 `>=22.12.0` 不一致，
   须在 AD-121 中统一改写。

## 叶子

### WASM 分发、引用与回归

- **AD-101 新包骨架** —— 按 [ADR 0015](../decisions/0015-wasm-distribution-single-package.md) 建 `excel/excel-wasm/`（包名 `@einfach/excel-wasm`），写 package.json 与 README 占位，确认被 `excel/*` workspace glob 纳入。完成判定：`pnpm install` 后该包出现在 workspace 列表。
- **AD-102 lite 产物落位** —— `build:wasm` 的 `--out-dir` 改指 `@einfach/excel-wasm` 的默认入口目录；验证旧路径不再生成。
- **AD-103 full 产物落位** —— `build:wasm:full` 落到同包的 `./full` 入口目录，并能被独立消费。
- **AD-104 打包候选核对** —— 处理 wasm-pack 生成的 gitignore 与 npm 打包的冲突；完成判定：`npm pack --dry-run` 列出 `.wasm`。
- **AD-105 exports 面** —— 按单包双入口写出可消费导出：`.` 为 lite、`./full` 为 full，各自带类型入口。
- **AD-106 strip 脚本接入** —— `strip-wasm-names.mjs` 调用路径随构建链迁移。
- **AD-107 类型导出核对** —— `einfach_wasm.d.ts` 能被消费者 tsc 解析，无悬空引用。
- **AD-108 产物离体核对** —— 解包后文件齐全且无多余源码。
- **AD-109 lite 引用切换** —— `worker-runtime.ts` 改为消费 `@einfach/excel-wasm`。
- **AD-110 full 引用切换** —— `worker-runtime-full.ts` 改为消费 `@einfach/excel-wasm/full`。
- **AD-111 ensureWasm 与 CI 同步** —— 探测和缓存路径随迁移，并验证 CI 使用它们。
- **AD-112 构建工具路径同步** —— Vite/Astro 别名与 `fs.allow` 随迁移。
- **AD-113 测试侧路径同步** —— mock/映射随迁移，并回归 worker 测试。
- **AD-114 e2e 回归** —— 新路径下回归 worker 后端相关用例。

### `@einfach/solid-excel` 可发布性

- **AD-115 Solid 产物形态裁决** —— 在 `solid` 条件源码、编译产物或双形态之间裁决，明确消费者编译责任。
- **AD-116 构建管线接入** —— 按 AD-115 的裁决接入构建，并更新失效注释。
- **AD-117 exports 重写** —— 重排子路径导出，保留 `vnext-worker-factory` 不进 barrel 的约束。
- **AD-118 `files` 字段** —— 收敛为可验证的发布白名单；`npm pack --dry-run` 不得含 e2e、test、demo 源码。
- **AD-119 内部依赖可解析** —— 按 [ADR 0014](../decisions/0014-publish-excel-core-ts.md) 公开发布 `@einfach/excel-core-ts`（移除 `private`），使外部安装能解析该依赖。
- **AD-120 workspace 协议替换验证** —— 打包时三个 `workspace:*` 依赖全部变为真实、可安装的版本号。
- **AD-121 依赖边界与运行环境口径** —— 为 `solid-js`、`@einfach/core`、`@einfach/solid` 定 peer 边界与版本范围；同时按 [ADR 0018](../decisions/0018-node-baseline-22-12.md) 把各包 `engines.node` 统一改写为 `>=22.12.0`。
- **AD-122 sideEffects 与 CSS 导出核对** —— **完成**：`vnext-styles.css` 在 tree-shaking 下可被引入（`da50614`）。
- **AD-123 单实例风险表达** —— **完成**：ADR 0001 的不变式已进入消费者文档（`5d97a76`）。
- **AD-124 产物离体核对** —— 解包验证 ESM/CJS 入口与 `.d.ts`。

### UI core 元数据

- **AD-125 仓库指向修正** —— **完成**：`repository`、`homepage`、`bugs` 指向当前仓库（`20ff465`）。
- **AD-126 exports 字段补齐** —— **完成**：现代 `exports` 已声明（`20ff465`）。
- **AD-127 keywords 补齐** —— 与 AD-405 的 topics 使用同一批词。
- **AD-128 ui-core 产物离体核对** —— **完成**：ui-core 产物已经解包核对（`20ff465`）。

### 版本、发布与离体验证

- **AD-129 版本策略落地** —— 按 [ADR 0017](../decisions/0017-initial-release-version-0-1-0.md) 把全部待发包对齐 `0.1.0`；`@einfach/excel-core-ts` 需从 `0.0.0` 提上来。
- **AD-130 fixed 组配置** —— 按发布包集合配置 changeset fixed 组（现只含 ui-core 与 solid-excel，需覆盖新增的 excel-wasm、excel-core-ts、ui-styles），并验证一次联动。
- **AD-131 首发 changeset** —— 覆盖全部待发包，且不得把任何包推过 `0.1.0`。
- **AD-132 发布 workflow** —— 按 [ADR 0016](../decisions/0016-ci-only-npm-publish.md) 恢复触发，从仓库 secret 读取 npm token，并在 publish 前跑完 WASM 构建。
- **AD-133 发布流程文档化** —— 写明谁能发、怎么发、secret 如何配置与轮换。
- **AD-134 稳定性声明** —— README 准确说明所选版本阶段的兼容性预期。
- **AD-135 首条 release notes** —— 说明成熟度、已知边界与非目标。
- **AD-136 本地 registry** —— 起 verdaccio 或等价方案。
- **AD-137 全链路 dry-run** —— 所有待发包经本地 registry 验证，不留下部分发布。
- **AD-138 / AD-139 / AD-140 / AD-141** —— Vite、webpack、Next、Nuxt 的仓外安装冒烟，在 Node `22.12.0` 基线下界上执行（只在更高版本跑通不算数）。
- **AD-142 失败路径可读性走查** —— 验证缺 WASM、worker 失败、重复 solid-js 时的错误指向明确解法。
