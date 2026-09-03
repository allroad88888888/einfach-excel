import { describe, expect, it, jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'

jest.mock('../../src/page/WorkbookRuntimeProvider', () => ({
  WorkbookRuntimeProvider: ({ children }: { readonly children: ReactNode }) => children,
}))
jest.mock('../../src/workbook/shell/WorkbookView', () => ({
  WorkbookView: () => <div data-testid="workbook-view">Ready workbook</div>,
}))

const { App } = jest.requireActual('../../src/app/App') as {
  App: ComponentType
}

describe('demo page', () => {
  it('renders registered navigation outside the active demo', () => {
    window.history.replaceState({}, '', '/?demo=sales-orders')
    render(<App />)

    expect(screen.getByRole('complementary', { name: '产品导航' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: '工作簿菜单' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sales Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Sales Orders' })).toHaveAttribute(
      'href',
      '?demo=sales-orders',
    )
    expect(screen.getByRole('main', { name: '工作簿演示内容' })).toContainElement(
      screen.getByTestId('workbook-view'),
    )
  })

  it('falls back to the first registered demo for an unknown id', () => {
    window.history.replaceState({}, '', '/?demo=missing')
    render(<App />)

    expect(screen.getByRole('link', { name: 'Sales Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByTestId('workbook-view')).toBeVisible()
  })
})
