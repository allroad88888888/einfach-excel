import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import reactExcelManifest from '../../package.json'
import xlsxManifest from '../../../xlsx-wasm/package.json'
import cellAppearanceManifest from '../../../../plugins/plugin-cell-appearance/package.json'
import chartManifest from '../../../../plugins/plugin-chart/package.json'
import dataConsolidateManifest from '../../../../plugins/plugin-data-consolidate/package.json'
import dataFilterManifest from '../../../../plugins/plugin-data-filter/package.json'
import dataSortManifest from '../../../../plugins/plugin-data-sort/package.json'
import dataSubtotalManifest from '../../../../plugins/plugin-data-subtotal/package.json'
import datePickerManifest from '../../../../plugins/plugin-date-picker/package.json'
import imageManifest from '../../../../plugins/plugin-image/package.json'
import imageExportManifest from '../../../../plugins/plugin-image-export/package.json'
import sampleManifest from '../../../../plugins/plugin-sample/package.json'
import sparklineManifest from '../../../../plugins/plugin-sparkline/package.json'
import textFormatManifest from '../../../../plugins/plugin-text-format/package.json'
import {
  Spreadsheet,
  WorkbookRuntimeProvider,
  WorkbookStoreProvider,
  WorkbookView,
  type SpreadsheetPlugin,
} from '../../src'

const DEFINITION = {
  title: 'SSR Host',
  sheets: [{ id: 'sheet-1', name: 'Sheet 1', rowCount: 20, colCount: 8 }],
  createImportChunks: () => [],
}

const PUBLIC_PLUGINS = [
  cellAppearanceManifest,
  chartManifest,
  dataConsolidateManifest,
  dataFilterManifest,
  dataSortManifest,
  dataSubtotalManifest,
  datePickerManifest,
  imageManifest,
  imageExportManifest,
  sparklineManifest,
  textFormatManifest,
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SSR safe initial render without window or Worker', () => {
  it('renders Spreadsheet and localized status shell via renderToString when window and Worker are absent', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('Worker', undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const plugin: SpreadsheetPlugin = {
      id: 'ssr-check',
      messages: { zh: {} },
    }

    const enHtml = renderToString(
      <Spreadsheet definition={DEFINITION} plugins={[plugin]} style={{ height: 480 }} />,
    )
    const zhHtml = renderToString(
      <Spreadsheet definition={DEFINITION} locale="zh" plugins={[plugin]} />,
    )
    const providerHtml = renderToString(
      <WorkbookRuntimeProvider definition={DEFINITION}>
        <div>Client workbook</div>
      </WorkbookRuntimeProvider>,
    )
    const viewHtml = renderToString(
      <WorkbookStoreProvider locale="en">
        <WorkbookView />
      </WorkbookStoreProvider>,
    )

    expect(enHtml).toContain('einfach-spreadsheet')
    expect(enHtml).toContain('Loading Rust/WASM workbook')
    expect(zhHtml).toContain('正在加载 Rust/WASM 工作簿')
    expect(providerHtml).toContain('Loading Rust/WASM workbook')
    expect(providerHtml).not.toContain('Client workbook')
    expect(viewHtml).toContain('data-runtime-state="ssr"')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('React 18/19 and 0.x package metadata contracts', () => {
  it('declares React 18.3 and React 19 peer compatibility and 0.x UI Core range on react-excel', () => {
    expect(reactExcelManifest.private).toBe(false)
    expect(reactExcelManifest.peerDependencies.react).toBe('^18.3.1 || ^19.0.0')
    expect(reactExcelManifest.peerDependencies['react-dom']).toBe('^18.3.1 || ^19.0.0')
    expect(reactExcelManifest.peerDependencies['@einfach-excel/spreadsheet-ui-core'])
      .toBe('>=0.2.0 <1.0.0')
  })

  it('configures @einfach-excel/xlsx and all 11 business plugins as public 0.1.0 packages while keeping plugin-sample private', () => {
    expect(xlsxManifest).toMatchObject({
      name: '@einfach-excel/xlsx',
      version: '0.1.0',
      private: false,
      publishConfig: { access: 'public' },
      engines: { node: '>=22.12.0' },
    })
    expect(sampleManifest.private).toBe(true)
    expect(PUBLIC_PLUGINS).toHaveLength(11)

    for (const manifest of PUBLIC_PLUGINS) {
      expect(manifest.version).toBe('0.1.0')
      expect(manifest.private).toBe(false)
      expect(manifest.publishConfig.access).toBe('public')
      expect(manifest.engines).toEqual({ node: '>=22.12.0' })
      expect(manifest.files).toEqual(['dist', 'README.md', 'LICENSE'])
      expect(manifest.peerDependencies.react).toBe('^18.3.1 || ^19.0.0')
      expect(manifest.peerDependencies['react-dom']).toBe('^18.3.1 || ^19.0.0')
      expect(manifest.peerDependencies['@einfach-excel/react-excel']).toBe('>=0.1.0 <1.0.0')
      expect(manifest.peerDependencies['@einfach-excel/spreadsheet-ui-core']).toBe('>=0.2.0 <1.0.0')
    }

    expect(
      (chartManifest as { dependencies?: Record<string, string> }).dependencies,
    ).toBeUndefined()
    expect(chartManifest.peerDependencies.echarts).toBe('^6.1.0')
  })
})
