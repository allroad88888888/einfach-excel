import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { richTextPanelAtom } from '@einfach-excel/spreadsheet-ui-core'
import { richTextBaselineAtom, runRichTextBaselineAtom } from './core'
import { labels } from './messages'

export function RichTextBaselineTools({ restoreSelection }: {
  readonly restoreSelection: () => void
}) {
  const { i18n } = useLingui()
  const panel = useAtomValue(richTextPanelAtom)
  const selected = useAtomValue(richTextBaselineAtom)
  const run = useSetAtom(runRichTextBaselineAtom)
  return <>{(['superscript', 'subscript'] as const).map(value =>
    <button key={value} type="button" data-rich-text-format={value}
      aria-label={i18n._(labels[value])} title={i18n._(labels[value])}
      aria-pressed={selected === 'mixed' ? 'mixed' : selected === value}
      disabled={!panel.open || panel.busy || selected === null}
      onMouseDown={event => event.preventDefault()}
      onClick={async () => { if (await run(value)) restoreSelection() }}>
      <span aria-hidden="true">{value === 'superscript' ? 'x²' : 'x₂'}</span>
    </button>)}</>
}
