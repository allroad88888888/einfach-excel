import { renderAtomFeatureMarkdown } from '../../../data/document-markdown'
import { atomFeatureDocs } from '../../../data/source-projection'

export function getStaticPaths() {
  return atomFeatureDocs.map((feature) => ({ params: { feature: feature.id } }))
}

export function GET({ params }: { params: { feature?: string } }) {
  return new Response(renderAtomFeatureMarkdown(params.feature ?? ''), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
