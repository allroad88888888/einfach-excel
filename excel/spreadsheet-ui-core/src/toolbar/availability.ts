import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing'
import { selectionAtom } from '../selection'
import { workspaceSessionAtom } from '../workspace'
import type {
  ToolbarAvailabilitySnapshot,
  ToolbarCommandAvailability,
  ToolbarFormatCommandInput,
  ToolbarFormatCommandIntent,
  ToolbarFormatCommandKind,
} from './types'

export function createToolbarFormatCommandIntent(
  input: ToolbarFormatCommandInput,
  snapshot: ToolbarAvailabilitySnapshot,
): ToolbarFormatCommandIntent | null {
  if (snapshot.sheetId === null) {
    return null
  }

  return Object.freeze({
    type: 'toolbar.format.command',
    source: 'toolbar',
    sheetId: snapshot.sheetId,
    selectionKind: snapshot.selectionKind,
    command: input.command,
    value: input.value ?? null,
  })
}

export function getToolbarCommandAvailability(
  snapshot: ToolbarAvailabilitySnapshot,
): ToolbarCommandAvailability {
  const isEditing = snapshot.editingMode === 'drafting'
  const hasSheet = snapshot.sheetId !== null
  const canFormatSelection =
    hasSheet &&
    !isEditing &&
    (snapshot.selectionKind === 'cell' || snapshot.selectionKind === 'range')
  const canStyleSelection = hasSheet && !isEditing && snapshot.selectionKind !== 'all'

  return Object.freeze({
    sheetId: snapshot.sheetId,
    selectionKind: snapshot.selectionKind,
    editingMode: snapshot.editingMode,
    bold: canStyleSelection,
    italic: canStyleSelection,
    textColor: canStyleSelection,
    fillColor: canStyleSelection,
    numberFormat: canFormatSelection,
    alignment: canStyleSelection,
    verticalAlignment: canStyleSelection,
    underline: canStyleSelection,
    strikethrough: canStyleSelection,
    wrap: canStyleSelection,
    rotation: canStyleSelection,
    indent: canStyleSelection,
    border: canStyleSelection,
    fontFamily: canStyleSelection,
    fontSize: canStyleSelection,
  })
}

export function isToolbarFormatCommandAvailable(
  command: ToolbarFormatCommandKind,
  availability: ToolbarCommandAvailability,
): boolean {
  switch (command) {
    case 'bold':
      return availability.bold
    case 'italic':
      return availability.italic
    case 'text-color':
      return availability.textColor
    case 'fill-color':
      return availability.fillColor
    case 'number-format':
      return availability.numberFormat
    case 'alignment':
      return availability.alignment
    case 'vertical-alignment':
      return availability.verticalAlignment
    case 'underline':
      return availability.underline
    case 'strikethrough':
      return availability.strikethrough
    case 'wrap':
      return availability.wrap
    case 'rotation':
      return availability.rotation
    case 'indent-increase':
    case 'indent-decrease':
      return availability.indent
    case 'border':
      return availability.border
    case 'font-family':
      return availability.fontFamily
    case 'font-size':
    case 'font-size-up':
    case 'font-size-down':
      return availability.fontSize
    default:
      return false
  }
}

export const toolbarCommandAvailabilityAtom = atom((get): ToolbarCommandAvailability => {
  const selection = get(selectionAtom)
  const editing = get(editingSessionAtom)
  const workspace = get(workspaceSessionAtom)

  return getToolbarCommandAvailability({
    sheetId: workspace.activeSheetId ?? (selection.sheetId.length > 0 ? selection.sheetId : null),
    selectionKind: selection.kind,
    editingMode: editing.status,
  })
})
toolbarCommandAvailabilityAtom.debugLabel = 'spreadsheet.toolbar.commandAvailability'
