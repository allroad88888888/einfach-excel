import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { runVisibleProjectionAtom, type VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'
import { projectionResultFor, renderSalesOrdersProjectionWorksheet } from '../../support/projection-harness'

describe('Rust workbook projection error', () => {
  it('a successful explicit reread removes the error and restores cell editing', async () => {
    const read = vi.fn(async (request: VisibleProjectionRequest) => projectionResultFor(request))
    read.mockRejectedValueOnce(new Error('temporary read failure'))
    const store = renderSalesOrdersProjectionWorksheet(
      createTestRustWorkbookConnection({ readVisibleProjection: read }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('temporary read failure')
    expect(read).toHaveBeenCalledOnce()
    // 只触发已有重读命令，验证 React 对 error → ready 的实际渲染与事件恢复。
    await act(async () => {
      const { sheetId, window, reason } = read.mock.calls[0][0]
      expect(await store.setter(runVisibleProjectionAtom, { sheetId, window, reason }))
        .toEqual({ status: 'ready' })
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const cell = document.querySelector<HTMLElement>('[data-cell="0:0"]')!
    expect(cell).toHaveTextContent('Order')
    fireEvent.doubleClick(cell)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Cell editor' }))
      .toHaveValue('Order'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Cell editor' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('shows Rust projection failures in place of worksheet cells', async () => {
    const readVisibleProjection = vi.fn(async () => {
      throw new Error('Rust projection unavailable')
    })
    renderSalesOrdersProjectionWorksheet(
      createTestRustWorkbookConnection({ readVisibleProjection }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Rust projection unavailable')
    expect(document.querySelectorAll('td')).toHaveLength(0)
  })
})
