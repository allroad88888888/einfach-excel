/** Crosses the positive safe-integer boundary once, then descends without reuse. */
function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

/** Pure plan; it exposes no writable access to the private editor authority. */
export function nextDataValidationSessionId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function nextDataValidationRequestId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}
