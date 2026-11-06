import { RibbonItem } from './RibbonItem'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect, useId, useRef } from 'react'
import {
  clearSelectSpecialFeedbackAtom,
  goToSpecialAvailableAtom,
  goToSpecialPanelAtom,
  runGoToSpecialAtom,
  selectCurrentRegionAtom,
  selectSpecialAvailableAtom,
  selectSpecialFeedbackAtom,
  selectVisibleCellsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { translateSelectSpecial } from '../../../i18n/translate-select-special'
import { cycleDialogFocus } from './dialog-focus'
import './go-to.css'

/** 三种条件共享一个原生查询命令；组件只负责选项、提示与 DOM 焦点。 */
export function GoToSpecialTools() {
  const { i18n, t } = useLingui()
  const panel = useAtomValue(goToSpecialPanelAtom)
  const available = useAtomValue(goToSpecialAvailableAtom)
  const run = useSetAtom(runGoToSpecialAtom)
  const helperAvailable = useAtomValue(selectSpecialAvailableAtom)
  const helperError = useAtomValue(selectSpecialFeedbackAtom).error
  const clearHelper = useSetAtom(clearSelectSpecialFeedbackAtom)
  const selectVisible = useSetAtom(selectVisibleCellsAtom)
  const selectRegion = useSetAtom(selectCurrentRegionAtom)
  /** 两个选择助手与三类条件共用对话框；成功后关闭，失败留在弹窗里显示原因。 */
  const helper = async (command: typeof selectVisible) => {
    if (await command()) void run('close')
  }
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!panel.open || !dialog) return
    const button = buttonRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    firstRef.current?.focus()
    return () => {
      dialog.close?.()
      const grid = button
        ?.closest('.workbook')
        ?.querySelector<HTMLElement>('[data-workbook-grid="true"]')
      ;(grid ?? button)?.focus({ preventScroll: true })
    }
  }, [panel.open])
  return (
    <>
      <RibbonItem id="view.go-to-special">
        <button
          data-ribbon-item="view.go-to-special"
          ref={buttonRef}
          type="button"
          className="tool-button"
          aria-label={t`Go to special`}
          title={t`Select constants, formulas, blanks, visible cells or the current region`}
          disabled={!available}
          onClick={() => {
            clearHelper()
            void run('open')
          }}
        >
          <span aria-hidden="true">⌖</span>
        </button>
      </RibbonItem>
      {panel.notice && (
        <span role="status" className="visually-hidden">
          {translateFeedback(i18n, panel.notice)}
        </span>
      )}
      {panel.open && (
        <dialog
          ref={dialogRef}
          className="go-to-dialog"
          aria-labelledby={`${id}-title`}
          aria-busy={panel.busy}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}>
            <Trans>Go to special</Trans>
          </h2>
          <p className="go-to-hint">{translateFeedback(i18n, panel.scope)}</p>
          <p className="go-to-hint">
            <Trans>Includes hidden cells. Merged cells are selected as a whole.</Trans>
          </p>
          <div
            className="go-to-special-options"
            role="group"
            aria-label={t`Select cells by condition`}
          >
            <button
              ref={firstRef}
              disabled={!available || !panel.continuous}
              onClick={() => void run('constants')}
            >
              <Trans>Constants</Trans>
            </button>
            <button disabled={!available || !panel.continuous} onClick={() => void run('formulas')}>
              <Trans>Formulas</Trans>
            </button>
            <button disabled={!available || !panel.continuous} onClick={() => void run('blanks')}>
              <Trans>Blanks</Trans>
            </button>
            <button disabled={!helperAvailable} onClick={() => void helper(selectVisible)}>
              <Trans>Visible cells only</Trans>
            </button>
            <button disabled={!helperAvailable} onClick={() => void helper(selectRegion)}>
              <Trans>Current region</Trans>
            </button>
          </div>
          {!panel.continuous && (
            <p role="alert" className="go-to-error">
              <Trans>Select one continuous range before using Go to special.</Trans>
            </p>
          )}
          {helperError && (
            <p role="alert" className="go-to-error">
              {translateSelectSpecial(i18n, helperError)}
            </p>
          )}
          {panel.busy && (
            <p role="status">
              <Trans>Locating cells…</Trans>
            </p>
          )}
          {panel.error && (
            <p role="alert" className="go-to-error">
              {translateFeedback(i18n, panel.error)}
            </p>
          )}
          <div className="go-to-actions">
            <button type="button" onClick={() => void run('close')}>
              <Trans>Cancel</Trans>
            </button>
          </div>
        </dialog>
      )}
    </>
  )
}
