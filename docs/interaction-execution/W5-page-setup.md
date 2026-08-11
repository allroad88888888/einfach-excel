# W5：打印设置入口

> 本波补齐已存在的页面设置会话到打印预览的正式用户路径；打印配置、可提交性与错误仍必须由现有
> `@einfach` Atom 和既有命令拥有。

| 来源 Issue | 唯一模型 | 判定 | 预期独占模块 | 前置 | 模型交付 |
| --- | --- | --- | --- | --- | --- |
| UI-516 页面设置编辑与打印预览衔接 | `model-516-page-setup` | 待审计 | `src-vnext/print/**`、专属 Core print Atom、聚焦测试 | UI-504、IX-005 | 审计页面设置 open/draft/submit/retry 契约；修复可编辑 dialog 与预览衔接，或证明必须先重构 Core。 |

## 审计约束

1. 先确定 `pageSetupDialogOpenAtom` 是否已有 draft、确认、取消和保存命令；不得用 Solid signal 复制页面配置。
2. 如果 Core 只有 open 标志而没有安全写入/确认契约，先按职责补 Atom/命令，不直接向浏览器 print API 写状态。
3. dialog 复用已有 overlay 焦点协议；补齐打开、编辑、确认/取消、Escape、焦点归还和失败恢复的聚焦回归。
4. 所有新增或大改文件不超过 300 行；不得顺手重写现有 Print preview 或 demo。
