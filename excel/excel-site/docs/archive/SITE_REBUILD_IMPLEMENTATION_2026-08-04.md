# excel-site 重构完成记录（2026-08-04）

这是对已归档 [重构计划](SITE_REBUILD_PLAN_2026-08-04.md) 的实施审计；它记录实际落地边界，
不替代代码旁的契约或 [ADR 0007](../../../../docs/decisions/0007-astro-static-site-with-solid-wasm-islands.md)。

## 已完成

- Astro 输出静态首页、演示、指南和 API 页面；Solid 仅加载真实表格 island。
- GitHub Pages workflow 构建 Rust/WASM、TypeDoc 和静态站，并使用 `/einfach-excel` 前缀。
- 英文与中文首页、主题切换、十个语义化 demo 路由和静态 Markdown 叙事已替代 hash-router SPA。
- Worker/WASM 示例使用 100,000 行种子；首个投影 HUD 显示实际可见窗口、总行数、Worker
  入/出消息数与往返时间。
- 脏数据、三工作表预测、自定义公式、静态后端、协作任务表和可执行导览均使用各自的真实种子。
- Backend port 与 atom 指南由源码投影；TypeDoc 从公开入口生成 Markdown；站点提供
  `llms.txt`、`llms-full.txt`、Markdown 文档端点、`sitemap.xml` 与 `robots.txt`。

## 有意保留的边界

计划中「实际遍历格数」和整列 range gate 的引擎诊断端口尚未合入 `main`。站点没有修改该
引擎工作线，也不会把 Worker 消息计数包装成单元格遍历计数。HUD 和 AI 文档明确显示此限制；
引擎合入后再以独立变更接入可选 diagnostics port。

## 验收记录

- `npm run check:docs`：验证 backend 的三项必选方法来自源码。
- `npm run check:solid`：验证 lockfile 的实际 `solid-js` package snapshot 只有 `1.9.12`。
  Astro integration 的包名含 `solid-js`，因此旧的宽松子串 grep 会把插件版本误报为 runtime。
- `pnpm --filter @einfach/excel-site build`：生成 TypeDoc 和 28 个静态页面/端点。
- `GITHUB_ACTIONS=true pnpm --filter @einfach/excel-site build`：验证 Pages 资源前缀。
- 真实浏览器在 `/einfach-excel/` 前缀下加载首页、详情页、主题、Worker/WASM island 与
  滚动后的 HUD，无 console error、模块或资源错误。复用的既有表格 chrome 仍会输出上游
  未编译翻译目录的开发 warning；它不来自本站路由或 Worker，且不在本次禁止修改的引擎范围内。
