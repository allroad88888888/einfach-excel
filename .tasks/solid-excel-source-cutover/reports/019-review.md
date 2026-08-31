# 019 独立审查

**REJECTED**。命令面与 worker wire 静态对照未见行为回归，但 command family 之间存在明确反向依赖，且 restore service 未经显式 context 注入，直接违反 019 的模块边界验收，C-018 不通过。执行报告中的测试、tsc 与 `git diff --check` 结果按要求未重跑。

## 质量发现

### Major — transfer command family 反向依赖 workbook command family，service 也未显式注入

`command-transfer.ts:15` 直接从同层的 `command-workbook.ts` 导入 `workbookRestoreServices`，并在 `:17-21` 组成模块级 `persistenceServices`。因此 transfer handler 看似只接收 `command-transfer.ts:23` 的 `{ state }`，实际上还依赖隐藏在闭包中的 workbook rebuild service。`runtime-dispatch.ts:7-14` 的 context 只定义了 `state`，没有把该 service 作为显式依赖传入。

同时，`command-workbook.ts:107-129` 在 workbook command 路由之外又导出整个 persistence restore 的 engine swap 实现，使该文件无法用单一的“workbook command family handler”职责描述。这不是行数问题，而是任务明示禁止的反向依赖与非显式 service context；执行报告“handler 只消费显式 `{ state }` context”的结论不充分。

建议将 workbook rebuild/restore 能力放入非 command-family 的单一职责 service 模块，或在公开装配壳创建后经 `RuntimeCommandContext` 显式注入；transfer handler 不应依赖另一 command handler 模块。

### Minor — `command-formulas.ts` 留有无使用的非命令路由类型

`command-formulas.ts:70-72` 导出 `RuntimeDirtyEvents`，全范围没有消费者，且 dirty event 装配已由公开 runtime 壳负责。这是可清理的遗留，不单独阻断。

## 逐条验收

1. **行数：字面通过。** `worker-runtime-ts.ts` 125 行；`runtime-dispatch.ts` 32 行；六个 `command-*.ts` 为 19–129 行，均正常格式且 ≤300。但 `command-workbook.ts` 的双重职责使 C-018 不能仅凭行数通过。
2. **定向 Jest：报告记录通过，本审查未重跑。**
3. **TypeScript：报告记录零错误，本审查未重跑。**
4. **Whitespace：报告记录通过，本审查未重跑。**

## C-013 与运行时契约

- 逐命令族对照 base inline switch：workbook/print/conditional-format、cell/projection、view metadata、import/export/snapshot/persistence、formula/name/debug、fail-closed unsupported 的全部公开 command 均恰好出现一次，未发现遗漏或重复处理。
- payload 转换、结果形状及 unsupported feature 文本与 base 一致；所有 handler 都 unhandled 时，`runtime-dispatch.ts:30` 仍返回 `UNKNOWN_COMMAND` / `unknown command: ...`。
- mutating command 集合与 base 一致。dispatch/handler 在首个 Promise yield 前同步完成命令变更，保持原有事件回调下的顺序；未引入额外并发状态。
- `worker-runtime-ts.ts:79-90` 仍先 post success/error response，再仅对成功的 mutating command post `cellsDirty`；错误 wire 仍经 `toRpcError` 生成。
- `worker-runtime-ts.ts:59-60` 仍在每次 `handle` 的 `finally` fire-and-forget pump，`:67` 的 `asyncPumpIdle()` 仍代理 pump idle。

因此 C-013 的静态命令面与 wire parity 通过；执行报告的测试证据本次未独立复验。

## C-018 与结构边界

- 公开壳已降至 125 行，仅保留导出、handler 装配、runtime/install 生命周期及 dirty 序列化，没有第二份 `RuntimeState`。
- handler 按六个内聚命令族分组，没有“一 case 一文件”或单一大杂烩 handler。
- 但上述 Major 表明 command-family 层仍有反向依赖、隐式 service 与双职责文件，故 C-018 **不通过**。

一句话回执：**REJECTED — 命令与 worker wire parity 保持，但 transfer→workbook command-family 反向依赖及隐式 restore service 违反 019/C-018 的显式边界要求。**

---

## R1 复审

**APPROVED**。上轮 Major 与 Minor 均已完整关闭，未发现新的阻断项。本轮仅复核指定修复点与行数，执行报告记录的 4 suites / 35 tests、TypeScript 与 `git diff --check` 结果按要求未重跑。

### Major 关闭证据

- **command-family 反向依赖已消失。** 六个 `command-*.ts` 之间没有任何 import；`command-transfer.ts:1-13` 只依赖 wire guard 与非 command 服务模块，不再导入 `command-workbook.ts`。
- **restore 已归入单一的 non-command lifecycle service。** `sheet-lifecycle.ts:51-60` 将 `rebuildForRestore` 定义为 workbook lifecycle replacement 能力，`:169-196` 完成 engine swap、print/conditional-format restore、session reset 与 custom-formula rebind。这与同文件 init/add/rename/remove/move 的“workbook lifecycle replacement”职责内聚，不是 command 路由层的附带实现。
- **service 经 context 显式注入。** 公开壳 `worker-runtime-ts.ts:71-91` 创建 lifecycle 与 persistence services，`:102` 将 `{ state, lifecycle, persistence }` 传给 dispatch；`runtime-dispatch.ts:9-18` 在 `RuntimeCommandContext` 中明确声明三者。`command-workbook.ts:10` 显式解构 lifecycle，`command-transfer.ts:15` 显式解构 persistence，不再通过模块闭包隐藏服务依赖。
- **`command-workbook.ts` 已恢复单一职责。** 文件现为 67 行，只定义并导出 workbook/print/conditional-format command-family handler；原 `workbookRestoreServices` 导出与 restore 实现均已移除。

### Minor 关闭证据

`RuntimeDirtyEvents` 已从 `command-formulas.ts` 删除；对 runtime 壳及整个 `worker-runtime-ts/` 目录搜索均无残留定义或引用。`command-formulas.ts` 现只保留 formula/name/debug command 处理。

### 行数复核

`worker-runtime-ts.ts` 为 172 行，`runtime-dispatch.ts` 36 行，六个 `command-*.ts` 为 19–95 行，`sheet-lifecycle.ts` 198 行，`persistence.ts` 62 行；目录内其余普通文件最大为 `cell-values.ts` 284 行。全部正常格式且 ≤300。

R1 一句话回执：**APPROVED — command-family 反向依赖与隐式 service 已消除，restore 归入单一 lifecycle service 并经 RuntimeCommandContext 显式注入，原 Minor 亦已清理。**
