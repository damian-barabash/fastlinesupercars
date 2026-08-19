// Jedno źródło meta dla SEO — używane i przez aplikację (tytuł przy nawigacji),
// i przez `scripts/prerender.mjs` (wypalanie tagów do statycznych plików HTML).
// Dzięki temu tytuł strony w przeglądarce i ten widziany przez roboty są tożsame.

export const SITE = 'https://fastlinesupercars.pl'
export const BRAND = 'Fastline Supercars'
export const DEFAULT_IMAGE = '/img/2023_04_g-6.webp'

const t = (title, description, extra = {}) => ({ title, description, ...extra })

export const PAGES = {
  '/': t(
    'Fastline Supercars – przejażdżka supersamochodem po torze wyścigowym',
    'Poprowadź Porsche 911, Toyotę GR Supra, Alpine A110 czy BMW M2 na torze wyścigowym. Vouchery ważne 1 rok, 5 torów w Polsce, instruktor w aucie. #sportdrivingexperience',
  ),
  '/oferta': t(
    'Oferta – jazda sportowym samochodem po torze | Fastline Supercars',
    'Wszystkie samochody i pakiety: Porsche 911, Toyota GR Supra, Alpine A110, BMW M2, Mercedes A45s AMG, Ford Focus RS, GR Yaris oraz pakiety niemiecki i japoński. Ceny od 199 zł.',
  ),
  '/tory': t(
    'Tory wyścigowe – gdzie pojedziesz | Fastline Supercars',
    'Jeździmy na pięciu torach w Polsce: Modlin, Łódź, Poznań, Krzywa-Wrocław i Autodrom Pomorze w Pszczółkach. Sprawdź długość, liczbę zakrętów i charakterystykę każdego z nich.',
  ),
  '/o-nas': t(
    'O nas – kim jest Fastline Supercars',
    'Od lat spełniamy marzenia o jeździe supersamochodem po torze. Instruktorzy wyścigowi, zadbana flota i bezpieczne warunki — bez ryzyka i bez własnego auta.',
  ),
  '/kalendarz': t(
    'Terminy przejazdów – kalendarz | Fastline Supercars',
    'Wybierz termin przejazdu na wybranym torze i zarezerwuj miejsce online, podając kod swojego vouchera.',
  ),
  '/kontakt': t(
    'Kontakt | Fastline Supercars',
    'Masz pytanie o voucher, termin albo wydarzenie firmowe? Napisz na rezerwacje@fastlinesupercars.pl — odpowiadamy w ciągu 24 h, pon–pt 10:00–17:00.',
  ),
  '/koszyk': t(
    'Koszyk | Fastline Supercars',
    'Twoje zamówienie — voucher PDF trafia na e-mail od razu po opłaceniu.',
    { noindex: true },
  ),
  '/dziekujemy': t(
    'Dziękujemy za zamówienie | Fastline Supercars',
    'Potwierdzenie zamówienia i kod vouchera.',
    { noindex: true },
  ),
  '/regulamin-platnosci': t(
    'Regulamin płatności | Fastline Supercars',
    'Zasady zakupu voucherów i przejazdów w Fastline Supercars — płatności, zwroty, ważność vouchera.',
  ),
  '/polityka-prywatnosci': t(
    'Polityka prywatności | Fastline Supercars',
    'Jak przetwarzamy dane osobowe użytkowników serwisu fastlinesupercars.pl.',
  ),
}

export function productSeo(p) {
  const desc = (p.description || '').replace(/\s+/g, ' ').trim()
  const price = p.price_from ? ` Cena od ${(p.price_from / 100).toFixed(0)} zł.` : ''
  return {
    title: `${p.name} na torze – przejażdżka i voucher | ${BRAND}`,
    description: (desc ? desc.slice(0, 150) : `Przejedź się ${p.name} po torze wyścigowym z instruktorem.`) +
      `${price} Voucher ważny 1 rok.`,
    image: p.cover || (p.images && p.images[0]) || DEFAULT_IMAGE,
    product: p,
  }
}

export function trackSeo(tr) {
  const stats = (tr.stats || []).map((s) => `${s.label.toLowerCase()}: ${s.num}`).join(', ')
  return {
    title: `${tr.name} – jazda supersamochodem po torze | ${BRAND}`,
    description: `${tr.name} — ${stats || 'tor wyścigowy'}. Sprawdź charakterystykę toru i wybierz auto na przejazd z instruktorem.`,
    image: tr.map || DEFAULT_IMAGE,
  }
}

/** Meta dla dowolnej ścieżki (bez końcowego ukośnika). */
export function seoFor(path, products = [], tracks = []) {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : '/'
  if (PAGES[clean]) return PAGES[clean]

  const prod = clean.match(/^\/produkt\/([^/]+)$/)
  if (prod) {
    const p = products.find((x) => x.id === prod[1])
    if (p) return productSeo(p)
  }
  const tor = clean.match(/^\/tory\/([^/]+)$/)
  if (tor) {
    const tr = tracks.find((x) => x.slug === tor[1])
    if (tr) return trackSeo(tr)
  }
  return { ...PAGES['/'], noindex: true }
}
