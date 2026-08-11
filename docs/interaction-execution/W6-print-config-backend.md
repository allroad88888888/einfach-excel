# W6：PrintConfig 后端权威存储

> 本波为 UI-516 的后端承接项。开始实现前必须先确认 PrintConfig 的最终权威层；不能把内存 Map
> 或 UI Atom 当作工作簿持久化事实。

| 来源 Issue                                 | 唯一模型                  | 判定           | 预期独占模块                                                                           | 前置   | 模型交付                                                                                           |
| ------------------------------------------ | ------------------------- | -------------- | -------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| UI-517 PrintConfig 后端持久化与 Worker RPC | `model-517-print-backend` | 待权威边界决定 | 一个确定的 engine 或 runtime adapter 路径、对应 Static/WASM/TS Worker 协议与持久化回归 | UI-516 | 定义权威存储、版本与 read/write 确认协议；让页面设置在重新加载、切换后端和导入导出后仍可准确读取。 |

## 已审计事实

- `SpreadsheetBackend` 仅声明可选 `readPrintConfig` 与 `setPrintConfig`；仓库没有两个端口的具体实现或运行时调用。
- Rust engine、TypeScript engine、WASM surface 和 Workbook Worker 协议尚未拥有 PrintConfig、页面区域、分页或页眉页脚的权威 API。
- UI-516 已要求精确 mutation ACK 与 read-back。没有 backend 端口时会阻止保存，避免把临时 UI 值伪装成已持久化配置。

## 必须先作出的决策

1. **Engine 原生权威（推荐）**：PrintConfig 属于工作簿语义，由 Rust/TS engine 保存并通过 Static、WASM、Worker 适配器一致暴露。该路径先补引擎 API，再接 RPC 与宿主。
2. **持久化 runtime sidecar**：PrintConfig 由适配器层的持久化工作簿快照拥有，而非短命内存 Map。该路径必须同时覆盖 Static、WASM、TS Worker、重启、导入和导出，并定义与工作簿版本的一致性。

两种方案都必须保证：后端/Worker 句柄不进入 Atom；Core 的 `printConfigStateAtom` 只保存确认后的读取缓存；页面设置会话 Atom 只保存 draft、提交阶段和安全恢复状态。

## 验收条件

- 同一 sheet 的保存能返回可验证 revision，并由 read-back 确认。
- 切换 Static、WASM 和 TS Worker 后读到相同配置语义。
- Worker 重启、工作簿重新加载以及导入导出不会无声丢失配置。
- 写入结果未知时仍维持 UI-516 的只读恢复，不重发可能重复的写入。
- 按已选权威层补齐 Core、adapter 与端到端回归，且每个新增或大改文件遵守单一职责与 300 行上限。
