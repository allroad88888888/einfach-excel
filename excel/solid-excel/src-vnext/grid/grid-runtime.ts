/**
 * Private dependency bag shared by the grid's focused feature controllers.
 * It keeps controller modules decoupled without turning UI state into a global.
 */
export type GridRuntime = Record<string, any>

export function createGridRuntime(seed: GridRuntime): GridRuntime {
  const target = { ...seed }
  return new Proxy(target, {
    get(current, key, receiver) {
      const value = Reflect.get(current, key, receiver)
      if (value !== undefined || typeof key !== 'string') return value
      return (...args: unknown[]) => {
        const implementation = Reflect.get(current, key, receiver)
        if (typeof implementation !== 'function') {
          throw new Error(`Grid runtime method ${key} is unavailable.`)
        }
        return implementation(...args)
      }
    },
  })
}
