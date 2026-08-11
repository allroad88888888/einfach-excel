# W3：运行时、可访问性和环境适配

> 这一波不把 Worker 或 DOM 临时测量强塞进 Atom。原则是：用户可见的期望、进度、错误和恢复由 Atom
> 持有；不可序列化的运行时句柄由每工作簿 runtime 持有。

| 来源 Issue | 唯一模型 | 判定 | 独占模块 | 前置 | 模型交付 |
| --- | --- | --- | --- | --- | --- |
| UI-501 批注线程 | `model-501-comments` | 重构后修复 | `src-vnext/comments/**`、`ui-core/src/comments/**` | IX-005 | 拆超限 core，补批注焦点/提交闭环；草稿继续为 Atom。 |
| UI-502 协作 Presence | `model-502-presence` | 修复 | `src-vnext/presence/**`、`ui-core/src/presence/**` | IX-001、IX-002 | 验证 transport/布局接线和覆盖层，不重建 remote cursor Atom。 |
| UI-503 保护和解锁 | `model-503-protection` | 重构后修复 | `src-vnext/protection/**`、`ui-core/src/protection/**` | IX-005 | 拆超限 core，统一解锁 dialog 交互和错误恢复。 |
| UI-504 打印预览 | `model-504-print` | 修复 | `src-vnext/print/**`、`ui-core/src/print/**` | IX-005 | 补 focus return、打印动作和语义标记；不改 print state。 |
| UI-505 通用 dialog / popover | `model-505-overlay-rollout` | 修复 | 每次只迁一个 `src-vnext/<feature>/**` surface | IX-005 | 以串行批次迁移既有浮层；不得并发改同一 feature surface。 |
| UI-506 状态栏、通知和诊断 | `model-506-feedback` | 补建 | `src-vnext/{status-bar,diagnostics,feedback}/**`、对应 core 模块 | IX-006 | 让诊断 Atom 产生可操作反馈；状态栏不承担 toast 的隐式替代。 |
| UI-507 初始化、切换和能力呈现 | `model-507-workbook-lifecycle` | 修复 | `src-vnext/provider/**` 的后续专属 batch | IX-001 | 统一 capability projection；禁止功能叶子各自 capture capability。 |
| UI-508 加载、中断和恢复 | `model-508-recovery` | 补建 | `src-vnext/recovery/**`（新）、`feedback/**` | IX-006 | 显示既有 idle/loading/error/retry Atom，不重做 core recovery。 |
| UI-509 键盘和读屏 | `model-509-a11y` | 修复 | `src-vnext/a11y/**`（新）与串行 surface adapters | IX-002、IX-005、UI-303 | 建立键盘/ARIA 契约并按 grid→menu→dialog 迁移。 |
| UI-510 国际化和 IME | `model-510-i18n-ime` | 修复 | `src-vnext/i18n-adapter/**`（新）、相关翻译测试 | IX-001、UI-104 | 覆盖非中英 locale、输入法组合与格式化；保留 locale Atom 同步。 |
| UI-511 窄屏、触控和触控板 | `model-511-responsive-input` | 重构后修复 | `src-vnext/responsive/**`（新）、专属 CSS | IX-002、IX-004、IX-005 | 定义响应式 shell 与 pointer/coarse 策略；不在各 dialog 分散硬编码。 |

## 验收顺序

1. 每个模型先跑其现有领域测试，确认基线；再写缺失测试。
2. 任何重新绑定焦点、键盘或 pointer 的节点必须补端到端路径和负向路径。
3. W3 结束后另安排独立模型跑全量 lint、类型、核心 Jest 和 Playwright，再由根节点审阅所有 diff。
