import { renderLlmsIndex } from '../data/ai-content'

export function GET() {
  return new Response(renderLlmsIndex(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
