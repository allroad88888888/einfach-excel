import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  WORKBOOK_RIBBON_TABS,
  workbookRibbonTabAtom,
  selectWorkbookRibbonTabAtom,
} from '@einfach/spreadsheet-ui-core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'

export const ribbonTabLabels = {
  Start: msg`Start`, Insert: msg`Insert`, Formulas: msg`Formulas`, Data: msg`Data`, View: msg`View`,
}

/** 分类切换的鼠标／键盘入口；业务状态由 UI Core atom 持有。 */
export function RibbonTabs({ id }: { readonly id: string }) {
  const { i18n, t } = useLingui()
  const active = useAtomValue(workbookRibbonTabAtom)
  const selectTab = useSetAtom(selectWorkbookRibbonTabAtom)
  return (
    <div className="ribbon-tabs" role="tablist" aria-label={t`Workbook commands`}>
      {WORKBOOK_RIBBON_TABS.map((tab, index) => (
        <button
          id={`${id}-${tab}`}
          aria-controls={`${id}-panel`}
          aria-selected={tab === active}
          className={tab === active ? 'ribbon-tab active' : 'ribbon-tab'}
          key={tab}
          role="tab"
          type="button"
          tabIndex={tab === active ? 0 : -1}
          onClick={() => selectTab(tab)}
          onKeyDown={(event) => {
            let next: number
            if (event.key === 'ArrowRight') next = (index + 1) % WORKBOOK_RIBBON_TABS.length
            else if (event.key === 'ArrowLeft') {
              next = (index + WORKBOOK_RIBBON_TABS.length - 1) % WORKBOOK_RIBBON_TABS.length
            } else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = WORKBOOK_RIBBON_TABS.length - 1
            else return
            event.preventDefault()
            selectTab(WORKBOOK_RIBBON_TABS[next]!)
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next]?.focus()
          }}
        >
          {i18n._(ribbonTabLabels[tab])}
        </button>
      ))}
    </div>
  )
}
