import type { CellRange, SheetRef } from '../shared'

type ProjectionRequestId = number
type ProjectionRevision = number | string

export type PrintOrientation = 'portrait' | 'landscape'

export type PrintScale =
  | { kind: 'percent'; percent: number }
  | { kind: 'fit'; pagesWide?: number; pagesTall?: number }

export interface ManualPageBreak {
  axis: 'row' | 'column'
  index: number
}

export interface HeaderFooterFields {
  left?: string
  center?: string
  right?: string
}

export interface PrintConfig {
  printArea?: CellRange
  manualPageBreaks: ManualPageBreak[]
  scale: PrintScale
  orientation: PrintOrientation
  header?: HeaderFooterFields
  footer?: HeaderFooterFields
}

export interface ReadPrintConfigRequest extends SheetRef {
  kind: 'read-print-config'
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface ReadPrintConfigResult extends SheetRef {
  kind: 'print-config'
  config: PrintConfig
  autoPageBreaks?: ManualPageBreak[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SetPrintConfigRequest extends SheetRef {
  kind: 'set-print-config'
  config: PrintConfig
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

/** Exact acknowledgement for a persisted print configuration mutation. */
export interface SetPrintConfigResult extends SheetRef {
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface PageSetupDraftPatch {
  orientation?: PrintOrientation
  scale?: PrintScale
}

export type PageSetupSaveOutcome =
  | 'completed'
  | 'blocked'
  | 'outcome-unknown'
  | 'refresh-failed'
  | 'stale'
