import { performance } from 'node:perf_hooks'

type ProfileCommand = 'Profiler.enable' | 'Profiler.setSamplingInterval' |
  'Profiler.start' | 'Profiler.stop' | 'Profiler.disable'
interface ProfileSession {
  send(method: ProfileCommand, params?: { interval: number }): Promise<unknown>
  detach(): Promise<void>
}
export interface InputStallCpuProfile {
  startTime: number
  endTime: number
  nodes: { id: number; callFrame: { functionName: string }; children?: number[] }[]
  samples?: number[]
  timeDeltas?: number[]
}
export interface ProfileResult {
  status: 'stopped' | 'not-started' | 'destroyed' | 'unconfirmed'
  cleanupConfirmed: boolean
  profile?: InputStallCpuProfile
}

/** 一次诊断采样：超时不是取消；迟到 start 必须接 stop，绝对期限兜底销毁自有 target。 */
export function beginInputStallProfile(
  session: ProfileSession,
  destroyTarget: () => Promise<void>,
  record: (kind: string, facts?: object) => void,
  { windowMs = 4000, observeMs = 700, deadlineMs = 4500, destroyMs = 500 } = {},
) {
  let started = false, stopping = false, destroying = false, settled = false
  const timers: { window?: ReturnType<typeof setTimeout>;
    deadline?: ReturnType<typeof setTimeout>; observation?: ReturnType<typeof setTimeout> } = {}
  const startCompletion = Promise.withResolvers<void>()
  let finishTask: Promise<void> | undefined
  let resolveReady!: (value: boolean) => void
  let resolveDone!: (value: ProfileResult) => void
  const ready = new Promise<boolean>(resolve => { resolveReady = resolve })
  const done = new Promise<ProfileResult>(resolve => { resolveDone = resolve })
  const command = async (method: ProfileCommand, params?: { interval: number }) => {
    record('profile-command-sent', { method, params, nodeMs: performance.now() })
    try {
      const value = await session.send(method, params)
      record('profile-command-ack', { method, nodeMs: performance.now() })
      return value
    } catch (error) {
      record('profile-command-error', { method, error: String(error) })
      throw error
    }
  }
  const settle = (result: ProfileResult) => {
    if (settled) return
    settled = true
    clearTimeout(timers.deadline)
    clearTimeout(timers.observation)
    clearTimeout(timers.window)
    resolveReady(false)
    record('profile-finished', result)
    resolveDone(result)
  }
  const destroy = async (reason: string) => {
    if (destroying || settled) return
    destroying = true
    clearTimeout(timers.window)
    record('profile-destroy-target', { reason })
    let timer: ReturnType<typeof setTimeout> | undefined
    const confirmed = await Promise.race([
      Promise.resolve().then(destroyTarget).then(() => true, error => {
        record('profile-destroy-error', { error: String(error) }); return false
      }),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), destroyMs) }),
    ])
    clearTimeout(timer)
    // target 关闭确认才可称采样结束；detach 不依赖挂起的 Profiler RPC。
    void session.detach().catch(error => record('profile-detach-error', { error: String(error) }))
    settle({ status: confirmed ? 'destroyed' : 'unconfirmed', cleanupConfirmed: confirmed })
  }
  const finish = () => {
    stopping = true
    clearTimeout(timers.window)
    if (!finishTask) finishTask = (async () => {
      await startCompletion.promise
      if (destroying || settled) return
      try {
        const result = started ? await command('Profiler.stop') as {
          profile: InputStallCpuProfile
        } : undefined
        if (destroying || settled) return
        await command('Profiler.disable')
        await session.detach()
        if (!destroying) settle({
          status: started ? 'stopped' : 'not-started', cleanupConfirmed: true,
          profile: result?.profile,
        })
      } catch (error) {
        record('profile-cleanup-error', { error: String(error) })
        await destroy('stop-or-detach-failed')
      }
    })()
    return done
  }
  timers.deadline = setTimeout(() => { void destroy('absolute-deadline') }, deadlineMs)
  timers.observation = setTimeout(() => {
    record('profile-start-observation-timeout', { observeMs })
    resolveReady(false)
    void finish()
  }, observeMs)
  void (async () => {
    try {
      await command('Profiler.enable')
      if (destroying || settled) return
      await command('Profiler.setSamplingInterval', { interval: 5000 })
      if (destroying || settled) return
      await command('Profiler.start')
      started = true
      if (destroying || settled) return
      clearTimeout(timers.observation)
      record('profile-started', { late: stopping, windowMs })
      resolveReady(!stopping)
      if (stopping) void finish()
      else timers.window = setTimeout(() => { void finish() }, windowMs)
    } catch {
      clearTimeout(timers.observation)
      resolveReady(false)
      void finish()
    } finally { startCompletion.resolve() }
  })()
  return { ready, finish }
}
