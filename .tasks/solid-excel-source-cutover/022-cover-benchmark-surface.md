---
id: "022"
title: 补齐 benchmark 表面覆盖
kind: leaf
parent: W3
depends_on: ["006"]
discovered_from: "012"
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - excel/solid-excel/test/bench-registry.test.ts
  - excel/solid-excel/e2e/bench/bench-smoke.spec.ts
  - .tasks/solid-excel-source-cutover/reports/022-report.md
---

# 补齐 benchmark 表面覆盖

## 目标

为公共 benchmark registry 与 `/?bench=1` 路由补上正向自动化证据，关闭 C-005 的覆盖缺口。

## 粒度

一个单测验证场景注册契约，一个浏览器 smoke 验证公开路由可进入；两者共同证明同一个 benchmark 表面从登记到运行可用。

## 上下文

不改 benchmark 产品实现。测试使用已有场景与稳定可见信号，禁止复制内部实现或依赖易变耗时数字；新文件均须小于 300 行并各自只有一个测试层职责。

## 覆盖矩阵行

- `C-005`。

## 接口

### 消费

- `excel/solid-excel/bench/registry.ts`。
- `excel/solid-excel/demo/main.tsx` 的 `bench=1` 路由。

### 产出

- registry contract Jest 测试。
- benchmark route Playwright 正向 smoke。

## 验收标准

1. `npx jest excel/solid-excel/test/bench-registry.test.ts --runInBand` → 全绿。
2. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/bench/bench-smoke.spec.ts --project=wasm` → 全绿。
3. `npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 零诊断。
4. `npm run lint:check` → 零错误。
5. `wc -l excel/solid-excel/test/bench-registry.test.ts excel/solid-excel/e2e/bench/bench-smoke.spec.ts` → 各自不超过 300 行。
6. `git diff --check` → 零错误。

## 执行记录（仅编排者回写）

- 2026-08-31：由 012 的 F-012-2 发现并派发；仅补测试，不改 benchmark 产品实现。
- 2026-08-31：独立审查 `APPROVED`；registry contract 与 `?bench=1` 正向 smoke 足以关闭 C-005。
