export function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && error.message.length > 0) return error.message
    if (typeof error === 'string' && error.length > 0) return error
  } catch {
    return 'Format save failed with an unreadable error'
  }
  return 'Format save failed'
}

export function runWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new Error('Format save timed out'))
    }, timeoutMs)
    operation.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
