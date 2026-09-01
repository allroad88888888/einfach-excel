---
id: "001"
title: 冻结 React Rust-only 边界
kind: leaf
parent: M0
depends_on: []
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01a"]
files:
  - docs/ARCHITECTURE.md
  - excel/react-excel/README.md
  - rules/react-rust-only-boundary.test.mjs
  - .tasks/react-excel-univer-parity/reports/001-report.md
---

# 冻结 React Rust-only 边界

## 目标与粒度

用可执行规则把 React/new worker 的产品路径限定为 Rust/WASM。预计 10–15 分钟；只改文档与扫描器。

## 上下文

保留 `baseline.md` 中已有 README 内容。扫描 `excel/react-excel/{src,demo,e2e,package.json}` 与
`excel/excel-worker/**`；新包尚未创建时允许目录缺席。禁止 token：`@einfach/solid-excel`、
`@einfach/excel-core-ts`、`worker-runtime-ts`、`worker-entry-ts`、`defaultExcelCoreTsWorkerFactory`、
`solid-js`、`@einfach/solid`。不得修改 `rules/.eslintrc`。

## 产出与验收

- 架构文档明确 React → private neutral worker → `@einfach/excel-wasm` → Rust，无 Static/TS fallback。
- 扫描器检查源码 import、package dependencies/peers、worker URL；fixture 注入任一禁用 token 必须失败并报路径。
- `node --test rules/react-rust-only-boundary.test.mjs` 通过。
- `git diff --check -- docs/ARCHITECTURE.md excel/react-excel/README.md rules/react-rust-only-boundary.test.mjs` 通过。

## 报告

写 `reports/001-report.md`：改动、命令、结果、保留 baseline 说明；不提交。
