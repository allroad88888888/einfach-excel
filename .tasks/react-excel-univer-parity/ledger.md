# React Excel 执行台账

| id | stage | priority | status | base | report | review |
|---|---|---|---|---|---|---|
| 001 | M0 | P0 | done | b940da7480da6482fb75141d855bb8ebbbda7257 | reports/001-report.md | reports/001-review.md |
| 002 | M0 | P0 | pending | null | | |
| 003 | M0 | P0 | pending | null | | |
| 004 | M0 | P0 | pending | null | | |
| 005 | M0 | P0 | pending | null | | |
| 006 | M0 | P0 | pending | null | | |
| 007 | M0 | P0 | pending | null | | |
| 008 | M0 | P0 | pending | null | | |
| 009 | M0 | P0 | pending | null | | |
| 010 | M0 | P0 | pending | null | | |
| 011 | M0 | P0 | pending | null | | |
| 012 | M0 | P0 | pending | null | | |
| 013 | M0 | P0 | pending | null | | |
| 014 | M0 | P0 | pending | null | | |
| 015 | M0 | P0 | pending | null | | |
| 016 | M0 | P0 | pending | null | | |
| 017 | M0 | P0 | pending | null | | |
| 018 | M0 | P0 | pending | null | | |
| 019 | M0 | P0 | pending | null | | |
| 020 | M0 | P0 | pending | null | | |
| 101 | S01 | P0 | pending | null | | |
| 102 | S01 | P0 | pending | null | | |
| 103 | S01 | P0 | pending | null | | |
| 104 | S01 | P0 | pending | null | | |
| 105 | S01 | P0 | pending | null | | |
| 106 | S01 | P0 | pending | null | | |
| 107 | S01 | P0 | pending | null | | |
| 108 | S01 | P0 | pending | null | | |
| 109 | S01 | P0 | pending | null | | |
| 110 | S01 | P0 | pending | null | | |
| 111 | S01 | P0 | pending | null | | |
| 112 | S01 | P0 | pending | null | | |
| 113 | S01 | P0 | pending | null | | |
| 114 | S01 | P0 | pending | null | | |

## 状态规则

- `pending → running → done` 需要执行、独立 review、编排者亲验全部闭环。
- 每叶 review 使用派发前 workspace hash/patch → 完工差异；不把 baseline 算给执行 agent。
- M0 全 done 才允许 S01；S01 完成进入 `awaiting_user`，用户通过前不展开 S02。
