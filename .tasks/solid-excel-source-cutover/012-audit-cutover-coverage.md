---
id: "012"
title: 审计源码扶正覆盖矩阵
kind: leaf
parent: W3
depends_on: ["010", "011", "020", "021", "022", "023"]
discovered_from: null
model: gpt-5.6-sol
status: done
created: 2026-08-31
done: 2026-08-31
base: 723082739d66140ac697a5a9c203a6fd99649d4a
files:
  - .tasks/solid-excel-source-cutover/reports/012-report.md
---

# 审计源码扶正覆盖矩阵

## 目标

只对照 C-001～C-018 盘点遗漏、运行整体验证并报告，不修改产品文件。

## 粒度

覆盖审计必须独立于实现；发现项由编排者新增 `discovered_from: 012` 叶子或登记遗留。

## 上下文

检查物理目录、public exports、旧别名、legacy parity、Demo/bench URL、仓内消费者、现行文档、构建产物和文件行数。archive 与日期化 observation 是允许残留，不得误报为产品路径漂移。

## 覆盖矩阵行

- `C-001`～`C-018`：逐行给证据与状态。

## 接口

### 消费

- index 覆盖矩阵与任务 001–011 的最终工作树。

### 产出

- `reports/012-report.md`：每行 `✅/❌/N/A`、命令、结果、漏项路径。

## 验收标准

1. `npm run check:docs && npm run lint:check && npm run check:cycles && npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` → 全绿或逐项记录失败。
2. `npm run build:publish` → 成功或记录失败。
3. `NO_PROXY=localhost,127.0.0.1 npm run e2e -w @einfach/solid-excel -- e2e/smoke/vnext-smoke.spec.ts e2e/demos/demo-budget.spec.ts e2e/worker-backend/vnext-worker-backend.spec.ts --project=wasm` → current、legacy、worker 三表面有证据。
4. `git grep -n 'src-vnext'` → 每个残留均属于 archive/日期化 observation/迁移 ADR allowlist，否则报告漏项。
5. `find excel/solid-excel/src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -print0 | xargs -0 wc -l` → 普通文件无未登记超限。

## 执行记录（仅编排者回写）

- 2026-08-31：011 R1 与发现叶 020 均复审通过后派发最终覆盖审计，model=`gpt-5.6-sol`。
- 2026-08-31：首轮审计发现 F-012-1（9 个现行文件残留）与 F-012-2（benchmark 正向覆盖缺失）；012 保持运行，派发 021/022 后复跑。
- 2026-08-31：021 R1 与 022 复审通过后进入 R1 总审计；必须重新确认 C-001～C-018 可关闭性。
- 2026-08-31：R1 报告虽全绿，但最终独立首审 `REJECTED`：stale 扫描遗漏已迁移旧 `src` 路径；派发 023 后再次复核。
- 2026-08-31：023 R1 复审通过后进入 R2；C-016 必须同时覆盖 `src-vnext` allowlist 与旧 `src` 迁移路径谓词。
- 2026-08-31：R2 最终独立复审 `APPROVED`；C-001～C-018 全部为 `✅/N/A`，行数 Minor 已校正为 553 文件/55666 行，任务树可关闭。
