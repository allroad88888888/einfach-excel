# 性能报告（生成产物）

本目录的 `.md` 全部由 `test/*.bench.ts` 写出，**不是手写文档**，重跑即覆盖。
生成器都由 `EINFACH_PERF=1` 门控，默认测试运行不会触发。

数字只对「那一次运行、那台机器」有效。要做性能判断请自己重跑，不要引用这里的历史数值。

- [perf-rust-bulk-import-trace-report.md](perf-rust-bulk-import-trace-report.md) — bulk import 分阶段 trace；生成器 `test/perf-rust-bulk-import-trace.bench.ts`
- [perf-rust-bulk-import-ultra-report.md](perf-rust-bulk-import-ultra-report.md) — bulk import 大 N 压测（需手改 wasm/src/lib.rs 抬 cap 才能复现）；生成器 `test/perf-rust-bulk-import-ultra.bench.ts`
- [perf-rust-storage-primary-report.md](perf-rust-storage-primary-report.md) — storage-primary 改造前后对比；生成器 `test/perf-rust-storage-primary.bench.ts`
- [perf-ts-vs-wasm-report.md](perf-ts-vs-wasm-report.md) — TS 引擎 vs WASM 引擎基准对照（含 2026-05-27/28 结论）；生成器 `test/perf-ts-vs-wasm.bench.ts`

重跑示例：

```bash
EINFACH_PERF=1 npx jest perf-ts-vs-wasm --no-coverage
```
