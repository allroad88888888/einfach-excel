# 005 收口现役 Demo 组件 — 完成报告（修复第 2 轮）

## 改动摘要

- 新增 `src-vnext/demos/index.ts` 作为唯一 Demo barrel，导出 `SpreadsheetSmokeDemo`、`SpreadsheetWorkerDemo`、`SpreadsheetTsWorkerDemo`、`SpreadsheetWorkbenchDemo`，并以同一导出绑定保留四个 `VNext*Demo` 兼容名称。
- 默认 App 已切换为 canonical 名称；保留既有 nav id 与 URL backend 选择行为。
- WASM worker Demo 明确拆为稳定配置 (`worker-workbook-config.ts`)、仅做 workbook 数据写入的 seed (`worker-workbook-seed.ts`)、debug/probe 生命周期 (`worker-lazy-probe.ts`)、probe logger 组件 (`WorkerLazyProbeLogger.tsx`) 与 workbook UI host (`WorkerWorkbookHost.tsx`)。
- 新增 Provider 内、无 DOM 的 `WorkerWorkbookRuntimeBootstrap`，专责默认 active-sheet/selection 初始化与 custom formula 注册/注销；由它组合 probe logger 和 UI host，host 不再承载运行时生命周期。
- workbench Demo 将静态 workbook seed 移到 `workbench-seed.ts`；所有 `src-vnext/demos` 文件均不超过 300 行。
- 菜单薄 UI 源码测试改为检查新 workbook host。

## 验收命令与结果

1. `find excel/solid-excel/src-vnext/demos -type f -print0 | xargs -0 wc -l`
   - 通过：最大文件为 `VNextWave5Demo.tsx`，237 行；其余文件均 ≤ 218 行。
2. `npx jest excel/solid-excel/test/vnext-menu-bar.test.tsx excel/solid-excel/test/package-entry.test.ts --runInBand`
   - 通过：2 suites、84 tests 全绿。
3. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts --project=wasm`
   - 通过：19/19 Playwright wasm smoke tests 通过。

## 已完成覆盖矩阵行与证据

| 行 | 状态 | 证据 |
| --- | --- | --- |
| C-003 默认 Demo 组件集合 | 完成 | App 使用四个 canonical Demo；wasm smoke 19/19 通过。 |
| C-009 `./demos` 导出面 | 完成（本叶子边界） | 唯一 `src-vnext/demos/index.ts` 导出 canonical 名称及 VNext 兼容别名；package-entry Jest 通过。 |
| C-018 Demo 文件行数 | 完成 | 修复后 `wc -l` 审计最大 237 行。 |

## 未验证项

- 未独立 import 未来 package `./demos` 的发布产物：当前 package export 指向 `src/demos/index.ts`，其公开路径切换由后续 009 负责。

## 范围外发现

- `test/vnext-menu-bar.test.tsx` 为 2958 行存量超限文件；本任务只做断言路径的必要小改，建议后续按菜单场景拆分测试文件。
- E2E 的 Rust/WASM 构建报告既有 unused-variable/dead-code 与 Vite JSX import-source warnings；不影响本次 19 个测试通过，未修改。

## 疑虑

- 文件名仍保留 `VNext*.tsx` 以降低深层路径兼容风险；公共 API 与默认 App 已采用 canonical 名称。

## 建议后续动作

- 009 切换 package `./demos` export 时，将其指向此唯一 canonical barrel，并补充发布产物导入断言。
