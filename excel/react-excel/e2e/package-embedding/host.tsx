import { createRoot } from 'react-dom/client'
import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'

/** 先测宿主原样式，再动态载入真实公开源码入口及其 CSS。 */
function hostStyles() {
  return ['html', 'body', '#host-button', '#host-input', '#host-table', '#host-table .cell', '#host-table .cell-content']
    .map(selector => {
      const element = document.querySelector(selector)!, style = getComputedStyle(element)
      return [selector, ...['fontFamily', 'fontSize', 'color', 'backgroundColor', 'boxSizing', 'padding',
        'margin', 'overflow', 'width', 'height', 'borderSpacing', 'display'].map(key => style[key as keyof CSSStyleDeclaration])]
    })
}

Object.assign(window, { embeddingEvidence: { before: hostStyles(), hostStyles } })
const { Spreadsheet } = await import('../../src')
const { createWorkbookI18n } = await import('../../src/i18n/runtime')

const definition: RustWorkbookDefinition = {
  title: 'Embedded workbook',
  sheets: [{ id: 'sheet', name: 'Sheet', rowCount: 1000, colCount: 20,
    mergedRanges: [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }] }],
  createImportChunks: () => [[{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Merged heading' },
    { sheet: 0, row: 1, col: 0, kind: 'text', value: 'Original' },
    { sheet: 0, row: 1, col: 1, kind: 'text', value: 'Neighbor' }]],
}
const first = createRoot(document.getElementById('first')!)
const second = createRoot(document.getElementById('second')!)
first.render(<Spreadsheet definition={definition} className="host-first" style={{ height: '100%' }} />)
second.render(<Spreadsheet definition={definition} />)
document.getElementById('unmount-first')!.onclick = () => first.unmount()
document.getElementById('canvas-first')!.onclick = () => first.render(<Spreadsheet definition={definition} renderer="canvas" />)
document.getElementById('locale-first')!.onclick = () => first.render(<Spreadsheet definition={definition} locale="zh" />)
document.getElementById('host-button')!.onclick = () => {
  const shared = createWorkbookI18n()
  first.render(<Spreadsheet definition={definition} i18n={shared} />)
  second.render(<Spreadsheet definition={definition} i18n={shared} />)
}
