import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  editingSessionAtom,
  formulaFunctionSuggestionsAtom,
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSignatureAtom,
  renderActiveSignatureSlots,
  acceptFormulaSuggestionAtom,
} from '@einfach/spreadsheet-ui-core'
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
  const session = useAtomValue(editingSessionAtom)
  const suggestions = useAtomValue(formulaFunctionSuggestionsAtom)
  const cursor = useAtomValue(formulaFunctionSuggestionCursorAtom)
  const signature = useAtomValue(formulaFunctionSignatureAtom)
  const accept = useSetAtom(acceptFormulaSuggestionAtom)
  const popupRef = useRef<HTMLDivElement>(null)
  const active =
    session.status === 'drafting' &&
    (source === 'formula-bar') === (session.source?.source === 'formula-bar')
  const visible = active && (suggestions.length > 0 || signature !== null)

  useLayoutEffect(() => {
    if (!visible) return
    const position = () => {
      const input = inputRef.current
      const popup = popupRef.current
      if (!input || !popup) return
      const rect = input.getBoundingClientRect()
      const width = document.documentElement.clientWidth
      const height = document.documentElement.clientHeight
      popup.style.visibility = rect.bottom <= 0 || rect.top >= height ||
        rect.right <= 0 || rect.left >= width ? 'hidden' : 'visible'
      popup.style.left = `${Math.max(8, Math.min(rect.left, width - popup.offsetWidth - 8))}px`
      const below = rect.bottom + 4
      popup.style.top = `${Math.max(
        8,
        below + popup.offsetHeight <= height - 8 ? below : rect.top - popup.offsetHeight - 4,
      )}px`
    }
    position()
    popupRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' })
    // 滚动只改 DOM 几何，不把像素坐标变成第二份业务状态。
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [visible, inputRef, suggestions, signature, cursor])

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
      className="formula-assist"
      ref={popupRef}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {suggestions.length > 0 ? (
        <>
          <div className="formula-assist-heading">
            Functions <span>↑ ↓ · Tab / Enter</span>
          </div>
          <div
            id={id}
            role="listbox"
            aria-label="Formula functions"
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
                aria-label={`${spec.name} ${spec.summary}`}
                title={spec.summary}
                onClick={() => acceptName(spec.name)}
              >
                <code>{spec.name}</code>
                <span>{spec.summary}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        signature && (
          <div
            id={`${id}-signature`}
            aria-label="Formula arguments"
            role="status"
            className="formula-signature"
          >
            <code>
              {signature.spec.name}(
              {renderActiveSignatureSlots(signature).map((slot, index) => (
                <span key={index}>
                  {index > 0 ? ', ' : ''}
                  {slot.active ? <strong>{slot.text}</strong> : slot.text}
                </span>
              ))}
              )
            </code>
          </div>
        )
      )}
    </div>,
    document.body,
  )
}
