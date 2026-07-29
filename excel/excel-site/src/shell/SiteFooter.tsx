import type { Component } from 'solid-js'
import { useSiteT } from '../i18n/use-site-t'

const GITHUB_URL = 'https://github.com/allroad88888888/einfach'

const SiteFooter: Component = () => {
  const t = useSiteT()

  return (
    <footer class="site-footer">
      <div class="site-footer__inner">
        <p class="site-footer__tagline">{t('site.footer.tagline')}</p>
        <div class="site-footer__links">
          <a class="site-footer__link" href={GITHUB_URL} target="_blank" rel="noreferrer">
            {t('site.footer.github')}
          </a>
          <span class="site-footer__license">{t('site.footer.license')}</span>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter
