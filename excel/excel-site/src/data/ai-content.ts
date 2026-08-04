import { demos } from './demo-catalog'
import { publicUrl } from './site-publication'
import { atomFeatureDocs } from './source-projection'
import { renderAtomFeatureMarkdown, renderDocumentationMarkdown } from './document-markdown'

/** Renders concise and expanded AI-readable indexes from the same site catalogue and source projections. */
export function renderLlmsIndex(): string {
  const demoLinks = demos
    .map((demo) => `- [${demo.id}](${publicUrl(`/demos/${demo.id}/`)})`)
    .join('\n')
  return `# einfach excel

> A spreadsheet UI stack with Atom state, pluggable backends, and a Solid/WASM surface.

## Documentation

- [Getting started](${publicUrl('/docs/getting-started/')})
- [Backend port](${publicUrl('/docs/backend-port/')})
- [API reference](${publicUrl('/api/')})
- [Generated API Markdown](${publicUrl('/api-reference/globals.md')})

## Demos

${demoLinks}

## Runtime boundary

Worker message counters measure visible-projection transport. They are not engine-internal cell traversal counts; that diagnostic port remains pending the engine merge.
`
}

/** Renders the detailed AI-readable document from source-projected contract content. */
export function renderLlmsFull(): string {
  const atomGuides = atomFeatureDocs.map((feature) => renderAtomFeatureMarkdown(feature.id)).join('\n\n')
  const demoDetails = demos
    .map(
      (demo) =>
        `## ${demo.id}\n\nRuntime: ${demo.runtime}. Scenario: ${demo.scenario}.\n\nSource: ${demo.sourceFiles
          .map((source) => `https://github.com/allroad88888888/einfach-excel/blob/main/${source}`)
          .join(', ')}`,
    )
    .join('\n\n')
  return `# einfach excel: full documentation

${renderDocumentationMarkdown('getting-started')}

${renderDocumentationMarkdown('backend-port')}

${renderDocumentationMarkdown('api')}

${atomGuides}

# Demo catalogue

${demoDetails}

# Measurement caveat

The performance HUD reports actual Worker messages and measured visible-projection round trips. It must not be read as a per-cell engine traversal count. That narrower metric requires the engine-side diagnostics work that has not yet been merged into main.
`
}
