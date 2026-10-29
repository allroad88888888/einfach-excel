import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId } from 'react'
import { nativeNameManagerAtom, runNativeNameManagerAtom } from '@einfach-excel/spreadsheet-ui-core'

/** 名称管理器里的 Table 是原生目录的只读导航，不是可编辑的命名区域。 */
export function NamedTableList() {
  const { t } = useLingui()
  const state = useAtomValue(nativeNameManagerAtom)
  const run = useSetAtom(runNativeNameManagerAtom)
  const id = useId()
  return <section aria-labelledby={`${id}-title`}>
    <div className="named-range-heading"><h3 id={`${id}-title`}><Trans>Tables</Trans></h3></div>
    <p><Trans>Select a table to go to its range.
      Use Tables to change its name or columns.</Trans></p>
    <div className="named-range-list" role="group" aria-label={t`Workbook tables`}>
      {!state.tables && <p><Trans>Waiting for the table list…</Trans></p>}
      {state.tables?.length === 0 && <p><Trans>No tables in this workbook.</Trans></p>}
      {state.tables?.map((table) => <button key={table.name} type="button"
        disabled={state.busy || !state.canLocateTable} aria-label={t`Go to table ${table.name}`}
        onClick={(event) => {
          const workbook = event.currentTarget.closest('.workbook')
          void run({ locateTable: table.name }).then((located) => {
            // 等 React 关闭原生 modal、解除页面 inert 后再聚焦目标画布。
            if (located) requestAnimationFrame(() => workbook
              ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
              ?.focus({ preventScroll: true }))
          })
        }}>
        <strong>{table.name}</strong><span>{table.sheet}!{table.range}</span>
      </button>)}
    </div>
  </section>
}
