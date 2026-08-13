# ADR 0001：进程内只允许一份 solid-js

- 状态：accepted
- 日期：2026-06-13（根因定位）；本 ADR 于 2026-07-30 从 `CLAUDE.md` 的叙述抽出成形
- 相关：`excel/solid-excel/test/provider-remount-1912.test.tsx`（契约测试）

## 背景

一个长期被归因为「solid-js 1.9.12 与 Provider 交互有 bug」的现象：`Provider` 下的消费者组件函数体
会在普通 atom 变更时重新执行，而不是只在挂载时执行一次。普通 atom 更新本身不会造成这种重执行；
当时把所有每实例状态搬进 `createSignal` 局部变量或 atom 的做法也没有触及根因。

## 根因

不是版本 bug，是**一个进程里存在两份物理的 solid-js**（历史上 `core/solid` → 1.9.5、
`excel/solid-excel` → 1.9.12）。

机制：A 份的 `createProvider` 用 **A 份自己的** `children()` memo 包裹 children。由 B 份实例化的
消费者无法 untrack A 份那个模块作用域里的 `Listener` —— 于是 children memo 订阅上了消费者的信号，
任何 atom 变更都会让它重跑。

**任一版本单独存在都是正常的；分裂本身才是 bug。** 这也解释了为什么换版本时好时坏。

## 决策

根 `pnpm.overrides` 钉死 `solid-js: 1.9.12`，并把「依赖图只能解析到一个物理的 solid-js 运行时」
作为不变式来守。

## 后果

- 校验方式：`grep -oE '^  solid-js@[0-9.]+' pnpm-lock.yaml | sort -u` 必须只输出
  `solid-js@1.9.12`。锚定依赖 stanza 可避免把 `@astrojs/solid-js` 误算成 solid-js 运行时。
- 契约测试 `excel/solid-excel/test/provider-remount-1912.test.tsx` 断言消费者函数体每次挂载
  只执行一次。它失败、或出现第二个 solid-js 版本时，**去修依赖图，不要在组件里绕**。
- 包内运行时无法可靠发现 resolver graph 中的第二个 Solid 分支，因此不新增开发期重复实例告警；
  这类告警必然存在假阳性或假阴性。
- 本决策不放宽状态归属：产品状态必须保留在 Einfach atoms。Solid 本地状态只可承载 DOM 引用、
  一次性测量值或动画帧临时变量等非产品性状态。
- 引入任何新的 Solid 相关依赖时，要确认它没有把 solid-js 拖成第二个版本。

## 备注

原始修复提交（`2b7d65e`）在 einfach 主仓的历史里，不在本仓 —— 本仓 2026-07-29 才拆出，
`pnpm.overrides` 是拆分时一起带过来的。
