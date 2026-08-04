# ADR 0007：文档站采用 Astro 静态壳与 Solid/WASM islands

- 状态：accepted
- 日期：2026-08-04
- 相关：`excel/excel-site/docs/archive/SITE_REBUILD_PLAN_2026-08-04.md`

## 背景

`@einfach/excel-site` 原先是 Vite + Solid 的 hash-router SPA。它能承载表格演示，
却不能让首页、指南、API 说明及 demo 的叙事正文在初始 HTML 中可读；GitHub Pages 的
仓库子路径部署也要求资源路径有明确的构建约束。

站点仍必须直接运行现有的 worker + WASM + `SpreadsheetUiProvider` 链路，不能为了静态
内容退回到模拟网格或主线程计算。

## 决策

站点重建采用 **Astro 输出静态页面，Solid 仅用于交互 islands** 的结构。

1. Astro 页面提供正文、导航和每个 demo 的可索引说明；交互表格以
   `client:only="solid-js"` island 装载。
2. island 保留 Vite 的 WASM、top-level-await 和 worker-factory 配置，并强制解析到唯一的
   `solid-js@1.9.12`。
3. GitHub Pages 构建使用 `/einfach-excel` 作为 Astro `base`；本地构建使用根路径，避免
   本地预览与生产部署混淆。
4. P1 迁移期间，现有 Vite SPA 仅作为 P0 的线上基准；新页面不继续扩展 hash 路由。

## 已验证的事实

`astro-spike/` 使用现有 `PerformanceDemo` 作为 client-only island：静态构建成功，
在 `/einfach-excel/` 前缀下的浏览器测试已渲染 50,000 × 8 的网格，worker/WASM 初始化和
资源加载均无控制台错误。 `cssCodeSplit: false` 是该岛的必要构建约束，避免运行时预加载
已被 Astro 内联的对话框样式。

当前自动化执行环境中的 Astro 开发服务器会过早退出；这不影响静态产物，因此 spike 的
验收使用 `astro build` 加静态服务器的真实浏览器加载，而不是开发服务器。

## 后果

- P1 可以按文件系统路由重建可索引的页面，并把沉重的表格依赖限制在真正需要它们的页面。
- 每个新增 island 必须复用此 WASM/worker 适配方式并保持单一 Solid 实例。
- 静态站切换后，Pages workflow 的发布目录随之改为 Astro 产物；P0 的 Vite workflow 在
  切换完成前继续提供可部署基准。
