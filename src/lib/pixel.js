// Meta Pixel — ładuje się dopiero po „Akceptuję" w oknie cookies, nigdy w panelu
// i nigdy dla robotów / przeglądarek automatycznych. Ten sam układ co na FRA.
//
// Zdarzenia: PageView na każdej stronie SPA, ViewContent na karcie produktu i po wyborze
// prezentu w konfiguratorze świątecznym, AddToCart, InitiateCheckout przy „Zapłać",
// Purchase po potwierdzeniu płatności przez serwer, Lead po wysłanym formularzu kontaktowym.
// Kwoty w sklepie są w groszach brutto — Meta dostaje złote brutto (tyle płaci klient).

export const PIXEL_ID = '121830146698365'
export const CONSENT_KEY = 'fs_cookies'      // 'all' | 'essential'
const LS_PAID = 'fs_px_paid'                 // zamówienia już zgłoszone jako Purchase

const get = (k) => { try { return localStorage.getItem(k) } catch { return null } }
export const cookieChoice = () => get(CONSENT_KEY)

const automated = () => !get('fs_pixel_force')
  && (!!navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless|prerender/i.test(navigator.userAgent || ''))

function ready() {
  if (typeof window === 'undefined') return false
  if (get(CONSENT_KEY) !== 'all' || automated() || window.location.pathname.startsWith('/admin')) return false
  if (!window.fbq) {
    const n = (window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) })
    if (!window._fbq) window._fbq = n
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
    n.disablePushState = true   // odsłony wysyłamy sami — inaczej Meta liczy każdą zmianę adresu drugi raz
    const s = document.createElement('script')
    s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(s)
    window.fbq('init', PIXEL_ID)
  }
  return true
}

// to samo zdarzenie dla tej samej rzeczy w ciągu 2 s = jedno (StrictMode odpala efekty dwa razy)
const recent = new Map()
function send(event, params, key = '', opts) {
  if (!ready()) return
  const k = `${event}:${key}`, now = Date.now()
  if (now - (recent.get(k) || 0) < 2000) return
  recent.set(k, now)
  if (opts) window.fbq('track', event, params || {}, opts)
  else if (params) window.fbq('track', event, params)
  else window.fbq('track', event)
}

const pln = (grosze) => Math.round(Number(grosze) || 0) / 100

// row = { product_id, name, variant?, price (grosze za sztukę), qty? }
const contents = (rows) => {
  const list = rows.filter(Boolean)
  return {
    content_ids: list.map((r) => String(r.product_id || r.id)),
    contents: list.map((r) => ({ id: String(r.product_id || r.id), quantity: r.qty || 1, item_price: pln(r.price) })),
    content_type: 'product',
    content_name: list.map((r) => r.name).filter(Boolean).join(', '),
    num_items: list.reduce((s, r) => s + (r.qty || 1), 0),
  }
}

export const pxPageView = () => send('PageView', null, window.location.pathname)

export const pxViewContent = (row) => {
  if (!row?.name) return
  send('ViewContent', { ...contents([row]), value: pln(row.price), currency: 'PLN' }, `${row.product_id}:${row.price}`)
}

export const pxAddToCart = (row) => {
  if (!row?.name) return
  send('AddToCart', { ...contents([row]), value: pln(row.price) * (row.qty || 1), currency: 'PLN' }, `${row.product_id}:${row.variant || ''}:${row.price}`)
}

// valueGrosze = do zapłaty po rabatach (tyle idzie do bramki)
export const pxInitiateCheckout = (rows, valueGrosze) =>
  send('InitiateCheckout', { ...contents(rows), value: pln(valueGrosze), currency: 'PLN' }, String(valueGrosze))

// order = { id (uuid), number, total (grosze), items[] } — raz na zamówienie w tej przeglądarce
export function pxPurchase(order) {
  if (!order?.id || !ready()) return
  let done = []
  try { done = JSON.parse(get(LS_PAID) || '[]') } catch { /* */ }
  if (done.includes(order.id)) return
  send('Purchase', { ...contents(order.items || []), value: pln(order.total), currency: 'PLN' }, order.id, { eventID: order.id })
  try { localStorage.setItem(LS_PAID, JSON.stringify([...done, order.id].slice(-30))) } catch { /* tryb prywatny */ }
}

// formularz kontaktowy przyjęty przez serwer
export const pxLead = (name) => send('Lead', { content_name: name }, name)
