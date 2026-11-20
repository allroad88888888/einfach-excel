import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}
const clientSnapshot = () => false
const serverSnapshot = () => true

/** Detects React SSR (`renderToString` / stream) without breaking client hydration. */
export function useIsServerRender(): boolean {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot)
}
