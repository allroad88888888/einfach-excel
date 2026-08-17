# AD-139 webpack 仓外安装冒烟观察

日期:2026-08-17。状态:**通过**。

## 范围

验证已发布 npm 包 `@einfach/solid-excel@0.1.0`(及其依赖 `@einfach/excel-wasm@0.1.0`、
`@einfach/spreadsheet-ui-core@0.1.0`、`@einfach/spreadsheet-ui-styles@0.1.0`、
`@einfach/excel-core-ts@0.1.0`)能在 **webpack 5** 下构建并运行。关键点:webpack 没有
`solid` 导出条件,exports 解析落到 `import`/`default` → 包内**预编译 ESM**(`esm/` 目录,
`.mjs`),此路径此前未被任何真实打包器验证过(仓内自用的是 Vite,且 Vite 走 `solid` 条件
从源码编译)。

工程:一次性 scratch 目录,纯 JS 入口无 JSX、无 Solid 编译插件——
`src/main.js` 用 `createComponent(VNextWorkerDemo, {})` + `render()`,消费的全是包内
预编译产物。

## 环境

- `pnpm exec node -v` → **v22.12.0**(`.npmrc` `use-node-version=22.12.0` 钉版生效;系统 node 为 v24.14.0,不参与)。包声明 `engines.node >=22.12.0`,本冒烟即在基线下界上跑。
- pnpm 10.15.1
- webpack **5.109.2**,webpack-cli 5.1.4
- html-webpack-plugin 5.6.8,css-loader 7.1.4,style-loader 4.0.0,http-server 14.1.1
- solid-js 1.9.12(钉版),@einfach/core 0.4.0,@einfach/solid 0.4.0
- registry 钉 registry.npmjs.org;安装 236 包,22.4s

## 遇到的问题与解法

**无。** 骨架配置(entry + html-webpack-plugin + css loader 链)一次构建通过,
未加任何 resolve condition(尤其**没有**加 `solid` 条件),未加 wasm/worker 相关配置:

- worker:包内 factory 写法 `new Worker(new URL('./worker-runtime.mjs', import.meta.url), { type: 'module' })` 被 webpack 5 静态识别,自动切出 worker chunk。
- wasm:`@einfach/excel-wasm` 是 wasm-pack `--target web` 产物,`einfach_wasm_bg.wasm` 经 `new URL(..., import.meta.url)` 被 webpack 5 asset module 自动发射,无需 asset/resource 规则。
- css:`@einfach/solid-excel/vnext-styles.css` 及 spreadsheet-ui-styles 的 CSS 由 css-loader/style-loader 正常吃下;包的 `sideEffects: ["**/*.css"]` 保住了样式不被摇掉。

仅有的 warning 是 webpack 默认 244 KiB 体积上限提示(main.js 1.16 MiB、wasm 1.78 MiB、
818.js 364 KiB),属预期,非错误。

## 产物清单(dist/,production)

| 文件 | 大小 | 说明 |
|---|---|---|
| main.js | 1.16 MiB | 入口(含 solid-js、UI core、adapter) |
| **559.js** | 66.4 KiB | **WASM worker chunk**(worker-runtime,含 instantiateStreaming 调用) |
| **818.js** | 364 KiB | **TS 引擎 worker chunk**(worker-entry-ts → excel-core-ts) |
| **32f1f5548d91ef00e0e9.wasm** | 1.78 MiB | einfach_wasm_bg.wasm(lite 变体)asset |
| 141/175/138/610/838/73/798/46.js | 0.7–7 KiB | 异步小 chunk |
| index.html | 171 B | html-webpack-plugin 注出 |

`main.js` 内可见两处 `new Worker(new URL(n.p+n.u(559)...)` / `...(818)...` ——
两个 worker factory 都被正确编译成 chunk 引用。

## 探针结果(Chromium / @playwright/test)

`http-server dist -p 5198` + headless Chromium 访问 `http://localhost:5198/`:

- `data-testid="vnext-worker-grid"` **可见**(30s 上限内)。
- 严格断言(防行号 13 假阳性):**数据单元格**(带 `data-row`/`data-col`,行号标签不带)
  中存在文本恰为 `13` 的格,位于 `data-row=1, data-col=2` 即 **C2** ——
  跨三表公式链 Sheet1!B4=10 → Sheet3!C2`=Sheet1!B4+1`=11 → Sheet2!C2`=Sheet3!C2+1`=12
  → Sheet1!C2`=Sheet2!C2+1`=**13** 的求值结果。
- 全部种子单元格到位:`Sheet1, cell1, result, 13, cell4, 10, source`。
- **pageerror:0 条;console error:0 条。**

首轮探针曾出现假阳性(网格 innerText 含行号 "13" 而单元格尚空),已改为按数据单元格
精确断言后复跑通过——这是探针的教训,不是包的问题。

## 解释边界

- 只验证了 **webpack 5 + 预编译 ESM(`esm/`,`import` 条件)** 这一条路径;`solid`
  条件(Vite/vite-plugin-solid 从源码编译)由仓内既有构建与 e2e 覆盖,不在本冒烟范围。
- 浏览器仅 **Chromium**(headless);未验 Firefox/WebKit。
- 只跑了 VNextWorkerDemo(WASM lite worker 后端);full 变体 （excel-wasm/full）与
  TS worker 后端未在浏览器内实跑(但 TS worker chunk 已确认能被 webpack 正常切出)。
- node 22.12.0 只是构建/工具链版本;运行时是浏览器,与 node 版本无关。
- production mode 单次构建;未验 dev-server / HMR。
