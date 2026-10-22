# 001 独立审查：可安装完整 React 工作簿

结论：`APPROVED`。001 的包入口、生命周期装配及发行物静态边界符合任务契约；没有 Critical / Important 缺陷。完整 demo、真实安装及 Vite/Rspack 浏览器结果仍须由 004 验收，本结论不代表整棵任务树或发布门禁通过。

审查基线：`08caefbce8cb4934ceea4f0c26115d910569a47c`。日期：2026-10-22。

## 范围与证据有效性

- 已读 001 任务、index、001-report，以及 index 要求的 React 架构、feature-wave、one-file-one-thing 规则；按 task-tree 规则独立审查。
- 按任务 frontmatter 的 files 执行 `git diff 08caefbce8cb4934ceea4f0c26115d910569a47c -- <files>`。tracked 变更为 React package、Provider、Provider 测试和 demo Vite 输出目录；新增的配置、公开入口、Worker、测试、脚本和接入文档全部直接读取，未漏掉 untracked 文件。
- `packages/react-cells` / `canvas-cells` / `canvas` 的允许范围没有变更；Core/Rust 的并行 003 改动不作为本叶实现审查范围。
- 逐一重算报告中全部 27 项 SHA-256，18 项本叶源码/配置/文档以及 9 项关键产物/预构建输入全部一致。可复用报告中的测试和构建结果。
- 复用：最终运行时源码的 4 文件 / 13 tests 通过；测试配置修正后的 package-test tsc 退出 0；最终 build:lib 退出 0；最终 npm pack dry-run 静态检查退出 0，12 文件 / 2,024,800 bytes。
- 不把原组合 `test:package` 命令记为退出 0：其 Vitest 通过后 tsc 退出 2，随后只修测试 tsconfig 并单独 tsc 通过。报告对此陈述准确。
- 未重复构建或执行单测。仅补做只读检查：公开声明 5 个相对引用全部解析到随包声明；当前主 JS 中的唯一 Worker URL 相对 `dist/index.js` 解析到实际存在的 `assets/workbook.worker-DisuxwQ0.js`。两项均退出 0。

## 逐条验收

| 条目 | 判定 | 独立证据与边界 |
|---|---|---|
| 1. 公开运行时/类型、导入无 Worker/demo | ✅ | `src/index.ts:1-13` 只导出四个要求的组件及四组 Props，没有复制 Core barrel；`Spreadsheet.tsx:15-21` 组合既有完整 WorkbookView。`test/package/public-entry.test.ts:17-42` 锁定精确四个运行时导出、Worker 零调用、demo-registry 毒化 mock及公开类型。当前五份发行声明直接读取确认接口一致，不含 demo/test 私有类型或 CSS 私有路径。语言初始化副作用另见 002 交接，不误记为本叶完全无副作用。 |
| 2. 外部 Store、工厂变化、失败与销毁 | ✅ | `WorkbookRuntimeProvider.tsx:18-39,57-70` 将外部 Store 注入同一 AtomProvider，直接把 definition/factory 传给 Core start atom，effect 只调用 Core dispose atom。报告的 9 个 Provider 场景覆盖外部 Store、自定义 factory、factory 替换、构造/初始化失败、恢复、迟到结果、初始化中卸载；测试精确断言 Worker terminate 一次。新增代码没有另造连接、runtime/controller 或第二次 terminate。 |
| 3. 库构建及 JS/声明/CSS/Worker 产物 | ✅ | 报告最终 build:lib 退出 0，且全部输入/关键产物指纹相符。`vite.lib.config.ts:13-38` 使用库模式、相对 base、独立 Worker ES 输出、Lingui 编译、关闭 publicDir。实际 dist 含 JS、CSS、5 份声明、Worker及 manifest；报告残留扫描通过。公开声明相对引用与 Worker 文件存在性另由本次只读补验通过。 |
| 4. pack、依赖闭包、消费者无需 Rust 编译 | ✅（静态及 pack 清单） | `package.json:18,23-32,49-54` 的发行文件及依赖边界与实际 12 文件 pack 清单一致；private renderer 包仅为 devDependency并已内联。`artifact-manifest.json` 的外部导入均属于普通依赖或 peer，无私有 renderer 外部导入。Worker 含预编译 WASM，无 Rust 源或消费者安装/编译 hook。真实 tarball 安装及 registry/peer 解析按既定分工交 004，尚不能从 dry-run 推导其通过。 |
| 5. demo 类型检查/构建及样例保留 | ✅ 实现保留；❌ 完整运行证据尚待 004 | `package.json:35-37,47` 保留 typecheck，把 build 显式定义为 build:lib 后 build:demo；`vite.config.ts:20-22` 只把原 demo 输出改为 dist-demo，避免两种构建互相覆盖。范围 diff 无 demo/样例删除。001 报告没有执行或宣称完整 demo typecheck/build；任务验证分工与 004 验收第 7 条已接管最终门禁，故该未验证项不作为 001 缺陷，也不记成已有通过证据。 |

以上 ❌ 表示尚无该执行证据，并非发现执行失败；004 必须补齐后才能关闭整体验收。

## PKG-01 至 PKG-03

| 矩阵行 | 判定 | 证据 |
|---|---|---|
| PKG-01：外部安装/公开 JS 与声明 | ✅ 本叶交付 | 包根条件导出指向当前 dist/index.js 与 dist/index.d.ts，`./style.css` 显式导出；四组件/Props 源码、公开入口测试、五份声明闭包及 pack 清单相互吻合。保留 private/0.0.0 是 index 明确的发布保护，最终发布准备归 004。 |
| PKG-02：默认/自定义 Worker 与生命周期 | ✅ 本叶交付 | 默认工厂只在调用时执行 `new Worker(new URL(..., import.meta.url), {type:'module'})`；包根无 `?worker`。发行 JS 的实际 Worker 地址为 `assets/workbook.worker-DisuxwQ0.js`，相对主模块且资产存在。默认工厂测试覆盖每次新实例；Provider 测试和既有 Core 所有权覆盖失败/替换/卸载。真实浏览器、CSP和部署路径仍待 004。 |
| PKG-03：依赖闭包/单例/无消费者宏 | ✅ 本叶交付 | `vite.lib.config.ts:9-11,19-25,37-38` 对 React/react-dom、Einfach Store/React binding、UI Core 的根及子路径 external，只 alias 三个私有 renderer。实际主 JS 直接从同一 `@einfach/spreadsheet-ui-core` 根导入 atom，没有内联第二份 UI Core atom模块；发行声明也引用 Core 公共类型。Lingui 宏与中英 PO 在库侧编译，发行模块只依赖已声明 Lingui runtime。宿主无需源码 alias、PO loader或宏插件。 |

## 设计与宿主边界

最短链路保持为宿主 Spreadsheet → 现有 Provider effect → Core start atom → Worker/WASM → Core atom 结果 → 完整 WorkbookView。Spreadsheet 只组合视图；默认工厂只提供资源 URL；Worker 入口只导入 Core 发行版原生 runtime。每层都有当前职责，没有新增工作簿状态层。

主线程的单例由 peer/external 保持：宿主 Store、React AtomProvider 及 WorkbookView 访问的 Core atom均从外部公开包解析。Worker 内部编译 Core 原生 runtime属于隔离执行环境，不等于主线程复制 Core atom身份。宿主仍需遵守同版本/单实例解析要求，文档明确一个 Store 同时只能归属一个工作簿；旧 core/react binding/React19 不被冒称兼容。

公开声明只含 React、Store、Core 公开 definition/connection 和 `rust-worker` 的 WorkerLike类型；没有内部 renderer、demo、Worker源码或 Lingui macro 类型泄漏。声明生成脚本从公开入口遍历类型闭包并拒绝缺失/越界引用，现有五份输出符合本次 API。库与 demo 构建分开，原 build 仍执行两者。

## Critical

无。

## Important

无。

## Minor

1. **打包附带的旧 README 仍声称 Provider 使用 `?worker`。** `excel/react-excel/README.md:69` 的描述已与本次实现不符；npm pack 自动包含该 README，因此消费者会同时收到这段旧说明与正确的 `docs/package/README.md:29-33`。这不影响运行，且该 README 在 004 的明确 files 范围中。建议 004 整合正式安装/Worker说明时删除旧断言；不要求 001 越界修改。

## 002 / 004 交接核对

✅ 002：报告明确记录包根导入目前仍会执行 `src/i18n/runtime.ts` 的 URL/localStorage 语言选择，两个 Provider仍用共享 i18n；Spreadsheet 导入 app.css，全局 body/:root/reset、renderer URL选择和尺寸/宿主滚动隔离尚未处理。002 任务已逐项接管，未被无 Worker/demo测试掩盖为“无任何导入副作用”。

✅ 004：报告明确交付普通依赖/peer清单、精确 artifact清单、声明和 Worker工厂接口；增加的 TypeScript devDependency与 peer/dev移动需统一更新 lockfile。Core/WASM必须在 003 完成后重建，再重建 React库，不能把本次基线 Worker当最终协议证据。完整 demo/Core/React门禁、真实 tarball、无仓库 alias安装、Vite/Rspack、默认和自定义 Worker、真实 DOM主用例及发布准备均已明确交接。

✅ FEATURES：001 没有越界修改登记表，报告留下了两个消费者主用例建议；004 已注明必须改用仓库认可的 `ABC-001` ID形式，不能直接抄 `PKG-EMBED-01`。单测不替代真实 DOM验收。

结论维持 `APPROVED`：允许 002 消费已审入口；Minor交 004 文档收尾。整包完成仍以 004 的最终独立消费者和全量门禁为准。
