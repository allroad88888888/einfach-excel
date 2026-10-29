import { translateFeedback } from '../../i18n/translate-feedback'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  editingSessionAtom,
  editingCommitLifecycleAtom,
  formulaFunctionSuggestionsAtom,
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSignatureAtom,
  acceptFormulaSuggestionAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { FormulaParameterHelp } from '../formula-help/FormulaParameterHelp'
import './formula-assist.css'

/** 两个编辑入口共用同一个 atom 提示视图；ref 只用于 DOM 定位和保留输入焦点。 */
export function FormulaAssist({
  inputRef,
  id,
  source,
}: {
  inputRef: RefObject<HTMLTextAreaElement>
  id: string
  source: 'cell' | 'formula-bar'
}) {
  const { i18n, t } = useLingui()
  const session = useAtomValue(editingSessionAtom)
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const suggestions = useAtomValue(formulaFunctionSuggestionsAtom)
  const cursor = useAtomValue(formulaFunctionSuggestionCursorAtom)
  const signature = useAtomValue(formulaFunctionSignatureAtom)
  const accept = useSetAtom(acceptFormulaSuggestionAtom)
  const popupRef = useRef<HTMLDivElement>(null)
  // 独占 DOM 容器先接收 portal，再在 ref 提交后挂到所属根；初次就有草稿也不依赖旧 ref。
  const portal = useMemo(() => {
    const element = document.createElement('div')
    element.style.display = 'contents'
    return element
  }, [])
  const active =
    session.status === 'drafting' &&
    (source === 'formula-bar') === (session.source?.source === 'formula-bar')
  const visible = active && (suggestions.length > 0 || signature !== null)

  useLayoutEffect(() => {
    if (!visible) return
    const root = inputRef.current?.closest('.einfach-spreadsheet')
    if (!root) return
    root.append(portal)
    const position = () => {
      const input = inputRef.current
      const popup = popupRef.current
      if (!input || !popup) return
      const rect = input.getBoundingClientRect()
      const bounds = root.getBoundingClientRect()
      popup.style.visibility = rect.bottom <= bounds.top || rect.top >= bounds.bottom ||
        rect.right <= bounds.left || rect.left >= bounds.right ? 'hidden' : 'visible'
      popup.style.left = `${Math.max(8,
        Math.min(rect.left - bounds.left, bounds.width - popup.offsetWidth - 8))}px`
      // 格内提交错误占用输入框下方；参数帮助接在错误之后，不盖住失败原因。
      const feedback = input.closest('[data-cell-editor]')?.querySelector('[role="alert"]')
      const below = Math.max(rect.bottom,
        feedback?.getBoundingClientRect().bottom ?? 0) - bounds.top + 4
      popup.style.top = `${Math.max(
        8,
        below + popup.offsetHeight <= bounds.height - 8
          ? below : rect.top - bounds.top - popup.offsetHeight - 4,
      )}px`
    }
    position()
    const list = popupRef.current?.querySelector<HTMLElement>('.formula-function-list')
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (list && option) {
      const bounds = list.getBoundingClientRect()
      const activeBounds = option.getBoundingClientRect()
      if (activeBounds.top < bounds.top) list.scrollTop += activeBounds.top - bounds.top
      else if (activeBounds.bottom > bounds.bottom)
        list.scrollTop += activeBounds.bottom - bounds.bottom
    }
    // 宿主布局缩放不一定触发 window resize；仅观察本根并复用同一 DOM 定位。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    observer?.observe(root)
    // 滚动只改 DOM 几何，不把像素坐标变成第二份业务状态。
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      portal.remove()
    }
  }, [visible, inputRef, suggestions, signature, cursor, lifecycle, portal])

  if (!visible) return null
  const acceptName = (name: string) => {
    let caret: number | null = null
    flushSync(() => {
      caret = accept(name)
    })
    if (caret !== null) {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.setSelectionRange(caret, caret)
    }
  }
  return createPortal(
    <div
      className={`formula-assist${suggestions.length > 0 ? '' : ' formula-assist-signature'}`}
      ref={popupRef}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {suggestions.length > 0 ? (
        <>
          <div className="formula-assist-heading">
            <Trans>Functions </Trans>
            <span>↑ ↓ · Tab / Enter</span>
          </div>
          <div
            id={id}
            role="listbox"
            aria-label={t`Formula functions`}
            className="formula-function-list"
          >
            {suggestions.map(({ spec }, index) => (
              <button
                key={spec.name}
                id={`${id}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === cursor}
                aria-label={`${spec.name} ${translateFeedback(
                  i18n,
                  i18n.locale.startsWith('zh') ? (spec.summaryZh ?? spec.summary) : spec.summary,
                )}`}
                title={translateFeedback(
                  i18n,
                  i18n.locale.startsWith('zh') ? (spec.summaryZh ?? spec.summary) : spec.summary,
                )}
                onClick={() => acceptName(spec.name)}
              >
                <code>{spec.name}</code>
                <span>
                  {translateFeedback(
                    i18n,
                    i18n.locale.startsWith('zh') ? (spec.summaryZh ?? spec.summary) : spec.summary,
                  )}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        signature && (
          <div
            id={`${id}-signature`}
            aria-label={t`Formula arguments`}
            role="status"
            className="formula-signature"
          >
            <FormulaParameterHelp
              spec={signature.spec}
              activeArgIndex={signature.activeArgIndex}
              compact
            />
          </div>
        )
      )}
    </div>,
    portal,
  )
}
