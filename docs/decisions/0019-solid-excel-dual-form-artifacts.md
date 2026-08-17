# ADR 0019：`@einfach/solid-excel` 以双形态交付

- 状态：accepted
- 日期：2026-08-17
- 相关：[AD-100：让人装得上（发布链路）](../adoption-issues/AD-100-publish-pipeline.md)（AD-115 → AD-116~124）、[ADR 0001](0001-solid-js-single-instance.md)

## 背景

Solid 的 JSX 不是运行时语义，必须经 `babel-preset-solid` 编译成响应式原语调用。库因此
面临三选一：交付源码（消费者编译）、交付预编译产物（库编译），或两者都给。当前
`@einfach/solid-excel` 的 `exports` 直指 `.tsx` 源码 —— 这在 workspace 内可用，对外
等于强制每个消费者配置 Solid 编译链，与「让人装得上」冲突。

## 决策

双形态交付，`exports` 每个入口同时给出：

```
"solid":   源码入口（.tsx / .ts）—— 消费者的 vite-plugin-solid 走此条件，编译最优
"types":   tsc 生成的 .d.ts
"import":  babel-preset-solid 预编译的 ESM
"default": 同上（CJS 或 ESM 兜底）
```

这是 Solid 生态库的标准做法（solid-primitives、Kobalte 同构）：装了 `vite-plugin-solid`
的用户拿源码获得最优编译与 SSR/hydration 兼容；任何其它打包器拿预编译产物开箱能用。

因此发布 `files` 必须同时包含预编译产物目录**与** `solid` 条件所指的源码目录 ——
源码进包不是泄漏，是交付形态的一部分。

## 后果

- 构建管线（AD-116）要为本包接入 babel-preset-solid 的 ESM/CJS 产出；`@types` 由既有
  `tsc -build` 声明输出承担。
- 每个子路径导出（`./vnext`、worker 运行时族、`./legacy` 等）都要成对维护双形态；
  `vnext-worker-factory` 不进 barrel 的约束（ADR 0004）不变。
- 预编译产物中对 `@einfach/excel-wasm`、`solid-js` 的 import 必须保持为外部引用，
  不得打进产物 —— 否则复发 ADR 0001 的双实例问题。
- 消费者文档需写明两条路径的差别与选择方法（AD-123 已落的单实例告诫同页维护）。

## 不在范围

- `solid-js` 及上游 `@einfach/*` 依赖的 peer 边界与版本范围（AD-121）。
- `files` 白名单的具体收敛与离体验证（AD-118、AD-124）。
- SSR 支持承诺 —— 双形态使其技术上可行，是否对外承诺另行裁决。
