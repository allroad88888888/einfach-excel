import type { Store } from '@einfach/core'
import { createWorkbookApi } from '@einfach-excel/spreadsheet-ui-core'

/** Installed package only: exercise public facade declarations and the shipped Worker. */
export function mountFacadeControls(store: Store): void {
  const api = createWorkbookApi(store)
  const output = document.createElement('output')
  output.setAttribute('aria-label', 'Installed API result')
  const format = document.createElement('button')
  format.textContent = 'Host format A1'
  format.onclick = async () => {
    output.textContent = 'pending'
    const sheetId = api.getDocument().sheets[0].id
    output.textContent = JSON.stringify(await api.format({ sheetId,
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, format: { bold: true } }))
  }
  document.getElementById('host-button')!.after(format, output)
}
