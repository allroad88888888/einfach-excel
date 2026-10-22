import { setupI18n } from '@lingui/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createWorkbookI18n } from '../../src/i18n/runtime'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { LanguageSelect } from '../../src/workbook/chrome/header/LanguageSelect'
import { RibbonTabs } from '../../src/workbook/chrome/ribbon/RibbonTabs'

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

test('isolates default language instances while respecting a separately injected Chinese instance', () => {
  const chinese = createWorkbookI18n('zh')
  render(<>
    <section data-testid="first"><WorkbookStoreProvider><LanguageSelect /><RibbonTabs id="a" /></WorkbookStoreProvider></section>
    <section data-testid="second"><WorkbookStoreProvider i18n={chinese}><LanguageSelect /><RibbonTabs id="b" /></WorkbookStoreProvider></section>
  </>)
  const first = within(screen.getByTestId('first')), second = within(screen.getByTestId('second'))
  expect(first.getByRole('combobox')).toHaveValue('en')
  expect(second.getByRole('combobox')).toHaveValue('zh')
  fireEvent.change(first.getByRole('combobox'), { target: { value: 'zh' } })
  fireEvent.change(second.getByRole('combobox'), { target: { value: 'en' } })
  expect(first.getByRole('tab', { name: '开始' })).toBeVisible()
  expect(second.getByRole('tab', { name: 'Start' })).toBeVisible()
})

test('only explicit I18n injection shares language changes', () => {
  const shared = createWorkbookI18n()
  render(<>
    <WorkbookStoreProvider i18n={shared}><LanguageSelect /></WorkbookStoreProvider>
    <WorkbookStoreProvider i18n={shared}><LanguageSelect /></WorkbookStoreProvider>
  </>)
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'zh' } })
  expect(screen.getAllByRole('combobox', { name: '界面语言' })).toHaveLength(2)
})

test('controlled locale disables the selector and follows host prop changes', () => {
  const view = (locale: 'en' | 'zh') => <WorkbookStoreProvider locale={locale}><LanguageSelect /></WorkbookStoreProvider>
  const { rerender } = render(view('en'))
  expect(screen.getByRole('combobox')).toBeDisabled()
  rerender(view('zh'))
  expect(screen.getByRole('combobox', { name: '界面语言' })).toHaveValue('zh')
})

test('preserves an injected host language and its dictionaries when locale is omitted', () => {
  const host = setupI18n({ locale: 'fr', messages: { fr: {} } })
  const { rerender } = render(
    <WorkbookStoreProvider i18n={host}><LanguageSelect /></WorkbookStoreProvider>,
  )
  expect(host.locale).toBe('fr')
  expect(screen.getByRole('combobox')).toHaveValue('fr')
  const next = createWorkbookI18n('zh')
  rerender(<WorkbookStoreProvider i18n={next}><LanguageSelect /></WorkbookStoreProvider>)
  expect(screen.getByRole('combobox')).toHaveValue('zh')
  act(() => next.activate('en'))
  expect(screen.getByRole('combobox')).toHaveValue('en')
})

test('mounting and selecting a library locale never reads or writes URL/storage preferences', () => {
  window.history.replaceState({ host: true }, '', '/?locale=zh&renderer=canvas#host')
  const read = vi.spyOn(Storage.prototype, 'getItem')
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const history = vi.spyOn(window.history, 'replaceState')
  render(<WorkbookStoreProvider><LanguageSelect /></WorkbookStoreProvider>)
  expect(screen.getByRole('combobox')).toHaveValue('en')
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zh' } })
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  expect(history).not.toHaveBeenCalled()
  expect(window.location.search).toBe('?locale=zh&renderer=canvas')
  expect(window.location.hash).toBe('#host')
})
