# print — e2e cases

> 功能源码：excel/solid-excel/src-vnext 的 File 菜单打印预览入口与预览对话框
> （print config 的 worker 后端读写在 jest：vnext-print-config-wasm.test.ts）。
> 本目录覆盖菜单入口 → 语义化 dialog → 焦点恢复的浏览器行为；真实双后端（?backend= 参数）。
> 存量 spec 行数超限登记：无（77 行）

| ID    | 场景                                            | 步骤概要                                          | 关键断言                                                                                             | 状态    | spec                       |
| ----- | ----------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- | -------------------------- |
| PR-01 | File > Print Preview 打开语义对话框并恢复焦点   | 打开预览，分别用 Escape 与 Close 关闭             | overlay 是 role=dialog + aria-label；close-x 初始获焦；朝向/缩放/分页数有值；关闭后焦点回 File 菜单 | ✅ 存量 | print-preview-menu.spec.ts |
