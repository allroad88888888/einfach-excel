import { atom, createStore } from '@einfach/core'
import { useAtomValue } from '@einfach/react'
import { openCellContextMenuAtom, selectWorkbookRibbonTabAtom } from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { PluginEditorAdornments, PluginPanels } from '../../src/plugin/PluginMounts'
import { assertUniquePluginIds } from '../../src/plugin/plugin-context'
import type { SpreadsheetPlugin } from '../../src/plugin/types'
import type { WorkbookUiOptions } from '../../src/page/workbook-ui-options'
import { WorkbookRibbon } from '../../src/workbook/chrome/ribbon/WorkbookRibbon'
import { CellContextMenu } from '../../src/workbook/shift-cells/CellContextMenu'
import { createTestRustWorkbookConnection } from '../support/rust-workbook-connection'

const countAtom = atom(0)
const bumpAtom = atom(null, (get, set) => set(countAtom, get(countAtom) + 1))

function CountPanel() {
  return <output data-testid="plugin-count">{useAtomValue(countAtom)}</output>
}

const plugin: SpreadsheetPlugin = {
  id: 'fake',
  ribbon: [{ id: 'bump', tab: 'Data', Group: () => <button type="button">Bump group</button> }],
  contextMenu: [{ id: 'fake.bump', label: { id: 'fake.bump', message: 'Bump fake' }, command: bumpAtom }],
  editorAdornments: [() => <span data-testid="adornment" />],
  panels: [CountPanel],
  messages: { zh: { 'fake.bump': '加一' } },
}

function renderWith(plugins: readonly SpreadsheetPlugin[], locale: 'en' | 'zh' = 'en',
  ui: WorkbookUiOptions = {}) {
  const store = createStore()
  render(
    <WorkbookStoreProvider connection={createTestRustWorkbookConnection({})} store={store}
      plugins={plugins} locale={locale} ui={ui}>
      <WorkbookRibbon />
      <CellContextMenu />
      <PluginEditorAdornments />
      <PluginPanels />
    </WorkbookStoreProvider>,
  )
  return store
}

describe('spreadsheet plugins', () => {
  it('mounts ribbon groups that follow the built-in tab visibility', async () => {
    const store = renderWith([plugin])
    const group = screen.getByRole('button', { name: 'Bump group' }).closest('.ribbon-tool-group')!
    expect(group).toHaveAttribute('data-plugin', 'fake')
    expect(group).toHaveAttribute('data-inactive', 'false')
    await act(async () => { store.setter(selectWorkbookRibbonTabAtom, 'Formulas') })
    expect(group).toHaveAttribute('data-inactive', 'true')
    await act(async () => { store.setter(selectWorkbookRibbonTabAtom, 'Data') })
    expect(group).toHaveAttribute('data-inactive', 'false')
  })

  it('runs a context menu command after the built-in items and closes the menu', async () => {
    const store = renderWith([plugin])
    await act(async () => { store.setter(openCellContextMenuAtom, { x: 10, y: 10 }) })
    const items = screen.getAllByRole('menuitem')
    expect(items.map(item => item.getAttribute('data-menu-item')))
      .toEqual(['cells.insert', 'cells.delete', 'fake.bump'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bump fake' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByTestId('plugin-count')).toHaveTextContent('1')
  })

  it('merges plugin messages into the workbook i18n instance', async () => {
    const store = renderWith([plugin], 'zh')
    await act(async () => { store.setter(openCellContextMenuAtom, { x: 0, y: 0 }) })
    expect(screen.getByRole('menuitem', { name: '加一' })).toBeInTheDocument()
  })

  it('mounts editor adornments and panels', () => {
    renderWith([plugin])
    expect(screen.getByTestId('adornment')).toBeInTheDocument()
    expect(screen.getByTestId('plugin-count')).toHaveTextContent('0')
  })

  it('renders nothing extra without plugins', async () => {
    const store = renderWith([])
    expect(document.querySelector('[data-plugin]')).toBeNull()
    await act(async () => { store.setter(openCellContextMenuAtom, { x: 0, y: 0 }) })
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })

  it('rejects duplicate plugin ids', () => {
    expect(() => assertUniquePluginIds([plugin, { id: 'fake' }]))
      .toThrow('Duplicate spreadsheet plugin id: fake')
  })

  it('hides built-in and plugin context menu items by id', async () => {
    const store = renderWith([plugin], 'en', { contextMenu: { hidden: ['cells.delete', 'fake.bump'] } })
    await act(async () => { store.setter(openCellContextMenuAtom, { x: 0, y: 0 }) })
    expect(screen.getAllByRole('menuitem').map(item => item.getAttribute('data-menu-item')))
      .toEqual(['cells.insert'])
  })

  it('turns the whole context menu off', async () => {
    const store = renderWith([plugin], 'en', { contextMenu: false })
    await act(async () => { store.setter(openCellContextMenuAtom, { x: 0, y: 0 }) })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
