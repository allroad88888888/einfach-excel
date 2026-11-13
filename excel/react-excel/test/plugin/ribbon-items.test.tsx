import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { RibbonItem } from '../../src/workbook/chrome/ribbon/RibbonItem'
import { assertUniquePluginIds } from '../../src/plugin/plugin-context'
import type { SpreadsheetPlugin } from '../../src/plugin/types'
import type { WorkbookUiOptions } from '../../src/page/workbook-ui-options'

const plugin: SpreadsheetPlugin = {
  id: 'tools',
  ribbonItems: [
    { id: 'first', after: 'format.font-size', Item: () => <button>First plugin item</button> },
    { id: 'second', after: 'format.font-size', Item: () => <button>Second plugin item</button> },
  ],
}

function Fixture({ plugins, ui = {} }: {
  readonly plugins: readonly SpreadsheetPlugin[]
  readonly ui?: WorkbookUiOptions
}) {
  return <WorkbookStoreProvider plugins={plugins} ui={ui}>
    <div data-testid="row">
      <RibbonItem id="format.font-size"><button>Anchor</button></RibbonItem>
      <RibbonItem id="format.increase-font-size"><button>Next built-in</button></RibbonItem>
    </div>
  </WorkbookStoreProvider>
}

describe('ribbon item contributions', () => {
  it('places contributions after their anchor in host plugin order and removes them on unmount', () => {
    const other: SpreadsheetPlugin = { id: 'other', ribbonItems: [
      { id: 'third', after: 'format.font-size', Item: () => <button>Other plugin item</button> },
    ] }
    const view = render(<Fixture plugins={[plugin, other]} />)
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Anchor', 'First plugin item', 'Second plugin item', 'Other plugin item', 'Next built-in',
    ])
    view.rerender(<Fixture plugins={[]} />)
    expect(screen.getAllByRole('button').map(button => button.textContent))
      .toEqual(['Anchor', 'Next built-in'])
  })

  it('hides the anchor independently from namespaced plugin contributions', () => {
    render(<Fixture plugins={[plugin]} ui={{ ribbon: { hidden: [
      'format.font-size', 'plugin:tools:second',
    ] } }} />)
    expect(screen.getAllByRole('button').map(button => button.textContent))
      .toEqual(['First plugin item', 'Next built-in'])
  })

  it('renders no contribution when the entire ribbon is hidden', () => {
    render(<Fixture plugins={[plugin]} ui={{ ribbon: false }} />)
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('rejects unknown anchors so configuration cannot silently lose a feature', () => {
    expect(() => assertUniquePluginIds([{ id: 'invalid', ribbonItems: [
      { ...plugin.ribbonItems![0], after: 'plugin:tools:first' as never },
    ] }])).toThrow('Unknown ribbon item anchor: plugin:tools:first')
  })

  it('rejects duplicate ids across a plugin’s group and item contributions', () => {
    expect(() => assertUniquePluginIds([{ ...plugin,
      ribbon: [{ id: 'first', tab: 'Start', Group: () => null }],
    }])).toThrow('Duplicate ribbon contribution id: tools:first')
    expect(() => assertUniquePluginIds([{ ...plugin, ribbonItems: [
      plugin.ribbonItems![0], plugin.ribbonItems![0],
    ] }])).toThrow('Duplicate ribbon contribution id: tools:first')
  })
})
