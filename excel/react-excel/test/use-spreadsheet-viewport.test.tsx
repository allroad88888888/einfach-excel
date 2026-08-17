import type {
  CellRange,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, render, screen, waitFor } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetViewport,
  type UseSpreadsheetViewportOptions,
} from '../src/use-spreadsheet-viewport'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

function resultFor(
  request: VisibleProjectionRequest,
  displayValue: string,
): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    sheetId: request.sheetId,
    requestId: request.requestId,
    window: request.window,
    cells: [{ row: request.window.rowStart, col: request.window.colStart, displayValue }],
  }
}

function ViewportProbe({ options }: { options: UseSpreadsheetViewportOptions }) {
  const viewport = useSpreadsheetViewport(options)
  return (
    <>
      <output data-testid="window">
        {`${viewport.window.rowStart}:${viewport.window.rowEnd}:${viewport.window.colStart}:${viewport.window.colEnd}`}
      </output>
      <output data-testid="status">{viewport.status}</output>
      <output data-testid="cells">
        {viewport.cells.map((cell) => cell.displayValue).join(',')}
      </output>
      <button onClick={() => viewport.scrollTo(99, -10)}>scroll</button>
    </>
  )
}

function ViewportHarness({
  backend,
  window,
  maxCells,
  onWindowChange,
}: {
  backend: SpreadsheetBackend
  window: CellRange
  maxCells?: number
  onWindowChange?: (window: CellRange) => void
}) {
  return (
    <SpreadsheetUiProvider backend={backend}>
      <ViewportProbe
        options={{
          sheetId: 'sheet-1',
          window,
          rowCount: 100,
          colCount: 100,
          maxCells,
          onWindowChange: (nextWindow) => onWindowChange?.(nextWindow),
        }}
      />
    </SpreadsheetUiProvider>
  )
}

function createBackend() {
  const requests: VisibleProjectionRequest[] = []
  const gates: Array<Deferred<VisibleProjectionResult>> = []
  const readVisibleProjection = jest.fn((request: VisibleProjectionRequest) => {
    const gate = deferred<VisibleProjectionResult>()
    requests.push(request)
    gates.push(gate)
    return gate.promise
  })

  return {
    backend: { readVisibleProjection } as unknown as SpreadsheetBackend,
    gates,
    requests,
  }
}

async function waitForRequests(
  backend: ReturnType<typeof createBackend>,
  expectedCount: number,
): Promise<void> {
  await waitFor(() => expect(backend.requests).toHaveLength(expectedCount))
}

describe('useSpreadsheetViewport', () => {
  it('clamps its controlled window and sends a bounded visible projection', async () => {
    const controlled = createBackend()
    const onWindowChange = jest.fn()
    render(
      <ViewportHarness
        backend={controlled.backend}
        window={{ rowStart: 95, rowEnd: 110, colStart: 95, colEnd: 110 }}
        maxCells={4}
        onWindowChange={onWindowChange}
      />,
    )

    await waitForRequests(controlled, 1)
    expect(controlled.requests[0]?.window).toEqual({
      rowStart: 95,
      rowEnd: 98,
      colStart: 95,
      colEnd: 95,
    })
    expect(screen.getByTestId('window')).toHaveTextContent('95:98:95:95')

    await act(async () => {
      screen.getByRole('button', { name: 'scroll' }).click()
    })
    expect(onWindowChange).toHaveBeenCalledWith({
      rowStart: 96,
      rowEnd: 99,
      colStart: 0,
      colEnd: 0,
    })
  })

  it('keeps an older response from painting over the latest controlled window', async () => {
    const controlled = createBackend()
    const view = render(
      <ViewportHarness
        backend={controlled.backend}
        window={{ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }}
      />,
    )

    await waitForRequests(controlled, 1)
    view.rerender(
      <ViewportHarness
        backend={controlled.backend}
        window={{ rowStart: 5, rowEnd: 6, colStart: 5, colEnd: 6 }}
      />,
    )

    await act(async () => {
      controlled.gates[0]?.resolve(resultFor(controlled.requests[0]!, 'old'))
    })
    await waitForRequests(controlled, 2)
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    expect(screen.getByTestId('cells')).toHaveTextContent('')

    await act(async () => {
      controlled.gates[1]?.resolve(resultFor(controlled.requests[1]!, 'new'))
    })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(screen.getByTestId('cells')).toHaveTextContent('new')
  })
})
