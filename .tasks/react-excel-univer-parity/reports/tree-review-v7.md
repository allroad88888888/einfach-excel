VERDICT: APPROVED

# React Excel · Rust/WASM 任务树 v7 最终独立门禁复审

复审日期：2026-09-01

产品基线：`fc174dfc7a9542ea6c198747d644d24c737f6a27`

范围：完整读取最新 `index.md`、012、014、015 与 `tree-review-v6.md`；复核
`coverage.md` / `stages.md` / `baseline.md` / `ledger.md`，并抽查 runtime、RPC、WASM、
projection、React retry、browser gate 与 acceptance 叶。本次只新增本报告，
不改产品/任务，不提交。

## 结论

v6 的两个阻断项均已以可实现、可定向验收的合同闭环，未发现新的
实现或验收阻断。任务树可以派发 001。

## v6 两项 finding 闭环

### 1. `ready()` lazy cached exact Promise / once transaction / sticky failure

- `index.md:146-162` 已把 `assertRevisionCapacity()` 加入 session 精确签名，并冻结
  lazy cached single-flight：并发/后续调用返回同一 Promise，init/manifest/afterInit
  各一次，sheets identity 稳定，失败在 session 内 sticky，retry 必须新建
  backend session。
- `012:33-41` 进一步要求 `ready` 是非 `async` 包装的普通方法，首次立即
  保存唯一 Promise；顺序是 `initWorkbook → describeCapabilities → exact validation
  → afterInit`，并且 targeted test 覆盖 Promise identity、三个外部阶段各一次、
  stable sheets、sticky rejection 与 new-session retry。
- `015:32` 规定每个 backend 只建一个 session；`016:32-37` 与 `017:38-45`
  将 UI retry 实现为新 generation/new Worker/new backend，没有在失败 session 上
  重放 init/seed。

裁决：该合同阻止 projection/write 每次 `await session.ready()` 时重建或重复
seed；并发、后续、失败与新 session retry 四条路径均已冻结。

### 2. cell-input 单 lane / pre-RPC capacity / failure non-poison

- `014:31-33` 规定每个 port 只有一条 Promise mutation lane，所有 caller 按调用
  顺序串行；每项 fulfill/reject 后都推进 tail，单次失败不 poison 后续。
- 每项在 ready/sheet resolution 后、任何单元格 mutation RPC 前执行
  `session.assertRevisionCapacity()`。MAX 前置拒绝且零 write RPC/零 canonical
  mutation；MAX-1 的两个并发请求经同一 lane 后最多一个进入 Rust。
- `014:37` targeted test 明确覆盖 MAX 零 RPC、MAX-1 最多一写、engine
  refusal 不 bump 且后续可继续。`015:32` 又冻结整个 backend 只创建
  一个 cell-input port，因此 lane 不会被每次方法调用重建而失效。
- 成功才 bump 并返回 strict ACK；formula `installed:true/false` 都是已应用
  mutation，structured refusal 才 reject。这与现有 UI-core 的“resolve 表示真实落地、
  无法应用必须 reject”合同（`backend/types.ts:1109-1118`）一致，也与真实
  WASM `trySetFormulaAt` 的 applied diagnostic 语义（`einfach_wasm.d.ts:672-681`）一致。

裁决：MAX/MAX-1 不再存在 rejection-after-mutation 窗口，失败也不会锁死
后续 mutation lane。

## 其余门禁

- **Exact interface**：`RustWorkerSpreadsheetBackend` 仍精确是 UI-core 三个 port 加
  `ready/sheets/dispose`（`index.md:153-156`）；`015:32-38` 仍要求
  `Reflect.ownKeys` 恰为六项，seed 不挂 backend。`014` 对 optional requestId 的回显与
  positive safe revision 满足 UI-core strict editing ACK 校验。
- **DAG / ownership**：脚本重算 34 叶、28 ready waves、0 未知依赖、0 环；
  所有同波写集冲突为 0，所有共享文件 owner 都有先后可达关系，不存在
  不可排序的写/写冲突。012/014 同波后在 015 集成，职责边界清晰。
- **Coverage**：当前横切矩阵 19 行与 34 叶 `coverage` 声明双向差集为 0；
  每行中 producer/export/composition/audit 的叶 id 与叶声明也双向一致。
- **粒度 / 行数**：34 叶均显式估时 10–20 分钟。全部任务文档物理行数
  ≤300（最大 `index.md` 281 行）；已存在且被列入修改范围的 8 个产品/配置
  文件全部 ≤300，最大为 `use-spreadsheet-viewport.ts` 255 行。新建文件按
  protocol/runtime/backend projection/backend mutation/React store 等单一职责分配，
  无 `partN`/`utils` 假拆分。
- **Rust-only**：001 扫描 React/demo/E2E/excel-worker 的 import、dependency 与 Worker URL；
  005 只暴露实际 lite WASM 存在的 fallible write/sparse read/bulk import surface；
  011/017/019/020 依次做 runtime、default composition、真浏览器与 bundle/dependency
  gate。未引入 TS core、Solid runtime 或 fallback 路径。
- **Baseline**：HEAD 等于声明基线；`baseline.md` 的 19 个 sha256 重算全匹配。
  worktree 除本未跟踪任务树外无其他改动。

## Residual risks（非阻断）

1. `014` 的“MAX 零 RPC”应在测试中计数单元格 mutation RPC，或先完成
   `session.ready()`；冷 session 的 init/manifest RPC 是前置生命周期必需，不应被误报
   为越过 capacity gate 的写入。
2. 012/014 的并发验收应用可控 deferred 卡住首个操作，再发第二个；
   否则只有两个已 settle Promise 的用例可能无法证明真正 single-flight/串行。
3. 012 与 017 均接近 20 分钟上界；若实施中 targeted test 超过 300 行，
   需按场景责任拆测试文件，不能以“测试”为由例外。
