import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { Provider as AtomProvider } from '@einfach/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { refreshSheetDrawingsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { renderChartSvg } from '../src/chart-image'
import { ChartSettingsPanel } from '../src/ChartSettingsPanel'
import {
  chartSectionForComponent,
  chartSettingsAtom,
  DARK_CHART_THEME,
  loadChartGridAtom,
  openChartSettingsAtom,
  parseChartSpec,
  toEChartsOption,
} from '../src/core'
import { messages } from '../src/messages'
import { chartDrawing, num, setupChartRust, text } from './rust-fixture'

function createEnI18n() {
  const i18n = setupI18n({ locale: 'en', messages: { en: messages.en ?? {} } })
  i18n.activate('en')
  return i18n
}

const SAMPLE_CELLS = () => [
  text(0, 0, 'Month'),
  text(0, 1, 'Revenue'),
  text(1, 0, 'Jan'),
  num(1, 1, 120),
  text(2, 0, 'Feb'),
  num(2, 1, 160),
]
const REFS = [{ startRow: 0, startCol: 0, endRow: 2, endCol: 1 }]

describe('chart element double-click routing & settings section focus', () => {
  test('maps ECharts componentType to the target settings section and guards unsupported sections', () => {
    expect(chartSectionForComponent('title', { type: 'column' })).toBe('title')
    expect(chartSectionForComponent('legend', { type: 'column' })).toBe('legend')
    expect(chartSectionForComponent('legend', { type: 'waterfall' })).toBeNull()
    expect(chartSectionForComponent('xAxis', { type: 'column' })).toBe('axis')
    expect(chartSectionForComponent('yAxis', { type: 'line' })).toBe('axis')
    expect(chartSectionForComponent('xAxis', { type: 'pie' })).toBeNull()
    expect(chartSectionForComponent('series', { type: 'pie' })).toBe('series')
    expect(chartSectionForComponent(undefined, { type: 'column' })).toBeNull()
  })

  test('opening settings with a section activates and focuses that section, including when switching sections', async () => {
    const { store, rust } = setupChartRust(SAMPLE_CELLS())
    const drawing = chartDrawing('chart-1', REFS, {
      payload: { type: 'column', title: 'Sales', xTitle: 'Month', yTitle: 'Amount' },
    })
    rust.drawings = [drawing]
    await store.setter(refreshSheetDrawingsAtom)
    await store.setter(loadChartGridAtom, drawing)

    const i18n = createEnI18n()
    render(
      <I18nProvider i18n={i18n}>
        <AtomProvider store={store}>
          <ChartSettingsPanel />
        </AtomProvider>
      </I18nProvider>,
    )

    // 1. Title section
    act(() => {
      store.setter(openChartSettingsAtom, { id: 'chart-1', section: 'title' })
    })
    expect(screen.getByLabelText('Chart title')).toHaveFocus()
    expect(
      document.querySelector('[data-chart-section="title"]')?.getAttribute('data-section-active'),
    ).toBe('true')

    // 2. Legend section while panel is already open
    act(() => {
      store.setter(openChartSettingsAtom, { id: 'chart-1', section: 'legend' })
    })
    expect(screen.getByLabelText('Legend')).toHaveFocus()
    expect(
      document.querySelector('[data-chart-section="legend"]')?.getAttribute('data-section-active'),
    ).toBe('true')

    // 3. Axis section
    act(() => {
      store.setter(openChartSettingsAtom, { id: 'chart-1', section: 'axis' })
    })
    expect(screen.getByLabelText('Horizontal axis title')).toHaveFocus()
    expect(
      document.querySelector('[data-chart-section="axis"]')?.getAttribute('data-section-active'),
    ).toBe('true')

    // 4. Series section
    act(() => {
      store.setter(openChartSettingsAtom, { id: 'chart-1', section: 'series' })
    })
    const activeInSeries = document.activeElement?.closest('[data-chart-section]')
    expect(activeInSeries?.getAttribute('data-chart-section')).toBe('series')
    expect(store.getter(chartSettingsAtom)).toMatchObject({ open: true, section: 'series' })
  })
})

describe('chart dark surface theme & export consistency', () => {
  test('spec.dark toggles dark canvas, text, gridlines, legend and tooltip and persists via drawings.set', async () => {
    const parsedDefault = parseChartSpec({})
    expect(parsedDefault.dark).toBe(false)
    const parsedDark = parseChartSpec({ type: 'column', title: 'Night', dark: true })
    expect(parsedDark.dark).toBe(true)

    const option = toEChartsOption({
      spec: parsedDark,
      data: {
        categories: ['Q1', 'Q2'],
        xValues: null,
        series: [{ name: 'Revenue', values: [12, 18], labels: ['12', '18'] }],
      },
      theme: DARK_CHART_THEME,
    })
    expect(option.backgroundColor).toBe(DARK_CHART_THEME.background)
    expect(option.color).toEqual(DARK_CHART_THEME.palette)
    expect((option.textStyle as { color: string }).color).toBe(DARK_CHART_THEME.text)
    const titleOpt = option.title as { triggerEvent?: boolean; textStyle: { color: string } }
    expect(titleOpt).toMatchObject({
      triggerEvent: true,
      textStyle: { color: DARK_CHART_THEME.text },
    })
    const legendOpt = option.legend as { triggerEvent?: boolean; textStyle: { color: string } }
    expect(legendOpt).toMatchObject({
      triggerEvent: true,
      textStyle: { color: DARK_CHART_THEME.text },
    })
    const yAxisOpt = option.yAxis as {
      triggerEvent?: boolean
      splitLine: { lineStyle: { color: string } }
    }
    expect(yAxisOpt).toMatchObject({
      triggerEvent: true,
      splitLine: { lineStyle: { color: DARK_CHART_THEME.gridline } },
    })
    expect((option.tooltip as { backgroundColor: string; borderColor: string })).toMatchObject({
      backgroundColor: DARK_CHART_THEME.background,
      borderColor: DARK_CHART_THEME.axisLine,
    })

    // Offscreen SVG export preserves the dark background #1c1b27.
    const svgBlob = await renderChartSvg(option, 480, 288)
    const svgText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(svgBlob)
    })
    expect(svgText.toLowerCase()).toContain(DARK_CHART_THEME.background)

    // Settings panel toggle writes dark: true into drawing payload via drawings.set.
    const { store, rust, writes } = setupChartRust(SAMPLE_CELLS())
    const drawing = chartDrawing('chart-1', REFS, { payload: { type: 'column', title: 'Rev' } })
    rust.drawings = [drawing]
    await store.setter(refreshSheetDrawingsAtom)
    await store.setter(loadChartGridAtom, drawing)
    store.setter(openChartSettingsAtom, 'chart-1')

    render(
      <I18nProvider i18n={createEnI18n()}>
        <AtomProvider store={store}>
          <ChartSettingsPanel />
        </AtomProvider>
      </I18nProvider>,
    )
    const toggle = screen.getByRole('checkbox', { name: 'Dark surface' })
    expect(toggle).not.toBeChecked()
    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(writes('drawings.set')).toHaveLength(1)
    expect(parseChartSpec(writes('drawings.set')[0]!.drawing.payload).dark).toBe(true)
  })
})
