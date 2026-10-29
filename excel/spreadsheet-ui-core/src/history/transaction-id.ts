let historyTransactionCounter = 0

/**
 * Generate a unique, monotonic transaction id for a history entry. Hosts that
 * record a mutation should call this once and reuse the id for the backend
 * mutation and the bounded history descriptor.
 */
export function nextHistoryTransactionId(prefix = 'tx'): string {
  historyTransactionCounter += 1
  return `${prefix}-${historyTransactionCounter}`
}
