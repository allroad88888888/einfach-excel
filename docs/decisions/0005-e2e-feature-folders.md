# ADR 0005：e2e 按功能点分目录，每目录一份 CASES.md

- 状态：accepted
- 日期：2026-07-29 规划 / 2026-07-30 落地（`ce2815a`）
- 相关：`excel/solid-excel/docs/archive/E2E_FEATURE_FOLDER_PLAN_2026-07-29.md`（执行计划与 as-built）

## 背景

`excel/solid-excel/e2e/` 曾是平铺的 87 个 spec（约 19k 行）。平铺目录无法回答一个基本问题：
**「某个功能点覆盖了哪些场景、缺哪些？」** 缺口只能靠通读全部 spec 才能发现，实际上等于发现不了。

## 决策

1. **每个功能点一个目录**，边界对齐 `spreadsheet-ui-core/src/<feature>` 与
   `src-vnext/<feature>` 的模块划分。
2. 每个目录一份 **`CASES.md`**：枚举该功能点的全部 e2e 场景 —— 存量用例映射 + 缺口清单
   （本轮补 / 明确延后）。
3. `helpers.ts` 与 `BACKEND_PARITY.md` 留在 `e2e/` 根不动。

## 为什么这样可行（迁移不变式，当时已核实）

- `testDir: './e2e'` 递归拾取子目录 → 分目录**零配置**。
- 存量 spec 唯一的相对导入是 `./helpers`，迁移后改 `../helpers`；无 fixture / `__dirname` /
  `import.meta` 路径依赖。
- `--shard=x/4` 按测试**文件**均分，与目录层级无关；`workers: 1` + `fullyParallel: false` 不变。

## 后果

- `CASES.md` 成为「该功能点 e2e 覆盖」的权威说明，且**它的写法值得作为全仓文档口径的样板**：
  用「源码路径引用 + 单文件行数登记」代替全局计数，因此不会随套件增长而腐坏。
  相比之下，凡是写了「本套件有 N 个用例」的文档全都已经过期。
- 新增功能点的 e2e 时，先写/更新 `CASES.md` 的场景清单，再写 spec。
- 引用某条 e2e 用例时用 `e2e/<feature>/<file>.spec.ts` 路径 —— 平铺时代的
  `e2e/<file>.spec.ts` 路径全部失效。
- 代价：跨功能点的 spec（例如同时验证筛选与复制的场景）需要选一个主属目录，靠 `CASES.md`
  交叉引用而不是复制用例。
