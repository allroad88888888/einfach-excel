import { atomFeatureDocs, backendContract, backendTypesPath, sourceUrl } from './source-projection'
import { publicUrl } from './site-publication'

export type DocumentationMarkdownPage = 'getting-started' | 'backend-port' | 'api'

/** Renders the Markdown mirrors from the same data that feeds the static documentation pages. */
export function renderDocumentationMarkdown(page: DocumentationMarkdownPage): string {
  if (page === 'getting-started') {
    return `# Getting started

Create one backend, mount one provider, and render a visible projection.

- [Backend port](${publicUrl('/docs/backend-port/')})
- [Viewport atoms](${publicUrl('/docs/atoms/viewport/')})
- [Selection atoms](${publicUrl('/docs/atoms/selection/')})
`
  }

  if (page === 'backend-port') {
    return `# Backend port

Source: [${backendTypesPath}](${sourceUrl(backendTypesPath)})

\`\`\`ts
${backendContract}
\`\`\`
`
  }

  const featureLinks = atomFeatureDocs.map((feature) => `- [${feature.title}](${publicUrl(`/docs/atoms/${feature.id}/`)})`).join('\n')
  return `# UI operation API

The [UI operation reference](${publicUrl('/api/')}) documents frontend spreadsheet interactions.

## Set one cell

1. \`selectCellAtom\` makes the target cell active.
2. \`startEditingAtom\` opens its editing session.
3. \`editingDraftAtom\` holds the value or formula being typed.
4. \`runEditingCommitAtom\` commits that draft.

## More UI operations

- \`setSelectionAtom\`, \`getActiveCell\`, and \`moveSelection\` control selection.
- \`copyClipboardAtom\` and \`pasteClipboardAtom\` coordinate clipboard interaction.
- \`runUndoHistoryAtom\` and \`runRedoHistoryAtom\` move through user history.

## State guides

${featureLinks}
`
}

/** Renders an atom-guide Markdown mirror from the feature-owned source excerpt. */
export function renderAtomFeatureMarkdown(featureId: string): string {
  const feature = atomFeatureDocs.find((candidate) => candidate.id === featureId)
  if (!feature) throw new Error(`Unknown atom feature: ${featureId}`)
  return `# ${feature.title}

Source: [${feature.sourcePath}](${sourceUrl(feature.sourcePath)})

\`\`\`md
${feature.source}
\`\`\`
`
}
