import { afterEach, expect, it, vi } from 'vitest'
import { createDefaultWorkbookWorker } from '../../src/worker/create-workbook-worker'

afterEach(() => vi.unstubAllGlobals())

it('creates a fresh module Worker from the library-relative URL only when requested', () => {
  const worker = vi.fn(function Worker() { return {} })
  vi.stubGlobal('Worker', worker)
  expect(worker).not.toHaveBeenCalled()
  expect(createDefaultWorkbookWorker()).not.toBe(createDefaultWorkbookWorker())
  expect(worker).toHaveBeenCalledTimes(2)
  const [url, options] = worker.mock.calls[0] as unknown as [URL, WorkerOptions]
  expect(url).toBeInstanceOf(URL)
  expect(url.pathname).toMatch(/\/worker\/workbook\.worker\.ts$/)
  expect(options).toEqual({ type: 'module' })
})
