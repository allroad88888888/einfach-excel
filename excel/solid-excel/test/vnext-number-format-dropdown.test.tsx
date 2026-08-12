/** @jsxImportSource solid-js */

import { createStore, type Store } from '@einfach/core'
import { Provider } from '@einfach/solid'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  beginProjectionAtom,
  openFormatCellsAtom,
  resolveProjectionAtom,
  runToolbarMutationAtom,
  selectCellAtom,
  setWorkspaceActiveSheetAtom,
  toolbarMutationLifecycleAtom,
  type SpreadsheetNumberFormat,
} from '@einfach/spreadsheet-ui-core'
import { setLocale } from '../src/i18n'
import {
  NumberFormatDropdown,
  numberFormatIdForFormat,
  type NumberFormatId,
} from '../src-vnext/toolbar/NumberFormatDropdown'

const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
const ANCHOR_RECT = {
  top: 10,
  right: 110,
  bottom: 30,
  left: 10,
  width: 100,
  height: 20,
  x: 10,
  y: 10,
  toJSON: () => ({}),
} as DOMRect

afterEach(() => {
  cleanup()
  document.querySelectorAll('[data-number-format-test-anchor]').forEach((node) => node.remove())
  setLocale('en')
})

setLocale('en')

function seedActiveFormat(store: Store, numberFormat: SpreadsheetNumberFormat): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  const begin = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 'sheet-1',
    reason: 'test',
    window: RANGE,
  })
  if (begin.status !== 'started') throw new Error('projection seed did not start')
  store.setter(resolveProjectionAtom, {
    request: begin.request,
    result: {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: begin.request.requestId,
      revision: 1,
      window: RANGE,
      cells: [
        {
          row: 0,
          col: 0,
          displayValue: '1,234.56',
          valueKind: 'number',
          format: { numberFormat },
        },
      ],
    },
  })
}

function mountDropdown(store: Store, overrides: { onClose?: () => void } = {}) {
  const anchor = document.createElement('button')
  anchor.dataset.numberFormatTestAnchor = 'true'
  document.body.append(anchor)
  const onSelect = jest.fn<(id: NumberFormatId) => void>()
  const onClose = overrides.onClose ?? jest.fn()
  const rendered = render(() => (
    <Provider store={store}>
      <NumberFormatDropdown
        open
        anchorRect={ANCHOR_RECT}
        anchorEl={anchor}
        onSelect={onSelect}
        onClose={onClose}
      />
    </Provider>
  ))
  return { ...rendered, anchor, onSelect, onClose }
}

function item(id: NumberFormatId): HTMLButtonElement {
  return document.body.querySelector(`[data-testid="number-format-item-${id}"]`)!
}

describe('number-format dropdown model', () => {
  it.each<[SpreadsheetNumberFormat, NumberFormatId]>([
    [{ kind: 'general' }, 'Auto'],
    [{ kind: 'number', digits: 2 }, 'Number'],
    [{ kind: 'decimal', thousands: true }, 'NumberThousands'],
    [{ kind: 'percentage', digits: 1 }, 'Percent'],
    [{ kind: 'date', pattern: 'yyyy年M月d日' }, 'DateLong'],
    [{ kind: 'time', pattern: 'AM/PM h:mm' }, 'Time12'],
    [{ kind: 'custom', pattern: 'yyyy-MM-dd HH:mm' }, 'DateTime24'],
    [{ kind: 'fraction', denominator: 'one-digit' }, 'Custom'],
  ])('maps %j to %s', (format, expected) => {
    expect(numberFormatIdForFormat(format)).toBe(expected)
  })
})

describe('NumberFormatDropdown', () => {
  it('reads the current format from Core and provides wrapping keyboard navigation', async () => {
    const store = createStore()
    seedActiveFormat(store, { kind: 'number', digits: 2, thousands: true })
    mountDropdown(store)

    await waitFor(() => expect(document.activeElement).toBe(item('NumberThousands')))
    expect(item('NumberThousands').getAttribute('aria-checked')).toBe('true')
    expect(item('WanYuan').disabled).toBe(true)

    fireEvent.keyDown(item('NumberThousands'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(item('Accounting'))
    fireEvent.keyDown(item('Accounting'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(item('Currency'))
    fireEvent.keyDown(item('Currency'), { key: 'Home' })
    expect(document.activeElement).toBe(item('Auto'))
  })

  it('reflects the open Format Cells draft instead of stale projection state', async () => {
    const store = createStore()
    seedActiveFormat(store, { kind: 'number', digits: 2 })
    store.setter(openFormatCellsAtom, {
      sheetId: 'sheet-1',
      range: RANGE,
      initialFormat: { numberFormat: { kind: 'custom', pattern: 'yyyy-MM-dd h:mm AM/PM' } },
      initialTab: 'number',
    })
    mountDropdown(store)

    await waitFor(() => expect(document.activeElement).toBe(item('DateTime12')))
    expect(item('DateTime12').getAttribute('aria-checked')).toBe('true')
    expect(item('Number').getAttribute('aria-checked')).toBe('false')
  })

  it('emits shortcuts and restores the anchor on selection and Escape', async () => {
    const store = createStore()
    seedActiveFormat(store, { kind: 'general' })
    const mounted = mountDropdown(store)
    await waitFor(() => expect(document.activeElement).toBe(item('Auto')))

    fireEvent.click(item('Percent'))
    expect(mounted.onSelect).toHaveBeenCalledWith('Percent')
    expect(document.activeElement).toBe(mounted.anchor)

    item('Auto').focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mounted.onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(mounted.anchor)
  })

  it('surfaces Atom-owned mutation ambiguity and performs refresh-only recovery', async () => {
    const store = createStore()
    seedActiveFormat(store, { kind: 'general' })
    const refreshProjection = jest.fn(async () => undefined)
    const setFormatRange = jest.fn(async () => {
      throw new Error('connection interrupted')
    })
    await store.setter(runToolbarMutationAtom, {
      source: { setFormatRange },
      sheetId: 'sheet-1',
      operation: 'format',
      affectedRange: RANGE,
      steps: [{ kind: 'set-format-range', range: RANGE, format: { bold: true } }],
      refreshProjection,
      historyEntryRecorder: (entry, append) => (append(entry) ? 'recorded' : 'rejected'),
    })
    mountDropdown(store)

    expect(
      document.body.querySelector('[data-testid="number-format-mutation-error"]'),
    ).not.toBeNull()
    fireEvent.click(document.body.querySelector('[data-testid="number-format-mutation-retry"]')!)

    await waitFor(() => {
      expect(refreshProjection).toHaveBeenCalledTimes(1)
      expect(store.getter(toolbarMutationLifecycleAtom)).toMatchObject({
        status: 'outcome-unknown',
        canRetryRefresh: false,
      })
    })
    expect(setFormatRange).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-testid="number-format-mutation-retry"]')).toBeNull()
  })
})
