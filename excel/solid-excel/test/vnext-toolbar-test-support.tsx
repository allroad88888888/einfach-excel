/** @jsxImportSource solid-js */

import { expect } from 'vitest'
import { createStore } from '@einfach/core'
import { fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  MergeRangeRequest,
  SetFormatRangeRequest,
  SortRangeRequest,
  SpreadsheetBackend,
  UnmergeRangeRequest,
  VisibleProjectionResult,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  beginProjectionAtom,
  findReplaceOpenAtom,
  formatCellsEditorAtom,
  formatPainterStateAtom,
  historyStackAtom,
  resolveProjectionAtom,
  selectCellAtom,
  setSheetProtectionAtom,
  setWorkspaceActiveSheetAtom,
  startEditingAtom,
  toolbarActiveSurfaceAtom,
  toolbarIntentAtom,
  toolbarMutationLifecycleAtom,
} from '@einfach/spreadsheet-ui-core'
import { setLocale } from '../src/i18n'
import { SpreadsheetFormatCellsDialog, numberFormatDialogAtom } from '../src/format-cells'
import { SpreadsheetUiProvider, spreadsheetProjectionSnapshotAtom } from '../src/provider'
import { SpreadsheetToolbar } from '../src/toolbar'

export {
  beginProjectionAtom,
  createStore,
  findReplaceOpenAtom,
  fireEvent,
  formatCellsEditorAtom,
  formatPainterStateAtom,
  historyStackAtom,
  numberFormatDialogAtom,
  render,
  resolveProjectionAtom,
  selectCellAtom,
  setLocale,
  setSheetProtectionAtom,
  setWorkspaceActiveSheetAtom,
  SpreadsheetFormatCellsDialog,
  SpreadsheetToolbar,
  SpreadsheetUiProvider,
  spreadsheetProjectionSnapshotAtom,
  startEditingAtom,
  toolbarActiveSurfaceAtom,
  toolbarIntentAtom,
  toolbarMutationLifecycleAtom,
  waitFor,
}
export type {
  MergeRangeRequest,
  SetFormatRangeRequest,
  SortRangeRequest,
  SpreadsheetBackend,
  UnmergeRangeRequest,
  VisibleProjectionResult,
  VisibleProjectionRequest,
}

export const RAW_I18N_KEY_RE =
  /\b(?:toolbar|numberFormatDropdown|numberFormatDialog|formatCells)\.[A-Za-z0-9_.-]+/

export function createFakeBackend() {
  const backend: SpreadsheetBackend = {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }

  return backend
}

export function createRecordingBackend() {
  const setFormatRangeCalls: SetFormatRangeRequest[] = []
  const mergeRangeCalls: MergeRangeRequest[] = []
  const unmergeRangeCalls: UnmergeRangeRequest[] = []
  const readVisibleProjectionCalls: VisibleProjectionRequest[] = []
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request) {
      readVisibleProjectionCalls.push(request)
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision,
        window: { ...request.window },
        cells: [
          {
            row: 0,
            col: 0,
            displayValue: 'A1',
            valueKind: 'string',
            format: { bold: true },
          },
        ],
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    async undoTransaction(request) {
      return {
        transactionId: request.transactionId,
        requestId: request.requestId,
        revision: 4,
      }
    },
    async redoTransaction(request) {
      return {
        transactionId: request.transactionId,
        requestId: request.requestId,
        revision: 4,
      }
    },
    async setFormatRange(request) {
      setFormatRangeCalls.push(request)
      return {
        kind: request.kind,
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 2,
        affectedRange: { ...request.range },
      }
    },
    // The Sort toolbar surface only renders when the host can physically sort
    // (#24 retired the display-permutation fallback).
    async sortRange(request) {
      return {
        kind: 'sort-range',
        sheetId: request.sheetId,
        applied: true,
        movedRows: 0,
        movedCells: 0,
        affectedRange: request.range,
        requestId: request.requestId,
        revision: 2,
      }
    },
    async mergeRange(request) {
      mergeRangeCalls.push(request)
      return {
        kind: request.kind,
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 2,
        affectedRange: { ...request.range },
      }
    },
    async unmergeRange(request) {
      unmergeRangeCalls.push(request)
      return {
        kind: request.kind,
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 3,
        affectedRange: { ...request.range },
      }
    },
    async setFilterSort(request) {
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 4,
      }
    },
  }

  return {
    backend,
    setFormatRangeCalls,
    mergeRangeCalls,
    unmergeRangeCalls,
    readVisibleProjectionCalls,
  }
}

export function seedReadyProjection(store: ReturnType<typeof createStore>) {
  seedVisibleProjection(store, {
    kind: 'visible-window',
    sheetId: 'sheet-1',
    requestId: 1,
    window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
    cells: [
      {
        row: 0,
        col: 0,
        displayValue: 'A1',
        valueKind: 'string',
        format: {},
      },
    ],
  })
}

export function seedVisibleProjection(
  store: ReturnType<typeof createStore>,
  result: VisibleProjectionResult,
) {
  const begin = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: result.sheetId,
    reason: 'test',
    window: result.window,
  })
  expect(begin.status).toBe('started')
  if (begin.status !== 'started') throw new Error('projection seed lane did not start')

  const resolved = store.setter(resolveProjectionAtom, {
    request: begin.request,
    result: { ...result, requestId: begin.request.requestId },
  })
  expect(resolved.status).toBe('accepted')
}

export function getButtons(container: HTMLElement) {
  return {
    bold: container.querySelector('[data-testid="toolbar-btn-bold"]') as HTMLButtonElement,
    italic: container.querySelector('[data-testid="toolbar-btn-italic"]') as HTMLButtonElement,
    underline: container.querySelector(
      '[data-testid="toolbar-btn-underline"]',
    ) as HTMLButtonElement,
    fillColor: container.querySelector(
      '[data-testid="toolbar-btn-fill-color"]',
    ) as HTMLButtonElement,
    textColor: container.querySelector(
      '[data-testid="toolbar-btn-text-color"]',
    ) as HTMLButtonElement,
    numberFormat: container.querySelector(
      '[data-testid="toolbar-btn-number-format"]',
    ) as HTMLButtonElement,
    percent: container.querySelector(
      '[data-testid="toolbar-btn-percent-format"]',
    ) as HTMLButtonElement,
    // Wave 5 merge surface is a single dropdown — the top-level button always
    // opens the menu; the dropdown's four items (merge-center, across-rows,
    // across-cols, unmerge) carry the per-preset disabled state.
    merge: container.querySelector('[data-testid="toolbar-btn-merge"]') as HTMLButtonElement,
    mergeCenterItem: () =>
      document.body.querySelector(
        '[data-testid="toolbar-merge-center"]',
      ) as HTMLButtonElement | null,
    unmergeItem: () =>
      document.body.querySelector(
        '[data-testid="toolbar-merge-unmerge"]',
      ) as HTMLButtonElement | null,
    painter: container.querySelector(
      '[data-testid="toolbar-btn-format-painter"]',
    ) as HTMLButtonElement,
    findReplace: container.querySelector(
      '[data-testid="toolbar-btn-find-replace"]',
    ) as HTMLButtonElement,
  }
}
