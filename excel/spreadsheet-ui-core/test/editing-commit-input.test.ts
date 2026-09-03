import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  runEditingCommitAtom,
  type EditingCommitAcknowledgement,
  type EditingCommitOutcome,
  type EditingCommitRequest,
  type EditingControllerPort,
  type RunEditingCommitInput,
} from '../src/editing'
import { startCellEdit } from './editing-test-support'

describe('editing commit input', () => {
  test('snapshots caller getters once and preserves the source method receiver', async () => {
    const store = createStore()
    startCellEdit(store, 'receiver')
    const inputReads: Record<string, number> = {}
    let methodReads = 0
    let receiver: unknown
    let refreshCalls = 0

    const execute = async function (
      this: unknown,
      request: EditingCommitRequest,
    ): Promise<EditingCommitAcknowledgement> {
      receiver = this
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 'rev-receiver',
      }
    }
    const source = Object.defineProperty({}, 'setCellInput', {
      get() {
        methodReads += 1
        if (methodReads > 1) throw new Error('method getter was re-read')
        return execute
      },
    }) as EditingControllerPort
    const count = <T>(key: string, value: T) => ({
      get() {
        inputReads[key] = (inputReads[key] ?? 0) + 1
        if (inputReads[key] > 1) throw new Error(`${key} getter was re-read`)
        return value
      },
    })
    const input = Object.defineProperties(
      {},
      {
        source: count('source', source),
        commitSource: count('commitSource', 'formula-bar'),
        move: count('move', 'down'),
        refreshProjection: count('refreshProjection', async () => {
          refreshCalls += 1
        }),
        timeoutMs: count('timeoutMs', 25_000),
      },
    ) as RunEditingCommitInput

    await expect(store.setter(runEditingCommitAtom, input)).resolves.toBe('completed')

    expect(inputReads).toEqual({
      source: 1,
      commitSource: 1,
      move: 1,
      refreshProjection: 1,
      timeoutMs: 1,
    })
    expect(methodReads).toBe(1)
    expect(receiver).toBe(source)
    expect(refreshCalls).toBe(1)
  })

  test('caller getter re-entry cannot overtake the replacement ticket it publishes', async () => {
    const store = createStore()
    startCellEdit(store, 'getter reentry')
    let replacement: Promise<EditingCommitOutcome> | undefined
    let replacementTransportCalls = 0
    let outerTransportCalls = 0
    const reads: Record<string, number> = {}
    let methodReads = 0

    const replacementInput: RunEditingCommitInput = {
      source: {
        async setCellInput(request) {
          replacementTransportCalls += 1
          return {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision: 'rev-replacement',
          }
        },
      },
      refreshProjection: async () => undefined,
    }
    const outerSource = Object.defineProperty({}, 'setCellInput', {
      get() {
        methodReads += 1
        return async (request: EditingCommitRequest) => {
          outerTransportCalls += 1
          return {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision: 'must-not-run',
          }
        }
      },
    }) as EditingControllerPort
    const once = <T>(key: string, value: () => T) => ({
      get() {
        reads[key] = (reads[key] ?? 0) + 1
        if (reads[key] > 1) throw new Error(`${key} getter was re-read`)
        return value()
      },
    })
    const outerInput = Object.defineProperties(
      {},
      {
        source: once('source', () => {
          replacement = store.setter(runEditingCommitAtom, replacementInput)
          return outerSource
        }),
        commitSource: once('commitSource', () => 'cell'),
        move: once('move', () => 'none'),
        refreshProjection: once('refreshProjection', () => async () => undefined),
        timeoutMs: once('timeoutMs', () => 25_000),
      },
    ) as RunEditingCommitInput

    await expect(store.setter(runEditingCommitAtom, outerInput)).resolves.toBe('blocked')
    expect(replacement).toBeDefined()
    await expect(replacement).resolves.toBe('completed')

    expect(reads).toEqual({
      source: 1,
      commitSource: 1,
      move: 1,
      refreshProjection: 1,
      timeoutMs: 1,
    })
    expect(methodReads).toBe(1)
    expect(outerTransportCalls).toBe(0)
    expect(replacementTransportCalls).toBe(1)
  })
})
