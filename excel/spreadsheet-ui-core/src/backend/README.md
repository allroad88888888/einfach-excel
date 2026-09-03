# backend

这里只定义框架无关的工作簿请求、结果和显示数据类型。目录名代表 Rust 引擎边界上的数据合同，
不代表存在一个 backend 对象；本目录禁止依赖 Worker、WASM、DOM、Solid 或 React。

真正的业务命令在 `../rust-workbook/` 注册，传输在 `../rust-worker/`。新增能力时应增加一条
明确的 Rust command，并复用这里对应的窄数据类型；禁止重新建立包含大量可选方法的统一接口。

投影合同必须按可见窗口或显式区域读取。UI Core 不得请求整本快照、公式缓存、依赖图或完整稀疏表。
批量变更同样使用区域、分块或单点请求，不能在 UI 层复制一套工作簿状态。

目录按一种数据职责一个文件拆分，例如 `projection-contracts.ts`、`cell-mutations.ts`、
`structure-contracts.ts` 和 `mutation-results.ts`。`types.ts` 只是兼容导出门面，不定义新类型。

## State Decision Template

- Source atoms: none.
- Derived atoms: none.
- Commands: none; commands live in `../rust-workbook/`.
- Scale bound: request/response contracts must be window/range based.
- Rust reads: implemented by explicit typed commands.
- Per-cell/per-row/per-col atom risk: not applicable.
- Tests: `test/backend*.test.ts`, `test/projection*.test.ts`.
