import { useLocale } from '../i18n/use-site-t'

const copy = {
  en: {
    heading: 'What using it looks like',
    caption: 'A static in-memory backend, a provider, a toolbar, and a grid — the whole surface.',
  },
  zh: {
    heading: '接入方式长什么样',
    caption: '一个静态内存后端、一个 Provider、一个工具栏、一个表格——就是全部接口。',
  },
} as const

const snippet = `import {
  createStaticSpreadsheetBackend,
  SpreadsheetUiProvider,
  SpreadsheetGrid,
  SpreadsheetToolbar,
} from '@einfach/solid-excel/vnext'

const backend = createStaticSpreadsheetBackend({
  sheets: [{ id: 'sheet-1', name: 'Sheet1' }],
  matrix: [['Item', 'Qty', 'Price'], ['Widget', 4, 9.5]],
})

const viewport = {
  scrollTop: 0, scrollLeft: 0, viewportHeight: 320, viewportWidth: 640,
  rowHeight: 24, colWidth: 96, rowCount: 50, colCount: 16,
  overscanRows: 1, overscanCols: 1,
}

function Sheet() {
  return (
    <SpreadsheetUiProvider backend={backend}>
      <SpreadsheetToolbar />
      <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
    </SpreadsheetUiProvider>
  )
}`

export default function CodeSnippetSection() {
  const locale = useLocale()
  const t = () => copy[locale()]

  return (
    <section class="site-code">
      <h2 class="site-code-heading">{t().heading}</h2>
      <p class="site-code-caption">{t().caption}</p>
      <pre class="site-code-block">
        <code>{snippet}</code>
      </pre>
    </section>
  )
}
