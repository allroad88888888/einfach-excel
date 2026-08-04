import type { ProjectionRevision } from '../backend/types'
import type { SearchRangeResult } from './types'
import type { SearchTicket, TicketedFindMatch } from './internal-types'
import { MAX_FIND_PAGE } from './constants'
import { copyMatch, isFindReplaceTarget, isProjectionRevision, isRecord, isSafeIndex } from './value-domain'

export function validateSearchResult(value: unknown, ticket: SearchTicket): { readonly result: SearchRangeResult; readonly matches: readonly TicketedFindMatch[] } | null {
  if (!isRecord(value) || value.kind !== 'search-range' || value.sheetId !== ticket.request.sheetId || value.requestId !== ticket.requestId || value.pageStart !== ticket.request.pageStart || !Array.isArray(value.matches) || value.matches.length > MAX_FIND_PAGE || !isSafeIndex(value.totalCount) || value.totalCount < value.matches.length || (value.revision !== undefined && !isProjectionRevision(value.revision)) || (ticket.request.revision !== undefined && value.revision !== ticket.request.revision)) return null
  const matches: TicketedFindMatch[] = []
  const intervalsByCell = new Map<string, Array<{ start: number; end: number }>>()
  for (const candidate of value.matches) {
    if (!isRecord(candidate) || !isRecord(candidate.coord)) return null
    const { row, col } = candidate.coord
    const { matchStart, matchEnd } = candidate
    if (candidate.sheetId !== ticket.request.sheetId || !isSafeIndex(row) || !isSafeIndex(col) || row < ticket.request.range.rowStart || row > ticket.request.range.rowEnd || col < ticket.request.range.colStart || col > ticket.request.range.colEnd || !isSafeIndex(matchStart) || !isSafeIndex(matchEnd) || matchEnd <= matchStart || (candidate.target !== undefined && !isFindReplaceTarget(candidate.target)) || (candidate.target === 'formula' && !ticket.request.query.options.searchFormulas)) return null
    const key = `${row}:${col}`
    const intervals = intervalsByCell.get(key) ?? []
    if (intervals.some((interval) => matchStart < interval.end && matchEnd > interval.start)) return null
    intervals.push({ start: matchStart, end: matchEnd })
    intervalsByCell.set(key, intervals)
    matches.push(Object.freeze({ coord: Object.freeze({ row, col }), sheetId: candidate.sheetId, matchStart, matchEnd, target: isFindReplaceTarget(candidate.target) ? candidate.target : null }))
  }
  const result: SearchRangeResult = { kind: 'search-range', sheetId: value.sheetId, requestId: value.requestId, pageStart: value.pageStart, matches: matches.map(copyMatch), totalCount: value.totalCount, ...(value.revision === undefined ? {} : { revision: value.revision as ProjectionRevision }) }
  return { result, matches: Object.freeze(matches) }
}
