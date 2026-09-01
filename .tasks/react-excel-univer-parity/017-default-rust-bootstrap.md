---
id: "017"
title: 组装 default Rust bootstrap 与 deterministic seed
kind: leaf
parent: M0
depends_on: ["016"]
discovered_from: null
model: gpt-5.6-sol
status: pending
created: 2026-09-01
done: null
base: null
priority: P0
stage: M0
coverage: ["C01a", "C01d2", "C01e2", "C01f", "C01g"]
files:
  - excel/react-excel/src/runtime/create-default-rust-workbook-runtime.ts
  - excel/react-excel/src/runtime/demo-seed.ts
  - excel/react-excel/test/default-rust-bootstrap.test.ts
  - excel/react-excel/src/index.ts
  - excel/react-excel/test/package-entry.test.ts
  - excel/react-excel/package.json
  - excel/react-excel/tsconfig.json
  - pnpm-lock.yaml
  - .tasks/react-excel-univer-parity/reports/017-report.md
---

# 组装 default Rust bootstrap 与 deterministic seed

## 目标与粒度

实现 index `createDefaultRustWorkbookRuntime`，在 backend ready transaction 中 seed 1000×8，并发布 M0 React public surface。预计 15–20 分钟。

## 确定性数据与事务

`demo-seed.ts` 导出 `DEMO_ROW_COUNT=1000`、`DEMO_COLUMN_COUNT=8` 与 generator，恰产 8,000 格。
A1=`=B1+C1`，B1=`40`，C1=`2`，所以 Rust projection A1 display=`42`；其余格按 row/column 纯函数生成。generator 从 `@einfach/excel-worker` root import 唯一 `toImportCellWire`，并复用 task003 的五类分类向量，禁止自写 parser。
generation factory：创建 client/backend，并把 `seedRustDemoWorkbook(client, generatedCells)` 作为 `afterInit`；只有 init→valid manifest→8,000 accepted、formula=1、errors/issues=0 后 resolve generation。
任一失败 dispose client/backend，绝不 publish 部分 workbook；retry 由 task016 调 factory 新建 Worker。package 只加 `@einfach/excel-worker`；React tsconfig 设置 `moduleResolution: "Bundler"`，明确不添加 excel-worker project reference，以直接消费 task002 的 private source exports。
`src/index.ts` 保留全部旧 exports，并追加 task016 store/hook、default factory 与 types；package-entry test 断言 root import 零 Worker side effect。task108 后续只能保留这些 export 并追加 S01 surface。

## 验收

- 修改 dependency/lock 后运行 `pnpm install --lockfile-only` 与 `pnpm install --offline --frozen-lockfile`，确保 `react-excel/node_modules/@einfach/excel-worker` workspace symlink 存在。
- `pnpm exec jest excel/react-excel/test/default-rust-bootstrap.test.ts excel/react-excel/test/package-entry.test.ts --runInBand --no-coverage` 覆盖 8,000坐标、五类共享分类向量、A1=42合同、afterInit顺序、seed reject dispose、retry新factory与 public export 零副作用。
- `pnpm exec tsc -p excel/react-excel/tsconfig.json --noEmit --pretty false` 与 `typecheck:demo` 通过，并真实解析 package root 与 `./wasm-worker-factory`；无 TS6305；Rust-only scan 通过。
- 两个 runtime 实现与 root index 均 ≤300 行。

写 `reports/017-report.md`；不提交。
