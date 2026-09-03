import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'

import {
  runEditingCommitAtom,
  type EditingCommitOutcome,
  type RunEditingCommitInput,
} from '../src/editing'
import { bindEditingMutation, startCellEdit } from './editing-test-support'

describe('editing commit input', () => {
  test('snapshots caller getters once while mutation stays on the connection atom', async () => {
    const store = createStore()
    startCellEdit(store, 'captured input')
    const inputReads: Record<string, number> = {}
    let transportCalls = 0
    let refreshCalls = 0
    bindEditingMutation(store, async (request) => {
      transportCalls += 1
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 'rev-captured',
      }
    })
    const count = <T>(key: string, value: T) => ({
      get() {
        inputReads[key] = (inputReads[key] ?? 0) + 1
        if (inputReads[key] > 1) throw new Error(`${key} getter was re-read`)
        return value
      },
    })
    const input = Object.defineProperties({}, {
      commitSource: count('commitSource', 'formula-bar'),
      move: count('move', 'down'),
      refreshProjection: count('refreshProjection', async () => {
        refreshCalls += 1
      }),
      timeoutMs: count('timeoutMs', 25_000),
    }) as RunEditingCommitInput

    await expect(store.setter(runEditingCommitAtom, input)).resolves.toBe('completed')
    expect(inputReads).toEqual({
      commitSource: 1,
      move: 1,
      refreshProjection: 1,
      timeoutMs: 1,
    })
    expect(transportCalls).toBe(1)
    expect(refreshCalls).toBe(1)
  })

  test('caller getter re-entry cannot overtake the replacement ticket it publishes', async () => {
    const store = createStore()
    startCellEdit(store, 'getter reentry')
    let replacement: Promise<EditingCommitOutcome> | undefined
    let transportCalls = 0
    const reads: Record<string, number> = {}
    bindEditingMutation(store, async (request) => {
      transportCalls += 1
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 'rev-replacement',
      }
    })
    const replacementInput: RunEditingCommitInput = {
      refreshProjection: async () => undefined,
    }
    const once = <T>(key: string, value: () => T) => ({
      get() {
        reads[key] = (reads[key] ?? 0) + 1
        if (reads[key] > 1) throw new Error(`${key} getter was re-read`)
        return value()
      },
    })
    const outerInput = Object.defineProperties({}, {
      commitSource: once('commitSource', () => {
        replacement = store.setter(runEditingCommitAtom, replacementInput)
        return 'cell'
      }),
      move: once('move', () => 'none'),
      refreshProjection: once('refreshProjection', () => async () => undefined),
      timeoutMs: once('timeoutMs', () => 25_000),
    }) as RunEditingCommitInput

    await expect(store.setter(runEditingCommitAtom, outerInput)).resolves.toBe('blocked')
    expect(replacement).toBeDefined()
    await expect(replacement).resolves.toBe('completed')
    expect(reads).toEqual({
      commitSource: 1,
      move: 1,
      refreshProjection: 1,
      timeoutMs: 1,
    })
    expect(transportCalls).toBe(1)
  })
})
