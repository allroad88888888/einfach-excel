# @einfach/excel-wasm

einfach 表格栈的预构建 WASM 公式引擎（[ADR 0015](../../docs/decisions/0015-wasm-distribution-single-package.md)
裁决的单包双入口交付形态）。产物由 `excel/rust/wasm` crate 经 wasm-pack 构建，
**消费者不需要 Rust 工具链**。

## 入口

```js
import init, { WasmWorkbook } from '@einfach/excel-wasm' // lite（默认）
import init, { WasmWorkbook } from '@einfach/excel-wasm/full' // full（--features regex-formulas）
```

- **TS 消费者要求**：`lib` 须含 ES2023+（d.ts 用了 `Symbol.dispose`）与 `DOM`
  （web-target glue 引用 fetch/URL/WebAssembly），或开 `skipLibCheck`。实测口径：
  `lib: ["ESNext", "DOM"]` + `moduleResolution: "Bundler"` 下两个入口零错。
- **lite**：默认入口，REGEX* 求值为 `#NAME?`。
- **full**：REGEXMATCH / REGEXEXTRACT / REGEXREPLACE 可用，体积代价与语义差异
  （同名 LAMBDA / 宿主自定义公式会被内建遮蔽）见
  [`excel/rust/wasm/README.md`](../rust/wasm/README.md)。
- 取舍数据见 [WASM 变体取舍](../../docs/WASM_VARIANT_TRADEOFFS.md)。

## 构建（仓内开发者）

```bash
npm run build:wasm -w @einfach/excel-wasm        # lite → lite/
npm run build:wasm:full -w @einfach/excel-wasm   # full → full/
npm run build:wasm:both -w @einfach/excel-wasm   # 两个都要
```

`lite/` 与 `full/` 是构建产物目录，不进 git；构建末尾会剥调试名
（`scripts/strip-wasm-names.mjs`）并清掉 wasm-pack 生成的 `.gitignore`
（否则 npm 打包候选会被它干扰）。需要可读 panic 栈时用
`build:wasm:keep-names` / `build:wasm:full:keep-names`。
