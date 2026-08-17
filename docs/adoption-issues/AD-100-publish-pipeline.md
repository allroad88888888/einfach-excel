# AD-100：让人装得上（发布链路）

父节点：[对外采用与推广：Issue 树](../ADOPTION_ISSUE_TREE.md)

本组把「npm 上没有可用包」这条断路接通。它仍是发布与上手路径的硬阻塞。

## 当前状态

状态：**口径已裁决（ADR 0014~0018）；AD-101~110、AD-112~114（WASM 分发迁移，`38d7d5b`）与 AD-122、AD-123、AD-125、AD-126、AD-128 已完成并独立验收（提交号见 [Issue 树](../ADOPTION_ISSUE_TREE.md)）；AD-111 局部进展；其余叶子未开始**。

原先阻塞本组的五项决策已落成 [ADR 0014~0018](#已裁决的口径)，“该做什么”不再是未知数；
裁决本身不构成完成判定 —— 已完成的叶子各有独立验收的交付物。

- `675f991` 补充了 Solid/UI-core 的部分公开元数据（`types`、仓库链接、部分 `files`/`exports`/keywords）。其中 AD-125、AD-126、AD-128 后续已由 `20ff465` 完成并验收；AD-118、AD-127 仍未满足完整判定。它**不**满足本树 AD-101 的 WASM 新包骨架判定。
- `2fb2fe8` 给发布 CI 安装 Rust `wasm32-unknown-unknown` target 与 `wasm-pack`。它是后续构建的前置准备，但没有完成路径迁移或回归，故**不**满足本树 AD-103 或 AD-111 的完整判定。

## 已裁决的口径

原 D1~D5 已由维护者裁决，各自落成 ADR。裁决不构成任何叶子的完成判定；受影响叶子的实施进度以「叶子」一节与 Issue 树为准（D2 的 AD-101~110 已按 ADR 0015 实施并验收）。

| 原编号 | 裁决                                                                                   | 影响的叶子             |
| ------ | -------------------------------------------------------------------------------------- | ---------------------- |
| D1     | [ADR 0014](../decisions/0014-publish-excel-core-ts.md)：`@einfach/excel-core-ts` 公开发布 | AD-115、AD-119、AD-120 |
| D2     | [ADR 0015](../decisions/0015-wasm-distribution-single-package.md)：`@einfach/excel-wasm` 单包双入口，CI 预构建 | AD-101~110             |
| D3     | [ADR 0016](../decisions/0016-ci-only-npm-publish.md)：只走 CI 发布，凭据填入仓库 secret | AD-132、AD-133、AD-137 |
| D4     | [ADR 0017](../decisions/0017-initial-release-version-0-1-0.md)：首发版本 `0.1.0`        | AD-129~131             |
| D5     | [ADR 0018](../decisions/0018-node-baseline-22-12.md)：Node 基线 `>=22.12.0`             | AD-121、AD-136~141     |

## 开工前事实

1. `@einfach/solid-excel` 尚没有经离体验证的库构建产物；当前导出仍指向源码形态。
2. ~~`wasm-pkg/.gitignore` 会影响打包候选文件~~ 已解决（`38d7d5b`）：excel-wasm 的构建链
   末尾清掉 wasm-pack 生成的 `.gitignore`（`wasm:tidy`），`npm pack --dry-run` 实测两份
   `.wasm` 均进 tarball。
3. `@einfach/solid-excel` 仍声明 `workspace:*` 依赖（`@einfach/excel-core-ts`、
   `@einfach/spreadsheet-ui-core`、`@einfach/spreadsheet-ui-styles`、`@einfach/excel-wasm`）；
   在 ADR 0014 落地并替换成真实版本号之前，外部安装不能视为可用。
4. 除 `@einfach/excel-wasm`（已按 ADR 0018 写 `>=22.12.0`）外，其余包 `engines.node`
   仍是未经验证的 `>=14.18.0`，须在 AD-121 中统一改写。

## 叶子

### WASM 分发、引用与回归

- **AD-101 新包骨架** —— **完成**（`38d7d5b`）：`excel/excel-wasm/` 已建（`@einfach/excel-wasm@0.1.0`，`engines >=22.12.0`），`pnpm install` 后出现在 workspace 列表。
- **AD-102 lite 产物落位** —— **完成**（`38d7d5b`）：`--out-dir` 改指 `excel/excel-wasm/lite/`，旧 `wasm-pkg*` 路径已删除且无脚本再写入。
- **AD-103 full 产物落位** —— **完成**（`38d7d5b`）：full 落 `excel/excel-wasm/full/`，经 `./full` 入口离体消费验证。
- **AD-104 打包候选核对** —— **完成**（`38d7d5b`）：构建链 `wasm:tidy` 清掉 wasm-pack 生成的 `.gitignore`，`npm pack --dry-run` 实测列出两份 `.wasm`。
- **AD-105 exports 面** —— **完成**（`38d7d5b`）：`.` = lite、`./full` = full，各带 `types` 条目，另留 `./package.json`。
- **AD-106 strip 脚本接入** —— **完成**（`38d7d5b`）：`strip-wasm-names.mjs` 挂在 excel-wasm 构建链末尾（lite 实测 2360.6→1848.5 KB）。
- **AD-107 类型导出核对** —— **完成**（`38d7d5b`）：仓外消费者 tsc 对两入口零错（要求 `lib ["ESNext","DOM"]`，已写进包 README）。
- **AD-108 产物离体核对** —— **完成**（`38d7d5b`）：tarball 解包仅 `lite/`、`full/`、`package.json`、`README.md`，入口齐全无源码。
- **AD-109 lite 引用切换** —— **完成**（`38d7d5b`）：`worker-runtime.ts` 消费 `@einfach/excel-wasm`，e2e 真 worker 回归通过。
- **AD-110 full 引用切换** —— **完成**（`38d7d5b`）：`worker-runtime-full.ts` 消费 `@einfach/excel-wasm/full`；类型兜底迁至 `excel-wasm-full-fallback.d.ts`（通配声明，产物在场/缺席 tsc 均过）。
- **AD-111 ensureWasm 与 CI 同步** —— **局部进展**（`38d7d5b`）：根 `ensureWasm` 探测 `excel/excel-wasm/lite/`（缺失自动重建已本地实测），ci/e2e/pages 三个 workflow 已改指 `-w @einfach/excel-wasm`；完成判定等推送后 CI 首绿。
- **AD-112 构建工具路径同步** —— **完成**（`38d7d5b`）：Vite dev/build（e2e webServer 实跑）与 Astro 站（typecheck:apps 三段）经 workspace 解析新包，无需额外 alias/fs.allow。
- **AD-113 测试侧路径同步** —— **完成**（`38d7d5b`）：jest 增加 `@einfach/excel-wasm(/full)` 映射，24 个测试文件的 mock/夹具路径迁移，worker 测试回归零新增失败。
- **AD-114 e2e 回归** —— **完成**（`38d7d5b`）：新路径下 `e2e/perf-virtual/`（wasm+ts 双后端）70 过 0 挂、`e2e/smoke/` 110 过 0 挂。

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
