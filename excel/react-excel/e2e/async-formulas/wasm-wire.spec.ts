import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`

// Supplemental wire regression: primary acceptance uses real Worker HTTP in json-literals.spec.ts.
for (const variant of ['lite', 'full'])
  test(`${variant} WASM keeps legacy async error returns and validates the explicit JSON-success envelope`, async ({ page }) => {
    await page.goto('/?demo=async-formulas')
    const results = await page.evaluate(async url => {
      const wasm = await import(url)
      await wasm.default()
      const outcomes: unknown[] = []
      for (const value of [
        '#N/A', { error: '#VALUE!' }, { json: '#BUSY!', error: '#N/A' },
        Object.create({ json: 'inherited' }), { json: { object: true } },
        { json: [[1], [2, 3]] }, { json: Infinity },
        { json: '#N/A' }, { json: [['#VALUE!', '#BUSY!'], ['#N/A', '#DIV/0!']] },
      ]) {
        const book = new wasm.WasmWorkbook()
        try {
          book.registerCustomFormulaAsync('WIRE')
          book.set_cell_input(0, 'A1', '=WIRE(1)')
          book.set_cell_input(0, 'F1', '=ISTEXT(A1)')
          book.set_cell_input(0, 'G1', '=ISERROR(A1)')
          const call = book.drainAsyncCustomRequests()[0]
          book.resolveAsyncCustomCall(call.callId, value)
          outcomes.push({ display: book.getCellDisplay(0, 'A1'),
            text: book.getCellDisplay(0, 'F1'), error: book.getCellDisplay(0, 'G1') })
        } finally { book.free() }
      }
      return outcomes
    }, `${wasmBase}${variant}/einfach_wasm.js`)
    expect(results.slice(0, 7)).toEqual([
      { display: '#N/A', text: 'FALSE', error: 'TRUE' },
      { display: '#VALUE!', text: 'FALSE', error: 'TRUE' },
      { display: '#N/A', text: 'FALSE', error: 'TRUE' },
      ...Array.from({ length: 4 }, () => ({ display: '#VALUE!', text: 'FALSE', error: 'TRUE' })),
    ])
    expect(results[7]).toEqual({ display: '#N/A', text: 'TRUE', error: 'FALSE' })
    expect(results[8]).toEqual({ display: '#VALUE!', text: 'TRUE', error: 'FALSE' })
  })
