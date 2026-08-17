# 配方：Nuxt 3（Vue）—— 引擎与 UI core，不挂 Solid 组件

> 事实来源：`docs/AD141_NUXT_SMOKE_OBSERVATION.md`（2026-08-17 仓外冒烟，通过）
> 及该冒烟工程的实际代码。
> **硬边界先说**：Nuxt 挂载不了 Solid 组件，`@einfach/solid-excel` 在 Nuxt 里只验证过
> 「能安装解析」，不渲染。可用的是三个框架中立包：`@einfach/excel-core-ts`、
> `@einfach/excel-wasm`、`@einfach/spreadsheet-ui-core`（SSR 构建 + 客户端运行均实跑）。

## 依赖清单（冒烟实测版本）

```jsonc
// package.json
{
  "dependencies": {
    "@einfach/spreadsheet-ui-core": "0.1.0",
    "@einfach/excel-core-ts": "0.1.0",
    "@einfach/excel-wasm": "0.1.0",
    "nuxt": "^3.17.0",             // 实测 3.21.11，内置 vite 7.3.6
    "vue": "^3.5.0"
  }
}
```

只要这三个中立包的话 `@einfach/solid-excel` / `solid-js` /
`@einfach/spreadsheet-ui-styles` 不必装。Node >= 22.12.0。

## 完整配置

```ts
// nuxt.config.ts —— 冒烟工程的全部配置，没有省略
export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
})
```

零特殊配置：不需要 vite/nitro 的 wasm 定制。Vite 会把包内
`new URL('einfach_wasm_bg.wasm', import.meta.url)` 发射为指纹资产
（`.output/public/_nuxt/einfach_wasm_bg.*.wasm`，2.2 MB），无参 `init()` 直接命中。

## SSR 规避（关键）

| 包 | 哪边能跑 | 写法 |
| --- | --- | --- |
| `@einfach/excel-core-ts` | **SSR + 客户端**（冒烟里两边各求值一次都得 43） | `<script setup>` 顶层同步调用 |
| `@einfach/excel-wasm` | **只能客户端** | `onMounted` 里动态 `import` + `await mod.default()`；结果段包 `<ClientOnly>` |
| `@einfach/spreadsheet-ui-core` | SSR + 客户端均可加载 | `<script setup>` 顶层 |
| `@einfach/solid-excel` | 不挂载 | 不 import 组件 |

## 代码片段（冒烟原样，节选）

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createWorkbook, keyFor } from '@einfach/excel-core-ts'

// (a) TS 引擎：SSR 与客户端都跑
const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
wb.setCell('s1', 0, 0, '6')        // A1
wb.setCell('s1', 0, 1, '7')        // B1
wb.setCell('s1', 1, 0, '=A1*B1+1') // A2
const value = wb.store.getter(wb.sheet('s1')!.formulaCellAtom(keyFor(1, 0))) // -> 43

// (b) WASM 引擎：仅客户端
const wasmResult = ref('pending')
onMounted(async () => {
  const mod = await import('@einfach/excel-wasm')
  await mod.default()
  const wbw = new mod.WasmWorkbook()
  if (wbw.sheet_count() === 0) wbw.add_sheet('Sheet1')
  wbw.set_number(0, 'A1', 6)
  wbw.set_number(0, 'B1', 7)
  wbw.set_formula(0, 'C1', '=A1*B1+1')
  wasmResult.value = `C1=${wbw.get_display(0, 'C1')}` // -> C1=43
})
</script>

<template>
  <ClientOnly>
    <p>{{ wasmResult }}</p>
    <template #fallback><p>ssr-fallback</p></template>
  </ClientOnly>
</template>
```

## 关键注意点

- WASM 结果的展示节点放 `<ClientOnly>`，避免水合不匹配；`import()` 放 `onMounted`，
  保证 wasm init 只发生在浏览器。
- pnpm 拦 esbuild postinstall（"Ignored build scripts"）可不 approve，构建照常通过
  （平台二进制走 optionalDependencies 已就位）。
- `@nuxt/cli` 对 `@nuxt/schema` 的 peer 警告是 nuxt 3 自身噪音，与 @einfach 包无关。
- excel-core-ts 在 Nitro（纯 node SSR）里可用 —— 冒烟顺带证明，但不构成对
  SSR 水合一致性的系统验证。

## 未验证

- worker 后端（`vnext-worker-factory`）、full WASM 变体（`@einfach/excel-wasm/full`）。
- `@einfach/spreadsheet-ui-styles` 的样式正确性（只装未 import）。
- Nuxt 4 / Vite 之外的 builder。浏览器仅 Chromium headless。
