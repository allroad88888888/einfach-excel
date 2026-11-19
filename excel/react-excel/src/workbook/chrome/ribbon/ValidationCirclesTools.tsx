import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  editingSessionAtom,
  runValidationCirclesAtom,
  validationCirclesAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { RibbonItem } from './RibbonItem'

/** 圈释无效数据／清除验证标识圈；只读视图层，不修改单元格或历史栈。 */
export function ValidationCirclesTools() {
  const { t } = useLingui()
  const circles = useAtomValue(validationCirclesAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runValidationCirclesAtom)
  const label = circles.active ? t`Clear validation circles` : t`Circle invalid data`

  return (
    <RibbonItem id="data.validation-circles">
      <button
        data-ribbon-item="data.validation-circles"
        type="button"
        className="tool-button"
        aria-label={label}
        title={label}
        aria-pressed={circles.active}
        aria-busy={circles.busy}
        disabled={editing || circles.busy || circles.sheetId === null}
        onClick={() => void run(circles.active ? 'clear' : 'circle')}
      >
        {circles.active ? '⊘' : '○'}
      </button>
    </RibbonItem>
  )
}
