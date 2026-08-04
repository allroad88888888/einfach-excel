import {
  atomFeatureDocs,
  backendContract,
  backendTypesPath,
  sourceUrl,
} from './source-projection'
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

  const featureLinks = atomFeatureDocs
    .map((feature) => `- [${feature.title}](${publicUrl(`/docs/atoms/${feature.id}/`)})`)
    .join('\n')
  return `# API reference

The live contract comes from [${backendTypesPath}](${sourceUrl(backendTypesPath)}).

\`\`\`ts
${backendContract}
\`\`\`

## Atom feature guides

${featureLinks}

## Generated reference

[TypeDoc Markdown](${publicUrl('/api-reference/globals.md')}) is generated at build time from the public package entry points.
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
