# 配方：Next.js（React）—— 引擎与 UI core，不挂 Solid 组件

> 事实来源：`docs/AD140_NEXT_SMOKE_OBSERVATION.md`（2026-08-17 仓外冒烟，通过）
> 及该冒烟工程的实际代码。
> **硬边界先说**：Next 是 React 框架，Solid 的 JSX 编译/运行时与 React 不兼容，
> `@einfach/solid-excel` 的组件（SpreadsheetUiProvider、SpreadsheetGrid 等）
> **无法也不应在 Next 里渲染**。这条配方给你的是：公式引擎（TS + WASM）与
> headless UI core 在 Next 里的正确用法。

## 依赖清单（冒烟实测版本）

```jsonc
// package.json
{
  "dependencies": {
    "@einfach/spreadsheet-ui-core": "0.1.0",
    "@einfach/excel-core-ts": "0.1.0",
    "@einfach/excel-wasm": "0.1.0",
    "next": "^15.0.0",             // 实测 15.5.23（webpack 生产构建）
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

只要引擎/UI core 的话，`@einfach/solid-excel`、`@einfach/spreadsheet-ui-styles`、
`solid-js` 都**不必装**（冒烟装了它们只为验证「可安装解析」）。
`next.config` **不存在** —— 冒烟工程零 Next 配置。Node >= 22.12.0。

## SSR 规避（关键）

| 包 | 哪边能跑 | 写法 |
| --- | --- | --- |
| `@einfach/excel-core-ts` | **服务端 + 客户端都行**（纯 TS） | server component 里直接同步调用 |
| `@einfach/excel-wasm` | **只能客户端**（浏览器里 init） | `'use client'` + `useEffect` 里动态 `import` + `await mod.default()` |
| `@einfach/spreadsheet-ui-core` | client bundle 验证过；（Nuxt 冒烟证明其 SSR 侧也可加载） | `'use client'` 组件 |
| `@einfach/solid-excel` | **都不行**（不挂载） | 不 import 组件 |

## 代码片段（冒烟原样）

服务端求值（server component，prerender 时执行）：

```tsx
// app/page.tsx
import { createWorkbook, keyFor } from '@einfach/excel-core-ts'

function evalCoreTsFormula(): string {
  const wb = createWorkbook([{ id: 's1', name: 'Sheet1' }])
  wb.setCell('s1', 0, 0, '21') // A1
  wb.setCell('s1', 0, 1, '=A1*2') // B1
  const value = wb.store.getter(wb.sheet('s1')!.formulaCellAtom(keyFor(0, 1)))
  return value.kind === 'number' ? String(value.value) : 'unexpected' // -> "42"
}
```

客户端 WASM（`'use client'`）：

```tsx
// app/wasm-cell.tsx
'use client'
import { useEffect, useState } from 'react'

export function WasmCell() {
  const [display, setDisplay] = useState('pending')
  useEffect(() => {
    ;(async () => {
      const mod = await import('@einfach/excel-wasm')
      await mod.default() // 无参 init；wasm 资产由 webpack 自动处理
      const wb = new mod.WasmWorkbook()
      const idx = wb.add_sheet('SmokeSheet')
      wb.set_number(idx, 'A1', 21)
      wb.set_formula(idx, 'B1', '=A1*3')
      setDisplay(wb.get_display(idx, 'B1')) // -> "63"
    })()
  }, [])
  return <span>{display}</span>
}
```

UI core（stub backend，三必选方法契约见 `ui-core-only.md`）：
`createSpreadsheetUi({ backend })` 在 `'use client'` 组件里直接调用即可。

## 关键注意点

- `@einfach/excel-wasm` 无参 `init()` 在 Next 15 webpack 生产构建下**开箱即用**：
  wasm-bindgen 的 `new URL('einfach_wasm_bg.wasm', import.meta.url)` 被 webpack 转成
  静态资产 URL，无需 next.config 定制、无需把 `.wasm` 拷进 `public/`。
- `WasmWorkbook` 构造后不要假设默认 sheet 存在，用 `add_sheet()` 的返回索引操作。
- TypeScript：`lib` ≥ ES2023 + DOM（或 `skipLibCheck`）、
  `moduleResolution: "bundler"`（仓根 README 的已验证组合）。
- `@einfach/excel-core-ts` 无 `exports` 字段（main/module/typings），webpack 走
  `module` 解析通过；node 原生 ESM 直接 import 的行为未覆盖。

## 未验证

- worker 后端（`vnext-worker-factory`）在 Next 里的用法、full WASM 变体。
- Turbopack（冒烟是 webpack 生产构建）、App Router 之外的 Pages Router。
- `@einfach/spreadsheet-ui-styles` 的 CSS 实际 import。
