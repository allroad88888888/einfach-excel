# AD-142 失败路径可读性走查

## 范围

本记录是 2026-08-17 对三类失败场景的错误可读性走查:缺 WASM 产物、worker 失败、
重复 solid-js。判定口径:失败时的报错是否指向明确解法。走查产出一项就地修复、
一个已立叶的缺口、一项文档覆盖确认。

## 场景 1:缺 WASM 产物 —— 缺口已就地修复

实测(临时移走 `excel/excel-wasm/lite/` 后跑 jest):默认报错是
`Could not locate module @einfach/excel-wasm mapped as: …` 加一段 moduleNameMapper
配置转储 —— 说了哪坏了,不说怎么修。

**修复**:`jest.config.mjs` 在配置加载期探测产物,缺失时定向报错并给出重建命令
(`npm run build:wasm -w @einfach/excel-wasm` / 根 `ensureWasm`)与工具链指引。
两态复验:缺失 → 定向报错;在场 → 套件正常。其余开发者路径本就自愈:根 `build`
链含 `ensureWasm`,playwright `webServer` 先跑 `build:wasm`。

## 场景 2:worker 失败 —— 缺口成立,立叶 AD-143

检视 `src-vnext/adapter/` 全部文件:RPC 层面的错误(`msg.error`)会 reject 对应
promise,dispose 会 reject 全部 pending;但 **Worker 实例本身的 `error` /
`messageerror` 事件没有任何监听**。后果:worker 启动即失败(生产环境 `.wasm`
未部署或 404、CSP 拦截 worker、错误的部署路径)时,所有 RPC promise 永远
pending —— UI 静默挂死,零报错,遑论指向解法。

该缺口的修复要动 `worker-protocol.ts` 的连接层,不属于走查的就地修复量级,
按外部反馈回写机制立独立叶子 **AD-143**(worker 启动失败的错误面)。

## 场景 3:重复 solid-js —— 文档覆盖确认

消费者侧症状(Provider 下 context 失效 / 组件重挂)在运行时无从自我解释;
覆盖方式是**事前声明**:README 稳定性声明与首发 release notes 均写明
peer 单实例要求与后果,根因分析在 [ADR 0001](decisions/0001-solid-js-single-instance.md)。
仓内检测为 lockfile 锚定 grep(CLAUDE.md,已修包名后缀误报)+ 契约测试
`provider-remount-1912.test.tsx`。运行期开发告警在 AD-123 已评估且刻意不做。

## 解释边界

走查在本仓修订与本机环境完成;场景 2 的结论基于源码检视(`onerror` 全目录零命中),
未构造真实 CSP/404 复现 —— 复现与修复验证归 AD-143。
