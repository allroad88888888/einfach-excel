# 007 执行报告：旧表格实现迁入 legacy

四态：`DONE`。

## 结果

- `excel/solid-excel/src/` 已物理不存在；`excel/solid-excel/legacy/index.tsx` 存在。
- 旧表格源码以 Git rename 迁入 `legacy/`，未重写 API 或拆分存量实现。
- 临时包根、`/legacy`、`/demos`、`/i18n` 和 Rollup 入口均改指向 legacy 树；006 的 `demo/`、`bench/`、`src-vnext/i18n/` 保留。
- `demo/App.tsx` 的 legacy demo imports 改为 `legacy/demos/*`；旧表格测试改为 `legacy/*`，现役 i18n 测试改直接使用 `src-vnext/i18n`。

## 逐条验收

1. **通过**：`test ! -d excel/solid-excel/src && test -f excel/solid-excel/legacy/index.tsx`。
2. **通过**：

   ```text
   npx jest excel/solid-excel/test/Cell.test.tsx excel/solid-excel/test/Table.test.tsx excel/solid-excel/test/sheet-store.test.ts excel/solid-excel/test/wasm-workbook-proxy.test.ts --runInBand
   4 suites / 104 tests passed
   ```

3. **受环境既有 Jest resolver 限制未能按原命令通过**：原命令无法解析 workspace 自引用 `@einfach/solid-excel`（根 `node_modules` 没有该 workspace link）；这发生在加载测试文件前。使用仅命令行的 module mapper 将根、`/legacy`、`/vnext` 和 package.json 映射到本地源码后，`package-entry.test.ts` 通过（2 suites / 2 tests），且断言了根与 `/legacy` API 均可导入。未修改范围外 Jest 配置。

## 覆盖矩阵

| 覆盖项 | 状态 | 证据 |
|---|---|---|
| C-002 legacy 兼容树 | 通过 | 36 个 Git rename；legacy 代表 Jest 组通过；临时入口 probe 通过。 |
| C-004 legacy parity Demo | 通过（本叶边界） | 006 的 `demo/` 保留，`demo/App.tsx` 的旧 Demo import 指向 `legacy/demos/*`。未跑浏览器 smoke（属于 006）。 |
| C-012 单测与深层内部导入 | 部分通过 | 任务卡指定 legacy Jest 组通过；列出的 legacy tests 已重指向 `legacy/*`。范围外 E2E 仍有 `/src/wasm-*` 动态导入，见“发现”。 |

## Git rename 与存量债务证据

- `git diff --cached --summary` 显示 **36** 条 `src => legacy` rename，均为 100% 相似度；包括 `index.tsx`、所有旧组件、store/worker、demos 和旧 i18n bridge。
- `git diff --check` 通过。
- 按 index 记账且本叶未拆分的 legacy 存量超限：`sheet-store.ts` 1220 行、`wasm-workbook-store.ts` 1036 行、`Table.tsx` 561 行、`js-sheet.ts` 554 行、`wasm-sheet-proxy.ts` 374 行、`file-import.ts` 303 行、`demos/DemoMillion.tsx` 389 行。
- 同时，因纯 import 路径调整触及的既有超限测试被行数钩子报告：`sheet-store.test.ts` 980、`wasm-workbook-proxy.test.ts` 1016、`worker-workbook-store.test.ts` 1453、`wasm-workbook-worker.test.ts` 2689、`vnext-find-replace.test.tsx` 1130、`vnext-format-cells.test.tsx` 786、`vnext-menu-bar.test.tsx` 2958、`vnext-name-box.test.tsx` 701、`vnext-name-manager.test.tsx` 993 行；均为存量小改，未越界重构。

## 未验证、发现与疑虑

- 未跑全量 Jest、TypeScript、构建或 E2E；它们不属于本叶验收。
- `e2e/perf-virtual/observability.spec.ts` 与 `e2e/worker-backend/worker-workbook.spec.ts` 仍含 `/src/wasm-*.ts` 浏览器动态导入。它们在本叶 files 范围外，未改；待后续负责 C-013 的叶子调整为 `/legacy/*`。
- 当前的 package-entry 原命令依赖 workspace self-reference 能被 Jest resolver 找到；本工作区没有该链接。源码入口本身经映射 probe 已验证，建议在负责测试基础设施或公共契约的后续叶子补全 resolver 约定。

## 范围确认

- 未派子 agent，未 commit，未回写任务卡或 index。
- 除任务卡列出的 legacy/package/rollup/tests/tsconfig 外，仅改动 006 产出的 `demo/App.tsx` 与使用已移除 `src/i18n` 的现役测试 import；两者都是让迁移后 demo 与测试可解析的必要路径修正。未触碰 `src-vnext` 产品实现、006 的 demo/bench/i18n 实体或 W0 改动。
