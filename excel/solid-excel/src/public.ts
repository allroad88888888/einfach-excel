export * from './adapter'
export * from './provider'
export * from './formula-autocomplete'
export * from './formula-bar'
export * from './name-box'
export * from './menu-bar'
export * from './context-menu'
export * from './sheet-tabs'
export * from './toolbar'
export * from './status-bar'
export * from './diagnostics'
export * from './grid'
export * from './format-painter'
export * from './go-to'
export * from './paste-special'
export * from './remove-duplicates'
export * from './text-to-columns'

// Dialog / overlay surfaces. A host that mounts the grid needs these to wire
// the menu and toolbar entries that open them, so they belong on the public
// entry just as much as the surfaces above — omitting them only pushed hosts
// into deep-importing `src/<feature>` and binding themselves to this
// package's internal file layout.
export * from './comments'
export * from './history'
export * from './conditional-formatting'
export * from './data-validation'
export * from './filter-sort'
export * from './find-replace'
export * from './format-cells'
export * from './named-ranges'
export * from './presence'
export * from './print'
export * from './protection'

// Feedback surfaces. These were reachable only by deep-importing
// `src/feedback`, so an out-of-package host (excel-site) could not mount
// the workbook feedback host at all — which is why a stalled editing commit
// showed the user nothing there.
export * from './feedback'
export * from './recovery'
