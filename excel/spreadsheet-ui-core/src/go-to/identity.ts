/** Session / request identity allocation for Go To. */

/** Crosses the positive safe-integer boundary once, then descends without reuse. */
function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

/** Pure production plan; no writable session authority is exposed. */
export function nextGoToSessionId(sessionId: number): number | null {
  return nextSafeMonotonicIdentity(sessionId)
}

/** Pure production plan; no writable request authority is exposed. */
export function nextGoToSpecialRequestId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}
