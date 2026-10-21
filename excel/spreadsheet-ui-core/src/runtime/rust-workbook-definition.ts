import type { RustImportCell, RustWorkbookSheetInput } from '../rust-workbook'
import type { WorkerLike } from '../rust-worker'
import { validNativeOutline } from '../outline/native-state'
import { validNativeTableStyle } from '../tables/native-types'
import { validFilterRules } from '../rust-workbook/filter-commands'
import { validFilterGroups } from '../advanced-filter/contracts'
import { cloneFilterSortRule } from '../backend/projection-helpers'
import { validateCustomFormulaDefinitions, type NativeCustomFormulaDefinition } from '../custom-formulas/expression-types'

export interface RustWorkbookSheetDefinition extends RustWorkbookSheetInput {
  readonly id: string
  readonly name: string
  readonly rowCount: number
  readonly colCount: number
}

export interface RustWorkbookDefinition {
  readonly title: string
  readonly sheets: readonly RustWorkbookSheetDefinition[]
  readonly customFormulas?: readonly NativeCustomFormulaDefinition[]
  createImportChunks():
    | Iterable<readonly RustImportCell[]>
    | AsyncIterable<readonly RustImportCell[]>
}

export interface StartRustWorkbookRuntimeInput {
  readonly definition: RustWorkbookDefinition
  readonly workerFactory: () => WorkerLike
}

/** Copies a valid Rust workbook definition before asynchronous startup uses it. */
export function snapshotRustWorkbookDefinition(
  input: RustWorkbookDefinition,
): RustWorkbookDefinition {
  const title = input.title.trim()
  const customFormulas = input.customFormulas === undefined ? undefined : Object.freeze(
    validateCustomFormulaDefinitions(input.customFormulas).map(definition => Object.freeze({
      name: definition.name, expression: definition.expression,
      parameters: Object.freeze([...definition.parameters]),
    })))
  const ids = new Set<string>()
  const sheets = input.sheets.map((sheet) => {
    const id = sheet.id.trim()
    const name = sheet.name.trim()
    if (
      id.length === 0 ||
      name.length === 0 ||
      ids.has(id) ||
      !Number.isSafeInteger(sheet.rowCount) ||
      sheet.rowCount < 1 ||
      !Number.isSafeInteger(sheet.colCount) ||
      sheet.colCount < 1
    ) {
      throw new Error('Rust workbook definition contains an invalid sheet.')
    }
    ids.add(id)
    const hidden = (indices: readonly number[] | undefined, count: number) => {
      if (indices?.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= count))
        throw new Error('Invalid initial hidden index.')
      return indices ? Object.freeze([...new Set(indices)].sort((a, b) => a - b)) : undefined
    }
    const hiddenRows = hidden(sheet.hiddenRows, sheet.rowCount)
    const hiddenColumns = hidden(sheet.hiddenColumns, sheet.colCount)
    const hyperlinks = sheet.hyperlinks?.map((link) => {
      if (![link.row, link.col].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        link.row >= sheet.rowCount || link.col >= sheet.colCount || typeof link.url !== 'string')
        throw new Error('Invalid initial hyperlink cell.')
      return Object.freeze({ ...link })
    })
    const notes = sheet.notes?.map((note) => {
      if (![note.row, note.col].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        note.row >= sheet.rowCount || note.col >= sheet.colCount || typeof note.text !== 'string')
        throw new Error('Invalid initial note cell.')
      return Object.freeze({ ...note })
    })
    const editableRanges = sheet.editableRanges?.map((range) => {
      if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
        (n) => Number.isSafeInteger(n) && n >= 0) || range.rowStart > range.rowEnd ||
        range.colStart > range.colEnd || range.rowEnd >= sheet.rowCount ||
        range.colEnd >= sheet.colCount)
        throw new Error('Invalid initial editable range.')
      return Object.freeze({ ...range })
    })
    const comments = sheet.comments?.map(comment => {
      if (![comment.row, comment.col].every(n => Number.isSafeInteger(n) && n >= 0) ||
        comment.row >= sheet.rowCount || comment.col >= sheet.colCount ||
        typeof comment.author !== 'string' || typeof comment.body !== 'string')
        throw new Error('Invalid initial comment cell.')
      return Object.freeze({ ...comment })
    })
    if (editableRanges && editableRanges.length > 256)
      throw new Error('A worksheet supports at most 256 editable ranges.')
    const snapshotRanges = (entries: RustWorkbookSheetInput['namedRanges'], label: string) =>
      entries?.map(({ name: rangeName, range }) => {
      if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
        (n) => Number.isSafeInteger(n) && n >= 0) || range.rowStart > range.rowEnd ||
        range.colStart > range.colEnd || range.rowEnd >= sheet.rowCount ||
        range.colEnd >= sheet.colCount)
        throw new Error(`Invalid initial ${label}.`)
      return Object.freeze({ name: rangeName, range: Object.freeze({ ...range }) })
    })
    const namedRanges = snapshotRanges(sheet.namedRanges, 'named range')
    const tables = snapshotRanges(sheet.tables, 'table range')?.map((table, index) => {
      const totals = sheet.tables![index].totals
      const style = sheet.tables![index].style
      const calculatedColumns = sheet.tables![index].calculatedColumns
      const filterRules = sheet.tables![index].filterRules
      const filterGroups = sheet.tables![index].filterGroups
      if (filterGroups !== undefined && (!validFilterGroups(filterGroups, sheet.colCount) ||
        (filterGroups.length > 0 && Boolean(filterRules?.length)) ||
        filterGroups.some(group => group.rules.some(rule =>
          rule.colIndex < table.range.colStart || rule.colIndex > table.range.colEnd))))
        throw new Error('Invalid initial table filter.')
      if (filterRules !== undefined && (!validFilterRules(filterRules, sheet.colCount) ||
        filterRules.some((rule) =>
          rule.colIndex < table.range.colStart || rule.colIndex > table.range.colEnd)))
        throw new Error('Invalid initial table filter.')
      if (calculatedColumns !== undefined && (
        calculatedColumns.length !== table.range.colEnd - table.range.colStart + 1 ||
        table.range.rowEnd <= table.range.rowStart || calculatedColumns.some((formula) =>
          formula !== null && (typeof formula !== 'string' || !formula.startsWith('=')))))
        throw new Error('Invalid initial calculated columns.')
      if (style !== undefined && !validNativeTableStyle(style)) throw new Error('Invalid initial table style.')
      if (totals !== undefined && (typeof totals !== 'boolean' ||
        (totals && table.range.rowEnd + 1 >= sheet.rowCount)))
        throw new Error('Invalid initial table totals row.')
      return Object.freeze({ ...table, ...(totals === undefined ? {} : { totals }),
        ...(filterRules === undefined ? {} : { filterRules:
          Object.freeze(filterRules.map((rule) => {
          const copied = cloneFilterSortRule(rule)
          if (copied.kind === 'list') Object.freeze(copied.values)
          return Object.freeze(copied)
          })) }),
        ...(filterGroups === undefined ? {} : { filterGroups:
          Object.freeze(filterGroups.map(group =>
          Object.freeze({ rules: Object.freeze(group.rules.map(rule => {
            const copied = cloneFilterSortRule(rule)
            if (copied.kind === 'list') Object.freeze(copied.values)
            return Object.freeze(copied)
          })) }))) }),
        ...(calculatedColumns === undefined ? {} : {
          calculatedColumns: Object.freeze([...calculatedColumns]),
        }),
        ...(style === undefined ? {} : { style: Object.freeze({ ...style }) }) })
    })
    if (sheet.outline && (!validNativeOutline(sheet.outline) ||
      sheet.outline.rows.some((group) => group.end >= sheet.rowCount) ||
      sheet.outline.columns.some((group) => group.end >= sheet.colCount)))
      throw new Error('Invalid initial outline range.')
    const outline = sheet.outline ? Object.freeze({
      rows: Object.freeze(sheet.outline.rows.map((group) => Object.freeze({ ...group }))),
      columns: Object.freeze(sheet.outline.columns.map((group) => Object.freeze({ ...group }))),
    }) : undefined
    const dataValidations = sheet.dataValidations?.map(({ range, rule }) => {
      if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
        (n) => Number.isSafeInteger(n) && n >= 0) || range.rowStart > range.rowEnd ||
        range.colStart > range.colEnd || range.rowEnd >= sheet.rowCount ||
        range.colEnd >= sheet.colCount)
        throw new Error('Invalid initial data-validation range.')
      return Object.freeze({ range: Object.freeze({ ...range }),
        rule: Object.freeze(rule.kind === 'list'
          ? { ...rule, items: Object.freeze([...rule.items]) } : { ...rule }) })
    })
    const conditionalFormats = sheet.conditionalFormats?.map((entry) => {
      const range = entry.scope.range
      if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
        (n) => Number.isSafeInteger(n) && n >= 0) || range.rowStart > range.rowEnd ||
        range.colStart > range.colEnd || range.rowEnd >= sheet.rowCount ||
        range.colEnd >= sheet.colCount)
        throw new Error('Invalid initial conditional-format range.')
      return Object.freeze({
        scope: Object.freeze({ range: Object.freeze({ ...range }) }),
        rule: Object.freeze('format' in entry.rule
          ? { ...entry.rule, format: Object.freeze({ ...entry.rule.format }) } : { ...entry.rule }),
      })
    })
    const freeze = sheet.freeze
    if (freeze && (![freeze.rows, freeze.cols].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      freeze.rows >= sheet.rowCount || freeze.cols >= sheet.colCount))
      throw new Error('Invalid initial freeze boundary.')
    const mergedRanges = sheet.mergedRanges?.map((range) => {
      if (
        ![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        ) ||
        range.rowStart > range.rowEnd ||
        range.colStart > range.colEnd ||
        range.rowEnd >= sheet.rowCount ||
        range.colEnd >= sheet.colCount ||
        (range.rowStart === range.rowEnd && range.colStart === range.colEnd)
      )
        throw new Error('Invalid initial merged range.')
      return Object.freeze({ ...range })
    })
    const rowHeights = sheet.rowHeights?.map((entry) => {
      if (
        !Number.isSafeInteger(entry.rowIndex) ||
        entry.rowIndex < 0 ||
        entry.rowIndex >= sheet.rowCount ||
        !Number.isSafeInteger(entry.heightPx) ||
        entry.heightPx < 16 ||
        entry.heightPx > 512
      )
        throw new Error('Invalid initial row height.')
      return Object.freeze({ ...entry })
    })
    const colWidths = sheet.colWidths?.map((entry) => {
      if (
        !Number.isSafeInteger(entry.colIndex) ||
        entry.colIndex < 0 ||
        entry.colIndex >= sheet.colCount ||
        !Number.isSafeInteger(entry.widthPx) ||
        entry.widthPx < 40 ||
        entry.widthPx > 1024
      )
        throw new Error('Invalid initial column width.')
      return Object.freeze({ ...entry })
    })
    return Object.freeze({
      id,
      name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      ...(rowHeights ? { rowHeights: Object.freeze(rowHeights) } : {}),
      ...(colWidths ? { colWidths: Object.freeze(colWidths) } : {}),
      ...(hiddenRows ? { hiddenRows } : {}),
      ...(hiddenColumns ? { hiddenColumns } : {}),
      ...(hyperlinks ? { hyperlinks: Object.freeze(hyperlinks) } : {}),
      ...(notes ? { notes: Object.freeze(notes) } : {}),
      ...(comments ? { comments: Object.freeze(comments) } : {}),
      ...(editableRanges ? { editableRanges: Object.freeze(editableRanges) } : {}),
      ...(outline ? { outline } : {}),
      ...(namedRanges ? { namedRanges: Object.freeze(namedRanges) } : {}),
      ...(tables ? { tables: Object.freeze(tables) } : {}),
      ...(mergedRanges ? { mergedRanges: Object.freeze(mergedRanges) } : {}),
      ...(freeze ? { freeze: Object.freeze({ ...freeze }) } : {}),
      ...(conditionalFormats ? { conditionalFormats: Object.freeze(conditionalFormats) } : {}),
      ...(dataValidations ? { dataValidations: Object.freeze(dataValidations) } : {}),
    })
  })
  if (title.length === 0 || sheets.length === 0) {
    throw new Error('Rust workbook definition requires a title and at least one sheet.')
  }
  return Object.freeze({
    title,
    sheets: Object.freeze(sheets),
    ...(customFormulas ? { customFormulas } : {}),
    createImportChunks: input.createImportChunks,
  })
}
