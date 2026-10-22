import { createWriteStream } from 'node:fs'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import type { CDPSession, Page } from '@playwright/test'
import { installInputStallProbe } from './input-stall-page'
import { beginInputStallProfile } from './input-stall-profile'

/** 测试侧两时钟观测；CDP 失败也落盘，不从缺帧直接推断产品原因。 */
export async function observeInputStall(page: Page, filename: string) {
  const output = createWriteStream(filename, { flags: 'wx' })
  const started = performance.now(), eld = monitorEventLoopDelay({ resolution: 20 })
  let previousTick = started, lastArrival = started, closed = false
  let rpcPending = false, batchCount = 0, rpcCount = 0
  let maxNodeGap = 0, maxPageGap = 0, maxArrivalGap = 0
  const write = (kind: string, facts: object = {}) => {
    if (!closed) output.write(JSON.stringify({
      kind, utc: new Date().toISOString(), nodeMs: performance.now(), ...facts,
    }) + '\n')
  }
  const cdp = await page.context().newCDPSession(page)
  const browserCdp = await page.context().browser()!.newBrowserCDPSession()
  // 全部观测 CDP 调用串行；超时后底层未结束之前也不发第二个 RPC。
  const rpc = async (session: CDPSession, method: string, params?: object) => {
    if (rpcPending) { write('rpc-skipped', { method, reason: 'one-in-flight' }); return null }
    rpcPending = true
    rpcCount++
    const began = performance.now()
    const operation = session.send(method as never, params as never)
      .then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))
      .finally(() => { rpcPending = false })
    let timer: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([operation, new Promise<null>(resolve => {
      timer = setTimeout(() => resolve(null), 700)
    })])
    clearTimeout(timer)
    write('rpc', { method, elapsed: performance.now() - began, result })
    return result && 'value' in result ? result.value : null
  }
  const resources = async () => {
    await rpc(browserCdp, 'SystemInfo.getProcessInfo')
    await rpc(cdp, 'Performance.getMetrics')
  }
  await page.exposeBinding('__inputStallDeliver', (source, batch) => {
    if (source.frame !== page.mainFrame()) return
    const now = performance.now()
    maxArrivalGap = Math.max(maxArrivalGap, now - lastArrival)
    lastArrival = now
    batchCount++
    maxPageGap = Math.max(maxPageGap, batch.maxBeatGap)
    write('page-batch', { arrivalNodeMs: now, batch })
  })
  await page.addInitScript(installInputStallProbe)
  page.on('pageerror', error => write('pageerror', { error: error.message }))
  page.on('crash', () => write('crash'))
  page.on('close', () => write('page-close'))
  await rpc(cdp, 'Performance.enable')
  await rpc(cdp, 'Target.getTargetInfo')
  await rpc(browserCdp, 'Browser.getVersion')
  await resources()
  eld.enable()
  write('observer-start', {
    nodePid: process.pid, condition: process.env.INPUT_STALL_CONDITION,
    browserPid: process.env.INPUT_STALL_BROWSER_PID,
    connection: process.env.INPUT_STALL_CONNECTION, heartbeatMs: 250, batchMs: 1000,
  })
  const interval = setInterval(() => {
    const now = performance.now(), gap = now - previousTick
    previousTick = now
    maxNodeGap = Math.max(maxNodeGap, gap)
    write('node-tick', {
      gap, eventLoopMaxMs: eld.max / 1e6, eventLoopMeanMs: eld.mean / 1e6,
      lastArrivalAge: now - lastArrival, memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    })
  }, 250)
  const stop = async () => {
    clearInterval(interval)
    eld.disable()
    if (!page.isClosed()) {
      // 最后一批通过同一有界 CDP 通道取回，恢复后的页面间隔仍可见。
      await rpc(cdp, 'Runtime.evaluate', {
        expression: 'window.__inputStallFlush?.()', awaitPromise: true,
      })
      await resources()
    }
    write('observer-end', {
      elapsed: performance.now() - started, batchCount, rpcCount,
      maxNodeGap, maxPageGap, maxArrivalGap, eventLoopMaxMs: eld.max / 1e6,
      rpcStillPending: rpcPending,
    })
    closed = true
    await Promise.allSettled([cdp.detach(), browserCdp.detach()])
    await new Promise<void>(resolve => output.end(resolve))
  }
  return {
    stop,
    mark: write,
    async startProfile() {
      // 专用 session 不共享资源采集的 rpcPending，收尾不能被它 skip。
      const profileSession = await page.context().newCDPSession(page)
      return beginInputStallProfile(profileSession, async () => {
        await page.close({ runBeforeUnload: false })
        if (!page.isClosed()) throw new Error('Diagnostic target closure not confirmed')
      }, write)
    },
  }
}
