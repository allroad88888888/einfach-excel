export const en: Record<string, string> = {
  'site.nav.home': 'Home',
  'site.nav.demos': 'Demos',
  'site.nav.workbench': 'Workbench',
  'site.nav.github': 'GitHub',

  'site.footer.tagline': 'An atom-powered spreadsheet engine, open-sourced end to end.',
  'site.footer.license': 'MIT licensed — fork it, break it, ship it.',
  'site.footer.github': 'Source on GitHub',

  'site.gallery.title': 'Demo gallery',
  'site.gallery.subtitle': 'Live, editable examples of what Einfach Sheets can do.',
  'site.gallery.tagFilterLabel': 'Filter by tag',
  'site.gallery.empty': 'No demos match that filter yet.',

  'site.demo.viewSource': 'View source',
  'site.demo.backToGallery': 'Back to gallery',
  'site.demo.tryThis': 'Try it',
  'site.demo.backend.static': 'Static',
  'site.demo.backend.workerWasm': 'Worker · WASM',
  'site.demo.backend.workerTs': 'Worker · TS',
  'site.demo.workerError':
    'The worker backend failed to start. Run `npm run ensureWasm` at the repo root, then reload.',

  'site.demoMeta.basics.title': 'Basics',
  'site.demoMeta.basics.blurb':
    'Click, type, and navigate cells with the keyboard — the fundamentals of the grid.',

  'site.demoMeta.formulas.title': 'Formulas & cross-sheet chains',
  'site.demoMeta.formulas.blurb':
    'The Rust/WASM engine recalculates dependency chains that span multiple sheets.',
  'site.demoMeta.dynamic-arrays.title': 'Dynamic arrays',
  'site.demoMeta.dynamic-arrays.blurb':
    'One formula, many cells — array results spill into their neighbors, Excel-style.',
  'site.demoMeta.custom-formulas.title': 'Custom formulas',
  'site.demoMeta.custom-formulas.blurb':
    'Register your own JS functions as cell formulas — including async ones that resolve #BUSY!.',
  'site.demoMeta.find-replace.title': 'Find & replace',
  'site.demoMeta.find-replace.blurb':
    'Search across the sheet, walk the matches, and replace one by one or all at once.',
  'site.demoMeta.conditional-formatting.title': 'Conditional formatting',
  'site.demoMeta.conditional-formatting.blurb':
    'Rules that recolor cells as their values change — thresholds, ranges, and more.',
  'site.demoMeta.data-validation.title': 'Data validation',
  'site.demoMeta.data-validation.blurb':
    'Constrain what a cell accepts and surface the violations as you type.',
  'site.demoMeta.named-ranges.title': 'Named ranges & Go To',
  'site.demoMeta.named-ranges.blurb':
    'Name a range, jump to it from the name box, and manage names in one dialog.',
  'site.demoMeta.history.title': 'Undo history',
  'site.demoMeta.history.blurb':
    'Every edit lands on an undo stack with a browsable timeline — jump to any point.',
  'site.demoMeta.data-tools.title': 'Data tools',
  'site.demoMeta.data-tools.blurb':
    'Paste special, text to columns, and remove duplicates — the data cleanup trio.',
  'site.demoMeta.filter-sort.title': 'Filter & sort',
  'site.demoMeta.filter-sort.blurb':
    'Hide rows by rule, sort ranges, and watch aggregates respect what is visible.',
  'site.demoMeta.collaboration.title': 'Comments & presence',
  'site.demoMeta.collaboration.blurb':
    'Threaded cell comments plus live remote cursors rendered from presence state.',
  'site.demoMeta.protection-print.title': 'Protection & print',
  'site.demoMeta.protection-print.blurb':
    'Lock down ranges behind sheet protection and set up print areas and page breaks.',
  'site.demoMeta.performance.title': 'Performance',
  'site.demoMeta.performance.blurb':
    'A large seeded workbook served by the Rust/WASM worker through a windowed projection.',
}
