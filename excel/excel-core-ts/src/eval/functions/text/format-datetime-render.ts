/**
 * 把 Excel 日期序列号按已编译的日期时间 token 渲染成字符串。
 */

import { parseTextDateTimeFormat } from './format-datetime-parse'
import type { TextDateTimeFormat } from './format-datetime-parse'

const TEXT_DATE_ANCHOR_UTC_MS = Date.UTC(1899, 11, 31)
const TEXT_MS_PER_DAY = 86_400_000

export function formatDateSerial(serial: number, format: string): string | undefined {
  const parsed = parseTextDateTimeFormat(format)
  if (!parsed) return undefined
  return renderTextDateTime(serial, parsed)
}

function excelDateParts(serial: number):
  | {
    readonly year: number
    readonly month: number
    readonly day: number
    readonly weekday: number
  }
  | undefined {
  if (!Number.isFinite(serial)) return undefined
  const whole = Math.floor(serial)
  if (whole < 0) return undefined
  if (whole === 60) return { year: 1900, month: 2, day: 29, weekday: 3 }
  const days = whole > 60 ? whole - 1 : whole
  const date = new Date(TEXT_DATE_ANCHOR_UTC_MS + days * TEXT_MS_PER_DAY)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  }
}

const TEXT_MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const TEXT_MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const TEXT_DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TEXT_DAY_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

function renderTextDateTime(serial: number, format: TextDateTimeFormat): string | undefined {
  if (!Number.isFinite(serial) || serial < 0) return undefined
  const scale = 10 ** Math.min(format.fractionalSecondDigits, 6)
  const totalUnits = Math.round(serial * 86_400 * scale)
  const unitsPerDay = 86_400 * scale
  const dayUnits = totalUnits % unitsPerDay
  const dayCarry = Math.floor(totalUnits / unitsPerDay) - Math.floor(serial)
  const dateParts = excelDateParts(Math.floor(serial) + (format.hasTime ? dayCarry : 0))
  if (!dateParts && format.hasDate) return undefined

  const totalSecondsInDay = Math.floor(dayUnits / scale)
  const fractionalSecond = dayUnits % scale
  const elapsedFractionalSecond = totalUnits % scale
  const hour24 = Math.floor(totalSecondsInDay / 3600) % 24
  const minute = Math.floor(totalSecondsInDay / 60) % 60
  const second = totalSecondsInDay % 60
  const hour12 = ((hour24 + 11) % 12) + 1

  let out = ''
  for (const token of format.tokens) {
    switch (token.kind) {
      case 'literal':
        out += token.value
        break
      case 'year':
        out += token.count <= 2
          ? String(dateParts!.year % 100).padStart(2, '0')
          : String(dateParts!.year).padStart(4, '0')
        break
      case 'month':
        out += renderTextDateMonth(dateParts!.month, token.count)
        break
      case 'day':
        out += renderTextDateDay(dateParts!.day, dateParts!.weekday, token.count)
        break
      case 'hour': {
        const value = format.hasMeridian ? hour12 : hour24
        out += token.count >= 2 ? String(value).padStart(2, '0') : String(value)
        break
      }
      case 'minute':
        out += token.count >= 2 ? String(minute).padStart(2, '0') : String(minute)
        break
      case 'second':
        out += token.count >= 2 ? String(second).padStart(2, '0') : String(second)
        break
      case 'fractional-second':
        out += String(fractionalSecond).padStart(token.count, '0')
        break
      case 'elapsed-fractional-second':
        out += String(elapsedFractionalSecond).padStart(token.count, '0')
        break
      case 'elapsed-hour':
        out += padTextElapsed(Math.floor(totalUnits / (3600 * scale)), token.count)
        break
      case 'elapsed-minute':
        out += padTextElapsed(Math.floor(totalUnits / (60 * scale)), token.count)
        break
      case 'elapsed-second':
        out += padTextElapsed(Math.floor(totalUnits / scale), token.count)
        break
      case 'meridian': {
        const isPm = hour24 >= 12
        if (token.style === 'AM/PM') out += isPm ? 'PM' : 'AM'
        else if (token.style === 'am/pm') out += isPm ? 'pm' : 'am'
        else if (token.style === 'A/P') out += isPm ? 'P' : 'A'
        else out += isPm ? 'p' : 'a'
        break
      }
    }
  }
  return out
}

function renderTextDateMonth(month: number, count: number): string {
  if (count === 1) return String(month)
  if (count === 2) return String(month).padStart(2, '0')
  if (count === 3) return TEXT_MONTH_SHORT[month - 1] ?? ''
  return TEXT_MONTH_LONG[month - 1] ?? ''
}

function renderTextDateDay(day: number, weekday: number, count: number): string {
  if (count === 1) return String(day)
  if (count === 2) return String(day).padStart(2, '0')
  if (count === 3) return TEXT_DAY_SHORT[weekday] ?? ''
  return TEXT_DAY_LONG[weekday] ?? ''
}

function padTextElapsed(value: number, count: number): string {
  return count >= 2 ? String(value).padStart(2, '0') : String(value)
}
