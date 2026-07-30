# 归档索引 —— @einfach/excel-core-ts

本目录是**冻结记录**：建包期的规划、多 agent 看板、一次性审计与会话交接。

注意两点：

1. 多份文档硬编码拆分前老仓的绝对路径 `/Volumes/work/self/einfach`，其中的 verify 命令
   在本仓无法执行；钉死的 commit 也不在本仓历史里。
2. `PLAN.md` 把「TS 比 Rust 慢」当前提，后续基准（见 `AGENT_COLLABORATION.md`）反转了这个结论。

现行入口：包定位与用法见 `../README.md`，分层见 `../docs/ARCHITECTURE.md`。

- [AGENT_COLLABORATION.md](AGENT_COLLABORATION.md) — 2026-05-26/27 多 agent 看板（Wave A-F 全 done），含函数 parity 验收清单
- [FUNCTION_QUALITY_2026-06-05.md](FUNCTION_QUALITY_2026-06-05.md) — 500/500 name parity 后的函数质量降级清单 —— 仍有 backlog 价值，但不是现状
- [KEY_GRANULAR_INVALIDATION.md](KEY_GRANULAR_INVALIDATION.md) — 键粒度失效 RFC（2026-06-12 implemented）；对应测试 test/audit-mutation-scaling.test.ts、test/key-granular-regressions.test.ts 仍在
- [PERF_BULK_IMPORT.md](PERF_BULK_IMPORT.md) — bulk import 分阶段基准（一次性，且写死拆分前的老仓路径）
- [SESSION_HANDOFF_2026-05-28.md](SESSION_HANDOFF_2026-05-28.md) — 会话交接（verify 块 cd /Volumes/work/self/einfach + 期望 tip 8eb692e，在本仓不可执行）
- [SESSION_HANDOFF_2026-06-05.md](SESSION_HANDOFF_2026-06-05.md) — 会话交接（自述把 05-28 那份定性为「考古」）
- [STASH_AUDIT.md](STASH_AUDIT.md) — 2026-05-27 对老仓 16 个 stash 的 DROP14/KEEP2 裁决；stash 不随拆仓迁移，纯考古
- [PLAN.md](PLAN.md) — 建包初期规划（开头自述「planning draft, no code yet」，包名 TBD）；其中「TS 比 Rust 慢 3-10×」的假设已被后续基准反转
