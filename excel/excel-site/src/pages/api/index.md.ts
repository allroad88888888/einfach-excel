import { renderDocumentationMarkdown } from '../../data/document-markdown'

export function GET() {
  return new Response(renderDocumentationMarkdown('api'), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}
