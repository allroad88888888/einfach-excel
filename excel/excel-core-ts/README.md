# @einfach/excel-core-ts

TypeScript 公式引擎：分词器 + 解析器 + 求值器 + Workbook 数据模型。响应式那一层委托给
[`@einfach/core`](https://github.com/allroad88888888/einfach)（走 npm，见
[ADR 0002](../../docs/decisions/0002-upstream-core-via-npm.md)），本包只拥有公式逻辑与工作簿模型。

private 包，不发布。

## 它在栈里的位置

本包是 `einfach-excel-core`（Rust）的 TS 孪生实现，有两个现役用途：

1. **parity 参照** —— 同一批 e2e 与单测跑两个引擎，用来钉住行为一致性
   （矩阵见 `excel/solid-excel/e2e/BACKEND_PARITY.md`）。
2. **第二个 worker 后端** —— `excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` 持有本包的
   `Workbook`，实现与 Rust 版**同一套** worker 协议。这条路径不需要 WASM，纯 JS 可部署。

Rust 引擎仍是现役主引擎（excel-site 默认走它）。本包不是它的替代计划 —— 早期文档里
「用 TS 版取代 Rust 版」的叙事已经作废，那批规划稿在 `docs/archive/`。

## 结构

```
src/parser/        分词器 + 解析器（公式文本 → AST）
src/eval/          求值器
src/eval/functions/  内置函数注册表，按类别分文件（math / stats / text / date /
                     lookup / logical / financial / engineering / info /
                     database / array）
src/refs/          A1 地址与区间解析
src/workbook.ts    Workbook：多表、命名区间、变更入口
src/sheet.ts       单表状态与解析器接线
src/deps.ts        依赖图
src/propagation.ts 失效传播
src/types.ts       跨轨道公共契约（AST、Value、函数签名、变更形状）
```

内置函数的清单以各 `src/eval/functions/*.ts` 的 `FUNCTIONS` 导出为准，barrel 自动合并；
跨文件重名由测试拦截：

```bash
npx jest excel/excel-core-ts/test/functions-registry.test.ts --no-coverage
```

## 包边界

本包**只能**导入 `@einfach/core`。不得导入：

- `solid-js`、React，或任何 DOM 类型
- `worker` 全局、`postMessage`、`navigator`、`window`
- wasm-pack 产出的绑定
- 任何其他 `@einfach/*` 包（不含 `spreadsheet-ui-core`、`solid`、`react-*`）

必须能在纯 node 下跑干净。需要 worker / DOM 的适配器住在下游
`excel/solid-excel/src-vnext/adapter/`。

## 开发

```bash
npm run build -w @einfach/excel-core-ts                 # tsc
npx jest excel/excel-core-ts --no-coverage              # 本包全部单测
npx tsc --noEmit -p excel/excel-core-ts/tsconfig.json   # 只类型检查
```

## 文档

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) —— 分层、数据流、求值流程
- [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) —— 仓库级三层架构
- [docs/archive/](./docs/archive/) —— 建包期规划、多 agent 看板、一次性审计（冻结，仅供考古）
