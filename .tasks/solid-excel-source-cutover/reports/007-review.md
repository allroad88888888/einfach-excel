# 007 独立审查：迁移旧表格实现到 legacy 树

结论：**APPROVED**。

审查按任务要求只核对执行者已报告的测试证据，未重跑测试。当前叶的路径搬迁、legacy 消费面修正与临时源码入口达到验收目标；没有阻断项。

## 逐条验收

1. **通过**。当前 `excel/solid-excel/src/` 不存在，`excel/solid-excel/legacy/index.tsx` 存在。
2. **通过（采信报告）**。报告记录指定 4 个 suite 共 104 tests 通过；审查未重跑。
3. **通过，但原命令为环境不可核实**。报告记录原 Jest 命令在加载测试文件前因 workspace self-reference `@einfach/solid-excel` 无法解析而失败；当前工作区确实没有可供该 Jest resolver 使用的 workspace link。命令行 mapper probe 覆盖了根、`/legacy`、`/vnext` 与 package.json，并通过 2 suites / 2 tests。结合 `package.json` 中根入口和 `./legacy` 均明确指向 `legacy/index.tsx`，这是对本叶源码入口契约的充分替代证据，不判为实现缺口。真实打包/安装后的解析与产物内容仍应由 009/C-014 验证。

## 搬迁与行为核对

- `git diff --cached --summary` 恰有 **36** 个 `src => legacy` rename，全部为 **100% similarity**；缓存区统计为 0 insertions / 0 deletions。内容身份与 Git rename 历史均保留。
- 搬迁后的 legacy 实现没有被顺手重构。`legacy/App.tsx` 与 `legacy/i18n/index.ts` 的工作区变化是 006 已建立的新壳/i18n 实体的兼容桥：前者转发 `demo/App`，后者转发 `src-vnext/i18n`；被转发 i18n 实现保持原契约。未发现旧 Table/store/worker 行为改写。
- `legacy/index.tsx` 仍保留旧根 API 导出面，且包根与 `./legacy` 在本阶段都指向它；`./demos` 与 `./i18n` 临时入口分别指向 legacy bridge。未发现残留的旧 `src` 源码入口。
- `demo/App.tsx` 的 10 个 legacy demo imports 均已切到 `../legacy/demos/*`；现役 demos 与 i18n 分别来自 `src-vnext/demos`、`src-vnext/i18n`。`?legacy=1` 选择 legacy groups，未混入 current demo imports。
- legacy 单测已改为 `../legacy/*`；current i18n 及 vNext UI tests 已改为 `../src-vnext/i18n`。在 `legacy/`、`demo/`、`test/` 中未发现仍指向已删除相对 `src/*` 的可执行 import。
- 存量超限 legacy 文件仅作 rename；超限测试只改 import 或已有相邻小改，没有为满足行数规则顺手拆分。符合 one-file-one-thing 对“存量小改不扩张重构”的要求。

## 覆盖矩阵

- **C-002：通过本叶边界**。legacy 树、旧 API 根面、代表性单测与 mapped package probe 均有证据。
- **C-004：通过本叶边界**。本叶正确维持 006 的 parity demo，并完成 legacy import 重定向；浏览器 smoke 属于 006，非本叶重跑项。
- **C-012：通过本叶边界**。范围内 legacy tests 与 current i18n tests 已分流到正确物理树；全局深层导入收口仍由 008 与 012 完成。

## 质量发现

### Minor（非阻断）

1. `package.json#files` 已从 `src` 改为 `legacy`，但类型目录仍列为 `@types/src`，而临时根、`./legacy`、`./demos`、`./i18n` 的 types 条目均指向 `@types/legacy/**`。这不会否定本叶明确要求的源码导入 probe，但若在 009 之前直接打包，legacy 声明可能未被纳入 tarball。应在 009/C-014 的 pack contents 验证中修正并锁定。

### Info

1. `e2e/perf-virtual/observability.spec.ts` 与 `e2e/worker-backend/worker-workbook.spec.ts` 仍有 `/src/wasm-*` 动态导入。这两文件不在 007 files 范围内，覆盖矩阵也把双后端浏览器路径归于 C-013（014–019、006、012），而 008 随后还会让 current 源码占用 `src/`。因此不应由本叶越界修改，也不阻断 007；必须在 012 最终覆盖审计前迁到明确的 `/legacy/*` 路径并由相应 E2E 证据验证。
2. 部分 E2E CASES/注释仍写旧 `src` 路径，同属 011/012 的现行文档与残留审计边界，不是 007 的产品行为问题。

## 最终裁决

**APPROVED**：007 的三条验收均有充分证据，C-002/C-004/C-012 达到本叶阶段目标；仅有应由 009/C-014 收口的类型打包清单风险，以及明确属于后续 C-013/012 的 E2E 深层路径残留。
