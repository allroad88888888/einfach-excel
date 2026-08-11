# W6：PrintConfig 后端权威存储

> 本波为 UI-516 的后端承接项。已确认 PrintConfig 属于工作簿语义，由引擎原生保存；不能把内存
> Map 或 UI Atom 当作工作簿持久化事实。

| 来源 Issue                                 | 唯一模型                        | 判定 | 预期独占模块                                            | 前置   | 模型交付                                                                                               |
| ------------------------------------------ | ------------------------------- | ---- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| UI-517 PrintConfig 后端持久化与 Worker RPC | `model-517-engine-print-config` | 完成 | 引擎状态、Static/WASM/TS Worker adapter、对应持久化回归 | UI-516 | 定义引擎权威存储、版本与 read/write 确认协议；让页面设置在重新加载、切换后端和导入导出后仍可准确读取。 |

## 已审计事实

- `SpreadsheetBackend` 仅声明可选 `readPrintConfig` 与 `setPrintConfig`；仓库没有两个端口的具体实现或运行时调用。
- Rust engine、TypeScript engine、WASM surface 和 Workbook Worker 协议尚未拥有 PrintConfig、页面区域、分页或页眉页脚的权威 API。
- UI-516 已要求精确 mutation ACK 与 read-back。没有 backend 端口时会阻止保存，避免把临时 UI 值伪装成已持久化配置。

## 已确认决策

**Engine 原生权威**：PrintConfig 属于工作簿语义，由 Rust/TS engine 保存并通过 Static、WASM、Worker
适配器一致暴露。实现顺序是引擎 API、持久化、RPC/adapter 与宿主读取；不得以 adapter sidecar
替代引擎事实。

后端/Worker 句柄不进入 Atom；Core 的 `printConfigStateAtom` 只保存确认后的读取缓存；页面设置会话
Atom 只保存 draft、提交阶段和安全恢复状态。

## 执行树

```text
UI-517 引擎原生 PrintConfig
├── A. 引擎事实与版本契约（完成，model-517-engine-print-config）
│   └── 每 sheet 配置、revision、深拷贝 read/write 与工作簿持久化
├── B. 运行时端口（完成，依赖 A）
│   └── Static、WASM Worker、TS Worker 的 read/set RPC 与精确业务 ACK
├── C. 宿主读取接入（完成，依赖 B）
│   └── 初次打开和切 sheet 时的配置 hydrate；只更新确认后的 Atom 缓存
├── D. 跨运行时验证（完成，依赖 A-C）
│   └── Static/WASM/TS parity、重启、重新加载、导入导出与未知结果恢复
└── E. 集成提交（完成，本提交）
    └── 范围审阅、文件行数、定向验证与单个 UI-517 提交
```

## 实施结果

- Rust `Workbook` 与 TypeScript workbook runtime 各自保存每个 sheet 的配置与单调 revision；新增、移动、删除 sheet 会同步该事实，读取和快照均返回深拷贝。
- WASM v1 persistence 以可选 `printConfigs` 字段兼容旧快照；恢复先在临时工作簿校验，成功后才替换 live workbook。
- Static、WASM Worker 与 TS Worker 都暴露真实 read/set port；写入 ACK 回显 `sheetId`、`requestId` 与 revision，页面设置继续以 read-back 确认结果。
- Preview 打开及活动 sheet 变更会 hydrate 已确认的 `printConfigStateAtom`；该 Atom 是缓存，不承载后端/运行时句柄。
- Static runtime 目前没有导入/导出 API，因此仅保证同一 workbook 生命周期内的配置保持；快照恢复语义由 WASM 与 TS Worker 覆盖，未把 Static 误称为跨重启持久化。

## 验收条件

- 同一 sheet 的保存能返回可验证 revision，并由 read-back 确认。
- 切换 Static、WASM 和 TS Worker 后读到相同配置语义。
- WASM 与 TS Worker 的快照恢复不会无声丢失配置；Static 没有导入/导出表面时仅维持 workbook 生命周期内的配置。
- 写入结果未知时仍维持 UI-516 的只读恢复，不重发可能重复的写入。
- 按已选权威层补齐 Core、adapter 与端到端回归，且每个新增或大改文件遵守单一职责与 300 行上限。
