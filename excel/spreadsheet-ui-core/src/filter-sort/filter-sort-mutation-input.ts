import type { FilterSortControllerPort, RunFilterSortMutationInput } from './types'
import { snapshotTimeoutMs } from './value-domain'

export type CapturedFilterSortMutationInput =
  | {
      readonly kind: 'captured'
      readonly sourceWitness: FilterSortControllerPort
      readonly transport: FilterSortControllerPort['setFilterSort']
      readonly historyEntryRecorder: RunFilterSortMutationInput['historyEntryRecorder']
      readonly sessionId: number
      readonly intent: RunFilterSortMutationInput['intent']
      readonly refreshProjection: RunFilterSortMutationInput['refreshProjection']
      readonly timeoutMs: number
    }
  | { readonly kind: 'invalid' }

export function captureFilterSortMutationInput(
  input: RunFilterSortMutationInput,
): CapturedFilterSortMutationInput {
  try {
    const sourceWitness = input.source
    const historyEntryRecorder = input.historyEntryRecorder
    const sessionId = input.sessionId
    const intentKind = input.intent?.kind
    const refreshProjection = input.refreshProjection
    const timeoutMs = snapshotTimeoutMs(input.timeoutMs)
    if (
      typeof historyEntryRecorder !== 'function' ||
      !Number.isSafeInteger(sessionId) ||
      typeof refreshProjection !== 'function' ||
      timeoutMs === null ||
      !['clear-filter', 'clear-column', 'apply-draft'].includes(intentKind)
    )
      return Object.freeze({ kind: 'invalid' })
    let transport: FilterSortControllerPort['setFilterSort']
    try {
      transport = sourceWitness?.setFilterSort
    } catch {}
    return Object.freeze({
      kind: 'captured',
      sourceWitness,
      transport,
      historyEntryRecorder,
      sessionId,
      intent: Object.freeze({ kind: intentKind }) as RunFilterSortMutationInput['intent'],
      refreshProjection,
      timeoutMs,
    })
  } catch {
    return Object.freeze({ kind: 'invalid' })
  }
}
