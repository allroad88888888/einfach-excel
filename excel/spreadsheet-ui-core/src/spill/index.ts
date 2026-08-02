import { atom, type Atom } from '@einfach/core'
import type { CellCoord } from '../shared'
import type {
  ActiveSpillRegion,
  SpillCellRole,
  SpillRegion,
  SpillRegionRequest,
  SpillRegionResult,
} from './types'

export * from './types'

/**
 * 有界上限：**同时只留 1 个溢出区** —— 当前选区所在的那个。查过就丢，不留历史，
 * 所以本模块的内存占用与表大小、与数组个数都无关。这条上限就是「不得引入
 * per-cell atom 家族」在本 feature 的落法。
 */
export const SPILL_REGION_CACHE_MAX = 1

/** 宿主后端里被本模块调用的那一个可选端口。 */
export interface SpillRegionPort {
  readSpillRegion?(request: SpillRegionRequest): Promise<SpillRegionResult>
}

export interface RefreshSpillRegionInput {
  source: SpillRegionPort | null | undefined
  sheetId: string
  cell: CellCoord
  revision?: number | string
}

/**
 * - `unsupported`：宿主后端没实现端口 —— 功能整体隐身，不是错误。
 * - `stale`：应答回来时已经有更新的一次查询发出去了，丢弃。
 * - `cleared` / `updated`：这一格不在 / 在某个溢出区里。
 * - `error`：端口拒绝或应答不合法；缓存被清空，边框消失而不是画错地方。
 */
export type RefreshSpillRegionOutcome = 'unsupported' | 'stale' | 'cleared' | 'updated' | 'error'

// --- source ---------------------------------------------------------------

const spillRegionBackingAtom = atom<ActiveSpillRegion | null>(null)
spillRegionBackingAtom.debugLabel = 'spreadsheet.spill.regionBacking'

/**
 * 单调递增的查询序号。选区可以移动得比 RPC 回来得快，晚到的旧应答必须丢掉，
 * 否则边框会在两个数组之间来回跳。
 */
const spillRequestSeqBackingAtom = atom<number>(0)
spillRequestSeqBackingAtom.debugLabel = 'spreadsheet.spill.requestSeqBacking'

const spillCapabilityBackingAtom = atom<boolean>(false)
spillCapabilityBackingAtom.debugLabel = 'spreadsheet.spill.capabilityBacking'

// --- derived --------------------------------------------------------------

/** 当前高亮的溢出区；没有就是 `null`。只读投影，宿主反射写会抛。 */
export const activeSpillRegionAtom: Atom<ActiveSpillRegion | null> = atom((get) =>
  get(spillRegionBackingAtom),
)
activeSpillRegionAtom.debugLabel = 'spreadsheet.spill.activeRegion'

/** 端口在位与否的只读证据。宿主没实现 → 边框与标记整体不出现。 */
export const spillRegionSupportedAtom: Atom<boolean> = atom((get) =>
  get(spillCapabilityBackingAtom),
)
spillRegionSupportedAtom.debugLabel = 'spreadsheet.spill.supported'

/**
 * 选择器投影：给一个坐标，回答它在当前高亮溢出区里的身份。
 *
 * 返回**函数**而不是按坐标建 atom —— 每格一个 atom 正是分层规则禁止的家族。
 */
export const spillCellRoleAtom: Atom<
  (sheetId: string, coord: CellCoord) => SpillCellRole | null
> = atom((get) => {
  const region = get(spillRegionBackingAtom)
  return (sheetId: string, coord: CellCoord): SpillCellRole | null => {
    if (!region || region.sheetId !== sheetId) return null
    const { range, anchor } = region
    if (coord.row < range.rowStart || coord.row > range.rowEnd) return null
    if (coord.col < range.colStart || coord.col > range.colEnd) return null
    return coord.row === anchor.row && coord.col === anchor.col ? 'anchor' : 'projected'
  }
})
spillCellRoleAtom.debugLabel = 'spreadsheet.spill.cellRole'

// --- validation -----------------------------------------------------------

function isFiniteIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function normalizeRegion(region: unknown): SpillRegion | null {
  if (typeof region !== 'object' || region === null) return null
  const { anchor, range } = region as Partial<SpillRegion>
  if (!anchor || !range) return null
  if (!isFiniteIndex(anchor.row) || !isFiniteIndex(anchor.col)) return null
  if (!isFiniteIndex(range.rowStart) || !isFiniteIndex(range.rowEnd)) return null
  if (!isFiniteIndex(range.colStart) || !isFiniteIndex(range.colEnd)) return null
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) return null
  // 锚点恒在矩形左上角 —— 引擎侧的两个实现都是这么算的，破了这条说明 wire 坏了，
  // 与其画一个歪掉的框不如什么都不画。
  if (anchor.row !== range.rowStart || anchor.col !== range.colStart) return null
  return {
    anchor: { row: anchor.row, col: anchor.col },
    range: {
      rowStart: range.rowStart,
      rowEnd: range.rowEnd,
      colStart: range.colStart,
      colEnd: range.colEnd,
    },
  }
}

// --- commands -------------------------------------------------------------

/** 抓一次端口在位与否；宿主换 backend 或 backend `ready()` 之后再抓一次。 */
export const captureSpillRegionCapabilityAtom = atom(
  null,
  (_get, set, source: SpillRegionPort | null | undefined): boolean => {
    let available = false
    try {
      available = typeof source?.readSpillRegion === 'function'
    } catch {
      available = false
    }
    set(spillCapabilityBackingAtom, available)
    if (!available) set(spillRegionBackingAtom, null)
    return available
  },
)
captureSpillRegionCapabilityAtom.debugLabel = 'spreadsheet.spill.captureCapability'

export const clearSpillRegionAtom = atom(null, (_get, set): void => {
  set(spillRegionBackingAtom, null)
})
clearSpillRegionAtom.debugLabel = 'spreadsheet.spill.clearRegion'

/**
 * 问后端「活动单元格在不在某个溢出区里」，把答案换进唯一的那格缓存。
 *
 * 宿主没实现端口就直接返回 `unsupported` —— 端口缺席是「功能不存在」，不是错误。
 */
export const refreshSpillRegionAtom = atom(
  null,
  async (get, set, input: RefreshSpillRegionInput): Promise<RefreshSpillRegionOutcome> => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    const read = input?.source?.readSpillRegion
    if (typeof read !== 'function') {
      set(spillCapabilityBackingAtom, false)
      set(spillRegionBackingAtom, null)
      return 'unsupported'
    }
    set(spillCapabilityBackingAtom, true)
    if (!sheetId || !isFiniteIndex(input.cell?.row) || !isFiniteIndex(input.cell?.col)) {
      set(spillRegionBackingAtom, null)
      return 'cleared'
    }

    const seq = get(spillRequestSeqBackingAtom) + 1
    set(spillRequestSeqBackingAtom, seq)

    let result: unknown
    try {
      result = await read.call(input.source, {
        kind: 'spill-region',
        sheetId,
        row: input.cell.row,
        col: input.cell.col,
        requestId: seq,
        revision: input.revision,
      } satisfies SpillRegionRequest)
    } catch {
      if (get(spillRequestSeqBackingAtom) !== seq) return 'stale'
      // 装饰性读失败不该留下一个陈旧的框。
      set(spillRegionBackingAtom, null)
      return 'error'
    }
    if (get(spillRequestSeqBackingAtom) !== seq) return 'stale'

    const payload = result as Partial<SpillRegionResult> | null | undefined
    if (typeof payload !== 'object' || payload === null || payload.sheetId !== sheetId) {
      set(spillRegionBackingAtom, null)
      return 'error'
    }
    const region = payload.region === null ? null : normalizeRegion(payload.region)
    if (region === null) {
      set(spillRegionBackingAtom, null)
      return payload.region === null ? 'cleared' : 'error'
    }
    set(spillRegionBackingAtom, { sheetId, anchor: region.anchor, range: region.range })
    return 'updated'
  },
)
refreshSpillRegionAtom.debugLabel = 'spreadsheet.spill.refreshRegion'
