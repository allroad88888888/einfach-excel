/**
 * A framework-neutral boundary between a command surface and its atom-backed
 * executor. Surface components may render from a resolution, but only this
 * boundary decides whether the executor can be called.
 */
export type CommandAvailability =
  | { readonly status: 'ready' }
  | { readonly status: 'disabled'; readonly reason: string | null }
  | { readonly status: 'hidden' }

export interface ResolvedCommand<TCommand, TPresentation = undefined> {
  readonly command: TCommand
  readonly availability: CommandAvailability
  readonly presentation: TPresentation
}

export interface CommandDispatchResult<TResult> {
  readonly dispatched: boolean
  readonly result?: TResult
}

export function isCommandReady<TCommand, TPresentation>(
  resolution: ResolvedCommand<TCommand, TPresentation>,
): boolean {
  return resolution.availability.status === 'ready'
}

/**
 * Executes a previously resolved command only when its snapshot permits it.
 * The caller supplies the atom-backed executor, keeping atom ownership out of
 * menu, context-menu, and toolbar presentation code.
 */
export function dispatchResolvedCommand<TCommand, TPresentation, TResult>(
  resolution: ResolvedCommand<TCommand, TPresentation>,
  execute: (command: TCommand) => TResult,
): CommandDispatchResult<TResult> {
  if (!isCommandReady(resolution)) return { dispatched: false }
  return { dispatched: true, result: execute(resolution.command) }
}
