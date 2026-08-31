# 018 抽出 TS worker sheet lifecycle 边界报告

## 职责

- `worker-runtime-ts/sheet-lifecycle.ts`：原子执行 sheet init/add/rename/remove/move/rebuild 及其伴随状态迁移。
- `worker-runtime-ts.ts`：保留命令装配与分派，通过显式服务依赖调用 lifecycle。
- 013–017 服务：继续分别拥有 runtime state、cell 数据、transfer session、custom formula、viewport size；lifecycle 仅消费接口，不反向导入装配壳。

## 逐条验收

1. 通过：`wc -l excel/solid-excel/src-vnext/adapter/worker-runtime-ts/sheet-lifecycle.ts` 为 `149`，低于 300 行上限。
2. 通过：`npx jest excel/solid-excel/test/vnext-worker-sheet-rename.test.ts excel/solid-excel/test/vnext-print-config-runtime.test.ts excel/solid-excel/test/vnext-conditional-format-revision.test.ts --runInBand`，3/3 suites、6/6 tests 全绿。
3. 通过：`npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false`，零错误。
4. 通过：`rg -n '^function rebuildPreservingCells' excel/solid-excel/src-vnext/adapter/worker-runtime-ts.ts` 无结果。

补充通过：`npx jest excel/solid-excel/test/vnext-worker-ts-failclosed.test.ts excel/solid-excel/test/vnext-worker-runtime-resources.test.ts --runInBand`，2/2 suites、18/18 tests 全绿；`git diff --check` 无空白错误。

## 生命周期语义

- init 重建 workbook/sheet registry，清空 custom formulas、viewport、conditional formats、import/snapshot sessions，并重置 session id 计数器。
- add/rename/remove/move 统一走 rebuild；sheet 顺序、index、name 按命令结果生成，存活 sheet 的 cell 以 name 优先、原 index 回退恢复，公式以源码重新解析，typed literal 不经字符串重分类。
- workbook 替换后重绑定 custom formulas；rename/remove 分别迁移或清除 viewport size；rebuild 保留 print config 与 conditional-format revision/rules。
- 每次结构 rebuild 清空 import/snapshot session，但保留递增计数器，避免 stale session id 与新 session 碰撞。
- lifecycle 依赖由装配壳显式注入；新模块没有反向导入 `worker-runtime-ts.ts`。

## 覆盖矩阵

- C-013：通过（本叶）。TS backend 的 create/rename/remove/move/rebuild 行为已迁入 lifecycle 服务；指定 rename、print-config、conditional-format 回归与补充 worker resource/custom-formula 回归均通过。
- C-018：通过（本叶）。新增文件 149 行且只有 sheet registry 生命周期这一项职责；装配壳从前序任务的 774 行降至 662 行，连续迁移链保持单调下降。壳仍为临时超限文件，由已排定的 019 命令分派收口负责降至 300 行内。

## 行数变化

- `worker-runtime-ts.ts`：774 → 662，减少 112 行。
- `worker-runtime-ts/sheet-lifecycle.ts`：新增 149 行。

## 未验证 / 发现 / 疑虑

- 未验证：未运行浏览器 E2E 或全量 Jest；本叶指定测试、相关补充 worker 测试与 package TypeScript 检查已完成，完整双后端浏览器证据留给后续汇总。
- 发现：工作树包含 001–017 与其他任务的未提交改动；本叶仅修改 `worker-runtime-ts.ts`、新增 `sheet-lifecycle.ts`、写入本报告，没有覆盖或回退范围外改动。
- 发现：PostToolUse 正确提示装配壳 662 行仍超过 500 行；这是连续迁移链在 019 前的已知临时超限状态，不扩张本叶去迁移命令分派。
- 疑虑：无。
