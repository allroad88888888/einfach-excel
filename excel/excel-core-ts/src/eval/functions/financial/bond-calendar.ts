import type { Value } from '../../../types'
import { ERR, parseArg } from './shared'

export type ParsedBasis = { ok: true; basis: number } | { ok: false; err: Value }
export type ParsedFrequency = { ok: true; frequency: number } | { ok: false; err: Value }
export type DateParts = { year: number; month: number; day: number }
export type CouponSplit = { a: number; dsc: number; e: number }

export const DATE_MS_PER_DAY = 86_400_000
export const EXCEL_ANCHOR_UTC_MS = Date.UTC(1899, 11, 31)

export function parseBasis(args: Value[], index: number): ParsedBasis {
  if (args.length <= index) return { ok: true, basis: 0 }
  const basis = parseArg(args[index])
  if (!basis.ok) return { ok: false, err: basis.err }
  // Harvey P2 — Excel returns `#NUM!` (not `#VALUE!`) for invalid basis, and
  // it rejects fractional / out-of-range values rather than silently truncating.
  if (!Number.isFinite(basis.n)) return { ok: false, err: ERR('#NUM!') }
  if (basis.n < 0 || basis.n >= 5) return { ok: false, err: ERR('#NUM!') }
  if (!Number.isInteger(basis.n)) return { ok: false, err: ERR('#NUM!') }
  return { ok: true, basis: basis.n }
}

export function parseFrequency(value: Value): ParsedFrequency {
  const frequency = parseArg(value)
  if (!frequency.ok) return { ok: false, err: frequency.err }
  const normalized = Math.trunc(frequency.n)
  if (normalized !== 1 && normalized !== 2 && normalized !== 4) {
    return { ok: false, err: ERR('#NUM!') }
  }
  return { ok: true, frequency: normalized }
}

export function serialDateToParts(serial: number): DateParts {
  const whole = Math.floor(serial)
  if (whole === 60) return { year: 1900, month: 2, day: 29 }
  const realDays = whole > 60 ? whole - 1 : whole
  const date = new Date(EXCEL_ANCHOR_UTC_MS + realDays * DATE_MS_PER_DAY)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

export function serialFromDateParts(year: number, month: number, day: number): number {
  if (year === 1900 && month === 2 && day === 29) return 60
  const ms = Date.UTC(year, month - 1, day)
  const realDays = Math.floor((ms - EXCEL_ANCHOR_UTC_MS) / DATE_MS_PER_DAY)
  return realDays >= 60 ? realDays + 1 : realDays
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function daysInYear(year: number): number {
  return Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1) === 366 * DATE_MS_PER_DAY ? 366 : 365
}

export function dayDiff(start: number, end: number): number {
  return Math.floor(end) - Math.floor(start)
}

export function yearFracActualActual(start: number, end: number): number {
  const startParts = serialDateToParts(start)
  const endParts = serialDateToParts(end)
  let yearLength: number
  if (isGreaterThanOneYear(startParts, endParts)) {
    yearLength = averageYearLength(startParts.year, endParts.year)
  } else if (shouldCountFeb29(startParts, endParts)) {
    yearLength = 366
  } else {
    yearLength = 365
  }
  return (end - start) / yearLength
}

export function averageYearLength(startYear: number, endYear: number): number {
  let days = 0
  for (let year = startYear; year <= endYear; year += 1) {
    days += daysInYear(year)
  }
  return days / (endYear - startYear + 1)
}

export function isGreaterThanOneYear(
  start: ReturnType<typeof serialDateToParts>,
  end: ReturnType<typeof serialDateToParts>,
): boolean {
  if (start.year === end.year) return false
  if (start.year + 1 !== end.year) return true
  if (start.month > end.month) return false
  if (start.month < end.month) return true
  return start.day < end.day
}

export function shouldCountFeb29(
  start: ReturnType<typeof serialDateToParts>,
  end: ReturnType<typeof serialDateToParts>,
): boolean {
  if (daysInYear(start.year) === 366) {
    if (start.year === end.year) return true
    return start.month <= 2
  }
  if (daysInYear(end.year) === 366) {
    if (end.month === 1) return false
    if (end.month === 2) return end.day === 29
    return true
  }
  return false
}

export function isLastDayOfFeb(parts: { year: number; month: number; day: number }): boolean {
  if (parts.month !== 2) return false
  const lastDay = daysInYear(parts.year) === 366 ? 29 : 28
  return parts.day === lastDay
}

export function yearFracBasis(start: number, end: number, basis: number): number {
  const lo = Math.floor(Math.min(start, end))
  const hi = Math.floor(Math.max(start, end))
  switch (basis) {
    case 0: {
      // Harvey P2 — Excel NASD 30/360 (basis 0) full rule:
      //   1. If start is last day of Feb AND end is last day of Feb, set end_day = 30.
      //   2. If start is last day of Feb, set start_day = 30.
      //   3. If start_day = 31, set start_day = 30.
      //   4. If end_day = 31 AND start_day (after step 3) = 30, set end_day = 30.
      const startParts = serialDateToParts(lo)
      const endParts = serialDateToParts(hi)
      let d1 = startParts.day
      let d2 = endParts.day
      if (isLastDayOfFeb(startParts)) {
        if (isLastDayOfFeb(endParts)) d2 = 30
        d1 = 30
      }
      if (d1 === 31) d1 = 30
      if (d1 === 30 && d2 === 31) d2 = 30
      const numerator =
        (endParts.year - startParts.year) * 360 +
        (endParts.month - startParts.month) * 30 +
        (d2 - d1)
      return numerator / 360
    }
    case 4: {
      // European 30/360 (basis 4): day-31 → 30 on both ends, no Feb EOM.
      const startParts = serialDateToParts(lo)
      const endParts = serialDateToParts(hi)
      const d1 = startParts.day === 31 ? 30 : startParts.day
      const d2 = endParts.day === 31 ? 30 : endParts.day
      const numerator =
        (endParts.year - startParts.year) * 360 +
        (endParts.month - startParts.month) * 30 +
        (d2 - d1)
      return numerator / 360
    }
    case 1:
      return yearFracActualActual(lo, hi)
    case 3:
      return (hi - lo) / 365
    case 2:
      return (hi - lo) / 360
    default:
      return Number.NaN
  }
}

export function couponPeriodDays(frequency: number, basis: number): number {
  switch (basis) {
    case 0:
    case 2:
    case 4:
      return 360 / frequency
    case 3:
      return 365 / frequency
    case 1:
      return 365.25 / frequency
    default:
      return Number.NaN
  }
}

export function couponDateFromMaturity(maturity: number, monthsOffset: number): number {
  const maturityParts = serialDateToParts(maturity)
  const monthIndex = maturityParts.year * 12 + (maturityParts.month - 1) + monthsOffset
  const year = Math.floor(monthIndex / 12)
  const month = ((monthIndex % 12) + 12) % 12 + 1
  const day = Math.min(maturityParts.day, daysInMonth(year, month))
  return serialFromDateParts(year, month, day)
}

export function prevCouponDate(settlement: number, maturity: number, frequency: number): number {
  const monthsPerPeriod = 12 / frequency
  let periodsBack = 0
  while (periodsBack <= 4_000) {
    const serial = couponDateFromMaturity(maturity, -periodsBack * monthsPerPeriod)
    if (serial <= settlement) return serial
    periodsBack += 1
  }
  return couponDateFromMaturity(maturity, -periodsBack * monthsPerPeriod)
}

export function nextCouponDate(settlement: number, maturity: number, frequency: number): number {
  const prev = prevCouponDate(settlement, maturity, frequency)
  const prevParts = serialDateToParts(prev)
  const monthsPerPeriod = 12 / frequency
  const monthIndex = prevParts.year * 12 + (prevParts.month - 1) + monthsPerPeriod
  const year = Math.floor(monthIndex / 12)
  const month = ((monthIndex % 12) + 12) % 12 + 1
  const day = Math.min(prevParts.day, daysInMonth(year, month))
  return serialFromDateParts(year, month, day)
}

export function couponNumber(settlement: number, maturity: number, frequency: number): number {
  const monthsPerPeriod = 12 / frequency
  const settlementParts = serialDateToParts(settlement)
  const maturityParts = serialDateToParts(maturity)
  const monthsBetween =
    maturityParts.year * 12 +
    (maturityParts.month - 1) -
    (settlementParts.year * 12 + settlementParts.month - 1)
  return Math.max(Math.ceil(monthsBetween / monthsPerPeriod), 1)
}

export function couponPeriodSplit(
  settlement: number,
  maturity: number,
  frequency: number,
  basis: number,
): CouponSplit {
  const previous = prevCouponDate(settlement, maturity, frequency)
  const next = nextCouponDate(settlement, maturity, frequency)
  const realPeriodDays = Math.max(dayDiff(previous, next), 1)
  const canonicalPeriodDays = couponPeriodDays(frequency, basis)
  const realA = Math.max(dayDiff(previous, settlement), 0)
  const realDsc = Math.max(dayDiff(settlement, next), 0)
  if (basis === 0 || basis === 2 || basis === 4) {
    const fraction = realPeriodDays > 0 ? realA / realPeriodDays : 0
    const a = canonicalPeriodDays * fraction
    return { a, dsc: canonicalPeriodDays - a, e: canonicalPeriodDays }
  }
  return { a: realA, dsc: realDsc, e: realPeriodDays }
}
