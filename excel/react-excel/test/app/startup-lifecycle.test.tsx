import { describe, expect, it, jest } from '@jest/globals'
import { act, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

interface MockRustConnection {
  dispose(): void
}

const mockCreateConnection = jest.fn<() => MockRustConnection>()
const mockInitializeWorkbook = jest.fn<(connection: MockRustConnection) => Promise<void>>()

jest.mock(
  '../../src/product/sales-orders/runtime/create-rust-workbook-connection',
  () => ({ createSalesOrdersWorkbookConnection: mockCreateConnection }),
)
jest.mock(
  '../../src/product/sales-orders/runtime/initialize-sales-orders-workbook',
  () => ({ initializeSalesOrdersWorkbook: mockInitializeWorkbook }),
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

function createConnection(): MockRustConnection {
  return { dispose: jest.fn() }
}

describe('App startup lifecycle', () => {
  it('renders loading until initialization finishes and disposes the connection', async () => {
    const startup = deferred<void>()
    const connection = createConnection()
    mockCreateConnection.mockReturnValueOnce(connection)
    mockInitializeWorkbook.mockReturnValueOnce(startup.promise)
    const rendered = render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading Rust/WASM workbook')

    await act(async () => startup.resolve())
    expect(screen.getByText('Ready workbook')).toBeVisible()

    rendered.unmount()
    expect(connection.dispose).toHaveBeenCalledTimes(1)
  })

  it('renders an async startup error and releases the connection once', async () => {
    const startup = deferred<void>()
    const connection = createConnection()
    mockCreateConnection.mockReturnValueOnce(connection)
    mockInitializeWorkbook.mockReturnValueOnce(startup.promise)
    render(<App />)

    await act(async () => startup.reject(new Error('Worker initialization failed')))

    expect(screen.getByRole('alert')).toHaveTextContent('Worker initialization failed')
    expect(connection.dispose).toHaveBeenCalledTimes(1)
  })

  it('renders a synchronous connection creation error', () => {
    mockCreateConnection.mockImplementationOnce(() => {
      throw new Error('Worker construction failed')
    })

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('Worker construction failed')
  })
})
