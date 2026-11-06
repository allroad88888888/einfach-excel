import type {
  DrawingAnchor, DrawingRange, HostCommandFailure, SheetDrawing, WorkbookApi,
} from '@einfach-excel/spreadsheet-ui-core'
import { areaLayout, combineAreaGrids, validateChartAreas } from './areas'
import { buildChartDrawing, nextChartId } from './chart-drawing'
import { chartInfo, type ChartInfo } from './chart-info'
import { chartGridFromSnapshot } from './data'
import { watchChartChanges, type ChartChangeEvent } from './host-events'
import { parseRangesText, toCellRange } from './range-text'
import { CHART_KIND, parseChartSpec, type ChartSpec, type ChartType } from './spec'
export interface ChartInsertInput {
  readonly sheetId: string
  /** `B2:D10` 或 `A3:A15,C3:C15`，也可直接给区域。 */
  readonly data: string | readonly DrawingRange[]
  /** 缺省按「推荐的图表」选类型。 */
  readonly type?: ChartType | 'recommended'
  readonly id?: string
  /** 覆盖按数据猜出的设置（标题、图例、表头等）。 */
  readonly spec?: Partial<ChartSpec>
  /** 覆盖默认位置（数据右侧空一列）与尺寸。 */
  readonly anchor?: Partial<DrawingAnchor>
}
export interface ChartUpdateInput {
  readonly spec?: Partial<ChartSpec>
  readonly data?: string | readonly DrawingRange[]
  readonly anchor?: Partial<DrawingAnchor>
}
type Result<T = object> = ({ readonly status: 'ok' } & T) | HostCommandFailure

const failure = (code: string, message = code): HostCommandFailure =>
  ({ status: 'error', error: { code, message } })

function areasOf(data: string | readonly DrawingRange[]): readonly DrawingRange[] | null {
  return typeof data === 'string' ? parseRangesText(data) : data
}

/**
 * 图表的宿主门面：建在 `createWorkbookApi` 之上，写入走同一条宿主操作链
 * （明确目标表、修改前拦截、共享撤销、变化事件），本身不保存任何图表状态。
 */
export function createChartApi(api: WorkbookApi) {
  async function drawingsOf(sheetId: string):
    Promise<Result<{ drawings: readonly SheetDrawing[] }>> {
    const read = await api.readDrawings(sheetId)
    return read.status === 'ok' ? { status: 'ok', drawings: read.drawings } : read
  }
  async function chartOf(sheetId: string, id: string): Promise<Result<{ drawing: SheetDrawing }>> {
    const read = await drawingsOf(sheetId)
    if (read.status !== 'ok') return read
    const drawing = read.drawings.find((entry) => entry.id === id && entry.kind === CHART_KIND)
    return drawing ? { status: 'ok', drawing } : failure('CHART_NOT_FOUND')
  }
  async function write(sheetId: string, drawing: SheetDrawing):
    Promise<Result<{ chart: ChartInfo }>> {
    const result = await api.setDrawing({ sheetId, drawing })
    return result.status === 'ok' ? { status: 'ok', chart: chartInfo(sheetId, drawing) } : result
  }
  async function readGrid(sheetId: string, areas: readonly DrawingRange[]) {
    const reads = await Promise.all(areas.map((area) =>
      api.readDisplay({ sheetId, range: toCellRange(area) })))
    const failed = reads.find((read) => read.status === 'error')
    if (failed?.status === 'error') return failed
    return { status: 'ok' as const, grid: combineAreaGrids(reads.flatMap((read, index) =>
      read.status === 'ok' ? [chartGridFromSnapshot(read.snapshot, areas[index]!)] : []),
    areaLayout(areas)!) }
  }

  return Object.freeze({
    /** 不给表时列出整本工作簿的图表（按表、按绘制顺序）。 */
    async list(sheetId?: string): Promise<Result<{ charts: readonly ChartInfo[] }>> {
      const sheets = sheetId ? [sheetId] : api.getDocument().sheets.map((sheet) => sheet.id)
      const charts: ChartInfo[] = []
      for (const id of sheets) {
        const read = await drawingsOf(id)
        if (read.status !== 'ok') return read
        charts.push(...read.drawings.filter((drawing) => drawing.kind === CHART_KIND)
          .map((drawing) => chartInfo(id, drawing)))
      }
      return { status: 'ok', charts }
    },
    async get(sheetId: string, id: string): Promise<Result<{ chart: ChartInfo }>> {
      const found = await chartOf(sheetId, id)
      return found.status === 'ok' ? { status: 'ok', chart: chartInfo(sheetId, found.drawing) } : found
    },
    async insert(input: ChartInsertInput): Promise<Result<{ chart: ChartInfo }>> {
      const areas = areasOf(input.data)
      if (!areas) return failure('INVALID_RANGE', 'Enter a range such as B2:D10.')
      const invalid = validateChartAreas(areas)
      if (invalid) return failure('INVALID_CHART_DATA', invalid)
      const existing = await drawingsOf(input.sheetId)
      if (existing.status !== 'ok') return existing
      if (input.id && existing.drawings.some((drawing) => drawing.id === input.id))
        return failure('DUPLICATE_OBJECT_ID')
      const grid = await readGrid(input.sheetId, areas)
      if (grid.status !== 'ok') return grid
      const built = buildChartDrawing({ id: input.id ?? nextChartId(existing.drawings), areas,
        grid: grid.grid, requested: input.type ?? 'recommended' })
      return write(input.sheetId, { ...built,
        anchor: { ...built.anchor, ...input.anchor },
        payload: { ...built.payload, ...input.spec } })
    },
    /** 一次修改一条撤销记录；没给的部分保持不变。 */
    async update(sheetId: string, id: string, patch: ChartUpdateInput):
      Promise<Result<{ chart: ChartInfo }>> {
      const found = await chartOf(sheetId, id)
      if (found.status !== 'ok') return found
      const areas = patch.data === undefined ? found.drawing.refs : areasOf(patch.data)
      if (!areas) return failure('INVALID_RANGE', 'Enter a range such as B2:D10.')
      if (patch.data !== undefined) {
        const invalid = validateChartAreas(areas as readonly DrawingRange[])
        if (invalid) return failure('INVALID_CHART_DATA', invalid)
      }
      return write(sheetId, { ...found.drawing, refs: areas,
        anchor: { ...found.drawing.anchor, ...patch.anchor },
        payload: { ...parseChartSpec(found.drawing.payload), ...patch.spec } })
    },
    async remove(sheetId: string, id: string): Promise<Result> {
      const found = await chartOf(sheetId, id)
      if (found.status !== 'ok') return found
      const result = await api.removeDrawing({ sheetId, id })
      return result.status === 'ok' ? { status: 'ok' } : result
    },
    async order(sheetId: string, id: string, toFront: boolean): Promise<Result> {
      const found = await chartOf(sheetId, id)
      if (found.status !== 'ok') return found
      const result = await api.orderDrawing({ sheetId, id, toFront })
      return result.status === 'ok' ? { status: 'ok' } : result
    },
    /** 图表新增、修改、删除（含撤销重做与结构编辑带来的移动）；返回取消订阅函数。 */
    onChange: (listener: (event: ChartChangeEvent) => void) =>
      watchChartChanges(api, listener),
  })
}

export type ChartApi = ReturnType<typeof createChartApi>
export type { ChartChangeEvent, ChartInfo }
