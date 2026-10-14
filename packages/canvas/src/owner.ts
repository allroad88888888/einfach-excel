/** An opaque lifetime boundary for bindings, effects, and child scopes. */
export interface Owner {
  readonly disposed: boolean;
}

export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T;
}

/** Internal root lifetime shared by its ordinary child scopes. */
export interface RootLifetime {
  readonly disposed: boolean;
  onCleanup(fn: () => void): () => void;
}

interface OwnerState {
  disposed: boolean;
  parent: Owner | null;
  children: Owner[];
  cleanups: Array<() => void>;
  contexts: Map<symbol, unknown>;
  root: RootLifetime;
}

const states = new WeakMap<Owner, OwnerState>();
let currentOwner: Owner | null = null;

function stateOf(owner: Owner): OwnerState {
  const state = states.get(owner);
  if (!state) throw new Error('Unknown owner.');
  return state;
}

function assertActive(owner: Owner): OwnerState {
  const state = stateOf(owner);
  if (state.disposed) throw new Error('Owner has been disposed.');
  return state;
}

/** Creates an attached scope; a null parent creates an independent root. */
export function createOwner(parent: Owner | null): Owner {
  const parentState = parent ? assertActive(parent) : null;
  const state: OwnerState = {
    disposed: false,
    parent,
    children: [],
    cleanups: [],
    contexts: new Map(parentState?.contexts),
    root: undefined as unknown as RootLifetime,
  };
  const owner: Owner = { get disposed() { return state.disposed; } };
  state.root = parentState?.root ?? {
    get disposed() { return state.disposed; },
    onCleanup(fn) {
      assertActive(owner).cleanups.push(fn);
      return fn;
    },
  };
  states.set(owner, state);
  parentState?.children.push(owner);
  return owner;
}

export function getOwner(): Owner | null {
  return currentOwner;
}

export function assertOwner(): Owner {
  if (!currentOwner) throw new Error('This operation requires an active owner.');
  assertActive(currentOwner);
  return currentOwner;
}

export function getRootLifetime(owner: Owner): RootLifetime {
  return assertActive(owner).root;
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  if (owner) assertActive(owner);
  const previous = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } finally {
    currentOwner = previous;
  }
}

export function onCleanup(fn: () => void): () => void {
  stateOf(assertOwner()).cleanups.push(fn);
  return fn;
}

function reportErrors(errors: unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Owner cleanup failed.');
}

function clearOwned(state: OwnerState): void {
  const children = state.children.splice(0);
  const cleanups = state.cleanups.splice(0);
  const errors: unknown[] = [];
  runWithOwner(null, () => {
    for (let i = children.length - 1; i >= 0; i--) {
      try { disposeOwner(children[i]); } catch (error) { errors.push(error); }
    }
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try { cleanups[i](); } catch (error) { errors.push(error); }
    }
  });
  reportErrors(errors);
}

/** Clears an effect's previous lifetime without disposing its owner. */
export function resetOwner(owner: Owner): void {
  clearOwned(assertActive(owner));
}

export function disposeOwner(owner: Owner): void {
  const state = stateOf(owner);
  if (state.disposed) return;
  state.disposed = true;
  if (state.parent) {
    const siblings = stateOf(state.parent).children;
    const index = siblings.indexOf(owner);
    if (index !== -1) siblings.splice(index, 1);
    state.parent = null;
  }
  try {
    clearOwned(state);
  } finally {
    state.contexts.clear();
  }
}

function initialize<T>(owner: Owner, fn: (dispose: () => void) => T): T {
  return runWithOwner(owner, () => {
    try {
      return fn(() => disposeOwner(owner));
    } catch (error) {
      try { disposeOwner(owner); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Owner creation failed.');
      }
      throw error;
    }
  });
}

/** Independent disposal boundary, inheriting the caller's current contexts. */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const parent = currentOwner ? assertActive(currentOwner) : null;
  const owner = createOwner(null);
  if (parent) stateOf(owner).contexts = new Map(parent.contexts);
  return initialize(owner, fn);
}

/** A disposal boundary owned by the current scope. */
export function createScope<T>(fn: (dispose: () => void) => T): T {
  return initialize(createOwner(assertOwner()), fn);
}

export function createContext<T>(defaultValue: T): Context<T> {
  return { id: Symbol('context'), defaultValue };
}

export function useContext<T>(context: Context<T>): T {
  if (!currentOwner) return context.defaultValue;
  const contexts = assertActive(currentOwner).contexts;
  return contexts.has(context.id) ? contexts.get(context.id) as T : context.defaultValue;
}

/** Children created inside fn retain this value after the provider returns. */
export function provideContext<T, R>(context: Context<T>, value: T, fn: () => R): R {
  const state = stateOf(assertOwner());
  const hadValue = state.contexts.has(context.id);
  const previous = state.contexts.get(context.id);
  state.contexts.set(context.id, value);
  try {
    return fn();
  } finally {
    if (!state.disposed) {
      if (hadValue) state.contexts.set(context.id, previous);
      else state.contexts.delete(context.id);
    }
  }
}
