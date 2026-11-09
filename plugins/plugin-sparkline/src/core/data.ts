import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, projectionSnapshotAtom, readWorkbookDisplayRangeAtom,
  rustWorkbookConnectionAtom, type DrawingRange, type ProjectionRevision,
  type RustWorkbookConnection, type SheetDrawing,
} from '@einfach-excel/spreadsheet-ui-core'
import { sparklineSlots } from './layout'

/** 一组迷你图的数值：按位置格顺序，每格一列数（非数值为 null）。 */
export interface SparklineDataEntry {
  readonly status: 'loading' | 'ready' | 'error'
  readonly series?: readonly (readonly (number | null)[])[]
  readonly error?: string
}
interface CacheEntry extends SparklineDataEntry {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly revision: ProjectionRevision
  readonly key: string
}
const cacheAtom = atom<Readonly<Record<string, CacheEntry>>>({})
cacheAtom.debugLabel = 'plugin.sparkline.data.cache'

/** 当前表各迷你图组的数值（按对象 id）；缓存上限是本表对象数，切表或换簿即失效。 */
export const sparklineDataAtom = atom((get): Readonly<Record<string, SparklineDataEntry>> => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheetId = get(activeWorkbookSheetAtom)?.id
  return Object.fromEntries(Object.entries(get(cacheAtom))
    .filter(([, entry]) => entry.connection === connection && entry.sheetId === sheetId))
})
sparklineDataAtom.debugLabel = 'plugin.sparkline.data'

/** 只取投影修订号：滚动不改修订，迷你图不随滚动重读。 */
export const sparklineRevisionAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' ? result.revision : undefined
})
sparklineRevisionAtom.debugLabel = 'plugin.sparkline.data.revision'

/** 修订变化（编辑、重算、撤销）后一次读回整块数据，再按位置格切开。 */
export const loadSparklineDataAtom = atom(null, async (get, set, drawing: SheetDrawing) => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const revision = get(sparklineRevisionAtom)
  if (!connection || !sheet || revision === undefined) return
  const [location, data] = drawing.refs
  const key = JSON.stringify([location, data])
  const current = get(cacheAtom)[drawing.id]
  if (current?.connection === connection && current.sheetId === sheet.id &&
    current.revision === revision && current.key === key) return
  const base = { connection, sheetId: sheet.id, revision, key }
  const publish = (entry: SparklineDataEntry) =>
    set(cacheAtom, { ...get(cacheAtom), [drawing.id]: { ...base, ...entry } })
  if (!location || !data) return publish({ status: 'error', error: '#REF!' })
  const layout = sparklineSlots(location, data)
  if ('error' in layout) return publish({ status: 'error', error: layout.error })
  publish({ status: 'loading', series: current?.series })
  const sheetId = data.sheetId ?? sheet.id
  const read = await set(readWorkbookDisplayRangeAtom, { sheetId, range: {
    rowStart: data.startRow, rowEnd: data.endRow, colStart: data.startCol, colEnd: data.endCol } })
  const latest = get(cacheAtom)[drawing.id]
  if (get(rustWorkbookConnectionAtom) !== connection || latest?.revision !== revision ||
    latest.key !== key) return
  if (read.status === 'error') return publish({ status: 'error', error: read.error.message })
  const numbers = new Map<string, number>()
  for (const cell of read.snapshot.cells)
    if (cell.valueKind === 'number' && !cell.error && Number.isFinite(cell.numericValue))
      numbers.set(`${cell.row}:${cell.col}`, cell.numericValue!)
  const values = (range: DrawingRange) => {
    const out: (number | null)[] = []
    for (let row = range.startRow; row <= range.endRow; row += 1)
      for (let col = range.startCol; col <= range.endCol; col += 1)
        out.push(numbers.get(`${row}:${col}`) ?? null)
    return out
  }
  publish({ status: 'ready', series: layout.slots.map((slot) => values(slot.data)) })
})
loadSparklineDataAtom.debugLabel = 'plugin.sparkline.data.load'
