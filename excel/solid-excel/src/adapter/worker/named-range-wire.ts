// 一句话：命名区域的身份匹配与地址端点解析。

import type { NamedRange } from '@einfach/spreadsheet-ui-core'
import { namedRangeIdentity } from '@einfach/spreadsheet-ui-core'

export function namedRangeMatches(
  entry: NamedRange,
  name: string,
  scope: NamedRange['scope'],
): boolean {
  const targetIdentity = namedRangeIdentity(name, scope)
  return targetIdentity !== null && namedRangeIdentity(entry.name, entry.scope) === targetIdentity
}

export function namedRangeAddressEndpoints(address: string): { start: string; end: string } | null {
  const parts = address
    .trim()
    .split(':')
    .map((part) => part.trim())
  if (parts.length === 1 && parts[0]) {
    return { start: parts[0], end: parts[0] }
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { start: parts[0], end: parts[1] }
  }
  return null
}

export function isNamedRangeEngineUnsupported(error: unknown): boolean {
  const code = (error as Error & { code?: string })?.code
  return code === 'NAME_BINDING_UNSUPPORTED' || code === 'UNKNOWN_COMMAND'
}
