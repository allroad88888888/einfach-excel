---
id: "108"
title: 发布首批 React public exports
kind: leaf
parent: S01
depends_on: ["101", "102", "103", "104", "105", "106", "107"]
discovered_from: null
model: gpt-5.6-terra
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: S01
coverage: ["C00", "C01g", "C02", "C06a", "C06b", "C06c"]
files:
  - excel/react-excel/src/index.ts
  - excel/react-excel/test/package-entry.test.ts
  - .tasks/react-excel-univer-parity/reports/108-report.md
---

# 发布首批 React public exports

## 目标与粒度

只更新 root barrel/allowlist，并作为所有 S01 src producer 的 typecheck gate。预计 10–15 分钟。

保留全部旧 exports、task017 已发布的 runtime store/hook/default factory/types 与 `./pointer-selection`；逐名追加 index 的 workspace、三个 forwardRef grid exports/props/handle、editing commit hook/controller/options、button及 types。
不 re-export worker factory/backend/import.meta URL，不新增旧 root 替代 subpath。

## 验收

- `pnpm exec jest excel/react-excel/test/package-entry.test.ts --runInBand --no-coverage` 旧 allowlist原样、新 allowlist精确、root零Worker side effect。
- 所有 S01 src producer 完成后 `pnpm exec tsc -p excel/react-excel/tsconfig.json --noEmit --pretty false` 通过；index ≤300行。

写 `reports/108-report.md`；不提交。
