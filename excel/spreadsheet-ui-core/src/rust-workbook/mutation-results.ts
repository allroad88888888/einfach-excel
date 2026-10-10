import type {
  BackendMutationResult, VisibleProjectionResult, ViewportColumnWidth, ViewportRowHeight,
} from '../backend'

/** 一次写入的确认与同一 Rust 修订版可见区，不需要第二次刷新。 */
export interface RustSetCellInputResult {
  readonly acknowledgement: BackendMutationResult
  readonly projection: VisibleProjectionResult
}

/** 格式写入可同时返回受影响的尺寸（例如字号撑高行高）。 */
export interface RustSetRangeFormatResult extends RustSetCellInputResult {
  readonly sizes?: {
    readonly rowHeights: ViewportRowHeight[]
    readonly colWidths: ViewportColumnWidth[]
  }
}
