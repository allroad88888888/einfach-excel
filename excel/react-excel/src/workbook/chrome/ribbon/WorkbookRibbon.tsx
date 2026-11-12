import {
  workbookRibbonOverflowAtom,
  workbookRibbonTabAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { useId, useRef } from 'react'
import { usePluginRibbonGroups } from '../../../plugin/PluginMounts'
import { HistoryTools } from './HistoryTools'
import { RibbonGroup } from './RibbonGroup'
import { RibbonMore } from './RibbonMore'
import { RibbonTabs, ribbonTabLabels } from './RibbonTabs'
import { BUILT_IN_RIBBON_GROUPS } from './ribbon-groups'
import { useRibbonMorePanel } from './use-ribbon-more-panel'
import { useRibbonOverflow } from './use-ribbon-overflow'
import './ribbon.css'
import './ribbon-groups.css'
import './ribbon-overflow.css'

/**
 * 与 Univer 相同的布局：分类标签独占一行，下面是按组排列的两行工具栏。
 * 历史组常驻最前；当前分类放不下时从末尾按整组收进“更多”。
 */
export function WorkbookRibbon() {
  const { i18n, t } = useLingui()
  const tab = useAtomValue(workbookRibbonTabAtom)
  const { collapsed, expanded } = useAtomValue(workbookRibbonOverflowAtom)
  const pluginGroups = usePluginRibbonGroups()
  const groups = [...BUILT_IN_RIBBON_GROUPS, ...pluginGroups]
  const active = groups.filter((group) => group.tab === tab)
  const folded = collapsed > 0 ? active.slice(Math.max(0, active.length - collapsed)) : []
  const tabLabel = i18n._(ribbonTabLabels[tab])
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  useRibbonOverflow(toolsRef, active.map((group) => group.id))
  useRibbonMorePanel(panelRef)

  return (
    <div className="ribbon-shell" data-expanded={expanded}>
      <RibbonTabs id={id} />
      <div
        ref={panelRef}
        className="ribbon-panel"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
      >
        <div ref={toolsRef} className="ribbon-tools" role="toolbar" aria-label={t`${tabLabel} tools`}>
          <div className="ribbon-tool-group" data-ribbon-group="history" data-layout="stack">
            <HistoryTools />
          </div>
          {groups
            .filter((group) => !folded.includes(group))
            .map((group) => (
              <RibbonGroup key={group.id} group={group} inactive={group.tab !== tab} />
            ))}
          <RibbonMore groups={folded} />
        </div>
      </div>
    </div>
  )
}
