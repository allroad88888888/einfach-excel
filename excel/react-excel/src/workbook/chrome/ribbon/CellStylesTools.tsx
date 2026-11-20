import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cellStylesPanelAtom,
  editingSessionAtom,
  resolveCellStylePreset,
  runCellStylesAtom,
  WORKBOOK_THEMES,
  workbookThemeAtom,
  type CellStylePresetId,
  type WorkbookThemeDefinition,
  type WorkbookThemeId,
} from '@einfach-excel/spreadsheet-ui-core'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { cycleDialogFocus } from './dialog-focus'
import { RibbonItem } from './RibbonItem'
import './cell-styles.css'

const THEME_LABELS: Readonly<Record<WorkbookThemeId, MessageDescriptor>> = {
  office: msg`Office`,
  facet: msg`Facet`,
  integral: msg`Integral`,
  slate: msg`Slate`,
  warm: msg`Warm`,
}

interface StyleGroup {
  readonly title: MessageDescriptor
  readonly items: readonly (readonly [CellStylePresetId, MessageDescriptor])[]
}

const STYLE_GROUPS: readonly StyleGroup[] = [
  {
    title: msg`Good, bad and neutral`,
    items: [
      ['normal', msg`Normal`],
      ['good', msg`Good`],
      ['bad', msg`Bad`],
      ['neutral', msg`Neutral`],
    ],
  },
  {
    title: msg`Data and model`,
    items: [
      ['input', msg`Input`],
      ['output', msg`Output`],
      ['calculation', msg`Calculation`],
      ['note', msg`Note`],
      ['warning', msg`Warning text`],
      ['explanatory', msg`Explanatory`],
    ],
  },
  {
    title: msg`Titles and headings`,
    items: [
      ['title', msg`Title`],
      ['heading-1', msg`Heading 1`],
      ['heading-2', msg`Heading 2`],
      ['heading-3', msg`Heading 3`],
      ['heading-4', msg`Heading 4`],
      ['total', msg`Total`],
    ],
  },
  {
    title: msg`Themed cell styles`,
    items: [
      ['accent-1', msg`Accent 1`],
      ['accent-2', msg`Accent 2`],
      ['accent-3', msg`Accent 3`],
      ['accent-4', msg`Accent 4`],
      ['accent-5', msg`Accent 5`],
      ['accent-6', msg`Accent 6`],
      ['accent-1-soft', msg`20% Accent 1`],
      ['accent-2-soft', msg`20% Accent 2`],
      ['accent-3-soft', msg`20% Accent 3`],
      ['accent-4-soft', msg`20% Accent 4`],
      ['accent-5-soft', msg`20% Accent 5`],
      ['accent-6-soft', msg`20% Accent 6`],
    ],
  },
]

function borderCss(edge?: {
  readonly style?: string
  readonly color?: string
}): string | undefined {
  if (!edge || !edge.style || edge.style === 'none') return undefined
  const color = edge.color ?? 'currentColor'
  if (edge.style === 'double') return `3px double ${color}`
  if (edge.style === 'thick') return `3px solid ${color}`
  if (edge.style === 'medium') return `2px solid ${color}`
  return `1px solid ${color}`
}

function swatchPreviewStyle(
  presetId: CellStylePresetId,
  theme: WorkbookThemeDefinition,
): CSSProperties {
  const { format } = resolveCellStylePreset(presetId, theme)
  return {
    backgroundColor: format.bgColor,
    color: format.fgColor,
    fontWeight: format.bold ? 700 : 400,
    fontStyle: format.italic ? 'italic' : undefined,
    fontFamily: format.fontFamily,
    fontSize: format.fontSize ? `${Math.min(format.fontSize, 15)}px` : undefined,
    borderTop: borderCss(format.borders?.top),
    borderBottom: borderCss(format.borders?.bottom),
    borderLeft: borderCss(format.borders?.left),
    borderRight: borderCss(format.borders?.right),
  }
}

/** Built-in Cell Styles gallery and Workbook Theme switcher in Start -> Styles. */
export function CellStylesTools() {
  const { i18n, t } = useLingui()
  const panel = useAtomValue(cellStylesPanelAtom)
  const theme = useAtomValue(workbookThemeAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const run = useSetAtom(runCellStylesAtom)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = trigger.current
    if (!panel.open || !dialog) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLButtonElement>('[data-cell-styles-close]')?.focus()
    return () => {
      dialog.close?.()
      opener?.focus({ preventScroll: true })
    }
  }, [panel.open])

  return (
    <>
      <RibbonItem id="format.cell-styles">
        <button
          data-ribbon-item="format.cell-styles"
          ref={trigger}
          type="button"
          className="tool-button"
          aria-label={t`Cell styles and themes`}
          title={t`Cell styles and themes`}
          aria-haspopup="dialog"
          aria-expanded={panel.open}
          disabled={editing || panel.busy}
          onClick={() => void run('open')}
        >
          <span aria-hidden="true">❖</span>
        </button>
      </RibbonItem>
      {panel.open && (
        <dialog
          ref={dialogRef}
          className="cell-styles-panel"
          aria-labelledby={`${id}-title`}
          onKeyDown={cycleDialogFocus}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <div className="cell-styles-header">
            <h2 id={`${id}-title`}>
              <Trans>Cell styles and themes</Trans>
            </h2>
            <button
              data-cell-styles-close
              type="button"
              className="cell-styles-close"
              disabled={panel.busy}
              onClick={() => void run('close')}
            >
              <Trans>Close</Trans>
            </button>
          </div>
          <section className="cell-styles-section">
            <h3>
              <Trans>Workbook theme</Trans>
            </h3>
            <div className="theme-picker" role="radiogroup" aria-label={t`Workbook theme`}>
              {WORKBOOK_THEMES.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  className="theme-chip"
                  data-theme-id={candidate.id}
                  aria-checked={candidate.id === theme.id}
                  disabled={panel.busy}
                  onClick={() => void run({ type: 'theme', themeId: candidate.id })}
                >
                  <span className="theme-dots" aria-hidden="true">
                    {candidate.accents.slice(0, 4).map((hex) => (
                      <span
                        key={hex}
                        className="theme-dot"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </span>
                  {i18n._(THEME_LABELS[candidate.id])}
                </button>
              ))}
            </div>
          </section>
          {STYLE_GROUPS.map((group) => (
            <section key={group.title.id} className="cell-styles-section">
              <h3>{i18n._(group.title)}</h3>
              <div className="cell-styles-grid">
                {group.items.map(([presetId, label]) => (
                  <button
                    key={presetId}
                    type="button"
                    className="cell-style-swatch"
                    data-style-preset={presetId}
                    disabled={panel.busy}
                    style={swatchPreviewStyle(presetId, theme)}
                    onClick={() => void run({ type: 'apply', presetId })}
                  >
                    {i18n._(label)}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {panel.error && <p role="alert">{translateFeedback(i18n, panel.error)}</p>}
        </dialog>
      )}
    </>
  )
}
