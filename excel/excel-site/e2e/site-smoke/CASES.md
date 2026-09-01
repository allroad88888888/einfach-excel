# site-smoke — e2e cases

> 对象：`astro build` 的静态产物（经 `astro preview`），即部署到 GitHub Pages 的同一形态。
> 门禁位置：pages.yml 在 deploy 之前跑本目录（构建产物此前是零测试盲区）。
> React 是独立 Vite 产品，不在介绍站提供 demo；Vue 受控投影 demo 由 Vue e2e 包覆盖
> （docs/FRAMEWORK_BACKEND_E2E_MATRIX.md）。

| ID    | 场景                              | 步骤概要                     | 关键断言                                                                                             | 状态    | spec                   |
| ----- | --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------- | ---------------------- |
| SS-01 | 10 个 Solid demo 页冷加载出真格子 | 逐页 goto `/demos/<id>/`     | spreadsheet-grid 可见 + 至少 1 个 td.cell；预算内（小 seed 15s / 10 万行 seed 45s）；无 error 反馈面 | ✅ 本轮 | demo-cold-load.spec.ts |
| SS-02 | 大 seed demo 的进度条不残留       | 同上（perf seed 两页）       | ready 后 demo-import-progress 卸载                                                                   | ✅ 本轮 | demo-cold-load.spec.ts |
| SS-03 | zh 变体同岛可用                   | goto `/zh/demos/workbench/`  | 同 SS-01                                                                                             | ✅ 本轮 | demo-cold-load.spec.ts |
| SS-04 | 首页 hero 预览就绪                | goto `/`                     | 收入表预览、标题与主 CTA 可见                                                                        | ✅ 本轮 | demo-cold-load.spec.ts |
| SS-05 | 暗色主题下表格可读                | workbench + 点 #theme-toggle | 岛携带 data-spreadsheet-theme=dark;单元格文字/底色对比 ≥4.5                                          | 🆕 本轮 | demo-cold-load.spec.ts |
| SS-06 | 首页营销入口与元信息一致          | goto `/`                     | 主 CTA 直达按需公式演示；安装区、canonical、description、JSON-LD 存在                                | ✅ 本轮 | demo-cold-load.spec.ts |
| SS-07 | 按需公式演示贯通跨表依赖          | Summary → Unused             | Summary 首屏结果正确；切到 Unused 后公式结果可见                                                      | ✅ 本轮 | demo-cold-load.spec.ts |
