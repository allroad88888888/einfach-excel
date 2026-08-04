import { publicUrl } from '../data/site-publication'

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${publicUrl('/sitemap.xml')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
