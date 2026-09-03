import type { WorkerRpcRequest } from './client-request'
import type {
  BeginImportOptionsWire,
  CellRefWire,
  CellSnapshotWire,
  ExportRangeTsvChunkConsumerWire,
  ExportRangeTsvChunkWire,
  ExportRangeTsvSessionWire,
  ImportCellWire,
  SparseCellWire,
  SparseRangeSnapshotChunkWire,
  SparseRangeSnapshotSessionWire,
  SparseRangeWire,
  SpillRegionWire,
  ViewportSizeSnapshotWire,
  WorkbookImportStatsWire,
} from './cell-range'
import type {
  WorkerWorkbookDebugCountersWire,
  WorkbookPersistenceRestoreStatsWire,
  WorkbookPersistenceSnapshotWire,
} from './persistence-capability'

const DEFAULT_ROWS_PER_CHUNK = 2048

function clampRowsPerChunk(value: number | undefined): number {
  const normalized = Math.floor(Number(value))
  if (!Number.isFinite(normalized) || normalized < 1) return 1
  return Math.min(normalized, 10_000)
}

export function normalizeRef(ref: CellRefWire): CellRefWire {
  return { sheet: ref.sheet, addr: ref.addr.toUpperCase() }
}

export function createDataCommands(request: WorkerRpcRequest) {
  let nextImportId = 1
  async function consumeExportRangeTsvChunks(
    range: SparseRangeWire,
    onChunk: ExportRangeTsvChunkConsumerWire,
    rowsPerChunk = DEFAULT_ROWS_PER_CHUNK,
  ): Promise<void> {
    const session = await request<ExportRangeTsvSessionWire>('beginExportRangeTsv', {
      range,
      rowsPerChunk: clampRowsPerChunk(rowsPerChunk),
    })
    let done = false
    try {
      while (true) {
        const chunk = await request<ExportRangeTsvChunkWire>('nextExportRangeTsvChunk', { sessionId: session.sessionId })
        await onChunk(chunk)
        if (chunk.done) break
      }
      done = true
    } finally {
      if (!done) await request<boolean>('cancelExport', { sessionId: session.sessionId }).catch(() => {})
    }
  }

  return {
    beginImport(
      sessionIdOrOptions?: number | BeginImportOptionsWire,
      options?: BeginImportOptionsWire,
    ) {
      const sessionId = typeof sessionIdOrOptions === 'number'
        ? sessionIdOrOptions
        : nextImportId++
      const importOptions = typeof sessionIdOrOptions === 'number' ? options : sessionIdOrOptions
      return request<number>('beginImport', { sessionId, ...(importOptions ?? {}) })
    },
    importChunk: (sessionId: number, cells: ImportCellWire[]) => request<number>('importChunk', { sessionId, cells }),
    commitImport: (sessionId: number) => request<WorkbookImportStatsWire>('commitImport', { sessionId }),
    cancelImport: (sessionId: number) => request<boolean>('cancelImport', { sessionId }),
    readCells: (cells: CellRefWire[]) => request<CellSnapshotWire[]>('readCells', { cells: cells.map(normalizeRef) }),
    listNonEmpty: () => request<CellRefWire[]>('listNonEmpty'),
    snapshotSparse: () => request<SparseCellWire[]>('snapshotSparse'),
    snapshotRangeSparse: (range: SparseRangeWire) => request<SparseCellWire[]>('snapshotRangeSparse', { range }),
    beginSnapshotRangeSparse: (range: SparseRangeWire, rowsPerChunk = DEFAULT_ROWS_PER_CHUNK) =>
      request<SparseRangeSnapshotSessionWire>('beginSnapshotRangeSparse', {
        range,
        rowsPerChunk: clampRowsPerChunk(rowsPerChunk),
      }),
    nextSnapshotRangeSparseChunk: (sessionId: number) => request<SparseRangeSnapshotChunkWire>('nextSnapshotRangeSparseChunk', { sessionId }),
    cancelSnapshot: (sessionId: number) => request<boolean>('cancelSnapshot', { sessionId }),
    async snapshotRangeSparseChunks(range: SparseRangeWire, rowsPerChunk = DEFAULT_ROWS_PER_CHUNK) {
      const session = await request<SparseRangeSnapshotSessionWire>('beginSnapshotRangeSparse', { range, rowsPerChunk: clampRowsPerChunk(rowsPerChunk) })
      const chunks: SparseCellWire[][] = []
      let done = false
      try {
        while (true) {
          const chunk = await request<SparseRangeSnapshotChunkWire>('nextSnapshotRangeSparseChunk', { sessionId: session.sessionId })
          chunks.push(chunk.cells)
          if (chunk.done) break
        }
        done = true
        return chunks
      } finally {
        if (!done) await request<boolean>('cancelSnapshot', { sessionId: session.sessionId }).catch(() => {})
      }
    },
    snapshotViewportSizes: (range: SparseRangeWire) => request<ViewportSizeSnapshotWire>('snapshotViewportSizes', { range }),
    setRowHeight: (sheet: number, rowIndex: number, heightPx: number) => request<boolean>('setRowHeight', { sheet, rowIndex, heightPx }),
    setColumnWidth: (sheet: number, colIndex: number, widthPx: number) => request<boolean>('setColumnWidth', { sheet, colIndex, widthPx }),
    snapshotPersistenceV1: () => request<WorkbookPersistenceSnapshotWire>('snapshotPersistenceV1'),
    restorePersistenceV1: (snapshot: WorkbookPersistenceSnapshotWire) => request<WorkbookPersistenceRestoreStatsWire>('restorePersistenceV1', { snapshot }),
    exportRangeTsv: (range: SparseRangeWire) => request<string>('exportRangeTsv', { range }),
    beginExportRangeTsv: (range: SparseRangeWire, rowsPerChunk = DEFAULT_ROWS_PER_CHUNK) => request<ExportRangeTsvSessionWire>('beginExportRangeTsv', { range, rowsPerChunk: clampRowsPerChunk(rowsPerChunk) }),
    nextExportRangeTsvChunk: (sessionId: number) => request<ExportRangeTsvChunkWire>('nextExportRangeTsvChunk', { sessionId }),
    cancelExport: (sessionId: number) => request<boolean>('cancelExport', { sessionId }),
    consumeExportRangeTsvChunks,
    async exportRangeTsvChunks(range: SparseRangeWire, rowsPerChunk = DEFAULT_ROWS_PER_CHUNK) {
      const chunks: string[] = []
      await consumeExportRangeTsvChunks(
        range,
        (chunk) => { chunks.push(chunk.chunk) },
        rowsPerChunk,
      )
      return chunks
    },
    restoreSparse: (cells: SparseCellWire[]) => request<number>('restoreSparse', { cells }),
    readSparseRange: (range: SparseRangeWire) => request<CellSnapshotWire[]>('readSparseRange', { range }),
    spillRegion: (sheet: number, addr: string) => request<SpillRegionWire | null>('spillRegion', { sheet, addr: addr.toUpperCase() }),
    debugFormulaCacheState: (sheet: number, addr: string) => request<string>('debugFormulaCacheState', { sheet, addr: addr.toUpperCase() }),
    debugFormulaEvalCount: (sheet: number) => request<number>('debugFormulaEvalCount', { sheet }),
    debugCounters: () => request<WorkerWorkbookDebugCountersWire>('debugCounters'),
  }
}
