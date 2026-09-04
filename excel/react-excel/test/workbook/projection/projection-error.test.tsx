import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'
import { renderSalesOrdersProjectionWorksheet } from '../../support/projection-harness'

describe('Rust workbook projection error', () => {
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
