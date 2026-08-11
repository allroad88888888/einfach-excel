import { useT } from '../../src/i18n'
import type { ToolbarGroupProps } from './ToolbarGroupProps'
import { ClearFormatIcon, CommentIcon, FormatPainterIcon, RedoIcon, UndoIcon } from './ToolbarIcons'

/** History, painter, clear-format and comment toolbar controls. */
export function ToolbarHistoryGroup(props: ToolbarGroupProps) {
  const t = useT()
  const { runtime } = props
  return (
    <>
      <button
        type="button"
        class="fmt-btn spreadsheet-toolbar-button"
        data-testid="toolbar-btn-undo"
        data-tooltip={t('toolbar.undo.title')}
        aria-label={t('toolbar.undo.title')}
        disabled={!runtime.canUndo()}
        onClick={() => void runtime.entrypoints.handleUndo()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        class="fmt-btn spreadsheet-toolbar-button"
        data-testid="toolbar-btn-redo"
        data-tooltip={t('toolbar.redo.title')}
        aria-label={t('toolbar.redo.title')}
        disabled={!runtime.canRedo()}
        onClick={() => void runtime.entrypoints.handleRedo()}
      >
        <RedoIcon />
      </button>
      <button
        type="button"
        class={`fmt-btn spreadsheet-toolbar-button ${runtime.formatPainterState() !== 'idle' ? 'fmt-btn-active' : ''}`.trim()}
        data-testid="toolbar-btn-format-painter"
        data-format-painter-state={runtime.formatPainterState()}
        data-tooltip={
          runtime.formatPainterState() === 'sticky'
            ? t('toolbar.painter.title.sticky')
            : t('toolbar.painter.title')
        }
        aria-label={t('toolbar.painter')}
        aria-pressed={runtime.formatPainterState() !== 'idle'}
        disabled={runtime.isProtectionGated()}
        onClick={runtime.painter.handleFormatPainterClick}
        onDblClick={runtime.painter.handleFormatPainterDoubleClick}
      >
        <FormatPainterIcon />
      </button>
      <button
        type="button"
        class="fmt-btn spreadsheet-toolbar-button"
        data-testid="toolbar-btn-clear-format"
        data-tooltip={t('toolbar.clearFormat.title')}
        aria-label={t('toolbar.clearFormat.title')}
        disabled={
          !runtime.backend?.setFormatRange ||
          runtime.isProtectionGated() ||
          !runtime.activeCellHasFormat()
        }
        onClick={() => void runtime.format.clearFormat()}
      >
        <ClearFormatIcon />
      </button>
      <span
        class="spreadsheet-toolbar-spacer"
        aria-hidden="true"
        style={{ display: 'inline-block', width: '40px', height: '28px', 'pointer-events': 'none' }}
      />
      <button
        type="button"
        class="fmt-btn spreadsheet-toolbar-button"
        data-testid="toolbar-btn-comment"
        data-tooltip={t('toolbar.comment.title')}
        aria-label={t('toolbar.comment.title')}
        disabled={
          !runtime.availability().sheetId || runtime.availability().editingMode === 'drafting'
        }
        onClick={runtime.entrypoints.openComment}
      >
        <CommentIcon />
      </button>
      <span class="spreadsheet-toolbar-separator" aria-hidden="true" />
    </>
  )
}
