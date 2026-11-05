import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  toggleFormulaBarAtom,
  toggleGridlinesAtom,
  toggleHeadingsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'

/** 视图显示选项：网格线与行列标题随工作表保存，公式栏只影响本次挂载。 */
export function ViewOptionsTools() {
  const { t } = useLingui()
  const gridlines = useAtomValue(toggleGridlinesAtom)
  const headings = useAtomValue(toggleHeadingsAtom)
  const formulaBar = useAtomValue(toggleFormulaBarAtom)
  const toggleGridlines = useSetAtom(toggleGridlinesAtom)
  const toggleHeadings = useSetAtom(toggleHeadingsAtom)
  const toggleFormulaBar = useSetAtom(toggleFormulaBarAtom)
  return (
    <>
      <button type="button" className="tool-button" aria-pressed={gridlines}
        aria-label={t`Gridlines`} title={t`Gridlines`}
        onClick={() => void toggleGridlines()}><span aria-hidden="true">#</span></button>
      <button type="button" className="tool-button" aria-pressed={headings}
        aria-label={t`Headings`} title={t`Headings`}
        onClick={() => void toggleHeadings()}><span aria-hidden="true">A1</span></button>
      <button type="button" className="tool-button" aria-pressed={formulaBar}
        aria-label={t`Formula bar`} title={t`Formula bar`}
        onClick={() => toggleFormulaBar()}><span aria-hidden="true">fx</span></button>
    </>
  )
}
