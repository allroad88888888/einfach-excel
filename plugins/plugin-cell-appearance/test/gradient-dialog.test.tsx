import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../excel/react-excel/src/page/WorkbookStoreProvider'
import { WorkbookRibbon } from '../../../excel/react-excel/src/workbook/chrome/ribbon/WorkbookRibbon'
import { PluginPanels } from '../../../excel/react-excel/src/plugin/PluginMounts'
import { createWorkbookI18n } from '../../../excel/react-excel/src/i18n/runtime'
import { cellAppearancePlugin } from '../src'
import { setup } from './fill-fixture'

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(name: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(name), { target: { value } }) })
}

test('gradient type switches retain geometry and imported stops before a single submit', async () => {
  const stops = [{ position: 0, color: '#ffffff' }, { position: 0.3, color: '#00ff00' }, { position: 1, color: '#0000ff' }]
  const { store, writes } = await setup({ fill: { kind: 'linear-gradient', degree: -450, stops } })
  render(<WorkbookStoreProvider store={store} plugins={[cellAppearancePlugin]}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  await click('Gradient fill')
  await change('Gradient type', 'path-gradient')
  for (const [name, value] of [['Left (%)', '10'], ['Right (%)', '70'], ['Top (%)', '20'], ['Bottom (%)', '60']])
    await change(name, value)
  await change('Gradient type', 'linear-gradient')
  expect(screen.getByLabelText('Angle (degrees)')).toHaveValue('-450')
  await change('Gradient type', 'path-gradient')
  expect(screen.getByLabelText('Right (%)')).toHaveValue('70')
  expect(screen.getByRole('img', { name: 'Fill preview' }).style.backgroundImage).toContain('data:image/svg+xml')
  expect(writes).toHaveLength(0)
  await act(async () => { fireEvent.submit(screen.getByRole('dialog').querySelector('form')!) })
  expect(writes).toHaveLength(1)
  expect(writes[0].format).toEqual({ bgColor: '#ffffff', fill: {
    kind: 'path-gradient', left: 0.1, right: 0.7, top: 0.2, bottom: 0.6, stops,
  } })
})

test('invalid input stays editable; Cancel discards it and plugin remount restores an open draft', async () => {
  const { store, writes } = await setup()
  const view = (enabled: boolean) => <WorkbookStoreProvider store={store}
    plugins={enabled ? [cellAppearancePlugin] : []}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>
  const mounted = render(view(true))
  await click('Gradient fill')
  await change('Angle (degrees)', 'NaN')
  await click('Apply fill')
  expect(screen.getByRole('alert')).toHaveTextContent('finite angle')
  expect(screen.getByLabelText('Angle (degrees)')).toHaveValue('NaN')
  await change('Angle (degrees)', '-450')
  expect(screen.queryByRole('alert')).toBeNull()
  mounted.rerender(view(false))
  expect(screen.queryByRole('button', { name: 'Gradient fill' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Fill color' })).toBeVisible()
  mounted.rerender(view(true))
  expect(screen.getByLabelText('Angle (degrees)')).toHaveValue('-450')
  await click('Cancel')
  await click('Gradient fill')
  expect(screen.getByLabelText('Angle (degrees)')).toHaveValue('0')
  expect(writes).toHaveLength(0)
})

test('Chinese controls distinguish rectangular edges and inner versus outer colors', async () => {
  const { store } = await setup()
  render(<WorkbookStoreProvider store={store} plugins={[cellAppearancePlugin]} i18n={createWorkbookI18n('zh')}>
    <WorkbookRibbon /><PluginPanels />
  </WorkbookStoreProvider>)
  await click('渐变填充')
  expect(screen.getByLabelText('角度（度）')).toHaveValue('0')
  await change('渐变类型', 'path-gradient')
  for (const name of ['左边（%）', '右边（%）', '上边（%）', '下边（%）'])
    expect(screen.getByLabelText(name)).toHaveValue('50')
  expect(screen.getByLabelText('内部颜色')).toHaveValue('#ffffff')
  expect(screen.getByLabelText('外部颜色')).toHaveValue('#4472c4')
})
