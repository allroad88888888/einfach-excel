import {
  renderDocumentationMarkdown,
  type DocumentationMarkdownPage,
} from '../../data/document-markdown'

const documents: readonly DocumentationMarkdownPage[] = ['getting-started', 'backend-port']

export function getStaticPaths() {
  return documents.map((document) => ({ params: { document } }))
}

export function GET({ params }: { params: { document?: string } }) {
  const document = params.document as DocumentationMarkdownPage
  return new Response(renderDocumentationMarkdown(document), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
