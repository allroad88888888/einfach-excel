# AD-100：让人装得上（发布链路）

父节点：[对外采用与推广：Issue 树](../ADOPTION_ISSUE_TREE.md)

本组把「npm 上没有可用包」这条断路接通。它仍是发布与上手路径的硬阻塞。

## 当前状态

状态：**有局部进展，未完成任何本组叶子的原完成判定**。

- `675f991` 补充了 Solid/UI-core 的部分公开元数据（`types`、仓库链接、部分 `files`/`exports`/keywords）。这对 AD-118、AD-125~127 有帮助，但未做 tarball 验证，且未满足它们的完整判定；它**不**满足本树 AD-101 的 WASM 新包骨架判定。
- `2fb2fe8` 给发布 CI 安装 Rust `wasm32-unknown-unknown` target 与 `wasm-pack`。它是后续构建的前置准备，但没有完成路径迁移或回归，故**不**满足本树 AD-103 或 AD-111 的完整判定。

## 阻塞决策

这些必须由维护者选择，不能把其中一个方案当作既定事实：

| 决策 | 影响的叶子             | 需要确认的内容                                                    |
| ---- | ---------------------- | ----------------------------------------------------------------- |
| D1   | AD-115、AD-119         | `@einfach/excel-core-ts` 对外策略：公开、内联、移除或显式可选后端 |
| D2   | AD-101~110             | WASM 的分发形态与支持承诺                                         |
| D3   | AD-132、AD-133、AD-137 | npm 身份、权限与 token 保管方式                                   |
| D4   | AD-129~131、AD-130     | 版本策略，含是否批准 `0.1.x` → `0.2.x`                            |
| D5   | AD-121、AD-136~141     | 对外支持的 Node.js 基线                                           |

## 开工前事实

1. `@einfach/solid-excel` 尚没有经离体验证的库构建产物；当前导出仍指向源码形态。
2. `wasm-pkg/.gitignore` 会影响打包候选文件；必须用实际 `npm pack --dry-run` 验证，而不是假定产物会进 tarball。
3. `@einfach/solid-excel` 仍声明私有 workspace 依赖；在明确的发布策略落地前，外部安装不能视为可用。

## 叶子

### WASM 分发、引用与回归

- **AD-101 新包骨架** —— 建 `excel/excel-wasm/`，写 package.json 与 README 占位，确认被 `excel/*` workspace glob 纳入。完成判定：`pnpm install` 后该包出现在 workspace 列表。
- **AD-102 lite 产物落位** —— `build:wasm` 的 `--out-dir` 改指已裁决的交付位置；验证旧路径不再生成。
- **AD-103 full 产物落位** —— `build:wasm:full` 与 lite 交付方式一致，并能被独立消费。
- **AD-104 打包候选核对** —— 处理 wasm-pack 生成的 gitignore 与 npm 打包的冲突；完成判定：`npm pack --dry-run` 列出 `.wasm`。
- **AD-105 exports 面** —— 为选定的 lite、full 与类型入口定义可消费导出。
- **AD-106 strip 脚本接入** —— `strip-wasm-names.mjs` 调用路径随构建链迁移。
- **AD-107 类型导出核对** —— `einfach_wasm.d.ts` 能被消费者 tsc 解析，无悬空引用。
- **AD-108 产物离体核对** —— 解包后文件齐全且无多余源码。
- **AD-109 lite 引用切换** —— `worker-runtime.ts` 改到选定交付入口。
- **AD-110 full 引用切换** —— `worker-runtime-full.ts` 同上。
- **AD-111 ensureWasm 与 CI 同步** —— 探测和缓存路径随迁移，并验证 CI 使用它们。
- **AD-112 构建工具路径同步** —— Vite/Astro 别名与 `fs.allow` 随迁移。
- **AD-113 测试侧路径同步** —— mock/映射随迁移，并回归 worker 测试。
- **AD-114 e2e 回归** —— 新路径下回归 worker 后端相关用例。

### `@einfach/solid-excel` 可发布性

- **AD-115 Solid 产物形态裁决** —— 在 `solid` 条件源码、编译产物或双形态之间裁决，明确消费者编译责任。
- **AD-116 构建管线接入** —— 按 AD-115 的裁决接入构建，并更新失效注释。
- **AD-117 exports 重写** —— 重排子路径导出，保留 `vnext-worker-factory` 不进 barrel 的约束。
- **AD-118 `files` 字段** —— 收敛为可验证的发布白名单；`npm pack --dry-run` 不得含 e2e、test、demo 源码。
- **AD-119 私有依赖解耦** —— 按 D1 移出或处理 `@einfach/excel-core-ts`，使外部安装成立。
- **AD-120 workspace 协议替换验证** —— 打包时 `workspace:*` 变为真实、可安装的版本号。
- **AD-121 peerDependencies 口径** —— 为 `solid-js`、`@einfach/core`、`@einfach/solid` 定依赖边界与版本范围。
- **AD-122 sideEffects 与 CSS 导出核对** —— `vnext-styles.css` 能在 tree-shaking 下被引入。
- **AD-123 单实例风险表达** —— ADR 0001 的不变式进入消费者文档，并评估开发期重复实例告警。
- **AD-124 产物离体核对** —— 解包验证 ESM/CJS 入口与 `.d.ts`。

### UI core 元数据

- **AD-125 仓库指向修正** —— `repository`、`homepage`、`bugs` 指向当前仓库。
- **AD-126 exports 字段补齐** —— 声明现代 `exports`。
- **AD-127 keywords 补齐** —— 与 AD-405 的 topics 使用同一批词。
- **AD-128 ui-core 产物离体核对** —— 同 AD-124。

### 版本、发布与离体验证

- **AD-129 版本策略落地** —— 按 D4 决策更新首发/升级版本；不能预设为 `0.0.1`。
- **AD-130 fixed 组配置** —— 按发布包集合配置 changeset fixed 组，并验证一次联动。
- **AD-131 首发 changeset** —— 覆盖全部待发包。
- **AD-132 发布 workflow** —— 恢复正确触发并使用 D3 的身份方案。
- **AD-133 发布流程文档化** —— 写明谁能发、怎么发、凭据如何配置。
- **AD-134 稳定性声明** —— README 准确说明所选版本阶段的兼容性预期。
- **AD-135 首条 release notes** —— 说明成熟度、已知边界与非目标。
- **AD-136 本地 registry** —— 起 verdaccio 或等价方案。
- **AD-137 全链路 dry-run** —— 所有待发包经本地 registry 验证，不留下部分发布。
- **AD-138 / AD-139 / AD-140 / AD-141** —— Vite、webpack、Next、Nuxt 的仓外安装冒烟。
- **AD-142 失败路径可读性走查** —— 验证缺 WASM、worker 失败、重复 solid-js 时的错误指向明确解法。
