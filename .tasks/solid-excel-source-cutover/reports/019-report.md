# 019 执行报告

## 结果

- 状态：完成（修复第 1 轮）。
- 职责落位：`worker-runtime-ts.ts` 仅保留公开装配、安装、请求封装、mutating dirty 序列化与任务指定导出；`runtime-dispatch.ts` 仅负责 handler 链和 unknown fallback；六个 `command-*.ts` 分别负责 workbook、cell/projection、view metadata、transfer/persistence、formula/debug、fail-closed unsupported 命令族；`sheet-lifecycle.ts` 负责 workbook lifecycle replacement。
- 公开壳创建共享 lifecycle/persistence services，handler 只消费显式 `{ state, lifecycle, persistence }` context；command-family 之间零 import，且没有第二份 runtime state。

## 逐条验收

1. 行数门：通过。公开壳 172 行；目录内所有普通文件均不超过 300 行（完整清单见下）。
2. 定向 Jest：通过。4 suites / 35 tests 全绿。
3. TypeScript：通过。`npx tsc -p excel/solid-excel/tsconfig.json --noEmit --pretty false` 零错误。
4. Diff whitespace：通过。`git diff --check` 零错误。

## 契约保持

- command/payload/result：原 inline switch 原样按命令族迁移；命令字符串未改名。
- `UNSUPPORTED` 与 unknown：原 feature 文本及 `UNKNOWN_COMMAND` wire 保持；unsupported 命令仍 fail-closed。
- error wire：`handle` 仍以 `toRpcError` 生成失败响应；install 仍发送同一 `RpcResponseWire`。
- mutating queue / postMessage：mutating command 集合、成功响应后的 `cellsDirty` 顺序、默认 sheet/address 保持不变。
- async pump idle：每次 handle 的 `finally` 仍 fire-and-forget pump，`asyncPumpIdle()` 仍代理 pump idle。

## 覆盖矩阵

- C-013：TS backend 最终命令面由显式 handler 链覆盖；定向 fail-closed、undo、resources、projection 测试通过。
- C-018：原 662 行临时超限 runtime 壳关闭至 172 行；所有 runtime 子模块不超过 300 行；修复审查指出的 transfer→workbook 反向依赖与 workbook handler 双职责。

## 最终全目录行数

```text
  19 command-view.ts
  79 export-session.ts
  77 runtime-state.ts
  25 runtime-errors.ts
  54 command-transfer.ts
 284 cell-values.ts
  95 command-cells.ts
 198 sheet-lifecycle.ts
 153 import-session.ts
  55 command-unsupported.ts
  20 runtime-capabilities.ts
 168 custom-formulas.ts
  67 command-workbook.ts
 201 viewport-sizes.ts
  67 command-formulas.ts
 149 range-projection.ts
  86 defined-names.ts
  62 persistence.ts
  36 runtime-dispatch.ts
1895 total
 172 worker-runtime-ts.ts
```

## 未验证 / 发现 / 疑虑

- 未验证：未运行全仓 Jest、浏览器 E2E 或构建；本叶验收要求的定向 Jest、tsc、行数与 diff check 已全部执行。
- 发现：工作树包含其他叶子的既有改动；本任务未修改范围外产品文件。
- 疑虑：无；`RuntimeDirtyEvents` 无消费者类型已删除。
