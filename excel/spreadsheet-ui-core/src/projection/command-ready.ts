import { atom, type Getter } from '@einfach/core'
import { projectionLaneBackingAtom, projectionSnapshotBackingAtom } from './state'

/**
 * 依赖已发布投影的命令此刻能否开始：就绪，或在途读取期间已发布结果仍是最新
 * （见 ProjectionLaneTicket.publishedCurrent）。修改结果经 applyVisibleProjectionAtom
 * 发布，被之后的读取顶掉时由那次读取带回。
 *
 * 面板与命令直接调用本函数而不是读派生 atom：einfach 的派生缓存只做浅新鲜检查，
 * 异步写入冲刷前，经一层派生读到的闸门可能是旧值；直接读底层状态才能建立可检测的依赖。
 */
export function isProjectionCommandReady(get: Getter): boolean {
  const snapshot = get(projectionSnapshotBackingAtom)
  const { active, queued } = get(projectionLaneBackingAtom).visibleWindow
  if (snapshot.status === 'ready') return true
  if (snapshot.status !== 'loading' || snapshot.error !== undefined) return false
  const { request, result } = snapshot
  return (
    active?.publishedCurrent === true &&
    (queued === null || queued.publishedCurrent === true) &&
    request?.kind === 'visible-window' &&
    result?.kind === 'visible-window' &&
    result.sheetId === request.sheetId
  )
}

/** 供视图层订阅的同一判断。 */
export const projectionCommandReadyAtom = atom(isProjectionCommandReady)
projectionCommandReadyAtom.debugLabel = 'spreadsheet.projection.commandReady'
