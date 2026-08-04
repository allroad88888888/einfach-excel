// 一句话：一个 worker 后端实例持有的全部可变会话状态。

import type {
  CellRange,
  ConditionalFormatRuleEntry,
  FilterSortState,
  NamedRange,
  ProjectionRevision,
} from '@einfach/spreadsheet-ui-core'
import type {
  SparseRangeWire,
  WorkerRuntimeCapabilitiesWire,
  WorkerWorkbookClient,
} from '../worker-protocol'
import type { SheetLookup, WorkerWorkbookBackendSheet } from './types'
import type { WorkerWorkbookSpreadsheetBackendOptions } from './types'
import type { WorkerTransactionRecord } from './transaction-record'
import type { WorkerValidationRuleLayer } from './validation-overlay'

/**
 * Every field below used to be a `let` / `const` in the factory closure; the
 * operations that read and write them now take this object as their first
 * argument, so they can live in one module per feature instead of one
 * 3800-line function.
 */
export interface WorkerBackendState {
  readonly options: WorkerWorkbookSpreadsheetBackendOptions
  readonly client: WorkerWorkbookClient
  readyPromise: Promise<WorkerWorkbookBackendSheet[]>
  lookup: SheetLookup
  revision: ProjectionRevision
  autoFillOpaqueRevisionNamespace: string | null
  autoFillOpaqueRevisionEpoch: bigint
  disposed: boolean

  // Adapter host-overlay metadata (data validation, conditional format, merge,
  // named ranges) lives on the main thread: neither engine models these facts.
  // CANONICAL_OWNERSHIP (2026-07-19) transposed this pattern from "temporary
  // until the Rust workbook grows native support" to the sanctioned final form
  // for the overlay-class items (#04 merge, #21 conditional format, #22
  // validation rule storage) — the contract shape stays backend-canonical
  // while the facts live here.
  readonly validationRulesBySheetId: Map<string, WorkerValidationRuleLayer[]>
  readonly conditionalFormatRulesBySheetId: Map<string, ConditionalFormatRuleEntry[]>
  /**
   * Parity #04 — merge/unmerge on the worker path (adapter host-overlay).
   * The contract shape stays backend canonical (`DisplayCell.mergedSpan`
   * / `mergeAnchor` in projections, `mergeRange` / `unmergeRange` ports
   * with exact ACKs) while the merge facts live in this main-thread Map;
   * neither engine models merges and, per CANONICAL_OWNERSHIP, this
   * overlay is the sanctioned landing shape — not a stopgap.
   *
   * SESSION-ONLY boundary: persistence v1 snapshots do not carry merge
   * ranges, so workbook save/restore drops them by design (consistent
   * with the overlay definition — same boundary as the validation and
   * conditional-format overlays above). Bounded by sheet count × merges
   * per sheet; structural insert/delete remaps entries in place via
   * `shiftMergeRangeList` (W3 semantics) and undo/redo replays the
   * per-mutation before/after images recorded on the transaction log.
   */
  readonly mergeRangesBySheetId: Map<string, CellRange[]>
  /**
   * Parity item #29 (filter visibility = UI-core view fact). UI-core's
   * `filterSortStateAtom` is the canonical rule store; this Map is the
   * adapter's projection-side MIRROR of the last ACKed `setFilterSort`
   * payload — never read back by the UI, never a second truth source.
   * Bounded by the workbook's sheet count; rule payload size is bounded
   * upstream by ui-core normalization (`MAX_FILTER_LIST_VALUES`).
   */
  readonly filterSortStateBySheetId: Map<string, FilterSortState>
  /**
   * FILTER-hidden source rows per sheet — a MIRROR of the engine's owned filter
   * set, so the projection can withhold those rows without a per-frame round
   * trip and so the same projection contract holds across the WASM and static
   * backends (static withholds identically until its E6 flip).
   *
   * Since E5 the ENGINE owns and evaluates this set (design §4.2/§5): the mirror
   * is populated from `applyFilter`'s returned `hiddenRows`, NOT from a host
   * predicate scan. A structural row edit self-displaces the engine's set, and
   * this mirror follows with the same arithmetic (`shiftFilterHiddenOverlay`) so
   * the two never disagree about where a hidden row landed. It retires fully
   * when UI-core becomes the sole render authority (E7).
   */
  readonly filterHiddenRowsBySheetId: Map<string, Set<number>>
  /**
   * Bounded host-orchestrated undo/redo transaction log (cap
   * `WORKER_UNDO_STACK_CAP`, oldest dropped). One record per undoable
   * mutation, aligned positionally with the UI-core history stack's
   * backend entries. Cleared wholesale when sheet indices shift
   * (deleteSheet / reorderSheet — design point D): records address
   * sheets by positional index and a stale index would replay into the
   * wrong sheet.
   */
  readonly undoRecords: WorkerTransactionRecord[]
  readonly redoRecords: WorkerTransactionRecord[]
  namedRanges: NamedRange[]
  namedRangeMutationTail: Promise<void>
  autoFillMutationTail: Promise<void>
  /**
   * Fail-closed capability witness declared by the worker runtime itself
   * (see `WorkerRuntimeCapabilitiesWire`). `null` means the runtime made
   * no full-family claims — either it predates the
   * `describeCapabilities` handshake or it returned the scoped AutoFill
   * witness, or the client double does
   * not implement the method — and the adapter keeps the legacy
   * full-trust contract so the WASM path is behaviorally unchanged.
   * Until the handshake resolves the value stays `null` (full trust);
   * capability-gated ports are getters, so post-`ready()` reads see the
   * declared witness.
   */
  runtimeCapabilities: WorkerRuntimeCapabilitiesWire | null
  autoFillCapability: boolean

  // Wave 8.2 — content-change push for worker-initiated recomputes
  // (async custom-formula settles). The worker posts a cellsDirty event
  // after every settle; forwarding it lets the grid refetch the visible
  // projection without a user interaction.
  readonly contentChangeHandlers: Set<() => void>
  sheetIndexRemapDepth: number
  deferredContentChange: boolean
  readonly autoFillNativeMutationRanges: SparseRangeWire[]
  deferredAutoFillContentChange: boolean
  /** Unsubscribes the worker `cellsDirty` listener; installed by `backend.ts`. */
  offDirty: () => void
}
