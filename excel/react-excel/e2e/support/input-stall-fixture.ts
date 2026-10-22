import { test as base, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { observeInputStall } from './input-stall-observer'

export { expect }
export type { Page } from '@playwright/test'

export const test = base.extend<{ inputStallObservation: void }>({
  inputStallObservation: [async ({ page }, use, info) => {
    // 默认路径不创建心跳、CDP session、计时器或额外进程。
    if (process.env.INPUT_STALL_OBSERVE !== '1') { await use(); return }
    const observation = await observeInputStall(page, info.outputPath('input-stall.jsonl'))
    let profile: Awaited<ReturnType<typeof observation.startProfile>> | undefined
    let startup: Promise<void> | undefined
    let profileError: unknown
    const onLoaded = () => {
      observation.mark('profile-navigation-ready', { url: page.url().split('?')[0] })
      startup = (async () => {
        profile = await observation.startProfile()
        if (!await profile.ready) profileError = new Error('Diagnostic profile start not ready')
      })().catch(error => { profileError = error })
    }
    // 原用例只显式采一个导航后的≤4s窗口，不在挂起后才请求 enable。
    if (process.env.INPUT_STALL_PROFILE === '1') page.once('domcontentloaded', onLoaded)
    try {
      if (process.env.INPUT_STALL_SELF_CHECK === '1') {
        await page.goto('about:blank')
        await page.waitForTimeout(400)
        // 只验证观测可识别已知同步 JS 停顿，不是复现工作簿缺陷。
        await page.evaluate(() => {
          const until = performance.now() + 2200
          while (performance.now() < until) { /* 受控主线程停顿 */ }
        })
        await page.waitForTimeout(400)
      }
      await use()
    } finally {
      page.off('domcontentloaded', onLoaded)
      await startup
      if (profile) {
        const result = await profile.finish()
        await writeFile(info.outputPath('input-stall-profile-result.json'),
          JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
        if (result.profile) await writeFile(info.outputPath('input-stall.cpuprofile'),
          JSON.stringify(result.profile) + '\n', { flag: 'wx' })
        if (result.status !== 'stopped' || !result.cleanupConfirmed)
          profileError = new Error(`Diagnostic profile cleanup: ${result.status}`)
      }
      await observation.stop()
      if (profileError) throw profileError
    }
  }, { auto: true }],
})
