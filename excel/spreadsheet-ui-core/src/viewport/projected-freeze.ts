import { atom } from '@einfach/core'
import { projectionSnapshotAtom } from '../projection/state'

/** 只读 Rust 返回的冻结配置及像素尺寸，不保留第二份可写冻结状态。 */
export const projectedFreezeAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  if (result?.kind !== 'visible-window' || !result.freeze) return null
  return {
    sheetId: result.sheetId,
    ...result.freeze,
    height: result.frozen?.height ?? 0,
    width: result.frozen?.width ?? 0,
  }
})
projectedFreezeAtom.debugLabel = 'spreadsheet.viewport.projectedFreeze'
