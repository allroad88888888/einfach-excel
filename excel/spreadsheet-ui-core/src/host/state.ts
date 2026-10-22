import { atom, type Atom } from '@einfach/core'
import type { HostControls, HostCommandError, WorkbookChangeEvent } from './types'
import { DEFAULT_HOST_CONTROLS } from './policy'

export const hostControlsBackingAtom = atom<HostControls>(DEFAULT_HOST_CONTROLS)
export const hostControlsAtom: Atom<HostControls> = atom((get) => get(hostControlsBackingAtom))
export const workbookChangeBackingAtom = atom<WorkbookChangeEvent | null>(null)
/** 有界的最后成功事实；宿主按自己的脏数据策略订阅，不保留无限事件日志。 */
export const workbookChangeAtom: Atom<WorkbookChangeEvent | null> = atom((get) =>
  get(workbookChangeBackingAtom))
export const hostSubscriptionAtom = atom<{ readonly dispose: () => void } | null>(null)
export const workbookReplacementErrorBackingAtom = atom<HostCommandError | null>(null)
export const workbookReplacementErrorAtom: Atom<HostCommandError | null> =
  atom((get) => get(workbookReplacementErrorBackingAtom))
