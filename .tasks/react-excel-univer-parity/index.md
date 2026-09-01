# React Excel · Rust/WASM 工作簿任务树

创建：2026-09-01

## 目标与状态

把 `@einfach/react-excel` 默认 demo 接到真实 Rust/WASM 工作簿，以 Univer 风格分小批交付；每个用户阶段后停止等待验收。

- 树版本：`v4-minimal-rust-vertical`。
- v1/v2/v3 复审均为 `NEEDS_CHANGES`，证据在 `reports/tree-review*.md`；v4 通过复审前不派产品任务。
- 只展开 M0 与 S01；S02–S16 进入前再拆 10–20 分钟叶。
- 全功能映射见 `coverage.md`，阶段见 `stages.md`，执行状态见 `ledger.md`。

## 范围与 Rust-only 边界

- M0 只做 S01 所需：lifecycle/manifest、稀疏读取、单格写、1000×8 demo seed；不迁移 Solid 的 128 文件 adapter。
- React、demo、E2E 与 `excel/excel-worker/**` 只接 `@einfach/excel-wasm` → Rust `excel-core`。
- 禁止上述路径依赖/导入 `@einfach/solid-excel`、`@einfach/excel-core-ts`、`worker-runtime-ts`、
  `worker-entry-ts`、`defaultExcelCoreTsWorkerFactory`、`solid-js`、`@einfach/solid`。
- `@einfach/excel-worker` 首批是 private workspace source package；可发布 multi-entry artifact 另开阶段。
- Rust load/manifest/seed 失败显示 error/retry，禁止 Static/TS fallback。
- S01 backend own keys 精确为 `readVisibleProjection/readRangeProjection/setCellInput/ready/sheets/dispose`。

## 全局规则

- 产品状态归 UI-core、Rust engine 或显式 service；React 本地只放 DOM、测量、焦点、滚动窗口与瞬态动画。
- 写入必须经 UI-core `runEditingCommitAtom` 产生 requestId、Rust ACK、history reservation、projection refresh。
- 可见网格只读取 bounded window；1000 行不等于 1000 行常驻 DOM。
- 普通文件 ≤300 行；禁止 `part1`、大杂烩 `utils` 与跨职责合并。
- Agent 只读本 index 与自己的任务；只写 `files` 和自己的 report，不提交、不扩围。
- 并行叶只跑 targeted test；全包 typecheck/build 只在其所有 producer 完成后的 integration leaf 运行。
- 非转录任务独立 review；编排者亲验至少一条命令。S01 完成进入 `awaiting_user`，用户通过才展开 S02。

## 冻结的 M0 wire 与 runtime 合同

```ts
export type RustCommand =
  | 'initWorkbook' | 'sheetList' | 'describeCapabilities' | 'readSparseRange'
  | 'setCell' | 'setFormulaDetailed' | 'clearCell' | 'seedCells'

export interface RustSheetWire { id: string; index: number; name: string }
export interface RustSparseRangeWire {
  sheet: number; rowStart: number; rowEnd: number; colStart: number; colEnd: number
}
export type RustCellValueWire =
  | { type: 'null' }
  | { type: 'number'; value: number }
  | { type: 'text'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; value: string }
export interface RustCellSnapshotWire {
  addr: string; display: string; type: RustCellValueWire['type']; formula: string; isError: boolean
}
export interface RustImportCellWire {
  sheet: number; row: number; col: number
  kind: 'null' | 'number' | 'text' | 'boolean' | 'error' | 'formula'
  value?: number | string | boolean
}
export type RustFormulaResultWire =
  | { ok: true; installed: true }
  | {
      ok: true; installed: false
      code: 'INVALID_FORMULA' | 'FORMULA_CYCLE'
      message: string; display: '#VALUE!' | '#CYCLE!'
    }
export interface RustSeedStatsWire {
  accepted: number; formulas: number; rejectedFormulas: number; errors: number
  issues?: readonly { code: string; message: string; row?: number; col?: number }[]
}
export interface RustRuntimeManifest {
  runtime: 'rust-wasm'; protocolVersion: 1; commands: readonly RustCommand[]
}
export type RustRpcRequest = { id: number; cmd: RustCommand; payload: Readonly<Record<string, unknown>> }
export type RustRpcResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { code: string; message: string; detail?: unknown } }
```

Payload/result 映射：

| command | payload | result |
|---|---|---|
| initWorkbook | `{sheets?: readonly string[]}` | `readonly RustSheetWire[]` |
| sheetList | `{}` | `readonly RustSheetWire[]` |
| describeCapabilities | `{}` | `RustRuntimeManifest` |
| readSparseRange | `{range: RustSparseRangeWire}` | `readonly RustCellSnapshotWire[]` |
| setCell | `{sheet:number;addr:string;value:RustCellValueWire}` | `{ok:true}` |
| setFormulaDetailed | `{sheet:number;addr:string;formula:string}` | `RustFormulaResultWire` |
| clearCell | `{sheet:number;addr:string}` | `{ok:true}` |
| seedCells | `{cells:readonly RustImportCellWire[]}` | `RustSeedStatsWire` |

```ts
export interface WorkerWorkbookClient {
  initWorkbook(sheets?: readonly string[]): Promise<readonly RustSheetWire[]>
  sheetList(): Promise<readonly RustSheetWire[]>
  describeCapabilities(): Promise<RustRuntimeManifest>
  readSparseRange(range: RustSparseRangeWire): Promise<readonly RustCellSnapshotWire[]>
  setCell(sheet: number, addr: string, value: RustCellValueWire): Promise<{ ok: true }>
  setFormulaDetailed(sheet: number, addr: string, formula: string): Promise<RustFormulaResultWire>
  clearCell(sheet: number, addr: string): Promise<{ ok: true }>
  seedCells(cells: readonly RustImportCellWire[]): Promise<RustSeedStatsWire>
  dispose(): void
}
export function toImportCellWire(
  sheet: number, row: number, col: number, input: string,
): RustImportCellWire
export type RustCommandOutcome = { handled: false } | { handled: true; result: unknown }
export type RustCommandHandler = (
  context: RuntimeWorkbookContext, request: RustRpcRequest,
) => Promise<RustCommandOutcome>
```

共享 runtime context 是 init/projection/seed 的唯一状态真相：

```ts
export interface RuntimeWorkbookGeneration {
  readonly id: number; readonly workbook: RustWasmWorkbook
  initialized: boolean; seeded: boolean; projectionStarted: boolean; invalidated: boolean
}
export interface RuntimeWorkbookContext {
  initialize(sheets?: readonly string[]): RuntimeWorkbookGeneration
  requireInitialized(): RuntimeWorkbookGeneration
  beginProjection(): RuntimeWorkbookGeneration
  claimSeed(): RuntimeWorkbookGeneration
  invalidate(generationId: number): void
}
export interface RustWasmModule {
  default(): Promise<unknown>
  WasmWorkbook: new () => RustWasmWorkbook
}
export function createRuntimeWorkbookContext(
  wasm: RustWasmModule,
): Promise<RuntimeWorkbookContext>
```

Backend/session 合同：

```ts
export interface RustWorkerSheet { id: string; index: number; name: string }
export interface RustWorkerBackendOptions {
  client?: WorkerWorkbookClient; workerFactory?: WorkerFactory
  sheets?: readonly (string | { id?: string; name: string })[]
  revision?: number
  afterInit?: (client: WorkerWorkbookClient, sheets: readonly RustWorkerSheet[]) => Promise<void> | void
}
export interface RustBackendSession {
  readonly client: WorkerWorkbookClient
  ready(): Promise<readonly RustWorkerSheet[]>; sheets(): readonly RustWorkerSheet[]
  resolveSheet(sheetId: string): RustWorkerSheet
  revision(): number; assertRevisionCapacity(): void; bumpRevision(): number
  dispose(): void
}
export interface RustWorkerSpreadsheetBackend extends Pick<SpreadsheetBackend,
  'readVisibleProjection' | 'readRangeProjection' | 'setCellInput'> {
  ready(): Promise<readonly RustWorkerSheet[]>; sheets(): readonly RustWorkerSheet[]; dispose(): void
}
```

`initWorkbook` 产生 wire id `sheet-${index}`。session 按位置把 options 交给 Rust：string 只提供 name；
object 的非空唯一 `id` 覆盖对应 wire id；`index/name` 始终以 Rust 返回值为准，空 id、重复 id、数量错位均使 ready fail-closed。
`ready()` 是 lazy cached single-flight：并发/后续调用返回同一个 Promise，init/manifest/afterInit 各执行一次；
成功 sheets identity 稳定，失败在该 session 内 sticky，retry 必须新建 backend session。

## 冻结的 React 组合合同

```ts
export interface RustWorkbookReadyState {
  phase: 'ready'; backend: RustWorkerSpreadsheetBackend; sheetId: string
}
export type RustWorkbookRuntimeState =
  | { phase: 'loading' }
  | RustWorkbookReadyState
  | { phase: 'error'; error: Error }
export interface RustWorkbookGeneration { backend: RustWorkerSpreadsheetBackend; sheetId: string; dispose(): void }
export type RustWorkbookGenerationFactory = () => Promise<RustWorkbookGeneration>
export interface RustWorkbookRuntime {
  getSnapshot(): RustWorkbookRuntimeState; subscribe(listener: () => void): () => void
  retry(): void; dispose(): void
}
export function createRustWorkbookRuntime(factory: RustWorkbookGenerationFactory): RustWorkbookRuntime
export function createDefaultRustWorkbookRuntime(options?: { workerFactory?: WorkerFactory }): RustWorkbookRuntime
export function useRustWorkbookRuntime(runtime: RustWorkbookRuntime): RustWorkbookRuntimeState
export interface SpreadsheetWorkspaceBoundaryProps {
  runtime: RustWorkbookRuntime
  children(state: RustWorkbookReadyState): React.ReactNode
}
export function SpreadsheetWorkspaceBoundary(props: SpreadsheetWorkspaceBoundaryProps): JSX.Element

export interface UseSpreadsheetViewportResult {
  window: CellRange; cells: readonly DisplayCell[]; status: ProjectionStatus
  error?: SpreadsheetError; truncated?: boolean
  scrollTo(row: number, col: number): void; refresh(): Promise<void>
}
export interface SpreadsheetViewportGridHandle {
  scrollToCell(row: number, col: number): void; refreshProjection(): Promise<void>; focusGrid(): void
}
export interface SpreadsheetGridViewProps {
  window: CellRange; cells: readonly DisplayCell[]; selected?: CellRange
  getCellId?: (row: number, col: number) => string | undefined
}
export interface SpreadsheetViewportGridProps {
  sheetId: string; rowCount: number; colCount: number
  rowHeight: number; columnWidth: number; overscanRows?: number; overscanColumns?: number
  ariaLabel: string; ariaActiveDescendant?: string
  getCellId?: SpreadsheetGridViewProps['getCellId']
}
export const SpreadsheetViewportGrid: React.ForwardRefExoticComponent<
  SpreadsheetViewportGridProps & React.RefAttributes<SpreadsheetViewportGridHandle>
>
export type SpreadsheetSelectableGridProps = SpreadsheetViewportGridProps
export const SpreadsheetSelectableGrid: React.ForwardRefExoticComponent<
  SpreadsheetSelectableGridProps & React.RefAttributes<SpreadsheetViewportGridHandle>
>
export type SpreadsheetEditableGridProps = SpreadsheetSelectableGridProps
export const SpreadsheetEditableGrid: React.ForwardRefExoticComponent<
  SpreadsheetEditableGridProps & React.RefAttributes<SpreadsheetViewportGridHandle>
>
export interface UseSpreadsheetEditingCommitOptions {
  refreshProjection(sheetId: string): Promise<void>; focusGrid(): void
}
export interface SpreadsheetEditingCommitController {
  commit(move?: EditingCommitMove): Promise<EditingCommitOutcome>
  retryRefresh(): Promise<EditingCommitOutcome>
  lifecycle: EditingCommitLifecycleState
}
export function useSpreadsheetEditingCommit(
  options: UseSpreadsheetEditingCommitOptions,
): SpreadsheetEditingCommitController
```

## 任务树

- M0 (`group`): 001 → 002 → 003；003 → 004/005，005 → 006 → 007/008/009 → 010；004/007/008/009/010 → 011 → 012 → 013/014 → 015 → 016 → 017 → 018 → 019 → 020。
- S01 (`group`): 101/102/107 依赖 020；102 → 103 → 104；104/102 → 105 → 106；101–107 → 108；108 → 109 → 110 → 111 → 112 → 113 → 114。
- S02–S16 (`group`, backlog, 不可派发)：sheet/editing productivity、clipboard、structure、format、rules、data、formula、Table、file、print、chrome、mobile、services、RC。

## 任务名

| id | stage | 任务 | model | status |
|---|---|---|---|---|
| 001 | M0 | Rust-only boundary | gpt-5.6-sol | pending |
| 002 | M0 | private neutral package | gpt-5.6-terra | pending |
| 003 | M0 | exact RPC contract | gpt-5.6-sol | pending |
| 004 | M0 | RPC client | gpt-5.6-sol | pending |
| 005 | M0 | WASM surface | gpt-5.6-sol | pending |
| 006 | M0 | runtime generation context | gpt-5.6-sol | pending |
| 007 | M0 | workbook/manifest handler | gpt-5.6-sol | pending |
| 008 | M0 | projection handler | gpt-5.6-terra | pending |
| 009 | M0 | cell write handler | gpt-5.6-sol | pending |
| 010 | M0 | seed handler | gpt-5.6-sol | pending |
| 011 | M0 | dispatcher/factory | gpt-5.6-sol | pending |
| 012 | M0 | backend session | gpt-5.6-sol | pending |
| 013 | M0 | projection port | gpt-5.6-terra | pending |
| 014 | M0 | cell-input port | gpt-5.6-sol | pending |
| 015 | M0 | exact backend surface | gpt-5.6-sol | pending |
| 016 | M0 | React runtime store | gpt-5.6-sol | pending |
| 017 | M0 | default Rust bootstrap/seed | gpt-5.6-sol | pending |
| 018 | M0 | E2E infrastructure | gpt-5.6-terra | pending |
| 019 | M0 | Rust browser fixture gate | gpt-5.6-sol | pending |
| 020 | M0 | dependency/bundle audit | gpt-5.6-sol | pending |
| 101 | S01 | workspace surface | gpt-5.6-terra | pending |
| 102 | S01 | projection refresh controller | gpt-5.6-sol | pending |
| 103 | S01 | viewport grid wrapper | gpt-5.6-terra | pending |
| 104 | S01 | selection grid wrapper | gpt-5.6-terra | pending |
| 105 | S01 | canonical editing controller | gpt-5.6-sol | pending |
| 106 | S01 | editable grid wrapper | gpt-5.6-sol | pending |
| 107 | S01 | Univer tokens | gpt-5.6-terra | pending |
| 108 | S01 | React public exports | gpt-5.6-terra | pending |
| 109 | S01 | demo grid/data binding | gpt-5.6-sol | pending |
| 110 | S01 | demo Univer shell | gpt-5.6-terra | pending |
| 111 | S01 | default demo composition | gpt-5.6-sol | pending |
| 112 | S01 | core interaction E2E | gpt-5.6-sol | pending |
| 113 | S01 | failure/layout E2E | gpt-5.6-sol | pending |
| 114 | S01 | acceptance gate | gpt-5.6-sol | pending |

## 决策

- v2 broad migration 撤销：真实闭包需 53 个迁移 family，不属于首个 demo。
- v4 seed 通过 `afterInit` 进入 ready transaction；任一 issue invalidate/dispose 未发布 generation，retry 必须新建。
- v4 editing 只走 `runEditingCommitAtom`；S01 backend 无 undo/redo 时 recorder 明确返回 `unavailable`，不伪造 history。
- 后续 comments/presence/revisions 无真实 service 只验 fail-closed；connector 保持 Deferred。
