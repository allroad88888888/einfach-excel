# 017 抽出 TS worker viewport size 边界报告

## 职责

- `worker-runtime-ts/viewport-sizes.ts`：维护 worker viewport 尺寸映射的归一化、变更、范围快照、持久化快照/恢复与 sheet 生命周期迁移。
- `worker-runtime-ts.ts`：仅在命令分派、持久化装配与 sheet 生命周期中调用该服务。

## 验收

1. 通过：`wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/viewport-sizes.ts` 为 `201`，低于 300 行上限。
2. 通过：`npx jest excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand`，2/2 测试通过。
3. 通过：`npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`，零错误。
4. 通过：`rg -n '^function (snapshotViewportSizes|setRowHeight|setColumnWidth|restorePersistenceSizes)' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` 无结果。

补充行为证据：`npx jest excel/solid-excel/test/excel-core-ts-runtime.test.ts --runInBand`，5/5 测试通过；覆盖尺寸取整、正数 px 校验、范围快照、persistence snapshot/restore。

## 覆盖矩阵

- C-013：通过。TS worker 的 row height / column width 写入、范围查询、排序、持久化 snapshot/restore 仍由同一份按 sheet name 映射提供；full-sheet persistence bound 仍为 `0xffffffff`，rename/remove/reset 调用已改为模块服务。
- C-018：通过（本叶）。新增 `viewport-sizes.ts` 201 行且单一职责；装配壳由 946 行降至 774 行，符合连续迁移链单调下降要求。装配壳仍超过 500 行，这是后续 018/019 的既有迁移目标，未在本叶越界重构。

## 范围与发现

- 未触碰 DOM 或 Grid store；未复制 RuntimeState，也没有反向导入壳。
- 未修改测试文件：指定资源测试用于装配资源边界，尺寸行为已由既有 `excel-core-ts-runtime.test.ts` 直接覆盖。
- 未验证：未运行浏览器 E2E 或全量 Jest；本叶验收未要求，且 C-013 的完整双后端浏览器证据留给 014–019/006 汇总。
- 发现：工作树存在其他并行任务的未提交改动；本叶仅新增 `viewport-sizes.ts` 并改动运行时装配接线。
- 疑虑：无。
