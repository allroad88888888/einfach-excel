import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** Messages emitted by the six next-version Core commands. */
export const nextVersionFeedback: Readonly<Record<string, MessageDescriptor>> = {
  'The cut cells overlap a named range. Change or remove that name in Name manager before moving cells between sheets. No cells were moved.':
    msg`The cut cells overlap a named range. Change or remove that name in Name manager before moving cells between sheets. No cells were moved.`,
  'Use nonempty groups and valid numbers; minimum cannot exceed maximum.':
    msg`Use nonempty groups and valid numbers; minimum cannot exceed maximum.`,
  'Choose valid filter conditions in nonempty groups, or up to eight different columns.':
    msg`Choose valid filter conditions in nonempty groups, or up to eight different columns.`,
  'Choose at most 1,000 values within 1 MiB, or narrow the search.':
    msg`Choose at most 1,000 values within 1 MiB, or narrow the search.`,
  'All search matches exceed the 1,000-value or 1 MiB selection budget. Narrow the search.':
    msg`All search matches exceed the 1,000-value or 1 MiB selection budget. Narrow the search.`,
  'Rust returned incomplete search matches. The selection was not changed.':
    msg`Rust returned incomplete search matches. The selection was not changed.`,
  'Search selection must start at the first match.':
    msg`Search selection must start at the first match.`,
  'Use nonempty groups with valid filter conditions.':
    msg`Use nonempty groups with valid filter conditions.`,
  'Choose nonempty groups with valid filter conditions.':
    msg`Choose nonempty groups with valid filter conditions.`,
  'Enter every required argument.': msg`Enter every required argument.`,
  'Complete every required parameter in each repeated group.':
    msg`Complete every required parameter in each repeated group.`,
  'Finish the wildcard escape with *, ? or ~.': msg`Finish the wildcard escape with *, ? or ~.`,
  'Selection area limit reached. Keep the current selection or start a new selection.':
    msg`Selection area limit reached. Keep the current selection or start a new selection.`,
  'Unmerge the source and destination before moving cells between sheets. No cells were moved.':
    msg`Unmerge the source and destination before moving cells between sheets. No cells were moved.`,
  'Move cells outside Excel Tables before cutting between sheets. No cells were moved.':
    msg`Move cells outside Excel Tables before cutting between sheets. No cells were moved.`,
}
