import type { ViewportRowHeight, ViewportColumnWidth } from './viewport-contracts'
import type { RustHistoryState } from '../history/rust-history-types'
import type { SheetVisibilityProjection } from '../viewport/hidden-state'
import type { CellRange, SheetRef } from '../shared'
import type {
  DisplayCell,
  ProjectionCancelToken,
  ProjectionRequestId,
  ProjectionRequestReason,
  ProjectionRevision,
} from './projection-primitives'

/** 工作簿可见区和显式区域读取的数据契约。 */
export interface VisibleProjectionRequest extends SheetRef {
  kind: 'visible-window'
  window: CellRange
  requestId: ProjectionRequestId
  reason?: ProjectionRequestReason
  revision?: ProjectionRevision
  cancelToken?: ProjectionCancelToken
}

export interface RangeProjectionRequest extends SheetRef {
  kind: 'range'
  range: CellRange
  requestId: ProjectionRequestId
  reason: ProjectionRequestReason
  revision?: ProjectionRevision
  cancelToken?: ProjectionCancelToken
}

export interface VisibleProjectionResult extends SheetRef {
  kind: 'visible-window'
  window: CellRange
  requestId: ProjectionRequestId
  revision?: ProjectionRevision
  cells: DisplayCell[]
  /** 当前窗口内由 rowStyle 持有的稀疏行高。 */
  rowHeights?: ViewportRowHeight[]
  /** 当前窗口内的稀疏列宽。 */
  colWidths?: ViewportColumnWidth[]
  /** 同一次原生命令返回的历史目录，不携带回放数据。 */
  history?: RustHistoryState
  /** 整张表的隐藏索引；不能只返回窗口内部分，否则屏幕外定位会漂移。 */
  visibility?: SheetVisibilityProjection
  truncated?: boolean
}

export interface RangeProjectionResult extends SheetRef {
  kind: 'range'
  range: CellRange
  requestId: ProjectionRequestId
  revision?: ProjectionRevision
  cells: DisplayCell[]
  truncated?: boolean
}

export interface RangeTsvExportRequest extends SheetRef {
  kind: 'export-range-tsv'
  range: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  rowsPerChunk?: number
  /**
   * FILTER-hidden source rows the export must NOT emit (§8.2 of
   * `excel/solid-excel/docs/archive/online-excel-parity/design-filter-hidden-rows.md`).
   *
   * Why this is an INPUT rather than something the adapter looks up:
   * filter visibility is a UI-core view fact (CANONICAL_OWNERSHIP §2 —
   * "UI-core 是唯一权威；backend 端口降级为可选持久化钩子"). The port is an
   * executor, never the authority. An adapter that consulted its own
   * `setFilterSort` snapshot would become a second source of truth and
   * could disagree with the live atom the small-range copy path reads —
   * which is precisely the size-dependent divergence this parameter
   * exists to remove.
   *
   * Contract for implementors:
   *   - Omitted / empty means "emit every row in the range", which is the
   *     pre-hardening behaviour and the only behaviour reachable until the
   *     S5 adapter flip stops compacting filtered rows out of the range.
   *   - Rows are 0-based SOURCE rows in the same coordinate space as
   *     `range`. Rows outside `range` are simply irrelevant.
   *   - `originAddr` in the result must name the first EMITTED row, not
   *     `range.rowStart` — it anchors relative-formula shifting on paste.
   *   - Chunked implementations must not emit a chunk that filters down to
   *     zero rows; the caller joins chunk texts with `\n` and an empty
   *     chunk would inject a blank line.
   *
   * This carries the FILTER subset only, never the manual ∪ filter union:
   * Excel skips filtered-out rows on copy but copies manually hidden rows
   * normally.
   */
  hiddenRows?: ReadonlySet<number> | readonly number[]
}

/**
 * Wave 8.4 — range screenshot. Host renders the rectangle to a raster
 * image and returns the encoded bytes. PoC only emits PNG; future hosts
 * may advertise additional `format` values.
 *
 * The port is OPTIONAL — UI core treats a missing implementation as
 * "feature absent" and hides the trigger surfaces (`copyAs.png` menu
 * entry, `Ctrl+Shift+P` accelerator) accordingly.
 */
export interface RangeImageExportRequest extends SheetRef {
  kind: 'export-range-image'
  range: CellRange
  /** Defaults to `'png'`; PoC only emits PNG. */
  format?: 'png'
  /** Defaults to `1` (CSS px). Set to `2` for retina output. */
  scale?: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  /**
   * FILTER-hidden source rows the render must skip — same ownership
   * contract and same coordinate space as `RangeTsvExportRequest.hiddenRows`.
   *
   * An image renderer has one obligation the text encoders do not: the
   * output GEOMETRY must shrink too. Skipping the paint while still summing
   * every row height into the canvas size yields a PNG with a blank band at
   * the bottom exactly as tall as the hidden rows. Implementors must drop
   * hidden rows from the height sum as well as from the paint.
   */
  hiddenRows?: ReadonlySet<number> | readonly number[]
}

export interface RangeImageExportResult extends SheetRef {
  kind: 'range-image'
  range: CellRange
  /**
   * Encoded image bytes. UI core wraps in a `Blob` for clipboard write;
   * `Uint8Array` keeps the result postMessage-friendly so a future host
   * can render in a worker without changing the contract.
   */
  bytes: Uint8Array
  width: number
  height: number
  mimeType: 'image/png'
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface RangeTsvExportResult extends SheetRef {
  kind: 'range-tsv'
  range: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  originAddr: string
  text: string
  estimatedBytes?: number
}

export interface RangeTsvExportChunk {
  startRow: number
  endRow: number
  text: string
}

export type RangeTsvChunkConsumer = (chunk: RangeTsvExportChunk) => void | Promise<void>

export interface RangeTsvChunkExportResult extends SheetRef {
  kind: 'range-tsv-chunks'
  range: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  originAddr: string
  estimatedBytes?: number
}
