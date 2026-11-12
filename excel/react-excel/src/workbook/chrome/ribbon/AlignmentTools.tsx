import { RibbonItem } from './RibbonItem'
import { activeCellFormatAtom, applySelectionFormatAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { TextLayoutTools } from './TextLayoutTools'
import { MergeTools } from './MergeTools'
import { ToolButton } from './ToolButton'

/** 对齐组：上行对齐与旋转，下行缩进、换行与合并。 */
export function AlignmentTools() {
  const { t } = useLingui()
  const activeFormat = useAtomValue(activeCellFormatAtom)
  const applyFormat = useSetAtom(applySelectionFormatAtom)
  return (
    <>
      <div className="ribbon-row">
        <TextLayoutTools />
      </div>
      <div className="ribbon-row">
        <RibbonItem id="format.decrease-indent">
          <ToolButton
            itemId="format.decrease-indent"
            icon="⇤"
            label={t`Decrease indent`}
            onClick={() => void applyFormat('decrease-indent')}
          />
        </RibbonItem>
        <RibbonItem id="format.increase-indent">
          <ToolButton
            itemId="format.increase-indent"
            icon="⇥"
            label={t`Increase indent`}
            onClick={() => void applyFormat('increase-indent')}
          />
        </RibbonItem>
        <RibbonItem id="format.wrap-text">
          <ToolButton
            itemId="format.wrap-text"
            icon="↵"
            label={t`Wrap text`}
            onClick={() => void applyFormat('wrap-text')}
            pressed={Boolean(activeFormat.wrap)}
          />
        </RibbonItem>
        <MergeTools />
      </div>
    </>
  )
}
