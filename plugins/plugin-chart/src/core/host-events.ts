import type { WorkbookApi, WorkbookChangeEvent } from '@einfach-excel/spreadsheet-ui-core'
import { chartInfo, type ChartInfo } from './chart-info'
import { CHART_KIND } from './spec'

export interface ChartChangeEvent {
  readonly type: 'insert' | 'update' | 'remove'
  readonly sheetId: string
  readonly id: string
  /** 新增与修改后的图表；删除时没有。 */
  readonly chart?: ChartInfo
  readonly source: WorkbookChangeEvent['source']
}

type Catalog = Map<string, ReadonlyMap<string, ChartInfo>>

/**
 * 订阅工作簿变化，重读受影响的表并与上一份图表目录比较，得出逐张图表的增删改。
 * 只在有订阅者时读取；目录上限是工作簿里的图表数，取消订阅即释放。
 */
export function watchChartChanges(api: WorkbookApi, listener: (event: ChartChangeEvent) => void) {
  const catalog: Catalog = new Map()
  let disposed = false
  let queue = Promise.resolve()

  async function readSheet(sheetId: string): Promise<ReadonlyMap<string, ChartInfo>> {
    const read = await api.readDrawings(sheetId)
    // 读不到（表已删除）按没有图表处理，随后报出删除。
    if (read.status !== 'ok') return new Map()
    return new Map(read.drawings.filter((drawing) => drawing.kind === CHART_KIND)
      .map((drawing) => [drawing.id, chartInfo(sheetId, drawing)]))
  }

  async function compare(sheetIds: readonly string[], source: ChartChangeEvent['source']) {
    for (const sheetId of sheetIds) {
      const next = await readSheet(sheetId)
      if (disposed) return
      const previous = catalog.get(sheetId) ?? new Map<string, ChartInfo>()
      if (next.size) catalog.set(sheetId, next)
      else catalog.delete(sheetId)
      for (const [id, chart] of next) {
        const before = previous.get(id)
        if (!before) listener({ type: 'insert', sheetId, id, chart, source })
        else if (JSON.stringify(before) !== JSON.stringify(chart))
          listener({ type: 'update', sheetId, id, chart, source })
      }
      for (const id of previous.keys())
        if (!next.has(id)) listener({ type: 'remove', sheetId, id, source })
    }
  }

  const live = () => api.getDocument().sheets.map((sheet) => sheet.id)
  queue = queue.then(async () => {
    for (const sheetId of live()) {
      const charts = await readSheet(sheetId)
      if (charts.size) catalog.set(sheetId, charts)
    }
  })
  const unsubscribe = api.onChange((event) => {
    if (!event) return
    // 空修改清单表示全簿目录变化（换簿、删表等）：所有表都要看；已删的表也要报出其图表被删。
    const touched = event.changes.length ? event.changes.map((change) => change.sheetId) : live()
    const sheetIds = [...new Set([...touched, ...[...catalog.keys()]
      .filter((sheetId) => !live().includes(sheetId))])]
    queue = queue.then(() => compare(sheetIds, event.source)).catch(() => undefined)
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
