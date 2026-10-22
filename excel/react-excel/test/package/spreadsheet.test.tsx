import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Spreadsheet } from '../../src/Spreadsheet'

const { mounted } = vi.hoisted(() => ({ mounted: vi.fn() }))
vi.mock('../../src/page/WorkbookRuntimeProvider', () => ({
  WorkbookRuntimeProvider: ({ children, ...props }: { children: ReactNode }) => {
    mounted(props)
    return children
  },
}))
vi.mock('../../src/workbook/shell/WorkbookView', () => ({
  WorkbookView: () => <div data-testid="full-workbook">Complete workbook</div>,
}))

it('composes the full WorkbookView with the runtime inputs and host sizing', () => {
  const definition = { title: 'Host', sheets: [], createImportChunks: () => [] }
  const workerFactory = vi.fn()
  render(<Spreadsheet definition={definition} workerFactory={workerFactory}
    className="host-sheet" style={{ height: 600 }} />)
  const container = screen.getByTestId('full-workbook').parentElement
  expect(container).toHaveClass('host-sheet')
  expect(container).toHaveClass('einfach-spreadsheet')
  expect(container).toHaveStyle({ height: '600px' })
  expect(mounted).toHaveBeenCalledWith({ definition, workerFactory })
})
