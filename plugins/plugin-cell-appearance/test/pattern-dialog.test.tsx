import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { WorkbookRibbon } from '../../../excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon'
import { PluginPanels } from '../../../excel/react-excel/src/plugin/PluginMounts'
import { createWorkbookI18n } from '../../../excel/react-excel/src/i18n/runtime'
import { cellAppearancePlugin } from '../src'
import { setup } from './pattern-fixture'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(name: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(name), { target: { value } }) })
}

test('the optional dialog edits all patterns and two colors without writing before Apply', async () => {
  const { store, writes } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[cellAppearancePlugin]}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  await click('Pattern fill')
  const dialog = screen.getByRole('dialog', { name: 'Pattern fill' })
  expect(within(dialog).getAllByRole('option')).toHaveLength(17)
  await change('Pattern', 'gray0625')
  await change('Pattern color', '#c00000')
  await change('Background color', '#fff2cc')
  expect(writes).toHaveLength(0)
  expect(screen.getByRole('img', { name: 'Fill preview' }).style.backgroundImage).toContain('data:image/svg+xml')
  await click('Apply fill')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(writes).toHaveLength(1)
  expect(writes[0]?.format).toEqual({ bgColor: '#fff2cc',
    fill: { kind: 'pattern', pattern: 'gray0625', foreground: '#c00000' } })
})

test('validation leaves a visible correctable draft and Cancel never submits it', async () => {
  const { store, writes } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[cellAppearancePlugin]}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  await click('Pattern fill')
  await change('Pattern color', 'red')
  await click('Apply fill')
  expect(screen.getByRole('alert')).toHaveTextContent('valid #RRGGBB')
  expect(screen.getByLabelText('Pattern color')).toHaveValue('red')
  expect(writes).toHaveLength(0)
  await change('Pattern color', '#abcdef')
  expect(screen.queryByRole('alert')).toBeNull()
  await click('Cancel')
  await click('Pattern fill')
  expect(screen.getByLabelText('Pattern color')).toHaveValue('#000000')
  expect(writes).toHaveLength(0)
})

test('unmounting and remounting the plugin retains its open draft in the same store', async () => {
  const { store, writes } = await setup()
  const view = (enabled: boolean) => <WorkbookStoreProvider store={store}
    plugins={enabled ? [cellAppearancePlugin] : []}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>
  const mounted = render(view(true))
  await click('Pattern fill')
  await change('Pattern', 'darkUp')
  await change('Background color', '#abcdef')
  mounted.rerender(view(false))
  expect(screen.queryByRole('button', { name: 'Pattern fill' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Fill color' })).toBeVisible()
  mounted.rerender(view(true))
  expect(screen.getByLabelText('Pattern')).toHaveValue('darkUp')
  expect(screen.getByLabelText('Background color')).toHaveValue('#abcdef')
  await click('Apply fill')
  expect(writes).toHaveLength(1)
})

test('Chinese labels cover the whole pattern selector and color controls', async () => {
  const { store } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[cellAppearancePlugin]} i18n={createWorkbookI18n('zh')}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  await click('图案填充')
  expect(screen.getByLabelText('图案')).toHaveValue('lightDown')
  expect(screen.getByRole('option', { name: '细下斜条纹' })).toBeVisible()
  expect(screen.getByRole('option', { name: '6.25% 点状' })).toBeVisible()
  expect(screen.getByLabelText('图案颜色')).toHaveValue('#000000')
  expect(screen.getByLabelText('底色')).toHaveValue('#ffffff')
})
