// 旧 backend 的数据契约；React 查找不调用这些可选端口。
import type { CellCoord, CellRange, SheetRef, SpreadsheetError } from '../shared'
import type { ProjectionRevision } from './types'

export type FindReplaceStatus = 'idle' | 'searching' | 'ready' | 'error'

export type FindReplaceCapability = 'unknown' | 'unsupported' | 'find-only' | 'find-and-replace'

export type FindReplaceScope = 'sheet' | 'workbook' | 'current-selection'

export type FindReplaceTab = 'find' | 'replace'

export type FindReplaceTarget = 'displayValue' | 'formula'

export interface FindReplaceOptions {
  readonly caseSensitive?: boolean
  readonly wholeMatch?: boolean
  readonly regex?: boolean
  readonly searchFormulas?: boolean
  readonly scope: FindReplaceScope
}

export interface FindReplaceQuery {
  readonly needle: string
  readonly replacement?: string
  readonly options: Readonly<FindReplaceOptions>
}

export interface FindReplaceFormState {
  readonly activeTab: FindReplaceTab
  readonly needle: string
  readonly replacement: string
  readonly caseSensitive: boolean
  readonly wholeMatch: boolean
  readonly regex: boolean
  readonly searchFormulas: boolean
  readonly scope: FindReplaceScope
}

export interface FindMatch {
  readonly coord: Readonly<CellCoord>
  readonly sheetId: string
  readonly matchStart: number
  readonly matchEnd: number
  /**
   * Canonical backend-owned haystack selector for this span. Legacy search
   * transports may omit it so Find can remain navigable, but guarded Replace
   * requires a valid target captured by the private result ticket.
   */
  readonly target?: FindReplaceTarget
}

export interface FindCursorState {
  readonly status: FindReplaceStatus
  readonly currentIndex: number
  readonly totalCount: number
  readonly pageMatches: readonly FindMatch[]
  readonly error?: Readonly<SpreadsheetError>
}

/**
 * Honest local projection cap surface (audit D-12). `pageMatches` is bounded
 * at `MAX_FIND_PAGE` (500), so a replace-all command can acknowledge at most
 * the current local page. This status reports only how many acknowledged
 * entries the local projection accepted; it never claims canonical workbook
 * state or durable replacement of any prefix.
 */
export interface ReplaceAllCapInfo {
  readonly acknowledgedProjectionCount: number
  readonly totalCount: number
}

export interface FindRangeRequest extends SheetRef {
  kind: 'find-range'
  query: FindReplaceQuery
  pageSize: number
  pageOffset: number
  requestId?: number
  revision?: ProjectionRevision
}

export interface FindRangeResult extends SheetRef {
  kind: 'find-range'
  requestId?: number
  revision?: ProjectionRevision
  matches: FindMatch[]
  total: number
  pageOffset: number
  truncated?: boolean
}

export interface SearchRangeRequest extends SheetRef {
  kind: 'search-range'
  range: CellRange
  query: FindReplaceQuery
  pageStart: number
  pageSize: number
  requestId?: number
  revision?: ProjectionRevision
}

export interface SearchRangeResult extends SheetRef {
  kind: 'search-range'
  matches: FindMatch[]
  pageStart: number
  totalCount: number
  /** Legacy transports may omit this; guarded core commands require the exact safe request id. */
  requestId?: number
  revision?: ProjectionRevision
}

export interface ReplaceMatchInput {
  sheetId: string
  coord: CellCoord
  matchStart: number
  matchEnd: number
  /** Required canonical haystack selector copied from the private accepted-search ticket. */
  target: FindReplaceTarget
}

export interface ReplaceMatchesRequest {
  kind: 'replace-matches'
  coords: ReplaceMatchInput[]
  replacement: string
  requestId?: number
  revision?: ProjectionRevision
}

export interface ReplaceMatchesResult {
  replacedCount: number
  /** Legacy transports may omit this; guarded core commands require the exact safe request id. */
  requestId?: number
  revision?: ProjectionRevision
}

/**
 * Contract-level evidence that a mutation was rejected before application.
 * Generic promise rejection is deliberately not equivalent to this result.
 */
export interface ReplaceMatchesNotAppliedResult {
  readonly kind: 'replace-matches-not-applied'
  readonly applied: false
  readonly requestId: number
  readonly error: Readonly<SpreadsheetError>
}

export type ReplaceMatchesResponse = ReplaceMatchesResult | ReplaceMatchesNotAppliedResult

