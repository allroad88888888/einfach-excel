# AD-141 Nuxt 仓外安装冒烟观察

日期:2026-08-17。状态:**通过**。

## 范围

验证 2026-08-17 发布到 registry.npmjs.org 的五个 0.1.0 包在**仓外** Nuxt 3（Vue）项目里可安装、
可解析；其中框架中立的三个包（`@einfach/spreadsheet-ui-core`、`@einfach/excel-core-ts`、
`@einfach/excel-wasm`）在 Nuxt/Vite/Nitro 工具链下真实可用（SSR 构建 + 客户端运行）。
`@einfach/solid-excel` 是 Solid 组件库，Nuxt 挂载不了 —— 本冒烟只验证它（连同 peer
`solid-js@^1.9.12`）能安装解析，不渲染。`@einfach/spreadsheet-ui-styles` 同样只验证安装解析。

## 环境

- 项目目录：一次性 scratch 目录
- `.npmrc`：`registry=https://registry.npmjs.org/` + `use-node-version=22.12.0`
  （本机全局 npm 配置指向镜像，必须显式覆盖到官方 registry）
- `pnpm exec node -v` → **v22.12.0**（pnpm 按 use-node-version 自动下载并钉住）
- pnpm 10.15.1；nuxt 3.21.11（`^3.17.0`）、vue 3.5.41、vite 7.3.6（nuxt 内置）
- 五包解析版本：全部 0.1.0；solid-js 1.9.14（满足 solid-excel 的 peer `^1.9.12`）

## 步骤

1. 手写最小 Nuxt 3 项目：`package.json`（五个 @einfach 包 + nuxt + vue + solid-js）、
   `nuxt.config.ts`（仅 compatibilityDate，零特殊配置）、单页 `app.vue`。
2. `app.vue` 三段：
   - (a) `@einfach/excel-core-ts`：`createWorkbook([{id:'s1',name:'Sheet1'}])`，
     `setCell` 写 A1=6、B1=7、A2=`=A1*B1+1`，经
     `wb.store.getter(wb.sheet('s1').formulaCellAtom(keyFor(1,0)))` 读回 `{kind:'number', value:43}`。
     顶层同步执行（SSR + 客户端都跑）。
   - (b) `@einfach/excel-wasm`：`onMounted` 里 `await import('@einfach/excel-wasm')` →
     `await mod.default()`（init）→ `new mod.WasmWorkbook()` → `set_number(0,'A1',6)`、
     `set_number(0,'B1',7)`、`set_formula(0,'C1','=A1*B1+1')` → `get_display(0,'C1')` 渲染 `C1=43`。
     结果段包在 `<ClientOnly>` 里。
   - (c) `@einfach/spreadsheet-ui-core`：`createSpreadsheetUi({ backend: 三方法 stub })`，
     返回对象含 store + backend 即渲染 `loaded`。
3. `pnpm run build` → 通过（client + ssr + nitro 三段构建零报错）。Vite 正确把
   wasm-pack `--target web` 产物里的 `new URL('einfach_wasm_bg.wasm', import.meta.url)`
   发射为指纹资产 `.output/public/_nuxt/einfach_wasm_bg.jZ2rOZad.wasm`（2.2 MB）——
   `init()` 无参调用即可命中，无需任何 vite/nitro 特殊配置。
4. `PORT=5196 node .output/server/index.mjs` 后台起服（`< /dev/null`），curl 200 确认存活。
5. Playwright（chromium，借 solid-excel 的 node_modules 经 NODE_PATH）探针 `probe.mjs`：
   goto → 等 `#wasm-result` 脱离 pending → 断言三个文本 + 零 pageerror。
6. 杀 server，确认 5196 释放。

## 结果

| 断言 | 期望 | 实际 | 结论 |
| --- | --- | --- | --- |
| excel-core-ts | `excel-core-ts: =A1*B1+1 -> 43` | 同左 | PASS |
| spreadsheet-ui-core | `spreadsheet-ui-core: loaded` | 同左 | PASS |
| excel-wasm | `excel-wasm: C1=43` | 同左 | PASS |
| pageerror | 0 | 0 | PASS |

probe 退出码 0，一次通过，无返工。

## 问题与解法

1. **pnpm 拦了 esbuild 的 postinstall**（"Ignored build scripts: esbuild"）。未 approve，
   直接 build —— 通过。esbuild 的平台二进制走 optionalDependencies（@esbuild/darwin-arm64）
   已就位，postinstall 只是校验，可以不跑。非阻塞。
2. **peer 警告**：`@nuxt/cli 3.37.0` 声明 peer `@nuxt/schema@^4.4.6`，实际 3.21.11 ——
   nuxt 3 自身的已知噪音，与 @einfach 包无关。非阻塞。
3. 预判过的 wasm 资产风险（Vite 对依赖内 `new URL(..., import.meta.url)` 的处理）**没有发生**：
   零配置即发射资产并可加载。记录在案是因为这是本冒烟最可能断的点。

## 解释边界

- 只证明「安装 + 解析 + 三个中立包在 Nuxt 构建产物里跑通一条最小路径」。不覆盖：
  solid-excel 组件的实际挂载（Nuxt 不能挂 Solid）、worker 后端路径（`vnext-worker-factory`）、
  spreadsheet-ui-styles 的样式正确性（只装未 import 使用）、full 变体 `@einfach/excel-wasm/full`。
- (a) 段在 SSR 与客户端各跑一次都得 43 —— 顺带证明 excel-core-ts 在纯 node（Nitro SSR）
  环境可用；但这不是对 SSR 水合一致性的系统验证。
- solid-js 解析到 1.9.14（范围内最新）。主仓钉 1.9.12 是 monorepo 单实例不变式，
  对本独立冒烟项目不适用。
- Playwright 借用主仓 solid-excel 的 node_modules（NODE_PATH 只读引用），未写入主仓。
