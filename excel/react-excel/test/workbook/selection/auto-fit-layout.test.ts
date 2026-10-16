import { afterEach, expect, test, vi } from 'vitest'
import { readAutoFitLayout } from '../../../src/workbook/grid/viewport/read-auto-fit-layout'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function setup() {
  const frame = document.createElement('div')
  frame.className = 'sheet-grid-frame'
  const surface = document.createElement('div')
  surface.className = 'grid-surface'
  const handle = document.createElement('span')
  const visible = document.createElement('td')
  visible.textContent = 'Keep me'
  visible.style.fontSize = '36px'
  surface.append(visible)
  frame.append(surface, handle)
  document.body.append(frame)
  return { frame, surface, handle, visible }
}

test.each(['detached handle', 'missing surface'])('%s does not start a measurement', (kind) => {
  const { handle, surface } = setup()
  if (kind === 'detached handle') handle.remove()
  else surface.remove()
  const computed = vi.spyOn(window, 'getComputedStyle')
  expect(readAutoFitLayout(handle)).toBeNull()
  expect(computed).not.toHaveBeenCalled()
})

test('reads an unformatted temporary first cell and removes it without touching visible cells', () => {
  const { handle, surface, visible } = setup()
  const style = document.createElement('td').style
  style.cssText = 'font-family:Arial;font-size:12.5px;line-height:15px;' +
    'padding:2px 3px 4px 5px;border-style:solid;border-width:1px 2px 3px 4px'
  const computed = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    expect(element).not.toBe(visible)
    expect(element).toHaveClass('cell')
    expect(element).toHaveAttribute('class', 'cell')
    expect(element.parentElement?.children).toHaveLength(2)
    expect(element).toBe(element.parentElement?.firstElementChild)
    expect(element.closest('table')?.style.visibility).toBe('hidden')
    expect(element.closest('table')?.style.position).toBe('absolute')
    expect(surface.contains(element)).toBe(true)
    return style
  })
  const result = readAutoFitLayout(handle)
  computed.mockRestore()
  expect(result).toEqual({
    fontFamily: 'Arial', fontSize: 12.5, lineHeight: 15,
    paddingTop: 2, paddingRight: 3, paddingBottom: 4, paddingLeft: 5,
    borderTop: 1, borderRight: 2, borderBottom: 3, borderLeft: 4,
  })
  expect([...surface.children]).toEqual([visible])
  expect(visible).toHaveStyle({ fontSize: '36px' })
  expect(visible).toHaveTextContent('Keep me')
})

test('failed style reads also remove the temporary table and allow the next measurement', () => {
  const { handle, surface, visible } = setup()
  const read = vi.spyOn(window, 'getComputedStyle').mockImplementationOnce(() => {
    throw new Error('Style read failed')
  })
  expect(() => readAutoFitLayout(handle)).toThrow('Style read failed')
  expect([...surface.children]).toEqual([visible])
  read.mockReturnValue(Object.assign(document.createElement('td').style, {
    fontFamily: 'Arial', fontSize: '12px', lineHeight: '15px',
  }))
  expect(readAutoFitLayout(handle)).toMatchObject({ fontSize: 12, lineHeight: 15 })
  expect([...surface.children]).toEqual([visible])
})
