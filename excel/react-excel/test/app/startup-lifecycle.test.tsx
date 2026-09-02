import { describe, expect, it, jest } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

interface MockRustBackend {
  ready(): Promise<void>
  dispose(): void
}

const mockCreateRustWorkbookBackend = jest.fn<() => MockRustBackend>()

jest.mock(
  '../../src/product/sales-orders/runtime/create-rust-workbook-backend',
  () => ({ createRustWorkbookBackend: mockCreateRustWorkbookBackend }),
)
jest.mock('../../src/workbook/shell/Workbook', () => ({
  Workbook: () => <main>Ready workbook</main>,
}))

const { App } = jest.requireActual('../../src/app/App') as {
  App: ComponentType
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createBackend(ready: Promise<void>): MockRustBackend {
  return {
    ready: jest.fn(() => ready),
    dispose: jest.fn(),
  }
}

describe('App startup lifecycle', () => {
  it('renders loading until the product backend becomes ready and disposes it', async () => {
    const startup = deferred<void>()
    const backend = createBackend(startup.promise)
    mockCreateRustWorkbookBackend.mockReturnValueOnce(backend)
    const rendered = render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading Rust/WASM workbook')

    await act(async () => startup.resolve())
    expect(screen.getByText('Ready workbook')).toBeVisible()

    rendered.unmount()
    expect(backend.dispose).toHaveBeenCalledTimes(1)
  })

  it('renders an async startup error and releases the backend once', async () => {
    const startup = deferred<void>()
    const backend = createBackend(startup.promise)
    mockCreateRustWorkbookBackend.mockReturnValueOnce(backend)
    render(<App />)

    await act(async () => startup.reject(new Error('Worker initialization failed')))

    expect(screen.getByRole('alert')).toHaveTextContent('Worker initialization failed')
    expect(backend.dispose).toHaveBeenCalledTimes(1)
  })

  it('renders a synchronous backend creation error', () => {
    mockCreateRustWorkbookBackend.mockImplementationOnce(() => {
      throw new Error('Worker construction failed')
    })

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('Worker construction failed')
  })
})
