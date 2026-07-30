export * from './types'
export * from './named-range-capability-port'
export * from './static-backend'
export * from './worker-workbook-backend'
export * from './worker-protocol'

// `./worker-factory` is deliberately NOT re-exported. It resolves its worker
// bundles through `import.meta.url`, which jest's CJS transform leaves intact
// and node then refuses to evaluate ("Cannot use 'import.meta' outside a
// module") — putting it here takes down every suite that imports this barrel.
// `package-entry.test.ts` also pins the public surface free of "worker URL
// factories". Hosts reach it via the `@einfach/solid-excel/vnext-worker-factory`
// subpath; in-tree callers import `./worker-factory` directly.
