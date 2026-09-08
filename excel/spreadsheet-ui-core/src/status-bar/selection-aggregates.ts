import { atom, type Atom } from '@einfach/core'
import { getSelectionRange, selectionBoundsAtom, selectionRegionsAtom } from '../selection'
import { projectionSnapshotAtom } from '../projection/state'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { SelectionAggregateState } from './types'

// 只依赖原生数据版本；同一版本的滚动投影不能重复统计整列。
const aggregateRevisionAtom = atom((get) => get(projectionSnapshotAtom).result?.revision ?? null)
aggregateRevisionAtom.debugLabel = 'spreadsheet.statusBar.revision'

/** 只读异步派生：选区或数据变了就查询，过时 Promise 由 atom 本身处理。 */
export const selectionAggregatesAtom: Atom<
  SelectionAggregateState | Promise<SelectionAggregateState>
> = atom((get) => {
  const connection = get(rustWorkbookConnectionAtom)
  const revision = get(aggregateRevisionAtom)
  const regions = get(selectionRegionsAtom)
  const bounds = get(selectionBoundsAtom)
  if (!connection || typeof revision !== 'number') return { status: 'idle' } as const
  const targets = regions.map((region) => ({
    sheetId: region.sheetId,
    range: getSelectionRange(region, bounds),
  }))
  if (targets.length === 0) return { status: 'idle' } as const
  return connection.request('selection.aggregate', { targets })
    .then((result) => {
      // 拒绝缺失/非数值的传输结果；不能把坏响应显示成看似正确的零。
      if (
        !result || !Number.isSafeInteger(result.numericCount) || result.numericCount < 0 ||
        !Number.isSafeInteger(result.count) || result.count < result.numericCount ||
        ![result.sum, result.average].every((value) => value === null || Number.isFinite(value)) ||
        (result.numericCount === 0
          ? result.min !== null || result.max !== null
          : !Number.isFinite(result.min) || !Number.isFinite(result.max) ||
            result.min === null || result.max === null || result.min > result.max) ||
        !Number.isSafeInteger(result.revision) || result.revision < revision
      ) {
        throw new Error('Invalid selection statistics response.')
      }
      return {
        status: 'ready',
        numbers: Object.freeze({
          count: result.count,
          numericCount: result.numericCount,
          sum: result.sum,
          average: result.average,
          min: result.min,
          max: result.max,
        }),
      } as const
    })
    .catch((error: unknown) => ({
      status: 'error',
      message: error instanceof Error ? error.message : 'Selection statistics failed.',
    }) as const)
})
selectionAggregatesAtom.debugLabel = 'spreadsheet.statusBar.selectionAggregates'
