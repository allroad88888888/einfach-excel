// Requires the React Vite dev server. Measures WASM projection plus Worker transport.
// node scripts/bench-rust-storage-worker.mjs http://127.0.0.1:5191
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../excel/react-excel/package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const origin = process.argv[2] ?? 'http://127.0.0.1:5191'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${origin}/robots.txt`)
  for (const variant of ['lite', 'full']) {
    const path = fileURLToPath(new URL(`../excel/excel-wasm/${variant}/einfach_wasm.js`, import.meta.url))
    const result = await page.evaluate(async url => {
      const body = `
        const wasm = await import(${JSON.stringify(url)})
        await wasm.default()
        const book = new wasm.WasmWorkbook()
        const text = 'Customer ' + 'x'.repeat(119)
        const cells = Array.from({length: 10000}, (_, i) => ({
          sheet: 0, addr: '', row: Math.floor(i / 100), col: i % 100,
          kind: 'text', value: text
        }))
        book.restore_sparse(cells)
        self.onmessage = event => {
          const start = performance.now()
          const { lastRow, lastCol } = event.data
          const cells = book.read_sparse_range(0, 0, 0, lastRow, lastCol)
          self.postMessage({ cells, readMs: performance.now() - start })
        }
        self.postMessage({ ready: true })
      `
      const objectURL = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }))
      const worker = new Worker(objectURL, { type: 'module' })
      const receive = () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker timeout')), 30000)
        worker.onmessage = event => { clearTimeout(timer); resolve(event.data) }
        worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)) }
      })
      try {
        await receive()
        const results = []
        const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)]
        for (const [shape, lastRow, lastCol, count] of [
          ['viewport', 49, 26, 1350],
          ['wide', 99, 49, 5000],
          ['sparse', 999999, 49, 5000],
          ['export', 99, 99, 10000],
        ]) {
          const read = [], transport = []
          for (let i = 0; i < 35; i++) {
            const response = receive()
            const start = performance.now()
            worker.postMessage({ lastRow, lastCol })
            const data = await response
            const elapsed = performance.now() - start
            if (data.cells.length !== count || data.cells.some(c => c.display.length !== 128 || c.inputText !== c.display))
              throw new Error(`Invalid ${shape} projection wire values`)
            if (i >= 5) { read.push(data.readMs); transport.push(elapsed) }
          }
          results.push({ shape, cells: count, samples: 30, readMedianMs: median(read), roundTripMedianMs: median(transport) })
        }
        return results
      } finally { worker.terminate(); URL.revokeObjectURL(objectURL) }
    }, `${origin}/@fs${path}`)
    for (const sample of result) console.log(JSON.stringify({ variant, ...sample }))
  }
} finally { await browser.close() }
