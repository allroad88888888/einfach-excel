# ADR 0015：WASM 以单包双入口分发，产物由 CI 预构建

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-100：让人装得上（发布链路）](../adoption-issues/AD-100-publish-pipeline.md)（D2 → AD-101~110）、[WASM 体积测量协议](../WASM_SIZE_MEASUREMENT_PROTOCOL.md)、[WASM 变体取舍](../WASM_VARIANT_TRADEOFFS.md)

## 背景

`build:wasm` 把 wasm-pack 产物写进 `excel/solid-excel/wasm-pkg/`（full 变体写
`wasm-pkg-full/`），这两个目录不进 git；而 `@einfach/solid-excel` 的发布白名单是
`["src", "src-vnext", "README.md"]`。也就是说：即使今天发布，tarball 里没有任何 `.wasm`，
消费者装上也跑不起来。

同时要回答两件事：产物用什么形态交付，以及 lite / full 两个变体对外支持到什么程度。
若把编译责任推给消费者，等于要求每个用户安装 Rust 工具链与 wasm-pack —— 这与"让人装得上"
的目标直接冲突。

## 决策

### 单包，两个入口

WASM 产物从 `@einfach/solid-excel` 中独立出来，发布为 `@einfach/excel-wasm` 一个包，
lite 走默认入口、full 走 `./full` 子路径：

```
import init from '@einfach/excel-wasm'        // lite
import init from '@einfach/excel-wasm/full'   // full（regex-formulas）
```

worker 运行时相应改为从这两个入口消费：`worker-runtime.ts` → 默认入口，
`worker-runtime-full.ts` → `./full`。

选单包而非两个包名：两个变体是同一份 Rust 源码的不同 feature 组合，版本必须严格同步。
单包让版本天然一致，不必靠 changeset fixed 组人工锁死两个包名。

### 两个变体都对外支持

lite 与 full 都是对外交付物，不存在"内部变体"。两者的体积差与功能差按
[WASM 变体取舍](../WASM_VARIANT_TRADEOFFS.md) 的口径表述。

### 产物由 CI 预构建

`.wasm` 与 glue 由发布 CI 构建后随包发出。消费者不需要 Rust 工具链，不需要 wasm-pack，
不需要在 postinstall 编译。发布产物不得来自维护者本地构建。

## 后果

- 包内两份 `.wasm` 都会落到消费者的 `node_modules`；只有实际被 import 的那份进 bundle。
  安装体积与 bundle 体积是两个口径，对外表述不得混用。
- 发布 workflow 必须在 publish 之前跑完 wasm 构建，且构建失败即中止发布。
- AD-104 的完成判定不变且不可绕过：wasm-pack 会在产物目录生成 `.gitignore`，必须用实际
  `npm pack --dry-run` 确认 `.wasm` 出现在打包候选里，不能从"配了 `files` 字段"推断。
- `@einfach/solid-excel` 不再自带 WASM 产物，它对 `@einfach/excel-wasm` 的依赖关系需在
  AD-109、AD-110 的引用切换中一并落定。

## 不在范围

- 包内目录布局与 `--out-dir` 的具体路径（AD-102、AD-103）。
- `exports` 字段的最终写法与类型入口（AD-105、AD-107）。
- `strip-wasm-names.mjs` 在新构建链中的接入点（AD-106）。
- 体积优化手段本身（AD-514 只评估、不实施）。
