---
id: "002"
title: 建立 private neutral worker 包
kind: leaf
parent: M0
depends_on: ["001"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01a"]
files:
  - excel/excel-worker/package.json
  - excel/excel-worker/tsconfig.json
  - excel/excel-worker/src/index.ts
  - excel/excel-worker/src/worker-like.ts
  - excel/excel-worker/test/package-boundary.test.ts
  - tsconfig.json
  - pnpm-lock.yaml
  - .tasks/react-excel-univer-parity/reports/002-report.md
---

# 建立 private neutral worker 包

## 目标与粒度

建立仅供 workspace private React demo 使用的 framework-neutral source package。预计 10–15 分钟；不写 RPC/runtime。

## 精确合同

`package.json`：name `@einfach/excel-worker`、version `0.0.0`、`private: true`、ESM；source exports 精确为
`.`→`./src/index.ts` 与 `./wasm-worker-factory`→`./src/wasm-worker-factory.ts`（后者由task011生产）。dependencies 只含 `@einfach/spreadsheet-ui-core` 与 `@einfach/excel-wasm`。不得修改 Solid metadata。

```ts
export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void
  terminate(): void
}
export type WorkerFactory = () => WorkerLike
```

## 验收

- `pnpm install --lockfile-only` 只加入新 workspace package 记录并保留 baseline lock 变化；随后 `pnpm install --offline --frozen-lockfile` 物化新包的 workspace dependency symlink。
- `pnpm exec tsc -p excel/excel-worker/tsconfig.json --noEmit --pretty false` 通过。
- `pnpm exec jest excel/excel-worker/test/package-boundary.test.ts --runInBand --no-coverage` 断言 private、两项 exact source exports 与依赖 allowlist。
- `node --test rules/react-rust-only-boundary.test.mjs` 通过；普通文件均 ≤300 行。

## 报告

写 `reports/002-report.md`，含 lock diff 摘要与命令；不提交。
