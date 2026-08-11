export function nextSequence(current: number): number | null {
  if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
    return null
  }
  return current + 1
}

export function nextSessionId(current: number): number {
  return Number.isSafeInteger(current) && current >= 0 && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : 1
}
