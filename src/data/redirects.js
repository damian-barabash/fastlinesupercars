// Mapa starych adresów WordPress/WooCommerce → nowe ścieżki.
// Źródło: `wp-sitemap.xml` produkcyjnego sklepu (61 adresów, zebrane 2026-08-19).
// Używane w dwóch miejscach: `scripts/prerender.mjs` wypala z tego statyczne
// strony przekierowujące (GitHub Pages nie umie przekierowań serwerowych),
// a aplikacja ma dla części z nich zwykłe trasy `<Navigate>`.
export const REDIRECTS = {
  // stare strony ofertowe
  '/cennik': '/oferta',
  '/supersamochody': '/oferta',
  '/supersamochody-na-torze': '/oferta',
  '/tory-wyscigowe': '/tory',
  '/zamowienie': '/koszyk',
  '/strona-poczatkowa': '/',
  '/moje-konto': '/',
  '/privacy-policy': '/polityka-prywatnosci',

  // kategorie i tagi WooCommerce
  '/kategoria-produktu/najnowsze': '/oferta',
  '/kategoria-produktu/najszybsze': '/oferta',
  '/kategoria-produktu/pelna-oferta': '/oferta',
  '/kategoria-produktu/pojedynki-aut': '/oferta',
  '/kategoria-produktu/voucher': '/produkt/voucher',
  '/tag-produktu/pelna-oferta': '/oferta',
  '/tag-produktu/pojedynki-aut': '/oferta',

  // wpis „samochody" (osobny typ postów) → karty produktów
  '/samochody/alpine-a110-1': '/produkt/alpine-a110',
  '/samochody/bmw-m2': '/produkt/bmw-m2',
  '/samochody/mercedes-benz-a45-amg': '/produkt/mercedes-a45s-amg',
  '/samochody/pakiet-japonski': '/produkt/pakiet-japonski',
  '/samochody/pakiet-niemiecki': '/produkt/pakiet-niemiecki',
  '/samochody/porsche-911-carrera-4-gts': '/produkt/porsche-911',
  '/samochody/toyota-gr-supra': '/produkt/toyota-gr-supra',
  '/samochody/toyota-gr-yaris': '/produkt/toyota-gr-yaris',

  // strony „dziękujemy" z WooCommerce/JetPopup
  '/dziekujemy-za-rezerwacje-samochodu': '/oferta',
  '/dziekujemy-za-rezerwacje-terminu': '/kalendarz',
  '/dziekujemy-za-wiadomosc': '/kontakt',

  // blog i pozostałości
  '/category/uncategorized': '/',
  '/uncategorized/hello-world': '/',
  '/uncategorized/tor-poznan': '/tory/tor-poznan',
  '/wyprawy/wyprawa-testowa': '/',
  '/jet-popup/formularz-eventy-supersamochodami': '/kontakt',
  '/jet-popup/rezerwacja-terminu': '/kalendarz',
}
