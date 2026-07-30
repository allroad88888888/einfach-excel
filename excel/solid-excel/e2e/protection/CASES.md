# 保护锁定 — e2e cases

> 功能源码：excel/spreadsheet-ui-core/src/protection/（MAX_UNLOCKED_RANGES = 256，
> UI-core canonical，后端 port 仅为可选持久化镜像）+
> excel/solid-excel/src-vnext/protection/SpreadsheetProtectionUnlockDialog.tsx +
> 菜单入口：menu-bar-item-format.protectSheet / .unprotectSheet / .unlockRange
> 存量 spec 行数超限登记：无（vnext-protection-real-backend.spec.ts 70 行）

## 语义要点（按实现核实）

- 保护是 UI-core canonical：命令本地同步提交，worker 后端无 protection port 也全功能。
- 锁定拦截的用户可见形态是**编辑器拒绝打开**（dblclick 无 input、type-to-edit 无效）
  ＋**工具栏格式按钮禁用**（`isProtectionGated`）。没有 toast/横幅提示。
- 解锁对话框：demo 未传 `verifySheetProtection` → 密码不校验，Unlock 即本地提交；
  密码在每次 open/close 时清空；Escape/Cancel 关闭不提交。
- 保护变更**不产生 undo 历史**（设计如此，对齐 Excel，见 protection/README.md）。

## 场景表

| ID | 场景 | 步骤概要 | 关键断言 | 状态 | spec |
|---|---|---|---|---|---|
| PR-01 | 保护后编辑被拦、取消保护恢复 | worker demo：protect → dblclick/type → unprotect | 编辑器不打开、显示值不变；解除后可编辑 | ✅ 存量 | vnext-protection-real-backend #"protect sheet blocks the editor; unprotect restores editing" |
| PR-02 | 解锁 range 内可编辑、界外仍拦 | protect → 选 B4 → Format→Unlock range → confirm → 编辑 B4 / 试 A4 | 对话框 target 文案含行列；B4 可编辑提交，A4 仍被拦；unprotect 后 A4 恢复 | 🆕 本轮 | protection-unlock-range.spec.ts |
| PR-03 | 解锁对话框取消路径 + 密码重置 | 开 unlock → 输密码 → Escape → 重开 | 取消不解锁（目标格仍拦）；重开后密码框为空 | 🆕 本轮 | protection-unlock-range.spec.ts |
| PR-04 | 保护驱动工具栏格式按钮禁用/解锁恢复 | Wave5：protect → bold disabled → unlock B2 → 选 B2 enabled、选 C3 disabled → unprotect | toolbar-btn-bold disabled 状态随保护/解锁精确翻转 | 🆕 本轮 | protection-toolbar-gating.spec.ts |
| PR-05 | 锁定编辑拦截的 toast/提示 | — | — | ⏳ P2 延后 | —（无提示 UI：拦截即静默拒绝，PR-01/02 钉住现状；toast 属产品未实现面） |
| PR-06 | 密码验证失败流（错误密码被拒） | — | — | ⏳ P2 延后 | —（无 UI 入口：两个 demo 均未接 verifySheetProtection port，无校验即提交；错误分支已有 ui-core 单测 test/protection.test.ts 钉住） |
| PR-07 | 解锁 range 256 上限提示 | — | — | ⏳ P2 延后 | —（需 256 次解锁操作，e2e 成本不可行；cap 报错文案由 ui-core 单测钉住） |

## 备注

- PR-02/03 跑 vNext Worker demo（对齐存量 PR-01，证明无 port 后端全功能）；
  PR-04 跑 Wave5 静态 demo（其后端支持 setFormatRange，规避 TS worker 对 format
  port 的 fail-closed 差异，保证 wasm/ts 双 project 行为一致）。
- 解锁 target 文案（EN）：`Worksheet {sheetId}, rows {r}–{r}, columns {c}–{c}`，
  行列均为 1-based。
