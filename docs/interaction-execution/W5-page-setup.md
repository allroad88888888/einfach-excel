# W5：打印设置入口

> 本波补齐已存在的页面设置会话到打印预览的正式用户路径；打印配置、可提交性与错误仍必须由现有
> `@einfach` Atom 和既有命令拥有。

| 来源 Issue                        | 唯一模型               | 判定                | 预期独占模块                                         | 前置           | 模型交付                                                          |
| --------------------------------- | ---------------------- | ------------------- | ---------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| UI-516 页面设置编辑与打印预览衔接 | `model-516-page-setup` | 已完成（`65be172`） | `src-vnext/print/**`、专属 Core print Atom、聚焦测试 | UI-504、IX-005 | 重构页面设置会话与严格提交契约，补齐 dialog、预览衔接与失败恢复。 |

## 审计约束

1. 先确定 `pageSetupDialogOpenAtom` 是否已有 draft、确认、取消和保存命令；不得用 Solid signal 复制页面配置。
2. 如果 Core 只有 open 标志而没有安全写入/确认契约，先按职责补 Atom/命令，不直接向浏览器 print API 写状态。
3. dialog 复用已有 overlay 焦点协议；补齐打开、编辑、确认/取消、Escape、焦点归还和失败恢复的聚焦回归。
4. 所有新增或大改文件不超过 300 行；不得顺手重写现有 Print preview 或 demo。

## 交付结论

- Core 原来的 open 标志和即时覆盖配置已按配置缓存、页面分隔符、页面设置会话、提交命令和提交领域职责拆开。
- 页面设置的 draft、阶段、错误和请求 ID 都由 Atom 持有；Solid 仅保留按钮元素引用和 overlay 的短生命周期焦点状态。
- 保存必须捕获 `setPrintConfig` 与 `readPrintConfig` 两个端口，收到精确匹配 sheet、请求和 revision 的写入 ACK 后，再精确 read-back；任一写入异常或不精确 ACK 都进入 `outcome-unknown`，只能执行只读恢复，绝不盲目重发写入。
- Page Setup 在 Print Preview 上层打开，复用通用 overlay 焦点协议；取消、Escape、Tab 焦点循环、关闭归还和失败停留均有聚焦回归。
- 定向验证为 4 个 Jest suite、35 个测试；Core 和 Solid TypeScript 均通过，范围 ESLint 无错误，Prettier 与 diff 检查通过。

## 已知后续边界

当前 backend 类型虽声明 `readPrintConfig` 与 `setPrintConfig`，但 Static、WASM 和 TS Worker 没有任何运行时实现。缺少端口时页面设置会安全地显示为不可提交，而不会伪造保存成功。其后端权威存储、持久化和跨运行时一致性另列为 [W6 / UI-517](W6-print-config-backend.md)，须先由产品决定最终权威层。
