import { demos } from './demo-catalog'
import { publicUrl } from './site-publication'
import { atomFeatureDocs } from './source-projection'
import { renderAtomFeatureMarkdown, renderDocumentationMarkdown } from './document-markdown'

const agentIntegrationGuidance = `## Agent integration

Implement the required backend ports: \`readVisibleProjection\`, \`readRangeProjection\`, and \`setCellInput\`. Keep workbook facts and authoritative mutations in the backend; the UI renders bounded projections. A Worker is an implementation choice for that backend boundary, not a required owner of UI state.`

const projectPositioning =
  'Einfach Excel is open-source spreadsheet infrastructure that evaluates the formulas requested results need, follows off-screen and cross-sheet dependencies automatically, and leaves unrelated formula values unevaluated.'

const formulaEvaluationBoundary = `## Demand-driven formula evaluation

On the bulk-import and ordinary formula-read path, formula values stay unevaluated until a requested result reads them. A visible projection can pull required dependencies from outside its rectangle or from another sheet through the workbook evaluation provider. Formula values outside that requested dependency chain stay unevaluated. Direct writes of array or spill formulas may still evaluate to maintain spill state, so this is not a blanket claim about every mutation path.`

const availabilityBoundary = `## Availability and adoption boundary

Five fixed-group packages, including \`@einfach/solid-excel\`, were published to npm at version \`0.1.0\` on 2026-08-17. Solid is the published UI binding. React and Vue pages are controlled-projection source references, not published adapters. The project is pre-1.0, has no paid support SLA, and its demos make no production performance or capacity promise.`

/** Renders concise and expanded AI-readable indexes from the same site catalogue and source projections. */
export function renderLlmsIndex(): string {
  const demoLinks = demos
    .map((demo) => `- [${demo.id}](${publicUrl(`/demos/${demo.id}/`)})`)
    .join('\n')
  return `# einfach excel

> ${projectPositioning}

${availabilityBoundary}

${formulaEvaluationBoundary}

## Documentation

- [Getting started](${publicUrl('/docs/getting-started/')})
- [Backend port](${publicUrl('/docs/backend-port/')})
- [API reference](${publicUrl('/api/')})
- [Generated API Markdown](${publicUrl('/api-reference/globals.md')})

${agentIntegrationGuidance}

## Demos

${demoLinks}

## Install

\`npm install @einfach/solid-excel @einfach/core @einfach/solid solid-js\`

## Runtime boundary

Worker message counters measure visible-projection transport. They are not engine-internal cell traversal counts; that diagnostic port remains pending the engine merge.
`
}

/** Renders the detailed AI-readable document from source-projected contract content. */
export function renderLlmsFull(): string {
  const atomGuides = atomFeatureDocs
    .map((feature) => renderAtomFeatureMarkdown(feature.id))
    .join('\n\n')
  const demoDetails = demos
    .map(
      (demo) =>
        `## ${demo.id}\n\nRuntime: ${demo.runtime}. Scenario: ${demo.scenario}.\n\nSource: ${demo.sourceFiles
          .map((source) => `https://github.com/allroad88888888/einfach-excel/blob/main/${source}`)
          .join(', ')}`,
    )
    .join('\n\n')
  return `# einfach excel: full documentation

${projectPositioning}

${availabilityBoundary}

${formulaEvaluationBoundary}

${renderDocumentationMarkdown('getting-started')}

${renderDocumentationMarkdown('backend-port')}

${agentIntegrationGuidance}

${renderDocumentationMarkdown('api')}

${atomGuides}

# Demo catalogue

${demoDetails}

# Measurement caveat

The performance HUD reports actual Worker messages and measured visible-projection round trips. It must not be read as a per-cell engine traversal count. That narrower metric requires the engine-side diagnostics work that has not yet been merged into main.
`
}
