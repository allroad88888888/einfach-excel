import { demoUiOptions } from '../../src/page/demo/demo-presentation'

describe('demo ui options', () => {
  it('maps hidden areas and context menu items from the query', () => {
    expect(demoUiOptions('?hide=ribbon,statusBar,menu:cells.insert')).toEqual({
      ribbon: false, statusBar: false, contextMenu: { hidden: ['cells.insert'] },
    })
    expect(demoUiOptions('?hide=menu')).toEqual({ contextMenu: false })
    expect(demoUiOptions('')).toEqual({})
  })
})
