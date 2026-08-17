# AD-138 Vite 仓外安装冒烟观察

## 范围

本记录是 2026-08-17 对已发布 `0.1.0` 包的一次仓外 Vite 消费冒烟。它验证「从
registry.npmjs.org 安装 → Vite 构建 → 浏览器运行」的完整链路；不构成性能、容量
或其它打包器（webpack/Next/Nuxt，归 AD-139~141）的结论。

## 环境与判定要点

- 消费者项目在仓外一次性目录，`.npmrc` 显式 `registry=https://registry.npmjs.org/`
  且 **`use-node-version=22.12.0`** —— 全部 install/build/preview 均在
  [ADR 0018](decisions/0018-node-baseline-22-12.md) 基线**下界**执行
  （`pnpm exec node -v` 实测 `v22.12.0`），满足本叶子「只在更高版本跑通不算数」的口径。
- pnpm 10.15.1、vite ^5.4、vite-plugin-solid ^2.8；依赖仅
  `@einfach/solid-excel@0.1.0` + 三个 peer（`solid-js@1.9.12`、`@einfach/core`、
  `@einfach/solid`）。走 `solid` 导出条件（源码编译路径，ADR 0019 双形态之一）。
- 应用体：渲染 `@einfach/solid-excel/demos` 的 `VNextWorkerDemo`
  （自带 worker 后端与跨表种子数据）+ `vnext-styles.css`。

## 实际观察

1. `pnpm install` 与 `vite build` 成功；产物含完整 worker 图：
   `worker-runtime`、`worker-entry-ts`、`wasm-workbook-worker`、`wasm-sheet-worker`
   四个 chunk 与 `einfach_wasm_bg-*.wasm` 二进制。
2. `vite preview` + Playwright Chromium 探针：`vnext-worker-grid` 可见，菜单栏、
   工具栏、表格 tab、自定义公式横幅均渲染；**零** pageerror / console error。
3. 网格 C2 显示 **13** —— 种子里 `C2 = '=Sheet2!C2+1'`、`Sheet2!C2 = '=Sheet3!C2+1'`，
   即跨三表公式链经真实 Rust/WASM worker 求值后投影回网格。

## 解释边界

- 仅覆盖 Vite + `vite-plugin-solid`（`solid` 条件）消费路径；预编译 ESM 路径由
  AD-139~141 的 webpack/Next/Nuxt 冒烟另行验证。
- 探针浏览器为 Playwright Chromium 单一环境；不构成浏览器兼容矩阵结论。
