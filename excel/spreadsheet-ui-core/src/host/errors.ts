import type { HostCommandError } from './types'

/** 失败不会被伪装成空读取或 noop；断线时明确保留“提交未知”的边界。 */
export function hostCommandError(cause: unknown, mutation = false): HostCommandError {
  const error = cause as { code?: string; message?: string }
  const message = typeof error?.message === 'string' ? error.message : String(cause)
  const code = error?.code ?? (/^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'WORKBOOK_COMMAND_FAILED')
  return Object.freeze({ code, message,
    ...(mutation && ['WORKER_TRANSPORT_FAILED', 'WORKER_DISPOSED', 'WORKBOOK_CONNECTION_REPLACED'].includes(code)
      ? { commitStatus: 'unknown' as const } : {}),
  })
}
