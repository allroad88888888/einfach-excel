import { renderLlmsFull } from '../data/ai-content'

export function GET() {
  return new Response(renderLlmsFull(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
