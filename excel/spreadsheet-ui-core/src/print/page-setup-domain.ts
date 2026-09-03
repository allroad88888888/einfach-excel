import type {
  ReadPrintConfigRequest,
  ReadPrintConfigResult,
  SetPrintConfigRequest,
  SetPrintConfigResult,
} from '../backend'
import type { CellRange } from '../shared'
import type { PrintConfig, PrintScale } from './types'

export interface PageSetupOperationTicket {
  readonly sessionId: number
  readonly sheetId: string
  readonly mutationRequestId: number | null
  readonly refreshRequestId: number
}

export interface PrintConfigSource {
  readonly readPrintConfig?: (
    request: ReadPrintConfigRequest,
  ) => Promise<ReadPrintConfigResult>
  readonly setPrintConfig?: (
    request: SetPrintConfigRequest,
  ) => Promise<SetPrintConfigResult>
}

export interface PageSetupPorts {
  readonly source: PrintConfigSource
  readonly readPrintConfig: NonNullable<PrintConfigSource['readPrintConfig']>
  readonly setPrintConfig: NonNullable<PrintConfigSource['setPrintConfig']>
}

export function capturePageSetupPorts(
  source: PrintConfigSource | undefined,
): PageSetupPorts | null {
  try {
    if (source === undefined) return null
    const readPrintConfig = source?.readPrintConfig
    const setPrintConfig = source?.setPrintConfig
    if (typeof readPrintConfig !== 'function' || typeof setPrintConfig !== 'function') return null
    return { source, readPrintConfig, setPrintConfig }
  } catch {
    return null
  }
}

export function capturePageSetupReadPort(
  source: PrintConfigSource | undefined,
): Pick<PageSetupPorts, 'source' | 'readPrintConfig'> | null {
  try {
    if (source === undefined) return null
    const readPrintConfig = source?.readPrintConfig
    return typeof readPrintConfig === 'function' ? { source, readPrintConfig } : null
  } catch {
    return null
  }
}

/** Crosses the positive safe-integer boundary once, then descends without reuse. */
export function nextPageSetupIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function revision(value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0)
  )
}

function snapshotRange(value: unknown): CellRange | null {
  const source = record(value)
  if (source === null) return null
  const { rowStart, rowEnd, colStart, colEnd } = source
  if (
    typeof rowStart !== 'number' ||
    !Number.isSafeInteger(rowStart) ||
    typeof rowEnd !== 'number' ||
    !Number.isSafeInteger(rowEnd) ||
    typeof colStart !== 'number' ||
    !Number.isSafeInteger(colStart) ||
    typeof colEnd !== 'number' ||
    !Number.isSafeInteger(colEnd) ||
    rowStart < 0 ||
    colStart < 0 ||
    rowEnd < rowStart ||
    colEnd < colStart
  )
    return null
  return { rowStart, rowEnd, colStart, colEnd }
}

function snapshotScale(value: unknown): PrintScale | null {
  const source = record(value)
  if (source?.kind === 'percent') {
    return typeof source.percent === 'number' &&
      Number.isFinite(source.percent) &&
      source.percent > 0
      ? { kind: 'percent', percent: source.percent }
      : null
  }
  if (source?.kind !== 'fit') return null
  const pagesWide: unknown = source.pagesWide
  const pagesTall: unknown = source.pagesTall
  if (
    (pagesWide !== undefined &&
      (typeof pagesWide !== 'number' || !Number.isSafeInteger(pagesWide) || pagesWide < 1)) ||
    (pagesTall !== undefined &&
      (typeof pagesTall !== 'number' || !Number.isSafeInteger(pagesTall) || pagesTall < 1))
  )
    return null
  return {
    kind: 'fit',
    ...(pagesWide === undefined ? {} : { pagesWide }),
    ...(pagesTall === undefined ? {} : { pagesTall }),
  }
}

function snapshotHeaderFooter(value: unknown): PrintConfig['header'] | null {
  if (value === undefined) return undefined
  const source = record(value)
  if (source === null) return null
  const { left, center, right } = source
  if (
    (left !== undefined && typeof left !== 'string') ||
    (center !== undefined && typeof center !== 'string') ||
    (right !== undefined && typeof right !== 'string')
  )
    return null
  return {
    ...(left === undefined ? {} : { left }),
    ...(center === undefined ? {} : { center }),
    ...(right === undefined ? {} : { right }),
  }
}

/** Copies and validates a config before it may become Atom-owned product state. */
export function snapshotPrintConfig(value: unknown): PrintConfig | null {
  const source = record(value)
  if (
    source === null ||
    (source.orientation !== 'portrait' && source.orientation !== 'landscape')
  ) {
    return null
  }
  if (!Array.isArray(source.manualPageBreaks)) return null
  const manualPageBreaks = source.manualPageBreaks.map((breakInput) => {
    const pageBreak = record(breakInput)
    if (
      pageBreak === null ||
      (pageBreak.axis !== 'row' && pageBreak.axis !== 'column') ||
      typeof pageBreak.index !== 'number' ||
      !Number.isSafeInteger(pageBreak.index) ||
      pageBreak.index < 0
    )
      return null
    return { axis: pageBreak.axis, index: pageBreak.index }
  })
  if (manualPageBreaks.some((pageBreak) => pageBreak === null)) return null
  const scale = snapshotScale(source.scale)
  const printArea = source.printArea === undefined ? undefined : snapshotRange(source.printArea)
  const header = snapshotHeaderFooter(source.header)
  const footer = snapshotHeaderFooter(source.footer)
  if (scale === null || printArea === null || header === null || footer === null) return null
  return {
    orientation: source.orientation,
    scale,
    manualPageBreaks: manualPageBreaks as PrintConfig['manualPageBreaks'],
    ...(printArea === undefined ? {} : { printArea }),
    ...(header === undefined ? {} : { header }),
    ...(footer === undefined ? {} : { footer }),
  }
}

export function hasExactPageSetupMutationAcknowledgement(
  value: unknown,
  sheetId: string,
  requestId: number,
): boolean {
  const acknowledgement = record(value)
  return (
    acknowledgement !== null &&
    acknowledgement.sheetId === sheetId &&
    acknowledgement.requestId === requestId &&
    revision(acknowledgement.revision)
  )
}

/** Accepts only a read receipt for this request and returns a detached config snapshot. */
export function snapshotExactPageSetupRead(
  value: unknown,
  sheetId: string,
  requestId: number,
): PrintConfig | null {
  const result = record(value)
  if (
    result === null ||
    result.kind !== 'print-config' ||
    result.sheetId !== sheetId ||
    result.requestId !== requestId ||
    !revision(result.revision)
  )
    return null
  return snapshotPrintConfig(result.config)
}

export function pageSetupErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && error.message.length > 0) return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown print configuration transport failure.'
  }
}
