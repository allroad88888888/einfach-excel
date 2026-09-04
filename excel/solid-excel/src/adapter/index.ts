export * from './types'
export * from './named-range-capability-port'
export * from './static-backend'
export * from './worker-workbook-backend'
export * from './worker-protocol'

// `./worker-factory` is deliberately NOT re-exported. It resolves its worker
// bundles through `import.meta.url`, which some CommonJS consumers cannot
// evaluate — putting it here would make every barrel import load worker-specific
// code even when the caller does not need it.
// `package-entry.test.ts` also pins the public surface free of "worker URL
// factories". Hosts reach it via the `@einfach/solid-excel/vnext-worker-factory`
// subpath; in-tree callers import `./worker-factory` directly.
