import { atom, type Atom, type Setter } from '@einfach/core'
import type { CellCoord } from '../shared'
import { isFiniteIndex, normalizeAnchorFormula, normalizeCoord, normalizeRegion } from './normalize'
import type {
  ActiveSpillBlockage,
  ActiveSpillRegion,
  SpillCellRole,
  SpillProjectedFormula,
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

/**
 * 有界上限：**同时只留 1 条 `#SPILL!` 阻塞线索**。与溢出区同一条查询、同一次换进
 * 换出，所以两者恒定不会同时非空（装上了投影就没有阻塞物）。
 */
export const SPILL_BLOCKAGE_CACHE_MAX = 1

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
 * - `blocked`：这一格是个碰撞态（`#SPILL!`）锚点，而且后端说得出被谁挡住 ——
 *   没有框可画（它一格都没装上），但有一句话可说。
 * - `error`：端口拒绝或应答不合法；缓存被清空，边框消失而不是画错地方。
 */
export type RefreshSpillRegionOutcome =
  | 'unsupported'
  | 'stale'
  | 'cleared'
  | 'updated'
  | 'blocked'
  | 'error'

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

/**
 * 唯一那一格阻塞线索缓存。与 `spillRegionBackingAtom` 分成两格而不是塞进一个联合
 * 类型：两者的消费者不同（一个画框、一个写字），合成一格会让画框的组件在只有文案
 * 变化时也重渲染。
 */
const spillBlockageBackingAtom = atom<ActiveSpillBlockage | null>(null)
spillBlockageBackingAtom.debugLabel = 'spreadsheet.spill.blockageBacking'

// --- derived --------------------------------------------------------------

/** 当前高亮的溢出区；没有就是 `null`。只读投影，宿主反射写会抛。 */
export const activeSpillRegionAtom: Atom<ActiveSpillRegion | null> = atom((get) =>
  get(spillRegionBackingAtom),
)
activeSpillRegionAtom.debugLabel = 'spreadsheet.spill.activeRegion'

/**
 * 当前选中的那个 `#SPILL!` 锚点是被谁挡住的；不适用时 `null`。
 *
 * `null` 覆盖三种情形，宿主对它们的处理一样 —— 不说话：选中的不是碰撞态锚点、
 * 后端答不出（TS 参考引擎没有溢出索引）、端口整个缺席。
 */
export const activeSpillBlockageAtom: Atom<ActiveSpillBlockage | null> = atom((get) =>
  get(spillBlockageBackingAtom),
)
activeSpillBlockageAtom.debugLabel = 'spreadsheet.spill.activeBlockage'

/** 端口在位与否的只读证据。宿主没实现 → 边框与标记整体不出现。 */
export const spillRegionSupportedAtom: Atom<boolean> = atom((get) =>
  get(spillCapabilityBackingAtom),
)
spillRegionSupportedAtom.debugLabel = 'spreadsheet.spill.supported'

/** 两个选择器共用的判定，免得「区内」的边界在两处各写一遍然后漂移。 */
function roleWithin(
  region: ActiveSpillRegion | null,
  sheetId: string,
  coord: CellCoord,
): SpillCellRole | null {
  if (!region || region.sheetId !== sheetId) return null
  const { range, anchor } = region
  if (coord.row < range.rowStart || coord.row > range.rowEnd) return null
  if (coord.col < range.colStart || coord.col > range.colEnd) return null
  return coord.row === anchor.row && coord.col === anchor.col ? 'anchor' : 'projected'
}

/**
 * 选择器投影：给一个坐标，回答它在当前高亮溢出区里的身份。
 *
 * 返回**函数**而不是按坐标建 atom —— 每格一个 atom 正是分层规则禁止的家族。
 */
export const spillCellRoleAtom: Atom<
  (sheetId: string, coord: CellCoord) => SpillCellRole | null
> = atom((get) => {
  const region = get(spillRegionBackingAtom)
  return (sheetId: string, coord: CellCoord): SpillCellRole | null =>
    roleWithin(region, sheetId, coord)
})
spillCellRoleAtom.debugLabel = 'spreadsheet.spill.cellRole'

/**
 * 选择器投影：这一格的公式栏该显示哪条**别人的**公式，且不接受编辑。
 *
 * 非 `null` 只发生在**投影格**上（锚点自己是那条公式的主人，照常可编辑），且后端
 * 说得出锚点公式时。两个条件缺一个就回 `null` = 「按原样走」。
 *
 * 这是一条**显示层**的事实，刻意不进 `editingSessionAtom`：往投影格里写值是 Excel
 * 允许的操作（ADR 0006：数组塌成 `#SPILL!`），只是**不能从公式栏那条灰公式改起**。
 * 把它做成编辑会话的一个状态会顺手连单元格内直接输入一起禁掉，那是另一个 bug。
 */
export const spillProjectedFormulaAtom: Atom<
  (sheetId: string, coord: CellCoord) => SpillProjectedFormula | null
> = atom((get) => {
  const region = get(spillRegionBackingAtom)
  return (sheetId: string, coord: CellCoord): SpillProjectedFormula | null => {
    if (!region?.anchorFormula) return null
    if (roleWithin(region, sheetId, coord) !== 'projected') return null
    return {
      anchor: { row: region.anchor.row, col: region.anchor.col },
      formula: region.anchorFormula,
    }
  }
})
spillProjectedFormulaAtom.debugLabel = 'spreadsheet.spill.projectedFormula'

// --- commands -------------------------------------------------------------

/**
 * 两格缓存一起清。所有「什么都不该显示」的出口都走这里 —— 分开写过一次就会漏掉
 * 一个，症状是框没了但「被 B3 挡住」还挂着。
 */
function clearSpillCaches(set: Setter): void {
  set(spillRegionBackingAtom, null)
  set(spillBlockageBackingAtom, null)
}

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
    if (!available) clearSpillCaches(set)
    return available
  },
)
captureSpillRegionCapabilityAtom.debugLabel = 'spreadsheet.spill.captureCapability'

export const clearSpillRegionAtom = atom(null, (_get, set): void => {
  clearSpillCaches(set)
})
clearSpillRegionAtom.debugLabel = 'spreadsheet.spill.clearRegion'

/**
 * 问后端「活动单元格在不在某个溢出区里」，把答案换进唯一的那格缓存。
 *
 * 宿主没实现端口就直接返回 `unsupported` —— 端口缺席是「功能不存在」，不是错误。
 *
 * 同一次应答顺带带回「这一格是不是一个说得出理由的 `#SPILL!`」。两件事共用一次
 * 查询而不是各发一次：它们是同一个问题的两半（「我脚下这一格跟动态数组有什么
 * 关系」），而且互斥 —— 装上了投影就没有阻塞物。
 */
export const refreshSpillRegionAtom = atom(
  null,
  async (get, set, input: RefreshSpillRegionInput): Promise<RefreshSpillRegionOutcome> => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    const read = input?.source?.readSpillRegion
    if (typeof read !== 'function') {
      set(spillCapabilityBackingAtom, false)
      clearSpillCaches(set)
      return 'unsupported'
    }
    set(spillCapabilityBackingAtom, true)
    if (!sheetId || !isFiniteIndex(input.cell?.row) || !isFiniteIndex(input.cell?.col)) {
      clearSpillCaches(set)
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
      clearSpillCaches(set)
      return 'error'
    }
    if (get(spillRequestSeqBackingAtom) !== seq) return 'stale'

    const payload = result as Partial<SpillRegionResult> | null | undefined
    if (typeof payload !== 'object' || payload === null || payload.sheetId !== sheetId) {
      clearSpillCaches(set)
      return 'error'
    }
    const region = payload.region === null ? null : normalizeRegion(payload.region)
    if (region === null) {
      clearSpillCaches(set)
      if (payload.region !== null) return 'error'
      // 没有活动溢出区，但可能有一条「你是个被挡住的锚点」的线索。缺席、坐标不
      // 合法、后端答不出，在这里都收敛成同一个「不说话」。
      const blockedBy = normalizeCoord(payload.blockedBy)
      if (blockedBy === null) return 'cleared'
      set(spillBlockageBackingAtom, {
        sheetId,
        anchor: { row: input.cell.row, col: input.cell.col },
        blockedBy,
      })
      return 'blocked'
    }
    // 两格互斥：装上了投影就没有阻塞物，上一次的线索必须跟着走，否则会挂着
    // 上一个锚点的那句话。
    set(spillBlockageBackingAtom, null)
    set(spillRegionBackingAtom, {
      sheetId,
      anchor: region.anchor,
      range: region.range,
      // 答不出就整个字段缺席 —— 公式栏据此退回原行为，而不是显示一条空公式。
      anchorFormula: normalizeAnchorFormula(payload.anchorFormula),
    })
    return 'updated'
  },
)
refreshSpillRegionAtom.debugLabel = 'spreadsheet.spill.refreshRegion'
