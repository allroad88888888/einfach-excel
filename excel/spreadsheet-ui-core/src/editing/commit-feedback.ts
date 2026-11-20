import type { EditingCommitLifecycleState } from './types'

/** 对已知原生拒绝给出可操作提示；未知错误仍保留通用提示及诊断 detail。 */
const INPUT_ERRORS = [
  ['DATA_VALIDATION_FAILED',
    'This value does not meet the cell’s data validation rule. Change it or press Escape.'],
  ['the new column name collides with another column of the table',
    'This table already has a column with that name. Choose a different column name.'],
  ['column name must not be empty', 'Enter a non-empty column name or press Escape.'],
  ['a table formula consumer changed or cannot be rewritten',
    'This column rename cannot rewrite one of its formula references.'],
  ['Spilled arrays cannot be entered inside a table.',
    'Spilled arrays cannot be entered inside a table. Use a single-value formula or press Escape.'],
] as const

// 稳定宿主诊断由现有展现层词典翻译；Core 不复制英文文案或放宽拒写门禁。
const HOST_ERRORS = ['HOST_READ_ONLY', 'HOST_BUSY', 'HOST_STRUCTURE_DISABLED'] as const

/** Maps known native input/table/host error suffixes to localized message keys. */
export function normalizeInputErrorMessage(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  return (
    HOST_ERRORS.find((code) => raw.endsWith(code)) ??
    INPUT_ERRORS.find(([suffix]) => raw.endsWith(suffix))?.[1]
  )
}

/** Error feedback for editing lifecycle states that leave a draft open. */
export interface EditingCommitFeedback {
  readonly kind: 'error'
  readonly message: string
  readonly detail?: string
}

/** Maps editing lifecycle facts to framework-neutral error copy. */
export function editingCommitFeedback(
  lifecycle: EditingCommitLifecycleState,
): EditingCommitFeedback | null {
  switch (lifecycle.status) {
    case 'rejected':
      return {
        kind: 'error',
        message: normalizeInputErrorMessage(lifecycle.error) ?? 'That edit was not saved.',
        detail: lifecycle.error || undefined,
      }
    case 'outcome-unknown':
      return {
        kind: 'error',
        message: 'This edit was not confirmed — it may or may not have been saved.',
        detail: lifecycle.error || undefined,
      }
    case 'ready':
    case 'blocked':
    case 'pending':
      return null
  }
}

/** Whether the lifecycle has error feedback that needs host presentation. */
export function isUnresolvedEditingCommit(lifecycle: EditingCommitLifecycleState): boolean {
  return editingCommitFeedback(lifecycle) !== null
}
