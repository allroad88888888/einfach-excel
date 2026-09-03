import type {
  RustWorkbookDefinition,
  StartRustWorkbookRuntimeInput,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'

const mockCreateWorker = jest.fn()

jest.mock(
  '@einfach/spreadsheet-ui-core/rust-runtime?worker',
  () => ({ __esModule: true, default: mockCreateWorker }),
  { virtual: true },
)

const { WorkbookRuntimeProvider } = jest.requireActual(
  '../../src/page/WorkbookRuntimeProvider',
) as {
  WorkbookRuntimeProvider: ComponentType<{
    readonly children: ReactNode
    readonly definition: RustWorkbookDefinition
  }>
}

type RuntimeWorker = ReturnType<StartRustWorkbookRuntimeInput['workerFactory']>

function createReadyWorker(): { worker: RuntimeWorker; terminate: jest.Mock } {
  const terminate = jest.fn()
  let onMessage: ((event: MessageEvent) => void) | undefined
  return {
    worker: {
      postMessage(message) {
        const request = message as { id: number }
        const result = [{ id: 'sheet-1', index: 0, name: 'Sheet 1' }]
        onMessage?.({ data: { id: request.id, ok: true, result } } as MessageEvent)
      },
      addEventListener(type, listener) {
        if (type === 'message') onMessage = listener
      },
      removeEventListener() {},
      terminate,
    },
    terminate,
  }
}

const DEFINITION: RustWorkbookDefinition = {
  title: 'Test workbook',
  sheets: [{ id: 'sheet-1', name: 'Sheet 1', rowCount: 10, colCount: 5 }],
  createImportChunks: () => [],
}

describe('WorkbookRuntimeProvider lifecycle', () => {
  it('starts the UI-core Rust runtime and disposes its Worker on unmount', async () => {
    const runtimeWorker = createReadyWorker()
    mockCreateWorker.mockImplementationOnce(() => runtimeWorker.worker)
    const rendered = render(
      <WorkbookRuntimeProvider definition={DEFINITION}>
        <div>Ready workbook</div>
      </WorkbookRuntimeProvider>,
    )

    expect(await screen.findByText('Ready workbook')).toBeVisible()

    rendered.unmount()
    expect(runtimeWorker.terminate).toHaveBeenCalledTimes(1)
  })
})
