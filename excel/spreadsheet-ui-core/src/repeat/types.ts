import type { SelectionMutation } from '../toolbar/selection-mutation-command'
import type { SelectionMergeAction } from '../toolbar/selection-merge-command'
import type { SelectionVisibilityAction } from '../toolbar/selection-visibility-command'
import type { StructureAction } from '../rust-workbook/structure-geometry'

/** 可重复动作的稳定名称；界面层据此翻译提示，Core 不保存本地化文本。 */
export type RepeatLabel =
  | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'wrap-text'
  | 'fill-color' | 'text-color' | 'font-family' | 'font-size' | 'alignment'
  | 'number-format' | 'borders' | 'indent' | 'format'
  | 'clear-contents' | 'clear-formats' | 'clear-all'
  | StructureAction
  | 'merge' | 'center' | 'unmerge'
  | 'row-height' | 'column-width'
  | SelectionVisibilityAction

/** 只记录“做了什么”的参数，不含选区；重复时总是作用于当前选区。 */
export type RepeatIntent =
  | { readonly kind: 'mutation'; readonly mutation: SelectionMutation }
  | { readonly kind: 'structure'; readonly action: StructureAction }
  | { readonly kind: 'merge'; readonly action: Exclude<SelectionMergeAction, 'confirm' | 'cancel'> }
  | { readonly kind: 'size'; readonly axis: 'row' | 'column'; readonly pixels: number }
  | { readonly kind: 'visibility'; readonly action: SelectionVisibilityAction }

export interface RepeatRecord {
  readonly intent: RepeatIntent
  readonly label: RepeatLabel
}
