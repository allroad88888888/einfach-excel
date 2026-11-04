import { atom, type Getter, type Setter } from '@einfach/core'
import type { ProjectionViewport, VisibleProjectionResult } from '../contracts'
import type { CellRange } from '../shared'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { DEFAULT_MAX_PROJECTION_CELLS } from './contracts'
import type { ProjectionRequest, ProjectionSnapshot } from './types'

/** 外层矩形完整包含内层矩形；空的内层矩形视为被包含。 */
export function cellRangeContains(outer: CellRange, inner: CellRange): boolean {
  if (inner.rowEnd < inner.rowStart || inner.colEnd < inner.colStart) return true
  return (
    outer.rowStart <= inner.rowStart &&
    outer.rowEnd >= inner.rowEnd &&
    outer.colStart <= inner.colStart &&
    outer.colEnd >= inner.colEnd
  )
}

function sameWindow(left: CellRange, right: CellRange): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

function sameViewport(left?: ProjectionViewport, right?: ProjectionViewport): boolean {
  if (left === undefined || right === undefined) return left === right
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.rowHeight === right.rowHeight &&
    left.colWidth === right.colWidth
  )
}

/** 两个请求读的是同一张表、同一窗口、同一像素预算。 */
export function sameVisibleView(
  left: ProjectionRequest | undefined,
  right: ProjectionRequest | undefined,
): boolean {
  return left?.kind === 'visible-window' && right?.kind === 'visible-window' &&
    left.sheetId === right.sheetId && sameWindow(left.window, right.window) &&
    sameViewport(left.viewport, right.viewport)
}

function boundedRange(range: CellRange, maxCells: number): boolean {
  const bounds = [range.rowStart, range.rowEnd, range.colStart, range.colEnd]
  if (!bounds.every((bound) => Number.isSafeInteger(bound) && bound >= 0)) return false
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) return false
  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1) <= maxCells
}

// 尺寸命令等会先单独发布几何、而它们的投影可能被拒；就绪结果只和随它一起发布的几何配套。
const publishedGeometryBackingAtom = atom<object | null>(null)
publishedGeometryBackingAtom.debugLabel = 'spreadsheet.projection.publishedGeometry.state'

/** 就绪结果连同尺寸、隐藏状态发布完毕后调用。 */
export function recordPublishedGeometry(get: Getter, set: Setter): void {
  set(publishedGeometryBackingAtom, get(viewportGeometrySizesAtom))
}

/** 当前几何仍是就绪结果发布时的那一份。 */
export const publishedGeometryCurrentAtom = atom(
  (get) => get(publishedGeometryBackingAtom) === get(viewportGeometrySizesAtom),
)
publishedGeometryCurrentAtom.debugLabel = 'spreadsheet.projection.publishedGeometryCurrent'

export interface CoveringRequestInput {
  readonly sheetId: string
  readonly window: CellRange
  readonly viewport?: ProjectionViewport
  readonly revision?: VisibleProjectionResult['revision']
  readonly maxCells?: number
}

/**
 * 已发布的就绪结果能否原样充当这次窗口请求的结果。投影带回更高的行高后，
 * 缓冲窗口会少算一两行，此时不必再读一次。要求同一视口像素预算（冻结区读多少取决于它）、
 * 结果未截断、请求本身合法；显式 revision 请求一律真实读取。几何来源由调用方另行确认。
 */
export function readyResultCoversRequest(
  snapshot: ProjectionSnapshot,
  input: CoveringRequestInput,
): boolean {
  const { request, result } = snapshot
  return (
    snapshot.status === 'ready' &&
    snapshot.error === undefined &&
    input.revision === undefined &&
    request?.kind === 'visible-window' &&
    request.sheetId === input.sheetId &&
    result?.kind === 'visible-window' &&
    result.sheetId === input.sheetId &&
    result.truncated !== true &&
    sameViewport(request.viewport, input.viewport) &&
    boundedRange(input.window, input.maxCells ?? DEFAULT_MAX_PROJECTION_CELLS) &&
    boundedRange(result.window, input.maxCells ?? DEFAULT_MAX_PROJECTION_CELLS) &&
    cellRangeContains(result.window, input.window)
  )
}

export interface VisibleProjectionView {
  readonly result: VisibleProjectionResult | undefined
  /** snapshot 的传输状态与错误属于这次浏览意图。 */
  readonly current: boolean
  /** 画面上的结果不能充当这次请求的结果，交互需等待。 */
  readonly retained: boolean
}

/** 把投影快照解读为某个浏览窗口的显示状态；只有可复用的覆盖结果放宽"窗口必须相等"。 */
export function viewVisibleProjection(
  snapshot: ProjectionSnapshot,
  input: CoveringRequestInput & { readonly geometryCurrent: boolean },
): VisibleProjectionView {
  const result = snapshot.result?.kind === 'visible-window' &&
    snapshot.result.sheetId === input.sheetId ? snapshot.result : undefined
  const request = snapshot.request?.kind === 'visible-window' &&
    snapshot.request.sheetId === input.sheetId ? snapshot.request : undefined
  const reusable = input.geometryCurrent && readyResultCoversRequest(snapshot, input)
  // 复用后宿主刷新等仍沿已发布的请求窗口读取；它在途或出错都要算到这次浏览上。
  const current = request !== undefined && (sameWindow(request.window, input.window) ||
    reusable || (snapshot.status !== 'ready' && cellRangeContains(request.window, input.window)))
  const retained = result !== undefined && !sameWindow(result.window, input.window) && !reusable
  return { result, current, retained }
}
