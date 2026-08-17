# AD-100：让人装得上（发布链路）

父节点：[对外采用与推广：Issue 树](../ADOPTION_ISSUE_TREE.md)

本组把「npm 上没有可用包」这条断路接通。**断路已于 2026-08-17 接通**：五包以 `0.1.0`
上线 registry.npmjs.org，仓外真实 `npm install` 验证通过；余项为发布质量收尾。

## 当前状态

状态：**首发完成；AD-101~126、AD-128~130、AD-132~142 已完成并独立验收（`38d7d5b` WASM 分发迁移、`8aadfff` 双形态交付与版本落地、`1b08a6a` 本地 registry dry-run、`3be70d7`/`93f7492`/`6ddc17a` 发布流并实跑上线，提交号见 [Issue 树](../ADOPTION_ISSUE_TREE.md)）；剩余 AD-131（判定待重定义）**；四框架冒烟矩阵（AD-138~141）收官，AD-127/143 已完成。

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

1. ~~`@einfach/solid-excel` 尚没有经离体验证的库构建产物~~ 已解决（`8aadfff`）：双形态
   产物落地（ADR 0019），tarball 结构经解包核对。
2. ~~`wasm-pkg/.gitignore` 会影响打包候选文件~~ 已解决（`38d7d5b`）：excel-wasm 的构建链
   末尾清掉 wasm-pack 生成的 `.gitignore`（`wasm:tidy`），`npm pack --dry-run` 实测两份
   `.wasm` 均进 tarball。
3. `workspace:*` 依赖的重写**只有 pnpm pack 会做**（实测 `npm pack` 原样保留、产物不可
   安装；`pnpm pack` 重写为 `0.1.0`）。发布链因此必须使用 pnpm 的打包/发布路径，
   AD-132/137 落地时以此为硬约束。
4. ~~各包 `engines.node` 不一致~~ 已解决（`8aadfff`）：五个待发包统一 `>=22.12.0`。
5. ~~在途 changeset 与首发顺序冲突~~ 已解除：首发（0.1.0）于 2026-08-17 先行完成，
   `lucky-pandas-clap.md` 此后走常规 Version PR 升 `0.2.0` 即为正当流转。

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
- **AD-111 ensureWasm 与 CI 同步** —— **完成**（`38d7d5b`）：根 `ensureWasm` 探测 `excel/excel-wasm/lite/`（缺失自动重建已本地实测）；推送后线上验证——pages workflow 全绿，ci 与 e2e 的 WASM 构建步骤均以 `-w @einfach/excel-wasm` 成功（ci 随后死于先于本迁移的 tsc 存量错；e2e 撞 20 分钟上限属 2026-08-10 起的慢性容量问题，两者均非 WASM 路径所致）。
- **AD-112 构建工具路径同步** —— **完成**（`38d7d5b`）：Vite dev/build（e2e webServer 实跑）与 Astro 站（typecheck:apps 三段）经 workspace 解析新包，无需额外 alias/fs.allow。
- **AD-113 测试侧路径同步** —— **完成**（`38d7d5b`）：jest 增加 `@einfach/excel-wasm(/full)` 映射，24 个测试文件的 mock/夹具路径迁移，worker 测试回归零新增失败。
- **AD-114 e2e 回归** —— **完成**（`38d7d5b`）：新路径下 `e2e/perf-virtual/`（wasm+ts 双后端）70 过 0 挂、`e2e/smoke/` 110 过 0 挂。

### `@einfach/solid-excel` 可发布性

- **AD-115 Solid 产物形态裁决** —— **完成**（`8aadfff`）：裁定双形态，见 [ADR 0019](../decisions/0019-solid-excel-dual-form-artifacts.md)。
- **AD-116 构建管线接入** —— **完成**（`8aadfff`）：`rollup.solid-excel.mjs` 独立管线（仅 ESM；CSS 副作用保留并按原路径拷入产物树；worker URL 字面量 `.ts`→`.mjs` 改写）。
- **AD-117 exports 重写** —— **完成**（`8aadfff`）：全部子路径 `solid`/`types`/`import`/`default` 四条件成对；`vnext-worker-factory` 不进 barrel 的约束保持，契约测试 `package-entry.test.ts` 同步钉住新形态。
- **AD-118 `files` 字段** —— **完成**（`8aadfff`）：白名单 `src`/`src-vnext`/`esm`/`@types/src*`；`npm pack --dry-run` 实测无 e2e、test。偏差说明：`src/demos` 保留 —— 它是公开导出面（`./demos` 子路径）的一部分，不属判定中的 dev 专用 demo 壳。
- **AD-119 内部依赖可解析** —— **完成**（`8aadfff`、`1b08a6a`）：`@einfach/excel-core-ts` 移除 `private` 并对齐 `0.1.0`；registry dry-run 中作为 solid-excel 依赖被外部消费者解析并可 import（[观察记录](../AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md)）。
- **AD-120 workspace 协议替换验证** —— **完成**（`8aadfff`）：实测 `pnpm pack` 把四个 `workspace:*` 全部重写为 `0.1.0`；`npm pack` **不重写**（产物不可安装），发布链因此锁定 pnpm 路径。
- **AD-121 依赖边界与运行环境口径** —— **完成**（`8aadfff`）：`solid-js`/`@einfach/core`/`@einfach/solid` 移入 peerDependencies（复制到 devDependencies 保本地开发），范围 `^1.9.12`/`^0.4.0`/`^0.4.0` —— 单实例不变式（ADR 0001）要求消费者持有唯一副本；五个待发包 `engines` 统一 `>=22.12.0`。
- **AD-122 sideEffects 与 CSS 导出核对** —— **完成**：`vnext-styles.css` 在 tree-shaking 下可被引入（`da50614`）。
- **AD-123 单实例风险表达** —— **完成**：ADR 0001 的不变式已进入消费者文档（`5d97a76`）。
- **AD-124 产物离体核对** —— **完成**（`8aadfff`）：tarball 解包仅 `src`/`src-vnext`/`esm`/`@types`/`package.json`/`README.md`，ESM 入口与 `.d.ts` 齐全，零 test/e2e 文件；按 ADR 0019 无 CJS 形态。

### UI core 元数据

- **AD-125 仓库指向修正** —— **完成**：`repository`、`homepage`、`bugs` 指向当前仓库（`20ff465`）。
- **AD-126 exports 字段补齐** —— **完成**：现代 `exports` 已声明（`20ff465`）。
- **AD-127 keywords 补齐** —— **完成**（`e64ac7b`）：仓库 topics 已在线且与定位对齐（AD-414 存量交付经核验），ui-core keywords 取同批词（spreadsheet/excel/headless-ui/typescript/virtual-scroll + einfach）。
- **AD-128 ui-core 产物离体核对** —— **完成**：ui-core 产物已经解包核对（`20ff465`）。

### 版本、发布与离体验证

- **AD-129 版本策略落地** —— **完成**（`8aadfff`）：五个待发包全部对齐 `0.1.0`（excel-core-ts 从 `0.0.0` 提上来）。
- **AD-130 fixed 组配置** —— **完成**（`8aadfff`）：fixed 组扩为五包；用临时 changeset 经 `changeset status` 实测联动（任一成员 bump，五包同升）。
- **AD-131 首发 changeset** —— **判定已被实际首发路径吸收，待维护者重定义或关闭**：首发按 ADR 0017 无 changeset 直发 `0.1.0`（changeset version 会把版本推过 0.1.0，与判定自相矛盾）；「说明成熟度与边界」的载体落在 GitHub Releases（AD-135）。原判定不再有可执行语义。
- **AD-132 发布 workflow** —— **完成**（`3be70d7`、`93f7492`、`6ddc17a`）：`publish.yml` 按 ADR 0016~0018 改造（Node 钉 22.12.0、`pnpm run release:publish` 保证 `workspace:*` 重写、`build:publish` 只建三个发包项目、`first-publish` 应急档）；2026-08-17 以 NPM_TOKEN 实跑 run `32003823855`，五包上线；push 触发已恢复走常规 changesets 流。
- **AD-133 发布流程文档化** —— **完成**：[docs/RELEASING.md](../RELEASING.md)——谁能发、凭据配置与轮换、pnpm-only 约束、首发 0.1.0 的顺序纪律与发布前自检。
- **AD-134 稳定性声明** —— **完成**（`de98cf6`）：中英 README 的「发布状态与稳定性」按 ADR 0017/0018/0019/0001 写清 0.x 语义（次版本可破坏、锁定 `~0.1.0`）、Node 基线、双形态与 peer 单实例要求、TS lib 要求。
- **AD-135 首条 release notes** —— **完成**：五个 `0.1.0` tag 的 GitHub Releases（tag 落发布提交 `6ddc17a`）；主 note 挂 `solid-excel@0.1.0`，覆盖成熟度、已知边界（打包器环境、peer 单实例、lite/full 语义差异、规模表述纪律）与非目标（非托管服务、无 SSR 承诺、无 React/Vue 已发布适配、非 Excel 平替）。
- **AD-136 本地 registry** —— **完成**（`1b08a6a`）：verdaccio 6.9.2，本仓五包 scope 不设 uplink、其余代理 npmjs；配置要点见[观察记录](../AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md)。
- **AD-137 全链路 dry-run** —— **完成**（`1b08a6a`）：五包经 `pnpm publish` 全部上 registry（无部分发布残留），仓外消费者一次 `npm install` 解析全链（含 peer 自动装自 npmjs 代理），运行时与类型探针见[观察记录](../AD137_LOCAL_REGISTRY_DRYRUN_OBSERVATION.md)。裸 node 下 `vnext` 入口因 CSS import 报错属设计内行为，打包器实跑归 AD-138~141。
- **AD-138 Vite 仓外冒烟** —— **完成**（`c423d1a`）：真 registry 安装 + Node `22.12.0` 基线下界构建 + 浏览器实跑，跨三表公式链经真实 WASM worker 求值显示，零运行时错误；见[观察记录](../AD138_VITE_SMOKE_OBSERVATION.md)。
- **AD-139 webpack 仓外冒烟** —— **完成**（`8e05c1d`）：**零配置改动**跑通预编译 ESM 路径（webpack 5.109.2 + Node 22.12.0 下界）——worker chunk 自动切出、wasm asset 自动发射、CSS 副作用保留；跨三表公式链在 C2 数据单元格严格断言为 13，零运行时错误；见[观察记录](../AD139_WEBPACK_SMOKE_OBSERVATION.md)。
- **AD-140 Next 仓外冒烟** —— **完成**（`af43c2d`）：Next 15.5（webpack 生产构建）下五包安装解析,三个中立包实跑（excel-core-ts 服务端 prerender 求值 42、excel-wasm 客户端 init 后 63、ui-core loaded），零 pageerror；顺带发现并补上 excel-core-ts 缺失的 `exports` 字段（随下个版本发布）；见[观察记录](../AD140_NEXT_SMOKE_OBSERVATION.md)。
- **AD-141 Nuxt 仓外冒烟** —— **完成**（`3a0741a`）：Nuxt 3.21/Vite 7/Nitro 下五包安装解析,三个中立包实跑（excel-core-ts SSR+客户端求值 43、excel-wasm 客户端 init 后 C1=43、ui-core createSpreadsheetUi loaded），wasm 资产零配置发射，零 pageerror；见[观察记录](../AD141_NUXT_SMOKE_OBSERVATION.md)。
- **AD-142 失败路径可读性走查** —— **完成**（`e12b416`）：三场景走查见[走查记录](../AD142_FAILURE_PATH_WALKTHROUGH.md)。缺 WASM → jest 配置加载期定向报错（含重建命令，两态复验）；worker 启动失败 → 发现零 `onerror` 的静默挂死缺口，立叶 AD-143；重复 solid-js → README/release notes/ADR 0001 事前声明 + 仓内契约测试覆盖。
- **AD-143 worker 启动失败的错误面** —— **完成**（`77ad63d`）：连接层经能力探测挂 `error`/`messageerror`（`WorkerLike` 契约不变，type 守卫防无视 type 的测试 double 误触发），失败时 reject 全部在途请求、后续请求快速失败，错误信息指向 wasm 部署与 CSP 排查；契约测试 `vnext-worker-boot-failure.test.ts` 三用例钉住。走查修正：worker **内部**的 wasm 404 本就经 `ensureInit()` 的 try/catch 走 RPC 错误路径拒绝（`worker-runtime-core.ts`），静默挂死仅存在于 worker 脚本加载失败/被 CSP 拦截的页面侧场景——即本次修复面。
