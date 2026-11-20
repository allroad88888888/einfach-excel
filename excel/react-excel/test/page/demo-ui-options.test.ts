import { demoPlugins, demoUiOptions } from '../../src/page/demo/demo-presentation'

describe('demo ui options', () => {
  it('maps hidden areas and context menu items from the query', () => {
    expect(demoUiOptions('?hide=ribbon,statusBar,menu:cells.insert')).toEqual({
      ribbon: false, statusBar: false, contextMenu: { hidden: ['cells.insert'] },
    })
    expect(demoUiOptions('?hide=menu')).toEqual({ contextMenu: false })
    expect(demoUiOptions('')).toEqual({})
    expect(demoUiOptions('?hide=ribbon:format.bold&rowHeaderWidth=80&columnHeaderHeight=40'))
      .toEqual({ ribbon: { hidden: ['format.bold'] }, rowHeaderWidth: 80, columnHeaderHeight: 40 })
  })

  it('expands ?plugins=all to the 11 public business plugins without sample or duplicates', () => {
    expect(demoPlugins('')).toEqual([])
    const all = demoPlugins('?plugins=all,chart')
    expect(all).toHaveLength(11)
    expect(all.some((plugin) => plugin.id === 'sample')).toBe(false)
    expect(new Set(all.map((plugin) => plugin.id)).size).toBe(11)
  })
})
