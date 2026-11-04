import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** Insert / Delete cells messages from UI Core and the native Rust command. */
export const shiftCellsFeedback: Readonly<Record<string, MessageDescriptor>> = {
  'Cannot shift cells through part of a merged cell.':
    msg`Cannot shift cells through part of a merged cell.`,
  'Cannot shift cells in a table. Insert or delete table rows or columns instead.':
    msg`Cannot shift cells in a table. Insert or delete table rows or columns instead.`,
  'Cannot shift part of a spilled array.': msg`Cannot shift part of a spilled array.`,
  'Cannot shift cells inside a filtered range.': msg`Cannot shift cells inside a filtered range.`,
  'Cannot shift nonblank cells off the worksheet. Clear the last cells first.':
    msg`Cannot shift nonblank cells off the worksheet. Clear the last cells first.`,
  'Shifting these cells would remove or split conditional formatting beyond its limits.':
    msg`Shifting these cells would remove or split conditional formatting beyond its limits.`,
  'Shifting these cells exceeds the 32 MiB undo budget.':
    msg`Shifting these cells exceeds the 32 MiB undo budget.`,
  'Select one continuous range to insert or delete cells.':
    msg`Select one continuous range to insert or delete cells.`,
  'Unprotect the worksheet before inserting or deleting cells.':
    msg`Unprotect the worksheet before inserting or deleting cells.`,
  'Choose how to shift the cells.': msg`Choose how to shift the cells.`,
}
