# AD-200：让人五分钟内跑起来（上手路径）

父节点：[对外采用与推广：Issue 树](../ADOPTION_ISSUE_TREE.md)

从「装上了」到「跑起来了」。每条都要能被未接触过本项目的人独立走完。

状态：**未开始**。前置：[AD-100](AD-100-publish-pipeline.md) 全组；未有可离体验证的安装包时，本组不能验收。

## 最小路径

- **AD-201 最小示例代码** —— README 首屏那段能整段复制的代码，控制在 20 行内，含 Provider、Grid、worker 后端三件套。
- **AD-202 最小示例可运行性验证** —— 把 AD-201 的代码原样贴进 AD-138 的冒烟工程，确认零改动可跑。
- **AD-203 Quickstart 文档** —— 从安装到第一个公式，一页写完。
- **AD-204 站点 getting-started 对齐** —— 站点现有页面与 AD-203 口径统一，避免第二份漂移。
- **AD-205 「只要 UI 核心」路径文档** —— 不装 Solid、不装 WASM 的消费方式，配可运行片段。这条同时是 AD-401 定位的兑现证据。

## 集成配方

- **AD-206 Vite 配方** —— WASM 与 worker 的完整配置片段。
- **AD-207 webpack 配方** —— 同上。
- **AD-208 Next 配方** —— 含 SSR 下的规避写法。
- **AD-209 Nuxt 配方** —— 含 SSR 下的规避写法。
- **AD-210 Astro 配方** —— 从 `excel/excel-site` 的现有配置提炼。
- **AD-211 配方页信息架构** —— 五份配方收进一个入口页，避免散落。

## 可试可改

- **AD-212 StackBlitz 模板** —— 一键打开即可编辑。
- **AD-213 CodeSandbox 模板** —— 同上，或明确只做一家并说明理由。
- **AD-214 starter 模板仓库** —— 可 `degit` 的最小工程，含正确的 worker 与 WASM 接线。
- **AD-215 模板与文档的联动** —— README 与 Quickstart 挂上模板入口。

## 接自己的后端

- **AD-216 三方法最小后端示例** —— 只实现 `readVisibleProjection`、`readRangeProjection`、`setCellInput` 的可运行示例。
- **AD-217 可选端口的降级演示** —— 演示宿主不实现某端口时 UI 如何隐藏对应入口。
- **AD-218 自定义后端教程正文** —— 把 AD-216、AD-217 串成一篇。

## 走查

- **AD-219 首次体验走查** —— **完成**：以零上下文 agent 代行（如实标注,非人类新用户）,从 README 走到 A1 输入 `=1+2` 显示 3;2 个阻断级卡点、4 摩擦、3 瑕疵,全文见[走查记录](../AD219_FIRST_RUN_WALKTHROUGH.md)。
- **AD-220 走查结论回写** —— **完成**：9 条修复中 7 条已落(README Node 基线/checkout 措辞、Quickstart 与 vite 配方的 dev 边界与嵌套 optimizeDeps 修法(实测 600 格通过)、幽灵引用、入口文件措辞、starter 升 Vite 8);推送模板(#1)待维护者 push;治本(#2)立叶 AD-221 + issue #12。
- **AD-221 dev 模式 CJS 传递依赖治本** —— 由 AD-219 走查立叶(issue #12):消除 `@lingui/core → @messageformat/parser` 的运行时 CJS 暴露,验收 = 干净 Vite 工程零 optimizeDeps 配置 dev 可跑。
