import { expect, test } from 'vitest'
import type { DisplayCell } from '../src/contracts'
import { encodeSelectionAsHtml, encodeSelectionAsPlainText } from '../src/copy-as'

function input(cell: Partial<DisplayCell>) {
  return { rect: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    cells: [{ row: 0, col: 0, displayValue: 'AB', ...cell }] }
}
function parse(cell: Partial<DisplayCell>) {
  const host = document.createElement('div')
  host.innerHTML = encodeSelectionAsHtml(input(cell))
  return host.querySelector('td')!
}

test('HTML keeps inherited glyph baselines and explicit normal separate from cell alignment', () => {
  const cell = parse({ format: { fontSize: 20, fontBaseline: 'superscript', verticalAlign: 'bottom' },
    richText: [{ text: 'A', format: {} }, { text: 'B', format: { fontBaseline: 'normal' } }] })
  expect(cell.style.verticalAlign).toBe('bottom')
  expect(cell.style.fontSize).toBe('20pt')
  const [raised, normal] = [...cell.querySelectorAll('span')]
  expect(raised.style.fontSize).toBe('13pt')
  expect(raised.style.verticalAlign).toBe('6pt')
  expect(normal.style.fontSize).toBe('20pt')
  expect(normal.style.verticalAlign).toBe('baseline')
  expect(cell.textContent).toBe('AB')
})

test('HTML resolves each run size and font overrides without ancestor text decoration', () => {
  const cell = parse({ format: { fontSize: 20, bold: true, underline: true, fgColor: '#AA0000' },
    richText: [{ text: 'A', format: { fontSize: 40, fontBaseline: 'subscript', underline: false, bold: false } },
      { text: 'B', format: { italic: true, color: '#0000AA' } }] })
  const [sub, inherited] = [...cell.querySelectorAll('span')]
  expect(cell.style.textDecoration).toBe('')
  expect(sub.style.fontSize).toBe('26pt')
  expect(sub.style.verticalAlign).toBe('-8pt')
  expect(sub.style.fontWeight).toBe('normal')
  expect(sub.style.textDecoration).toBe('none')
  expect(inherited.style.textDecoration).toBe('underline')
  expect(inherited.style.fontStyle).toBe('italic')
  expect(inherited.style.color).toBe('rgb(0, 0, 170)')
})

test('inline HTML escapes text and rejects CSS injection while preserving split CRLF as one break', () => {
  const displayValue = '<img src=x onerror=alert(1)>\r\n&"'
  const fixture = { displayValue, richText: [
    { text: '<img src=x onerror=alert(1)>\r', format: { color: '#000; background: url(https://bad)',
      fontFamily: 'Arial; background: url(https://bad)' } },
    { text: '\n&"', format: { fontBaseline: 'superscript' as const } },
  ] }
  const cell = parse(fixture)
  expect(cell.querySelectorAll('img,script')).toHaveLength(0)
  expect(cell.querySelectorAll('br')).toHaveLength(1)
  expect(cell.innerHTML).not.toContain('https://bad')
  expect(cell.textContent).toBe('<img src=x onerror=alert(1)>&"')
  // The existing TSV export flattens cell line breaks to spaces; inline styles do not alter it.
  expect(encodeSelectionAsPlainText(input(fixture))).toBe('<img src=x onerror=alert(1)> &"')
})

test('whole-cell baseline uses a glyph span and stale runs never replace displayed text', () => {
  const cell = parse({ displayValue: 'Result', format: { fontSize: 20, fontBaseline: 'subscript' },
    richText: [{ text: 'Old', format: { fontBaseline: 'superscript' } }] })
  expect(cell.textContent).toBe('Result')
  expect(cell.querySelector('span')!.style.verticalAlign).toBe('-4pt')
  expect(cell.querySelector('span')!.style.fontSize).toBe('13pt')
  expect(parse({ displayValue: 'Plain' }).querySelector('span')).toBeNull()
})
