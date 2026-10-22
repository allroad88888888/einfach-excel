# 001：外部项目可安装并嵌入完整工作簿

状态：`DONE_WITH_CONCERNS`。公开库交付及本任务就近验证已完成；独立消费者、完整 demo 门禁与样式/语言隔离按任务分工交给 002/004，未冒称已验证。

基线/当前 HEAD：`08caefbce8cb4934ceea4f0c26115d910569a47c`。未 commit、push、发布，未改 root package、lockfile、CI、Core、Rust 或暂停框架。

## 实际交付

- 包根精确导出 `Spreadsheet`、`WorkbookView`、`WorkbookRuntimeProvider`、`WorkbookStoreProvider`，并导出四个同名 Props 类型；不转导出 Core barrel。
- `Spreadsheet` props 继承 definition、可选 Store/workerFactory，增加 className/style；组合真正的完整 WorkbookView。
- Provider 将 definition 与 factory 直接交给既有 `startRustWorkbookRuntimeAtom`，effect 清理只调用既有 `disposeRustWorkbookRuntimeAtom`。Worker 终止权属于 Core，无第二套 runtime/controller、React workbook state 或重复 dispose。
- 默认工厂只在挂载时通过标准模块 Worker URL 创建新实例。Worker 入口导入 UI Core 的发行版 `./rust-runtime`；公共 JS 不使用 `?worker`。
- 单独 `vite.lib.config.ts` 构建库，使用已构建的 Core JS/声明，不对 Core 做源码 alias。私有 react-cells/canvas-cells/canvas 内联；Core、Einfach Store/React 绑定、React/react-dom 保留外部 peer 身份。
- `./style.css` 显式导出；库侧完成 Lingui macro 与中英 `.po` 编译。5 份公开可达声明由 TypeScript 原生编译结果生成，排除私有 CSS import 与不可达 DOM/demo/test 类型。
- 库构建关闭 publicDir，避免 Vite 自动复制 demo 数据；相对 base 确保 Worker 不指向宿主站点根 `/assets`。ESM 库输出显式启用代码生成压缩，去除 `.po`/`.tsx` 源文件 region 标记并保留 pure/legal 注释。
- `build:lib` 输出 dist；`build:demo` 保留原 Vite demo 构建、输出 dist-demo；`build` 依次执行两者，没有删 demo/样例。
- 新增公开入口、组合组件、默认工厂测试；扩展原生命周期测试。新增库声明/pack 检查脚本及接入文档 `excel/react-excel/docs/package/README.md`。

最短调用链：宿主 `<Spreadsheet definition store? workerFactory?>` → React Provider effect → Core start atom → Rust module Worker/WASM → Core atom 结果 → 完整 WorkbookView。新增 Spreadsheet 只组合完整工作簿；工厂只封装默认 Worker URL；Worker 入口只装配发行版原生运行时；均不新增业务状态层。

## 逐条验收

| 验收项 | 结果 | 证据与限制 |
|---|---|---|
| 1. 根运行时导出/类型，导入无 Worker/demo | 通过本任务检查 | public-entry 的精确 4 export 断言、Worker constructor 零调用、demo-registry 毒化 mock；公开 props 类型断言另经最终 tsc 检查。dist 也无 demo 数据/源码。真实 tarball 导入由 004 再验。 |
| 2. 外部 Store、自定义 factory、变化/卸载、失败 | 通过 | Provider 9 个实例化场景覆盖外部 Store 文档/ready 状态、自定义 factory 替换时旧实例一次 terminate、新实例卸载一次 terminate、默认/自定义构造失败、原生初始化失败恢复、旧初始化迟到成功/失败、初始化中卸载；保留 Core 单一销毁所有权。 |
| 3. build:lib 与 JS/声明/CSS/Worker | 通过 | 最终 `build:lib` 自然退出 0；8 个基础产物加 artifact-manifest。AST 检查外部 imports，扫描宏、`.po`/`.tsx`、仓库绝对路径、`?worker`，检查相对 Worker 路径及预编译 WASM。 |
| 4. pack/依赖闭包/无需 Rust 编译 | 通过静态及 pack 清单检查 | npm pack dry-run 自然退出 0，12 文件，2,024,800 bytes；无 demo/test/e2e/src、构建脚本或 Rust 源。私有实现只在 devDependencies，发行依赖/peer 无私有绘制包。默认 Worker 内嵌已编译 WASM，无消费者 Rust 安装/构建脚本。真实安装由 004 验。 |
| 5. 现有 demo 类型检查/构建 | 实现保留，集成待验 | demo 源码/样例未删；原 Vite 配置仅改输出目录；build:demo 仍执行 vite build。遵守本叶“只跑本任务单测、库构建、产物静态检查”，未执行 demo/root/full gates，由 004 统一执行。 |

## 命令与自然退出结果

所有工具返回 session 时均等待同一个进程自然退出；未把 yielding/超时当失败重启。下列命令工作目录均为 `/Volumes/work/self/excel`。

| 命令/阶段 | 自然退出 | 结果 |
|---|---:|---|
| `pnpm --filter @einfach/react-excel test -- test/package test/page/workbook-runtime-provider.test.tsx` 初轮 | 0 | 3 文件 / 12 tests 通过；随后新增默认工厂测试。 |
| `pnpm --filter @einfach/react-excel test:package` 最终运行时源码 | 2 | Vitest 阶段 4 文件 / 13 tests 全通过（1.42s）；随后 tsc 因 jest-dom 类型入口未选 vitest augmentation 失败。仅测试 tsconfig 修正，未改测试/产品运行时源码。 |
| `pnpm --filter @einfach/react-excel exec tsc -p tsconfig.package-test.json` 修正后 | 0 | 最终公开类型断言与本任务测试类型检查通过，无输出。复用上行未变运行时源码的 13 tests 证据，不重复跑单测。 |
| `pnpm --filter @einfach/react-excel build:lib` 最终候选 | 0 | Vite 199 modules；index.js 431.69 kB、style.css 68.54 kB、Worker 5,685.03 kB；公开声明 5 files；artifact 静态检查通过。自然退出 session 55468。 |
| `node excel/react-excel/scripts/check-package-contents.mjs` 最终候选 | 0 | npm pack dry-run/ignore-scripts，12 文件；见下方完整清单。自然退出 session 17192。未生成/安装 tarball。 |
| `git diff --check -- excel/react-excel` | 0 | 本任务 tracked diff 无空白错误。 |
| `wc -l` 新增/大改源码与脚本/测试 | 0 | 所有文件 ≤300 行，最大 Provider 测试 221 行；配置 41、声明生成 63、artifact 检查 86、pack 检查 25 行。无需复杂算法豁免。 |

构建/静态检查发现并已修复的失败（均明确自然退出 1）：

1. 首次声明编译：WorkerLike 并非 Core 根导出，改用已公开 `@einfach/spreadsheet-ui-core/rust-worker`，不修改 Core API。
2. 声明闭包：WorkbookView 的 CSS side-effect import 不是类型依赖，生成公开声明时移除该类 CSS import；消费者通过显式 style.css 导出加载样式。
3. 产物检查：Vite 自动复制 public/demo 数据，库配置关闭 publicDir；实际源码、demo 公共资源未删除。
4. 更严格的残留检查：ESM 库默认输出 source region，显式 output.minify 去除 `.po`/`.tsx` 路径标记。
5. 压缩后的字符串令 import 正则误判目录文本 `,[`，检查器改用 TypeScript AST 识别真实 JS/声明 imports。
6. 前述构建失败后曾提前启动 pack 检查，因缺少 artifact-manifest 自然退出 1；修复构建后再正常检查。
7. pack 检查发现 npm 自动纳入 README，白名单已接受根 README/LICENSE/COPYING 等必要发布文件；未删说明或许可证来过关。

## 覆盖矩阵证据

| id | 精确入口/证据 | 状态 |
|---|---|---|
| PKG-01 | src/index.ts、src/Spreadsheet.tsx；test/package/public-entry.test.ts（2 项）、spreadsheet.test.tsx（1 项）；最终公开声明 tsc；dist/index.d.ts 等 5 份声明；pack 清单 | 本叶完成；真实安装/DOM 消费由 004 |
| PKG-02 | page/WorkbookRuntimeProvider.tsx；test/page/workbook-runtime-provider.test.tsx（9 项）；test/package/default-worker.test.ts（1 项）；dist/assets/workbook.worker-DisuxwQ0.js；相对 URL/预编译 WASM 检查 | 本叶完成；浏览器 Worker/WASM 通路由 004 |
| PKG-03 | vite.lib.config.ts 的 singleton external 与仅私有 renderer alias；scripts/build-declarations.mjs、verify-package-artifact.mjs、check-package-contents.mjs；artifact-manifest 的完整外部导入清单 | 本叶完成；registry peer/tarball 真实安装由 004 |

`FEATURES.md` 按全局约束未修改。建议 004 以消费者真实 DOM 主用例登记：

- `PKG-EMBED-01`：外部宿主挂载 Spreadsheet，默认 Worker 初始化后展示完整 chrome/grid/页签，并从实际 DOM 编辑验证结果及相邻单元格。建议主测试名 `embeds a complete initialized workbook from the installed package`。
- `PKG-EMBED-02`：外部宿主明确覆盖 Worker factory，在 DOM 使用同一工作簿后卸载，验证资源销毁与重挂载。建议主测试名 `uses the host Worker factory and disposes the mounted workbook`。

这些是待 004 合并到持久消费者 E2E 的登记建议，尚无主 E2E 文件/执行结果，不能以本叶单测冒充。

## 发行物与依赖

最终 npm pack dry-run 清单：

```text
README.md
dist/Spreadsheet.d.ts
dist/artifact-manifest.json
dist/assets/workbook.worker-DisuxwQ0.js
dist/index.d.ts
dist/index.js
dist/page/WorkbookRuntimeProvider.d.ts
dist/page/WorkbookStoreProvider.d.ts
dist/style.css
dist/workbook/shell/WorkbookView.d.ts
docs/package/README.md
package.json
```

运行时普通依赖：`@lingui/core` / `@lingui/react` `6.9.1`。宿主 peer：`@einfach/core` / `@einfach/react` `^0.4.0`、`@einfach/spreadsheet-ui-core` `^0.1.0`、React/react-dom `^18.3.1`。Core 的公开 `./rust-worker` 子路径仅供类型引用。JS 主模块不内联这些单例包；私有 `@einfach/react-cells`、`@einfach/canvas-cells`、`@einfach/canvas` 编译进产物。

无新第三方库。只在 React package 显式增加已在仓库存在的 `typescript ^5.7.2` devDependency；把单例依赖放到 peer 并保留对应 devDependency，私有绘制包移到 devDependency。004 需统一更新 lockfile。无 packages/* package 修改需求。

默认 Worker 是自包含 JS，WASM 以 `data:application/wasm;base64,AGFzb…` 预编译字节内嵌；不存在消费者 Rust 编译步骤。构建机器需要先产出 Core 的匹配发行 JS/声明和 WASM，React 库不伪造 Core 构建。004 必须在 003 完成后重建 Core/WASM 与本库，不能拿本报告基线 Worker 代替最终宿主协议验收。

## 002/004 接手边界与未验证项

- 002 可直接消费已稳定的根导出与 workerFactory API；Provider 仍引用 `src/i18n/runtime.ts` 的现有全局 i18n。包根导入仍有现有语言初始化的 URL/localStorage 读取，当前测试只锁定“无 Worker/无 demo 数据”，未声称语言无副作用。
- Spreadsheet 当前导入 `./app/app.css` 提供既有基础 token/样式；style.css 导出已就绪，但现有全局 body/:root/reset 与 renderer URL 行为仍由 002 隔离。没有在本叶越界改 CSS/i18n/WorkbookView。
- 004 负责根脚本/lockfile/CI/发布准备与 README 总接入；保留 `private: true` 发布保护，版本仍 0.0.0；不把包元数据当已发布结果。
- 未运行完整 demo typecheck/build、完整 React/Core 单测、E2E、独立 tarball 安装、Vite/Rspack 浏览器、CSP 或 CDN/子路径部署。标准相对 Worker URL、内嵌 WASM 的真实打包兼容性仍以 004 为准。
- 已知外部插件为 Einfach core 0.2.18 / React binding 0.3.21 / React19，与首版 peer 不匹配；必须先升级/对齐，不能放宽 peer 或捆绑第二份 Store/React/Core atom 冒充兼容。本叶未修改外部插件。
- 当前任务工作区另有并行 003 的 Core/Rust 改动，未覆盖或计入本叶源码指纹。

## 源码与输入指纹

以下 SHA-256 为最终候选；路径均相对仓库根。报告本身不计入产品源码身份。

```text
9083a8082e523d8a08a96d9921f3082e577cefc7ede2e43c978ca163c6fca4a7  excel/react-excel/package.json
112b4f177131bc268fb2a14f55e81c1d5a99f43211941b27979fe1da51cfc919  excel/react-excel/vite.config.ts
8e4d214f5069adca7050220a2b879a883df585ccba92ba476283621c037b7930  excel/react-excel/vite.lib.config.ts
bd76f806b624c0e29f528f974549d19107125cea2e1f2b9dff7f084e3e2da4d5  excel/react-excel/tsconfig.lib.json
954b5bc24fb83fc648eb1a06440cfea25170f44959d7ecd105a565f9bbeafec0  excel/react-excel/tsconfig.package-test.json
bd5bf167abb2ba72e08f8260aeaabcb7714d21cbe5c1171e3d0ce26b96ab64e4  excel/react-excel/src/index.ts
79a1fd1a0c3be450a489eea70dc80f4faf93b6d3e1c215c99a6357d725c83bb5  excel/react-excel/src/Spreadsheet.tsx
5d7dc8599d4ff1fa4e01b3534734b119a6c7942392175a50eb8d50ba79a3d049  excel/react-excel/src/worker/create-workbook-worker.ts
8dc6e2ddf3b3966e81ef349be46e6b00537155db93e385d5f8f0fa58b0d38ef9  excel/react-excel/src/worker/workbook.worker.ts
279d688b5c215f0724287207b05cd73a863cfd8bde003b0c75c5b866be276167  excel/react-excel/src/page/WorkbookRuntimeProvider.tsx
54a3fd07b9abd75a99c6d3df5971a9914a128eb8665244be152736b7309a7f29  excel/react-excel/scripts/build-declarations.mjs
217525e9f06d2b526be2e341722b9195140a40f35d076e5dff7f44831b2e7695  excel/react-excel/scripts/check-package-contents.mjs
10dffa34eccb5e1df4b04bfc65355d4c3e24e153022634d8dc79bd088087848e  excel/react-excel/scripts/verify-package-artifact.mjs
6b4b05d2fd0f59573654b38d9bfe5955d20f5fd487e5343c31b61787092c51f0  excel/react-excel/test/package/default-worker.test.ts
5af66d7264764ca37da3b1bbcb9a419325e1cc4a8316b034843e2f1641b5992e  excel/react-excel/test/package/public-entry.test.ts
da5c7439c5aebe5faa5518fc1caa723347b752b6acc357efa647f6cccc5a34ef  excel/react-excel/test/package/spreadsheet.test.tsx
760a527ca73805e3df3762e4361cd14dc6bef177f8c18734a6997d82300e60b8  excel/react-excel/test/page/workbook-runtime-provider.test.tsx
1ca6d7c47eeb38ef961ea4aa44e707effc034050cda6b04897d6ba2550da8b5f  excel/react-excel/docs/package/README.md
```

关键发行物 / 预构建输入 SHA-256：

```text
f61d6242d4232229889742837285554b83edbc7487f9317e2707e499def49502  excel/react-excel/dist/index.js
2e954de87f310de8288373f15fcc0e23cc8c146ce3a68e395b402d8a0d29e24e  excel/react-excel/dist/assets/workbook.worker-DisuxwQ0.js
4df6762b8ddeb4d73fc5c27bb9e8a2ecdd775c55649ea6c85aa23a6cc5ae99a4  excel/react-excel/dist/style.css
1f6ef7eccaaf00c43632cc68171f8005a28be02804599d42513aacbf2c1de6b8  excel/react-excel/dist/artifact-manifest.json
b6c4d283c288e33ba8018ed9e08493a90a2d932064b4c8eb5f9956193b2c5824  excel/spreadsheet-ui-core/esm/index.mjs
3cf016518641f029501e29173c7098e2807abde16690a7e6ae501169e7614073  excel/spreadsheet-ui-core/esm/rust-runtime.mjs
a1eac8c5c1369b85921d2515ddf715dcd1040d9f6871df6471093bdf2570c366  excel/spreadsheet-ui-core/@types/index.d.ts
bd6b9abb7eca0336b542a4e88d04b5ce4ebe363d3eb346954ae7ee65f501de58  excel/excel-wasm/lite/einfach_wasm.js
adccb69f0e9951d845a96b7d4a18bea1044b734d49f802bb425270c5cc1741dc  excel/excel-wasm/lite/einfach_wasm_bg.wasm
```
