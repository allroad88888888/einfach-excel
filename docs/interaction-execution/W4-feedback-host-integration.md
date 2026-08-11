# W4：反馈入口装配

> 本波只处理已有 Atom 反馈契约到正式工作簿宿主的可见接线；不把浏览器 DOM、后端句柄或功能命令
> 重复写进新的 UI 状态。

| 来源 Issue | 唯一模型 | 判定 | 预期独占模块 | 前置 | 模型交付 |
| --- | --- | --- | --- | --- | --- |
| UI-515 全局诊断与恢复反馈入口 | `model-515-feedback-host` | 待审计 | 正式 workbook host/Chrome 入口、`diagnostics/**`、`feedback/**`、`recovery/**` | UI-506、UI-507、UI-508 | 先证明现有挂载路径与 retry/cancel 权限，再修复可见性和焦点路径；不新建第二份产品状态。 |

## 审计约束

1. 先定位 `SpreadsheetDiagnostics`、`SpreadsheetFeedbackSurface` 和 `SpreadsheetWorkbookRecovery` 的真实宿主；没有可安全重试的命令时不得伪造 Retry。
2. 诊断 dismiss、生命周期反馈 retry 与工作簿恢复操作继续由现有 Atom/调用方命令拥有；宿主只做投影、层级与 DOM 焦点。
3. 如果必须改共享 Chrome 或 Provider，模型须先报告精确文件和 Atom 边界，再实施；不得顺手迁移各功能表面。
4. 交付需有“命令失败 → 可见反馈 → dismiss 或已有 retry”的聚焦回归，并保持每份新增/大改文件不超过 300 行。
