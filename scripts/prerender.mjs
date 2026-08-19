// Po `vite build` zamienia SPA w zestaw prawdziwych plików HTML — po jednym na trasę.
//
// Dlaczego: GitHub Pages nie ma przekierowań serwerowych ani fallbacku, więc każdy adres
// poza `/` zwracał **404** (sprawdzone na draft.fastlinesupercars.pl) i wszystkie podstrony
// miały ten sam <title>. Po tym kroku każda trasa to osobny plik → status 200, własny tytuł,
// opis, canonical, Open Graph i dane strukturalne. Stare adresy z WordPressa dostają
// statyczne strony przekierowujące (meta refresh + canonical), bo inaczej znikłyby z indeksu.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const { PAGES, SITE, BRAND, DEFAULT_IMAGE, seoFor } = await import('../src/data/seo.js')
const { REDIRECTS } = await import('../src/data/redirects.js')
const { TORY } = await import('../src/data/tory.js')
const { SB_URL, ANON_KEY } = await import('../src/lib/api.js')

// Produkty bierzemy z bazy, żeby ten dodany w panelu dostał własną stronę i wpis w sitemapie
// bez ruszania kodu. Gdy baza jest nieosiągalna (offline CI), zostaje wersja z repo.
const BUNDLED = JSON.parse(readFileSync(join(root, 'src/data/products.json'), 'utf8'))
let PRODUCTS = BUNDLED
try {
  const r = await fetch(`${SB_URL}/rest/v1/products?select=*&active=eq.true&order=sort.asc`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const live = await r.json()
  if (Array.isArray(live) && live.length) {
    const byId = new Map(BUNDLED.map((p) => [p.id, p]))
    for (const p of live) byId.set(p.id, { ...(byId.get(p.id) || {}), ...p })
    PRODUCTS = [...byId.values()].filter((p) => live.some((l) => l.id === p.id))
    console.log(`prerender: produkty z bazy (${PRODUCTS.length})`)
  }
} catch (e) {
  console.warn(`prerender: baza niedostępna (${e.message}) — produkty z repo (${BUNDLED.length})`)
}

const shell = readFileSync(join(dist, 'index.html'), 'utf8')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const abs = (u) => (u && u.startsWith('http') ? u : SITE + (u || DEFAULT_IMAGE))

const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#organizacja`,
  name: BRAND,
  url: SITE,
  logo: `${SITE}/img/2024_05_logo-grey.webp`,
  email: 'rezerwacje@fastlinesupercars.pl',
  address: { '@type': 'PostalAddress', streetAddress: 'ul. Wita Stwosza 48', addressLocality: 'Warszawa', addressCountry: 'PL' },
}

function jsonLd(path, seo) {
  const graph = [ORG]
  if (path === '/') {
    graph.push({
      '@type': 'WebSite', '@id': `${SITE}/#strona`, url: SITE, name: BRAND,
      inLanguage: 'pl-PL', publisher: { '@id': ORG['@id'] },
    })
  }
  if (seo.product) {
    const p = seo.product
    graph.push({
      '@type': 'Product',
      name: p.name,
      description: (p.description || p.subtitle || '').replace(/\s+/g, ' ').slice(0, 400),
      image: abs(p.cover || (p.images && p.images[0])),
      brand: { '@id': ORG['@id'] },
      offers: {
        '@type': 'Offer',
        price: ((p.price_from || 0) / 100).toFixed(2),
        priceCurrency: 'PLN',
        availability: 'https://schema.org/InStock',
        url: `${SITE}${path}`,
      },
    })
  }
  const crumbs = path.split('/').filter(Boolean)
  if (crumbs.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Strona główna', item: SITE },
        ...crumbs.map((c, i) => ({
          '@type': 'ListItem', position: i + 2,
          name: i === crumbs.length - 1 ? seo.title.split(/[–|]/)[0].trim() : c,
          item: `${SITE}/${crumbs.slice(0, i + 1).join('/')}`,
        })),
      ],
    })
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
}

/** Treść dla robotów bez JS (i dla czytników) — znika, gdy React zamontuje aplikację. */
function noscriptBlock(seo, path) {
  const links = ['/oferta', '/tory', '/o-nas', '/kalendarz', '/kontakt']
    .filter((l) => l !== path)
    .map((l) => `<li><a href="${l}">${esc((PAGES[l] || {}).title || l).split(/[–|]/)[0].trim()}</a></li>`).join('')
  return `<noscript><div style="max-width:760px;margin:40px auto;padding:0 24px;font-family:system-ui,sans-serif">
<h1>${esc(seo.title.split(/[–|]/)[0].trim())}</h1>
<p>${esc(seo.description)}</p>
<ul>${links}</ul>
<p>Kontakt: <a href="mailto:rezerwacje@fastlinesupercars.pl">rezerwacje@fastlinesupercars.pl</a></p>
</div></noscript>`
}

function pageHtml(path, seo) {
  const url = SITE + (path === '/' ? '/' : path)
  const image = abs(seo.image)
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(seo.description)}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(seo.title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(seo.description)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${image}" />`)

  const head = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:locale" content="pl_PL" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(seo.title)}" />`,
    `<meta name="twitter:description" content="${esc(seo.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    seo.noindex
      ? `<meta name="robots" content="noindex,follow" />`
      : `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />`,
    `<script type="application/ld+json">${jsonLd(path, seo)}</script>`,
  ].join('\n    ')

  html = html.replace('</head>', `    ${head}\n  </head>`)
  html = html.replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscriptBlock(seo, path)}`)
  return html
}

function write(path, html) {
  // dwie formy adresu: /oferta i /oferta/ — obie mają zwracać 200
  const clean = path.replace(/^\/|\/$/g, '')
  if (!clean) { writeFileSync(join(dist, 'index.html'), html); return }
  const dir = join(dist, clean)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
  const flat = join(dist, `${clean}.html`)
  if (!existsSync(dirname(flat))) mkdirSync(dirname(flat), { recursive: true })
  writeFileSync(flat, html)
}

function redirectHtml(from, to) {
  const url = SITE + to
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <title>Przeniesiono — ${esc(BRAND)}</title>
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="noindex,follow" />
    <meta http-equiv="refresh" content="0; url=${to}" />
    <script>location.replace(${JSON.stringify(to)} + location.search + location.hash)</script>
  </head>
  <body>
    <p>Ta strona została przeniesiona. Jeśli nie nastąpi przekierowanie, kliknij:
      <a href="${to}">${url}</a></p>
  </body>
</html>`
}

// ---------- trasy ----------
const routes = [
  ...Object.keys(PAGES),
  ...PRODUCTS.map((p) => `/produkt/${p.id}`),
  ...TORY.map((t) => `/tory/${t.slug}`),
]

let pages = 0
for (const path of routes) {
  const seo = seoFor(path, PRODUCTS, TORY)
  write(path, pageHtml(path, seo))
  pages++
}

// ---------- przekierowania ze starych adresów ----------
let redirects = 0
for (const [from, to] of Object.entries(REDIRECTS)) {
  write(from, redirectHtml(from, to))
  redirects++
}

// ---------- sitemap ----------
const today = new Date().toISOString().slice(0, 10)
const indexable = routes.filter((r) => !seoFor(r, PRODUCTS, TORY).noindex)
const priority = (r) => (r === '/' ? '1.0' : r.startsWith('/produkt/') ? '0.9' : r.split('/').length === 2 ? '0.8' : '0.7')
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((r) => `  <url>
    <loc>${SITE}${r === '/' ? '/' : r}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r === '/' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${priority(r)}</priority>
  </url>`).join('\n')}
</urlset>
`
writeFileSync(join(dist, 'sitemap.xml'), sitemap)

// ---------- SPA fallback dla nieznanych adresów (GitHub Pages odda je z kodem 404) ----------
writeFileSync(join(dist, '404.html'), pageHtml('/404', { ...PAGES['/'], title: 'Nie znaleziono strony | ' + BRAND, description: 'Ta strona nie istnieje. Wróć na stronę główną Fastline Supercars.', noindex: true }))

console.log(`prerender: ${pages} stron, ${redirects} przekierowań, sitemap z ${indexable.length} adresami`)
