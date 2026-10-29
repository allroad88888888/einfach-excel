import type { Getter, Setter } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import type {
  ToolbarMutationControllerPort,
  ToolbarMutationOperation,
  ToolbarMutationStep,
  RunToolbarMutationInput,
} from './types'
import {
  toolbarMutationRequestSequenceAtom,
  toolbarMutationSessionSequenceAtom,
  planToolbarMutationIdentities,
} from './mutation-state'
import type {
  CapturedToolbarMutationStep,
  ToolbarMutationHistoryKind,
  ToolbarMutationTicket,
} from './mutation-state'
import { isCellRange, snapshotFormat, snapshotRange } from './mutation-snapshots'

function operationAcceptsStep(
  operation: ToolbarMutationOperation,
  step: ToolbarMutationStep,
): boolean {
  switch (operation) {
    case 'format':
    case 'border-batch':
      return step.kind === 'set-format-range'
    case 'merge':
      return step.kind === 'merge-range'
    case 'unmerge':
      return step.kind === 'unmerge-range'
    default:
      return false
  }
}

function historyKindForOperation(
  operation: ToolbarMutationOperation,
): ToolbarMutationHistoryKind | null {
  switch (operation) {
    case 'format':
    case 'border-batch':
      return 'format.set'
    case 'merge':
      return 'range.merge'
    case 'unmerge':
      return 'range.unmerge'
    default:
      return null
  }
}

function capturePort<K extends keyof ToolbarMutationControllerPort>(
  source: ToolbarMutationControllerPort,
  key: K,
): ToolbarMutationControllerPort[K] | null {
  try {
    const method = source[key]
    return typeof method === 'function'
      ? (method.bind(source) as ToolbarMutationControllerPort[K])
      : null
  } catch {
    return null
  }
}

function captureToolbarHistoryEntryRecorder(
  input: RunToolbarMutationInput,
): HistoryEntryRecorder | null {
  try {
    const recorder = input.historyEntryRecorder
    return typeof recorder === 'function' ? recorder : null
  } catch {
    return null
  }
}

export function buildMutationTicket(
  get: Getter,
  set: Setter,
  input: RunToolbarMutationInput,
): ToolbarMutationTicket | null {
  const historyKind = historyKindForOperation(input.operation)
  const historyEntryRecorder = captureToolbarHistoryEntryRecorder(input)
  if (
    historyKind === null ||
    typeof input.sheetId !== 'string' ||
    input.sheetId.length === 0 ||
    !isCellRange(input.affectedRange) ||
    !Array.isArray(input.steps) ||
    input.steps.length === 0 ||
    typeof input.refreshProjection !== 'function' ||
    historyEntryRecorder === null
  ) {
    return null
  }

  const setFormatRange = capturePort(input.source, 'setFormatRange')
  const mergeRange = capturePort(input.source, 'mergeRange')
  const unmergeRange = capturePort(input.source, 'unmergeRange')
  if (
    input.steps.some(
      (step) =>
        !isCellRange(step.range) ||
        !operationAcceptsStep(input.operation, step) ||
        (step.kind === 'set-format-range' && setFormatRange === null) ||
        (step.kind === 'merge-range' && mergeRange === null) ||
        (step.kind === 'unmerge-range' && unmergeRange === null),
    )
  ) {
    return null
  }

  const identityPlan = planToolbarMutationIdentities(
    get(toolbarMutationSessionSequenceAtom),
    get(toolbarMutationRequestSequenceAtom),
    input.steps.length,
  )
  if (identityPlan === null) return null

  const capturedSteps: CapturedToolbarMutationStep[] = []
  for (const [index, step] of input.steps.entries()) {
    const requestId = identityPlan.requestIds[index]
    if (requestId === undefined) return null
    const range = snapshotRange(step.range)

    if (step.kind === 'set-format-range' && setFormatRange) {
      const request = Object.freeze({
        kind: 'set-format-range' as const,
        sheetId: input.sheetId,
        requestId,
        range,
        format: snapshotFormat(step.format),
      })
      capturedSteps.push(
        Object.freeze({
          kind: step.kind,
          requestId,
          range,
          request,
          execute: () => setFormatRange(request),
        }),
      )
    } else if (step.kind === 'merge-range' && mergeRange) {
      const request = Object.freeze({
        kind: 'merge-range' as const,
        sheetId: input.sheetId,
        requestId,
        range,
      })
      capturedSteps.push(
        Object.freeze({
          kind: step.kind,
          requestId,
          range,
          request,
          execute: () => mergeRange(request),
        }),
      )
    } else if (step.kind === 'unmerge-range' && unmergeRange) {
      const request = Object.freeze({
        kind: 'unmerge-range' as const,
        sheetId: input.sheetId,
        requestId,
        range,
      })
      capturedSteps.push(
        Object.freeze({
          kind: step.kind,
          requestId,
          range,
          request,
          execute: () => unmergeRange(request),
        }),
      )
    }
  }

  if (capturedSteps.length !== input.steps.length) return null
  set(toolbarMutationSessionSequenceAtom, identityPlan.sessionId)
  set(toolbarMutationRequestSequenceAtom, identityPlan.requestSequence)
  return Object.freeze({
    sessionId: identityPlan.sessionId,
    operation: input.operation,
    sheetId: input.sheetId,
    requestId: capturedSteps[0].requestId,
    affectedRange: snapshotRange(input.affectedRange),
    steps: Object.freeze(capturedSteps),
    historyKind,
    refreshProjection: input.refreshProjection,
    historyEntryRecorder,
  })
}
