> 🤖 **生成产物，不是手写文档。** 由 `test/perf-rust-storage-primary.bench.ts` 写出（`EINFACH_PERF=1` 门控）。
> 文中数字是**该次运行**的结果，不代表当前性能 —— 需要现在的数字就重跑生成器覆盖本文，
> 不要引用这里的数值做判断。

# Storage-primary vs legacy bulk import (Phase 6.1/6.2)

*Last run: 2026-06-11T10:46:21.215Z*

Legacy = `bulk_import_cells` (WorkbookLoader per-cell API). Storage-primary = `bulk_install_workbook` (map swap; formulas park lazily). Build = JS-side wire construction; call = RPC wall-clock (deserialize + engine).

| Tier | total cells | legacy build (ms) | legacy call (ms) | sp build (ms) | sp call (ms) | call speedup | crossSheetParsed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 500k | 500000 | 0.00 | 4662 | 40.3 | 279 | 16.7× | 0 |
| Mega (1M) | 1000000 | 0.00 | 8477 | 68.5 | 578 | 14.7× | 0 |

Probe cells (must match across paths — bench throws on mismatch):

- 500k: A1="94" B1="" C1="" D1="50431" A100="27" B100="127" C100="" D100=""
- Mega (1M): A1="71" B1="92" C1="" D1="" A100="94" B100="" C100="38" D100=""
