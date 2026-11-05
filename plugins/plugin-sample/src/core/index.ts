import { atom } from '@einfach/core'

// 插件自有状态：每个工作簿 store 独立，不写入 Rust 工作簿或撤销历史。
const pingCountBackingAtom = atom(0)

export const samplePingCountAtom = atom((get) => get(pingCountBackingAtom))
samplePingCountAtom.debugLabel = 'plugin.sample.pingCount'

export const pingSampleAtom = atom(null, (get, set) => {
  set(pingCountBackingAtom, get(pingCountBackingAtom) + 1)
})
pingSampleAtom.debugLabel = 'plugin.sample.ping'
