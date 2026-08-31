/**
 * AD-143 契约:worker 启动失败(生产环境 .wasm 404、CSP 拦截等)时,RPC 不允许
 * 永远 pending —— 在途请求要被拒绝、错误信息要指向排查方向、后续请求要快速失败。
 *
 * 同时钉住兼容性守卫:部分测试 double 的 addEventListener 无视 type 参数,把
 * 所有 listener 当 message listener 调用 —— 普通消息(无 e.type)不得误触发失败路径。
 */
import { describe, expect, it } from '@jest/globals'

import { createWorkerWorkbook, type WorkerLike } from '../src/adapter/worker-protocol'

type AnyListener = (e: MessageEvent) => void

function createDeadWorker() {
  const listeners = new Map<string, AnyListener[]>()
  const worker = {
    postMessage() {
      // 死 worker:永不回包。
    },
    addEventListener(type: string, listener: AnyListener) {
      const bucket = listeners.get(type) ?? []
      bucket.push(listener)
      listeners.set(type, bucket)
    },
    removeEventListener(type: string, listener: AnyListener) {
      const bucket = listeners.get(type) ?? []
      listeners.set(
        type,
        bucket.filter((l) => l !== listener),
      )
    },
    terminate() {},
  }
  const dispatch = (type: string, event: unknown) => {
    for (const listener of listeners.get(type) ?? []) listener(event as MessageEvent)
  }
  return { worker: worker as unknown as WorkerLike, dispatch }
}

describe('worker boot failure surface (AD-143)', () => {
  it('rejects in-flight and subsequent requests with actionable guidance on worker error', async () => {
    const { worker, dispatch } = createDeadWorker()
    const client = createWorkerWorkbook({ workerFactory: () => worker })

    const inflight = client.initWorkbook()
    dispatch('error', { type: 'error', message: 'importScripts failed', filename: 'worker.js' })

    await expect(inflight).rejects.toThrow(/einfach_wasm_bg\.wasm/)
    await expect(inflight).rejects.toThrow(/importScripts failed/)
    // 后续请求不再进入 pending,同一错误快速失败。
    await expect(client.initWorkbook()).rejects.toThrow(/failed to start or crashed/)
  })

  it('rejects on messageerror with a deserialization hint', async () => {
    const { worker, dispatch } = createDeadWorker()
    const client = createWorkerWorkbook({ workerFactory: () => worker })

    const inflight = client.initWorkbook()
    dispatch('messageerror', { type: 'messageerror', data: null })

    await expect(inflight).rejects.toThrow(/deserialized/)
  })

  it('ignores plain messages delivered to the failure listener (type-agnostic fakes)', async () => {
    const { worker, dispatch } = createDeadWorker()
    const client = createWorkerWorkbook({ workerFactory: () => worker })

    const inflight = client.initWorkbook()
    // 模拟无视 type 的 fake:把一条普通回包同时喂给所有已注册 listener
    // (含 error/messageerror 监听),事件对象没有 type 字段。
    const reply = { data: { id: 1, ok: true, result: [] } }
    dispatch('error', reply)
    dispatch('messageerror', reply)
    dispatch('message', reply)

    await expect(inflight).resolves.toEqual([])
  })
})
