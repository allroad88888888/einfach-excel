import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  setWorkbookRibbonExpandedAtom,
  workbookRibbonOverflowAtom,
  editingSessionAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import { useId } from 'react'
import { RibbonGroup } from './RibbonGroup'
import type { WorkbookRibbonGroup } from './ribbon-groups'

/**
 * 放不下的组按整组收进这里（Univer 的 More）。面板关闭时这些组仍挂载并隐藏入口，
 * 快捷键打开的弹窗照常显示；打开时按组分段、带组标题。
 */
export function RibbonMore({ groups }: { readonly groups: readonly WorkbookRibbonGroup[] }) {
  const { i18n, t } = useLingui()
  const { expanded } = useAtomValue(workbookRibbonOverflowAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const setExpanded = useSetAtom(setWorkbookRibbonExpandedAtom)
  const id = useId()
  if (groups.length === 0) return null
  const label = expanded ? t`Fewer tools` : t`More tools`
  return (
    <div className="ribbon-more" data-expanded={expanded}>
      <button
        data-ribbon-more=""
        className="tool-button ribbon-large"
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={expanded}
        aria-controls={`${id}-panel`}
        onPointerDown={event => { if (editing) event.preventDefault() }}
        onClick={() => setExpanded(!expanded)}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="12.5" cy="8" r="1.3" />
        </svg>
        <span className="ribbon-large-label" aria-hidden="true">{t`More`} ▾</span>
      </button>
      <div id={`${id}-panel`} className="ribbon-more-panel">
        {groups.map((group) => (
          <section
            key={group.id}
            className="ribbon-more-section"
            aria-labelledby={group.title ? `${id}-${group.id}` : undefined}
          >
            {group.title && <h3 id={`${id}-${group.id}`}>{i18n._(group.title)}</h3>}
            <RibbonGroup group={group} inactive={!expanded} />
          </section>
        ))}
      </div>
    </div>
  )
}
