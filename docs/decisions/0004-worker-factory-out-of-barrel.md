# ADR 0004：worker 工厂不进 vnext barrel，走独立子路径导出

- 状态：accepted
- 日期：2026-07-30（`07150f0`）
- 相关：`excel/solid-excel/src-vnext/adapter/index.ts`、`excel/solid-excel/test/package-entry.test.ts`

## 背景

`src-vnext/adapter/worker-factory.ts` 通过 `import.meta.url` 解析它的 worker bundle。这是浏览器侧
正确的做法，但 jest 的 CJS transform 会原样保留 `import.meta`，node 随后拒绝求值：
`Cannot use 'import.meta' outside a module`。

把它 `export *` 进 adapter barrel 的后果是：**任何 import 该 barrel 的测试套件全部崩溃** ——
实测 37 个套件。崩溃点与 worker 无关，只因为顺着 barrel 被拖进来了。

## 决策

`worker-factory` **刻意不从** `src-vnext/adapter/index.ts` 重新导出。宿主通过独立子路径入口拿它：

```ts
import { createWorker } from '@einfach/solid-excel/vnext-worker-factory'
```

仓内调用方直接 `import './worker-factory'`。

## 后果

- `package.json` 的 `exports` 多一个 `./vnext-worker-factory` 子路径。宿主侧的真实用法见
  `excel/excel-site/src/spreadsheet/backends.ts`。
- barrel 文件里有一段解释性注释说明「这里为什么少一个导出」—— 没有它，后来的人会认为这是遗漏
  并「修好」它，从而复现 37 个套件的崩溃。
- `package-entry.test.ts` 把公共导出面钉死为「不含 worker URL 工厂」，防止回归。
- 通用原则：**凡依赖 `import.meta` 的模块都不要放进 barrel。** barrel 的传染性会把
  环境约束扩散到所有间接导入者。
