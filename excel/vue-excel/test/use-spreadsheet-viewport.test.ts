import type {
  CellRange,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { createApp, defineComponent, h, nextTick, shallowRef, type ShallowRef } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import {
  useSpreadsheetViewport,
  type UseSpreadsheetViewportResult,
} from '../src/use-spreadsheet-viewport'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

interface MountedViewport {
  readonly app: ReturnType<typeof createApp>
  readonly viewport: UseSpreadsheetViewportResult
  readonly window: ShallowRef<CellRange>
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
    backend: { readVisibleProjection } as SpreadsheetBackend,
    gates,
    requests,
  }
}

function mountViewport(
  backend: SpreadsheetBackend,
  initialWindow: CellRange,
  maxCells?: number,
  onWindowChange?: (window: CellRange) => void,
): MountedViewport {
  const window = shallowRef(initialWindow)
  let viewport: UseSpreadsheetViewportResult | undefined
  function ViewportCaptureSetup() {
    viewport = useSpreadsheetViewport({
      sheetId: 'sheet-1',
      window,
      rowCount: 100,
      colCount: 100,
      maxCells,
      onWindowChange(nextWindow) {
        window.value = nextWindow
        onWindowChange?.(nextWindow)
      },
    })
    return () => null
  }
  const Capture = defineComponent({
    name: 'ViewportCapture',
    setup: ViewportCaptureSetup,
  })
  const Root = defineComponent({
    setup() {
      return () => h(SpreadsheetUiProvider, { backend }, { default: () => h(Capture) })
    },
  })
  const app = createApp(Root)
  app.mount(document.createElement('div'))

  if (viewport === undefined) throw new Error('Viewport hook was not mounted.')
  return { app, viewport, window }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('useSpreadsheetViewport', () => {
  it('clamps a controlled window before issuing a bounded visible projection', async () => {
    const controlled = createBackend()
    const onWindowChange = jest.fn()
    const mounted = mountViewport(
      controlled.backend,
      { rowStart: 99, rowEnd: 110, colStart: 99, colEnd: 110 },
      4,
      onWindowChange,
    )

    await settle()
    expect(controlled.requests).toHaveLength(1)
    expect(controlled.requests[0]?.window).toEqual({
      rowStart: 96,
      rowEnd: 99,
      colStart: 99,
      colEnd: 99,
    })
    expect(mounted.viewport.window.value).toEqual(controlled.requests[0]?.window)

    mounted.viewport.scrollTo(99, -10)
    expect(onWindowChange).toHaveBeenCalledWith({
      rowStart: 96,
      rowEnd: 99,
      colStart: 0,
      colEnd: 0,
    })
    mounted.app.unmount()
  })

  it('does not paint an obsolete response after the controlled window changes', async () => {
    const controlled = createBackend()
    const mounted = mountViewport(controlled.backend, {
      rowStart: 0,
      rowEnd: 1,
      colStart: 0,
      colEnd: 1,
    })

    await settle()
    expect(controlled.requests).toHaveLength(1)
    mounted.window.value = { rowStart: 5, rowEnd: 6, colStart: 5, colEnd: 6 }
    await settle()

    controlled.gates[0]?.resolve(resultFor(controlled.requests[0]!, 'old'))
    await settle()
    expect(controlled.requests).toHaveLength(2)
    expect(mounted.viewport.status.value).toBe('loading')
    expect(mounted.viewport.cells.value).toEqual([])

    controlled.gates[1]?.resolve(resultFor(controlled.requests[1]!, 'new'))
    await settle()
    expect(mounted.viewport.status.value).toBe('ready')
    expect(mounted.viewport.cells.value.map((cell) => cell.displayValue)).toEqual(['new'])
    mounted.app.unmount()
  })
})
