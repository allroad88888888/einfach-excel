# einfach-excel Vite starter

最小可运行工程：`@einfach/solid-excel` + Vite + `vite-plugin-solid`（`solid`
导出条件走源码编译，worker 与 WASM 由 Vite 自动接线，零特殊配置）。
`src/main.tsx` 就是 [Quickstart](../../docs/QUICKSTART.md) 里那 20 行。

## 用法

```bash
npx degit allroad88888888/einfach-excel/templates/vite-starter my-sheet
cd my-sheet && npm install && npm run dev
```

或在线打开（免安装）：

- StackBlitz: <https://stackblitz.com/github/allroad88888888/einfach-excel/tree/main/templates/vite-starter>
- CodeSandbox: <https://codesandbox.io/s/github/allroad88888888/einfach-excel/tree/main/templates/vite-starter>

Node `>=22.12.0`。集成到既有工程见[配方页](../../docs/recipes/README.md)。
