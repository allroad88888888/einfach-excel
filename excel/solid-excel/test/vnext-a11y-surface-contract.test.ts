import { afterEach, describe, expect, it } from 'vitest'
import { auditKeyboardA11ySurface } from '../src/a11y'

afterEach(() => {
  document.body.replaceChildren()
})

function mount(markup: string): HTMLElement {
  document.body.innerHTML = markup
  const root = document.body.firstElementChild
  if (!(root instanceof HTMLElement)) throw new Error('expected an interactive surface root')
  return root
}

describe('vNext keyboard and screen-reader surface contract', () => {
  it('accepts a grid with one tab stop and a rendered active cell', () => {
    const root = mount(`
      <div role="grid" tabindex="0" aria-rowcount="10" aria-colcount="4" aria-activedescendant="cell-b2">
        <div id="cell-b2" role="gridcell">12</div>
      </div>
    `)

    expect(auditKeyboardA11ySurface('grid', root)).toEqual([])
  })

  it('reports the exact broken grid affordances', () => {
    const root = mount('<div role="grid" aria-rowcount="0" aria-colcount="x"></div>')

    expect(auditKeyboardA11ySurface('grid', root).map((item) => item.code)).toEqual([
      'grid.tab-stop',
      'grid.row-count',
      'grid.column-count',
      'grid.active-descendant',
    ])
  })

  it('accepts a labelled menubar whose popup trigger announces state', () => {
    const root = mount(`
      <div role="menubar">
        <div role="none">
          <button role="menuitem" aria-haspopup="menu" aria-expanded="true">File</button>
          <div role="menu"><button role="menuitem">Print</button></div>
        </div>
      </div>
    `)

    expect(auditKeyboardA11ySurface('menu', root)).toEqual([])
  })

  it('reports menu triggers and entries that cannot be announced', () => {
    const root = mount(`
      <div role="menubar">
        <button role="menuitem" aria-haspopup="menu"></button>
        <div role="menu"></div>
      </div>
    `)

    expect(auditKeyboardA11ySurface('menu', root).map((item) => item.code)).toEqual([
      'menu.item-name',
      'menu.trigger-expanded',
      'menu.empty-popup',
    ])
  })

  it('accepts a labelled modal dialog with a focus entry point', () => {
    const root = mount(`
      <section role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">Print preview</h2>
        <button type="button">Close</button>
      </section>
    `)

    expect(auditKeyboardA11ySurface('dialog', root)).toEqual([])
  })

  it('reports unresolved labels and focusless modal dialogs', () => {
    const root = mount(
      '<section role="dialog" aria-modal="true" aria-labelledby="missing"></section>',
    )

    expect(auditKeyboardA11ySurface('dialog', root).map((item) => item.code)).toEqual([
      'dialog.labelledby-target',
      'dialog.name',
      'dialog.modal-focus-target',
    ])
  })
})
