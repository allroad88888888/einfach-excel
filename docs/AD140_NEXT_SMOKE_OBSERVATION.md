# AD-140 Next 仓外安装冒烟观察

日期：2026-08-17。执行者：claude（子任务）。

## 范围

验证 2026-08-17 发布到 registry.npmjs.org 的五个 0.1.0 包在一个**仓外**、
**非 Solid**（Next.js / React）工具链里的可用性：

| 包 | 冒烟深度 |
| --- | --- |
| @einfach/spreadsheet-ui-core | 安装 + client bundle 加载 + `createSpreadsheetUi()` 真实调用 |
| @einfach/excel-core-ts | 安装 + 服务端（prerender）真实求值一条公式 |
| @einfach/excel-wasm | 安装 + client 动态 import + default init() + WasmWorkbook 全链路 |
| @einfach/spreadsheet-ui-styles | 仅安装解析（无 UI 消费方） |
| @einfach/solid-excel | 仅安装解析（Next 不能挂 Solid 组件，见「边界」） |

## 环境（精确版本）

- 工程目录：一次性 scratch 目录（独立于仓库）
- `.npmrc`：`registry=https://registry.npmjs.org/` + `use-node-version=22.12.0`
  （本机全局 npm registry 指向 http://npmjs.deepfos.com/ 镜像，必须显式覆盖）
- `pnpm exec node -v` → **v22.12.0**（pnpm 按 use-node-version 下载托管；宿主机 node 是 v24.14.0，被覆盖）
- pnpm 10.15.1
- next 15.5.23（webpack 生产构建）、react / react-dom 19.2.8、solid-js 1.9.14（仅作 peer 消解）
- typescript 5.9.3、@types/react 19.2.18、@types/node 22.20.1
- 五个 @einfach 包全部精确解析到 **0.1.0**

## 步骤

1. scratch 下新建最小 App Router 工程：`app/layout.tsx` + `app/page.tsx` +
   两个 client 组件；deps 含五个 @einfach 包 + solid-js（消解 @einfach/solid-excel
   的 `peer solid-js@^1.9.12`，不 import）。
2. `app/page.tsx`（server component）：`createWorkbook([{id:'s1',name:'Sheet1'}])` →
   `setCell('s1',0,0,'21')`（A1）、`setCell('s1',0,1,'=A1*2')`（B1）→
   `wb.store.getter(sheet.formulaCellAtom(keyFor(0,1)))` 读回 `{kind:'number',value:42}`，
   渲染进 `#core-ts-result`。API 从 `excel/excel-core-ts/src/index.ts` / `workbook.ts` /
   `sheet.ts` 只读查得。
3. `app/wasm-cell.tsx`（'use client'）：`await import('@einfach/excel-wasm')` →
   `await mod.default()`（无参 init，wasm 二进制走 webpack 对
   `new URL('einfach_wasm_bg.wasm', import.meta.url)` 的 asset 处理）→
   `new mod.WasmWorkbook()` → `add_sheet('SmokeSheet')` → `set_number(idx,'A1',21)` →
   `set_formula(idx,'B1','=A1*3')` → `get_display(idx,'B1')` → 渲染进 `#wasm-result`。
   方法名从 `excel/excel-wasm/lite/einfach_wasm.d.ts` 只读查得。
4. `app/ui-core-status.tsx`（'use client'）：`createSpreadsheetUi({ backend: stub })`
   （stub 只带三个必选方法 readVisibleProjection / readRangeProjection / setCellInput），
   校验返回 `{ store, backend }` 后渲染 `loaded` 进 `#ui-core-status`。
5. `pnpm run build` → 通过（Compiled successfully；类型检查含五包的已发布 d.ts；
   首页静态预渲染，core-ts 求值发生在 prerender 时）。
6. `pnpm run start`（`next start -p 5197`，后台、`< /dev/null`）→ Ready in 138ms，
   curl 200。
7. 浏览器探针 `probe.cjs`：`NO_PROXY=localhost,127.0.0.1
   NODE_PATH=/Volumes/work/self/excel/excel/solid-excel/node_modules node probe.cjs`，
   `require('@playwright/test')` 的 chromium 无头访问 http://localhost:5197/，
   等 `#wasm-result` 离开 `pending` 后断言。
8. 杀 server，确认 5197 释放。

## 结果

| 断言 | 期望 | 实际 | 判定 |
| --- | --- | --- | --- |
| `#core-ts-result`（excel-core-ts 服务端求值 =A1*2） | `42` | `42` | PASS |
| `#wasm-result`（excel-wasm 客户端 init + workbook =A1*3） | `63` | `63` | PASS |
| `#ui-core-status`（spreadsheet-ui-core client bundle 加载） | `loaded` | `loaded` | PASS |
| pageerror 计数 | 0 | 0 | PASS |

probe exit 0。`pnpm install` 干净安装五包无 peer 冲突（唯一告警：pnpm 默认拦了
sharp 的 build script，与本冒烟无关）。

## 遇到的问题与解法

- 无阻塞问题。两处预先规避：
  1. 本机全局 registry 是内网镜像，`.npmrc` 显式写 registry.npmjs.org，否则装不到
     刚发布的 0.1.0；
  2. `WasmWorkbook` 构造后不假设默认 sheet 存在，用 `add_sheet()` 的返回索引操作，
     对「新 workbook 是否自带 sheet」的两种实现都安全。
- 值得记录的顺利点：`@einfach/excel-wasm` 的无参 `init()` 在 Next 15 webpack 生产
  构建下开箱即用 —— wasm-bindgen 的 `new URL(..., import.meta.url)` 被 webpack 转成
  静态资产 URL，无需 next.config 定制、无需把 .wasm 拷进 public/。
- `@einfach/excel-core-ts` 的 package.json 无 `exports` 字段（只有 main/module/typings），
  webpack 走 `module` 字段解析 ESM，本冒烟通过；严格 `exports` 消费方（如 node 原生 ESM
  直接 import）行为未在本冒烟覆盖。

## 边界（明确不在本冒烟范围）

- **Solid 组件不挂载**：Next 是 React 框架，solid-js 的 JSX 编译与运行时和 React 不
  兼容，`@einfach/solid-excel` 的组件（SpreadsheetUiProvider 等）无法也不应在 Next 里
  渲染。本冒烟对它只验证「npm 安装可解析、peer（solid-js@^1.9.12）可消解」。Solid
  侧的真实挂载冒烟属于 Vite+Solid 工程（另行覆盖）。
- `@einfach/spreadsheet-ui-styles` 只验证安装解析，未 import 其 CSS。
- worker 后端（vnext-worker-factory）、双引擎 parity、full wasm 变体（`/full` 子路径）
  均不在本次范围。
