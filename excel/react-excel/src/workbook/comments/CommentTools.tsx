import { useId, useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui, Trans } from '@lingui/react/macro'
import {
  nativeCommentPanelAtom, runNativeCommentAtom, COMMENT_BODY_MAX, COMMENT_AUTHOR_MAX, toA1,
} from '@einfach/spreadsheet-ui-core'
import { cycleDialogFocus } from '../chrome/ribbon/dialog-focus'
import { translateFeedback } from '../../i18n/translate-feedback'
import { CommentTimeline } from './CommentTimeline'
import './comments.css'

/** DOM 焦点属于 React；线程事实与全部变更属于 Rust，草稿属于 Core。 */
export function CommentTools(): React.JSX.Element {
  const { t, i18n } = useLingui()
  const state = useAtomValue(nativeCommentPanelAtom)
  const run = useSetAtom(runNativeCommentAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const address = toA1(state.cell.row, state.cell.col)
  useLayoutEffect(() => {
    const node = dialog.current
    const opener = trigger.current
    if (!state.open || !node) return
    if (node.showModal) node.showModal()
    else node.setAttribute('open', '')
    return () => { node.close?.(); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [state.open])
  useLayoutEffect(() => {
    const node = dialog.current
    if (!state.open || !state.loaded || state.phase || !node) return
    // 仅在就绪/保存收尾时用 DOM 当前值决定焦点，作者输入不应重启焦点 effect。
    const author = node.querySelector<HTMLInputElement>('input')
    const target = author?.value
      ? node.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)') : author
    target?.focus()
  }, [state.open, state.loaded, state.phase])
  return <>
    <button ref={trigger} className="tool-button" type="button" aria-label={t`Comments`}
      title={t`Comments`} disabled={!state.available || state.busy} onClick={() => void run('open')}>
      <span aria-hidden="true">▤</span>
    </button>
    {state.open && <dialog ref={dialog} className="comment-panel" aria-labelledby={`${id}-title`}
      aria-busy={state.busy} onKeyDown={cycleDialogFocus}
      onCancel={event => { event.preventDefault(); void run('close') }}>
      <h2 id={`${id}-title`}><Trans>Cell comments</Trans></h2>
      <p><Trans>Discussion for cell {address}</Trans></p>
      {state.loaded && <CommentTimeline thread={state.thread} />}
      <form onSubmit={event => { event.preventDefault(); void run('post') }}>
        <label htmlFor={`${id}-author`}><Trans>Workbook display name</Trans></label>
        <input id={`${id}-author`} value={state.author} disabled={state.busy || !state.loaded}
          aria-describedby={`${id}-identity`}
          onChange={event => void run({ author: event.currentTarget.value })} />
        <p id={`${id}-identity`} className="comment-hint">
          <Trans>
            A name stored in this workbook, not an authenticated identity.
            Up to {COMMENT_AUTHOR_MAX} characters.
          </Trans>
        </p>
        <label htmlFor={`${id}-body`}>{state.thread ? t`Reply text` : t`Comment text`}</label>
        <textarea id={`${id}-body`} rows={4} value={state.body}
          disabled={state.busy || !state.loaded || state.thread?.resolved} aria-describedby={`${id}-hint`}
          onChange={event => void run({ body: event.currentTarget.value })} />
        <p id={`${id}-hint`} className="comment-hint">
          <Trans>Plain text. Times use this device's local clock.</Trans>
          <span className="comment-count">{Array.from(state.body).length} / {COMMENT_BODY_MAX}</span>
        </p>
        {state.error && <p className="comment-error" role="alert">
          {translateFeedback(i18n, state.error)}
        </p>}
        {state.phase === 'loading' && <p role="status"><Trans>Loading comments…</Trans></p>}
        {state.phase === 'saving' && <p role="status"><Trans>Saving comment…</Trans></p>}
        <div className="comment-actions">
          {state.thread && <button type="button" disabled={state.busy}
            onClick={() => void run(state.thread?.resolved ? 'reopen' : 'resolve')}>
            {state.thread.resolved ? t`Reopen discussion` : t`Resolve discussion`}
          </button>}
          <button type="button" disabled={state.phase === 'saving'} onClick={() => void run('close')}>
            <Trans>Close comments</Trans>
          </button>
          <button type="submit" disabled={state.busy || !state.loaded || state.thread?.resolved}>
            {state.thread ? t`Post reply` : t`New comment`}
          </button>
        </div>
      </form>
    </dialog>}
  </>
}
