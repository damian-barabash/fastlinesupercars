import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useProducts } from '../lib/products.js'
import { TORY } from '../data/tory.js'
import { seoFor, SITE, DEFAULT_IMAGE } from '../data/seo.js'
import { gtmPageView } from '../lib/gtm.js'

// Statyczne pliki z `scripts/prerender.mjs` mają poprawne meta już przy wejściu,
// ale przy nawigacji wewnątrz aplikacji tytuł i canonical trzeba podmienić ręcznie —
// inaczej po kliknięciu w menu zostaje meta strony wejściowej.
function tag(selector, create) {
  let el = document.head.querySelector(selector)
  if (!el) { el = create(); document.head.appendChild(el) }
  return el
}
const meta = (attr, name, content) => {
  const el = tag(`meta[${attr}="${name}"]`, () => {
    const m = document.createElement('meta'); m.setAttribute(attr, name); return m
  })
  el.setAttribute('content', content)
}

export default function SeoSync() {
  const { pathname } = useLocation()
  const products = useProducts()
  // efekt powtarza się, gdy dojadą produkty z bazy — meta odświeżamy, ale odsłonę
  // wysyłamy raz na adres, inaczej statystyki liczyłyby każdą wizytę podwójnie
  const sentFor = useRef(null)

  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/'
    const seo = seoFor(path, products, TORY)
    const url = SITE + (path === '/' ? '/' : path)
    const image = (seo.image || DEFAULT_IMAGE).startsWith('http') ? seo.image : SITE + (seo.image || DEFAULT_IMAGE)

    document.title = seo.title
    meta('name', 'description', seo.description)
    meta('name', 'robots', seo.noindex
      ? 'noindex,follow'
      : 'index,follow,max-image-preview:large,max-snippet:-1')
    meta('property', 'og:title', seo.title)
    meta('property', 'og:description', seo.description)
    meta('property', 'og:url', url)
    meta('property', 'og:image', image)

    const link = tag('link[rel="canonical"]', () => {
      const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l
    })
    link.setAttribute('href', url)

    if (!path.startsWith('/admin') && sentFor.current !== path) {
      sentFor.current = path
      gtmPageView(path, seo.title)
    }
  }, [pathname, products])

  return null
}
