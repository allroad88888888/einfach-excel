import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import './cell-metadata.css'

export interface CellMetadataLabels {
  readonly note: string
  readonly comment: string
}

const DEFAULT_LABELS: CellMetadataLabels = {
  note: 'Cell has a note', comment: 'Cell has comments',
}

/** 只呈现原生投影事实；图标索引的比较、逆序由 Rust 完成。 */
export function CellMetadata({ cell, labels = DEFAULT_LABELS }: {
  readonly cell?: DisplayCell
  readonly labels?: CellMetadataLabels
}) {
  const icon = cell?.conditionalIcon
  const color = icon && ['#c93639', '#b57900', '#21834a'][icon.index]
  return <>
    {icon && <span aria-hidden="true" className="cell-conditional-icon"
      data-conditional-icon="true" data-icon-set={icon.set} data-icon-index={icon.index}
      style={{ color }}>
      {icon.set === 'three-arrows' ? ['↓', '→', '↑'][icon.index]
        : icon.set === 'three-traffic-lights' ? '●' : '⚑'}
    </span>}
    {cell?.noteIndicator && <span role="img" aria-label={labels.note}
      className="cell-note-indicator" data-cell-note="true" />}
    {(cell?.commentIndicator || cell?.commentThreadId) && <span role="img" aria-label={labels.comment}
      className="cell-comment-indicator" data-cell-comment="true"
      data-comment-thread-id={cell.commentThreadId} />}
  </>
}
