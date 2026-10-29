# 兼容与发行检查

首版支持现代浏览器、React/react-dom 18.3、Einfach core/react `^0.4.0`、UI Core `^0.2.0`，
提供 ESM 与公开声明。构建工具要求 Node 22.19+。本轮以 Vite 8.3.4 与 Rspack 2.2.9 验证。
不承诺 SSR、CJS、React 19、旧 Einfach Store、任意 CSP/CDN 或旧浏览器兼容。
一个 Store 同时只属于一个工作簿；不同组件用不同 Store，避免重复 core/UI Core 模块身份。
样式限定组件根，不是 Shadow DOM，不承诺抵御宿主对内部选择器的高优先级覆盖。

已知非阻断限制：当前 Rspack 消费构建中的工具栏、语言控件字号大于 Vite，状态区可能多行。
两者的实际包场景没有发现入口缺失、文案裁断或功能阻断，但首版不承诺跨打包器像素一致。
此差异已登记为样式一致性 Minor，后续单独收敛；本轮不为它修改冻结中的产品或降低测试断言。

React 18当前候选的包级44项及同候选最终完整浏览器门禁均已通过。2026-10-23唯一最终序列
自然退出0：370文件2679/2679、同JSON主绑定1026/1026，零失败、跳过、重试或flaky；
6276个冻结输入结束零差异。真实包44项与嵌入18项包含在该次完整运行中。
历史attempt2的两处输入长停顿本次均未复现，原因仍unknown，不能声称已完成卡顿修复；
历史attempt3的格式重开、向左填充及冻结插入三项失败经定向收敛后在本次完整序列均通过。
最终完整门禁已获独审APPROVED_WITH_CONCERNS，004/验收7/PKG-13本地通过，原I2按其完整门禁定义关闭；
历史卡顿原因及修复仍未证实。本地验收时尚未推送，推送状态以Git/最终交接为准；未npm发布。
原始失败与各候选冻结见本任务004报告。
本段是完整回归结束后的docs-only状态更新。已验tarball与消费者内文档保持打包时快照，
未为状态文字重新build或pack，既有tgz不包含本次新增文字。

仓库根命令：

```sh
pnpm --filter @einfach-excel/excel-wasm build:wasm:both
pnpm build:publish
pnpm prepare:package-consumers
pnpm --filter @einfach-excel/react-excel exec playwright test --config playwright.package.config.ts
pnpm --filter @einfach-excel/react-excel e2e # 准备仓外消费者，再运行 demo + embedding + package-host 全部用例
```

pack 准备脚本在 mktemp 副本运行现有 Changesets version + lockfile 流程，pnpm pack 五个发行包。
源码仍为原版本，模拟发行是 React 0.1.0 与 fixed 组 Core/styles/TS core/WASM 0.2.0。
Vite/Rspack 安装的是 tarball 与 registry 包；无源码 alias、workspace link、宏插件或消费者 Rust。
消费者只安装 React、UI Core、WASM 三份 tarball；另外两包仅验证关联发行计划，不进入 React 依赖树。
依赖树、构建/声明日志、tarball SHA 和临时路径在 `.codex-artifacts/react-excel-package-004/`。
`consumers.json` 可续跑静态 server 和包 E2E，测试使用生产构建后的页面。
默认完整 Playwright 配置包含这两个 server，包测试不会只被采集却无法实际执行。

发行准备检查：

1. 构建匹配 Rust 源码的 lite/full WASM，验证 default/lite/native/browser 与公开 API 快照。
2. 根静态门禁、全量 Vitest、Core/React 类型和根 build 通过。
3. 验 tarball 的 JS/声明/CSS/Worker/WASM/许可证、依赖闭包与 strict peer 安装。
4. 运行仓外 Vite/Rspack、千行多表、宿主 API/控制/隔离/资源与完整 React DOM 回归，保存同次 JSON。
5. 核对 FEATURES 的原主绑定与新增操作，保留失败历史，不拼接多份报告冒充单次全绿。
6. 另行授权后创建/合并 Version PR，再另行执行 npm 发布。本地验收时实现已分批提交但尚未推送，
   推送状态以Git/最终交接为准；未npm发布。

React 的 private:false 与 publishConfig 仅准备元数据。pending changesets 留在工作区，不能在工作区
运行 release:version 消费它们。现有 publish workflow 在主分支有 changeset 时开 Version PR，
无 changeset 时会直接发布，故未来版本应用/合并/发布仍需独立授权。
根 build:publish 显式执行 React build:lib；React 不声明旧 Rollup 发现器使用的冗余 module 字段，
保留 type:module、main、exports.import，避免 ESM-only 库被旧 CJS+ESM 扫描覆盖。

包沿用仓库 MIT 许可，随包包含 LICENSE、NOTICE 与生成的第三方 Worker 许可证正文。
Lingui/React/Einfach 等外部依赖保留自身许可，本轮不改变仓库授权。
