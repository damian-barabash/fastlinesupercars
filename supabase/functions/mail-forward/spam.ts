// FASTLINESUPERCARS — filtr spamu dla poczty przychodzącej (rezerwacje@ → biuro).
//
// Dlaczego własny filtr: Resend (Amazon SES) daje tylko werdykt `X-SES-Spam-Verdict`,
// który przepuszcza większość tego, co przychodzi. Spamerzy mają poprawne SPF/DKIM
// (wysyłają z własnych domen albo z Gmaila), więc same nagłówki nie wystarczą — trzeba
// patrzeć też na treść. Reguły ułożone na 157 prawdziwych listach z 28.09–26.10.2026.
//
// Zasada: punkty. Każda reguła dokłada punkty i powód, sygnały „to klient" odejmują.
// Od SPAM_THRESHOLD w górę list trafia do kwarantanny (tabela `mail_spam`), skąd biuro
// może go przekazać jednym kliknięciem w panelu. Nic nie jest kasowane po cichu.
//
// Moduł jest czysty (bez sieci i bazy) — da się go przetestować na zrzucie listów.

export const SPAM_THRESHOLD = 6

export type InboundEmail = {
  from?: string
  subject?: string
  text?: string
  html?: string
  headers?: Record<string, unknown>
  attachments?: unknown[]
}

export type Lists = {
  /** adresy (`jan@x.pl`) albo domeny (`x.pl`) zawsze przepuszczane */
  allow?: string[]
  /** adresy albo domeny zawsze zatrzymywane */
  block?: string[]
}

export type Verdict = { spam: boolean; score: number; reasons: string[] }

const OWN_DOMAIN = 'fastlinesupercars.pl'

/** Partnerzy i własne skrzynki — przepuszczane, o ile podpis domeny się zgadza. */
const TRUSTED_DOMAINS = ['greywolfgroup.pl', 'katalogmarzen.pl', 'wyjatkowyprezent.pl']

/** Skrzynki prywatne — klienci piszą głównie stąd. */
const FREEMAIL = /(^|\.)(gmail\.com|googlemail\.com|wp\.pl|o2\.pl|onet\.pl|onet\.eu|op\.pl|interia\.pl|interia\.eu|poczta\.fm|icloud\.com|me\.com|outlook\.com|hotmail\.com|live\.com|yahoo\.com|tlen\.pl|gazeta\.pl|vp\.pl|int\.pl|proton\.me|protonmail\.com)$/

/**
 * Marki, pod które podszywa się phishing. Nazwa marki w temacie lub początku treści
 * wysłana z domeny spoza listy = podszywanie się.
 */
// `w` — waga: banki, płatności i kurierzy nigdy nie piszą na ten adres (6), za to nazwę
// Facebooka czy Instagrama klient może wspomnieć zwyczajnie (4, potrzebny drugi sygnał).
const BRANDS: { name: string; re: RegExp; domains: string[]; w: number; token?: RegExp }[] = [
  { name: 'Facebook/Meta', re: /\b(facebook\w*|meta (business|verified|for business|support)|centrum wsparcia meta|meta ads)\b/, domains: ['facebook.com', 'facebookmail.com', 'meta.com', 'instagram.com', 'business.fb.com'], w: 4, token: /facebook|meta/ },
  { name: 'Instagram', re: /\binstagram\b/, domains: ['instagram.com', 'facebookmail.com', 'facebook.com', 'meta.com'], w: 4, token: /instagram/ },
  { name: 'PKO', re: /\b(ipko|pko bank|pko bp)\b/, domains: ['pkobp.pl', 'ipko.pl'], w: 6 },
  { name: 'Erste', re: /\berste\b/, domains: ['erstebank.pl', 'erstegroup.com'], w: 6 },
  { name: 'PayPal', re: /\bpaypal\b/, domains: ['paypal.com', 'paypal.pl'], w: 6, token: /paypal/ },
  { name: 'DPD', re: /\bdpd\b/, domains: ['dpd.com.pl', 'dpd.pl', 'dpd.com'], w: 6 },
  { name: 'InPost', re: /\binpost\b/, domains: ['inpost.pl', 'inpost.eu'], w: 6 },
  { name: 'OpenAI/ChatGPT', re: /\b(chatgpt|openai)\b/, domains: ['openai.com', 'chatgpt.com'], w: 4, token: /openai|chatgpt/ },
  { name: 'CapCut', re: /\bcapcut\b/, domains: ['capcut.com', 'bytedance.com'], w: 4, token: /capcut/ },
  { name: 'WordPress', re: /\bwordpress\b/, domains: ['wordpress.com', 'wordpress.org', 'automattic.com'], w: 4 },
  { name: 'Google', re: /\b(google ads|google search console|google business)\b/, domains: ['google.com'], w: 4 },
]

/** Phishing: groźba, pilność, weryfikacja konta, „paczka czeka". Każda grupa liczy się raz. */
const PHISHING: [string, RegExp][] = [
  ['naruszenie praw / copyright', /naruszen\w* (zasad|praw autorskich|wlasnosci intelektualnej|zasad dotyczacych)|copyright|intellectual property|dmca/],
  ['odznaka / Meta Verified', /meta verified|odznak\w* weryfikac|niebiesk\w* odznak/],
  ['konto reklamowe / polityka reklam', /kont\w* reklamow|advertising (policy|content)|policy violation|naruszeniu zasad/],
  ['wymagana akcja', /wymagana (akcja|autoryzacja|weryfikacja|aktualizacja)|dzialanie wymagane|action required|wymagane potwierdzenie|weryfikacja bezpieczenstwa|request for appeal/],
  ['groźba blokady konta', /trwale wylaczenie|permanent\w* disabl|dezaktywacj|zawieszeni\w* konta|account (suspen|disabl)|wylaczenie twojego konta|ograniczenia \/ dezaktywacji/],
  ['logowanie / hasło', /password expires|haslo wygasa|zaufan\w* urzadzeni|zabezpieczenie logowania|aktualizacj\w* aplikacji|nowe zasady logowania|potwierdz\w* (adres\w* e-?mail|swoje dane)/],
  ['płatność / subskrypcja', /problem z platnoscia|autoryzacj\w* platnosci|subskrypcj\w* chatgpt|przetwarzanie platnosci/],
  ['paczka czeka', /paczka czeka|(udalo|udac) nam sie .{0,25}(dostarczyc|doreczyc)|ponown\w* dostaw/],
  ['„zostałeś wybrany” / nagroda', /zostal\w* wybran|you have been selected|(bezplatny|darmowy) roczny dostep|kwalifikuje sie do otrzymania/],
]

/** Oferty sprzedażowe „na zimno", SEO i handel domenami. */
const COLD_SALES: [string, number, RegExp][] = [
  ['zła domena (.com)', 6, /fastlinesupercars\.com|nesupercars\.com/],
  ['rejestracja w wyszukiwarkach', 4, /search (engines?|index)|wyszukiwark\w* google/],
  ['SEO / pozycjonowanie', 3, /\bseo\b|pozycjonow/],
  ['strona / redesign', 3, /redesign|website idea|modernizing your website|strona lub sklep internetow|strona internetowa panstwa firmy|obecna strona/],
  ['oferta sklepu / strony', 3, /sklep\w* online|strony internetowej lub sklepu|zapytania od klientow|w sprzedazy produktow/],
  ['propozycja współpracy', 3, /pisze z propozycj\w* wspolpracy|propozycj\w* wspolpracy w zakresie|oferta wspolpracy/],
  ['aplikacje / software', 3, /mobile app|app development|custom app|software development|tworzenie aplikacji/],
  ['pozyskiwanie klientów / B2B', 3, /pozyskiwani\w* (nowych )?klientow|lead\w* generation|oferta wspolpracy b2b|klientow b2b/],
  ['media społecznościowe', 3, /media spolecznosciowe czesto|social media management/],
  ['reklamy w ChatGPT', 3, /reklam\w* w chatgpt|chatgpt ads/],
  ['oferta niezwiązana z firmą', 6, /luxury watch|machining|prototyping|naprawiamy komputery|sprzatani|profesjonalna czystosc|acquiring \S+\.com/],
  ['zimny kontakt', 3, /came across your (business|website)|i was checking your website|you're listed as the owner|kontakt do panstwa odszukalem|are you (currently )?considering|i hope you're doing well|i hope all is well|wanted to reach out|happy to connect|want me to forward it/],
  ['autoodpowiedź obcej firmy', 3, /grazie per averci contattato|thank you for contacting us|we have received your (request|message)/],
]

/** Sygnały, że to klient albo sprawa firmy — odejmują punkty. */
const BUSINESS = /voucher|rezerwac|przejazd|przejazdz|okrazen|\btor(ze|u|em)?\b|termin|jazd[aeyu]|kierownic|porsche|bmw|supra|yaris|gt3|mybenefit|benefit system|kafeteri|katalog marzen|\bbon\b/

const OUR_THREAD = /(rezerwacja potwierdzona|wiadomosc od|zamowienie|fastline supercars|sport driving experience)/

/** Bez polskich znaków i wielkich liter — reguły piszemy raz, w ASCII. */
export function fold(s: string): string {
  return String(s ?? '')
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
}

const stripHtml = (h: string) =>
  String(h ?? '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

export function bareAddr(v: string): string {
  const m = String(v || '').match(/<([^>]+)>/)
  return (m ? m[1] : String(v || '')).trim().toLowerCase()
}

const domainOf = (addr: string) => addr.split('@')[1] || ''
const sameOrSub = (d: string, base: string) => d === base || d.endsWith('.' + base)

function listHit(list: string[] | undefined, addr: string): string | null {
  const dom = domainOf(addr)
  for (const raw of list ?? []) {
    const e = raw.trim().toLowerCase()
    if (!e) continue
    if (e.includes('@') ? e === addr : sameOrSub(dom, e.replace(/^@/, ''))) return e
  }
  return null
}

/** Wyniki SPF / DKIM / DMARC z nagłówka Authentication-Results dopisanego przez SES. */
function auth(h: Record<string, string>) {
  const ar = h['authentication-results'] || ''
  const spf = (ar.match(/\bspf=(\w+)/) || [])[1] || 'none'
  const dmarc = (ar.match(/\bdmarc=(\w+)/) || [])[1] || 'none'
  const dkimPass = [...ar.matchAll(/dkim=pass header\.i=@?([\w.-]+)/g)].map((m) => m[1].toLowerCase())
  return { spf, dmarc, dkimPass }
}

/** Losowy ciąg udający imię: `ZLOzseCgvTngIljLBDni`, `jjXIDHyYyfyDVMosGIT`. */
function gibberishName(name: string): boolean {
  const n = name.trim()
  if (/\s/.test(n) || n.length < 10) return false
  const switches = (n.match(/[a-z][A-Z]/g) || []).length
  return switches >= 3
}

/**
 * Formularz kontaktowy ze strony przychodzi od nas samych (`rezerwacja@`, podpisany DKIM),
 * więc filtr nagłówkowy go nie złapie. Boty wpisują losowe ciągi jako imię i telefon
 * oraz Gmaila z kropkami między literami (`bo.d.an.o.ge1.5.9@gmail.com`).
 */
function contactFormBot(subject: string, text: string, replyTo: string): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  const name = (subject.match(/Wiadomo\S* od (.+)$/) || [])[1] || ''
  if (gibberishName(name)) { score += 4; reasons.push(`formularz: losowe imię „${name.trim().slice(0, 30)}”`) }
  const tel = (text.match(/Tel:\s*([^\n·]+)/) || [])[1] || ''
  if ((tel.match(/[A-Za-z]/g) || []).length >= 5) { score += 4; reasons.push('formularz: litery zamiast telefonu') }
  const local = bareAddr(replyTo).split('@')[0] || ''
  if ((local.match(/\./g) || []).length >= 4) { score += 3; reasons.push('formularz: adres z kropkami między literami') }
  return { score, reasons }
}

export function classify(email: InboundEmail, lists: Lists = {}): Verdict {
  const h: Record<string, string> = {}
  for (const [k, v] of Object.entries(email?.headers ?? {})) h[k.toLowerCase()] = String(v)

  const from = bareAddr(email?.from || '')
  const dom = domainOf(from)
  const subject = String(email?.subject || '')
  const rawText = String(email?.text || '') || stripHtml(String(email?.html || ''))
  const head = fold(subject + ' \n ' + rawText.slice(0, 4000))
  const a = auth(h)
  const signedBy = (base: string) => a.dkimPass.some((d) => sameOrSub(d, base))

  const reasons: string[] = []
  let score = 0
  const add = (n: number, why: string) => { score += n; reasons.push(why) }
  const done = (): Verdict => ({ spam: score >= SPAM_THRESHOLD, score, reasons })

  // 1. Twarde decyzje
  if (/fail/i.test(h['x-ses-virus-verdict'] || '')) { add(100, 'wirus (werdykt SES)'); return done() }

  const blocked = listHit(lists.block, from)
  if (blocked) { add(100, `na liście blokowanych (${blocked})`); return done() }

  // Nasza domena: prawdziwe listy (kopie zamówień, formularz) są podpisane naszym DKIM.
  if (sameOrSub(dom, OWN_DOMAIN)) {
    if (!signedBy(OWN_DOMAIN)) { add(10, 'podszywa się pod naszą domenę (brak podpisu DKIM)'); return done() }
    if (/^\[fastlinesupercars\.pl\] wiadomo/i.test(subject)) {
      const bot = contactFormBot(subject, rawText, h['reply-to'] || '')
      score += bot.score; reasons.push(...bot.reasons)
    }
    return done()
  }

  const allowed = listHit(lists.allow, from)
  if (allowed) { reasons.push(`na liście zaufanych (${allowed})`); return done() }
  if (TRUSTED_DOMAINS.some((d) => sameOrSub(dom, d)) && (signedBy(dom) || a.dmarc === 'pass')) {
    reasons.push('zaufany partner'); return done()
  }

  // 2. Uwierzytelnienie nadawcy
  if (/fail/i.test(h['x-ses-spam-verdict'] || '')) add(4, 'werdykt SES: spam')
  if (a.dmarc === 'fail') add(3, 'DMARC fail')
  else if (a.dmarc !== 'pass' && /^(fail|softfail|none|neutral)$/.test(a.spf)) add(2, `SPF ${a.spf}, brak DMARC`)

  // 3. Podszywanie się pod marki
  // Bez linków: stopka klienta „www.facebook.com/fastlineracingacademy" to nie podszywanie się.
  const subjHead = fold(subject + ' ' + rawText.slice(0, 1500)).replace(/(https?:\/\/|www\.)\S+/g, ' ')
  let strongBrand = false
  for (const b of BRANDS) {
    if (b.domains.some((d) => sameOrSub(dom, d))) continue
    if (b.re.test(subjHead)) {
      add(b.w, `podszywa się pod ${b.name} (nadawca ${dom || '?'})`)
      if (b.w >= 6) strongBrand = true
      if (b.token?.test(dom)) add(3, `domena-podróbka ${dom}`)
      break
    }
  }

  // TestFlight: prawdziwy Apple, ale zaproszenia do „OpenAI/Meta Ads" to znany przekręt.
  if (/testflight/.test(from) && /invited you to test/i.test(subject) && /\b(ads?|openai|meta|gpt)\b/i.test(subject)) {
    add(6, 'TestFlight: fałszywe zaproszenie do „Ads”')
  }

  // 4. Phishing
  let ph = 0
  for (const [why, re] of PHISHING) {
    if (ph >= 9) break
    if (re.test(head)) { add(3, why); ph += 3 }
  }

  // 5. Oferty na zimno, SEO, domeny
  let cs = 0
  for (const [why, n, re] of COLD_SALES) {
    if (cs >= 9) break
    if (re.test(head)) { add(n, why); cs += n }
  }

  // 6. Śmieci bez treści: temat z samych znaków kontrolnych, pusta treść
  const plain = rawText.replace(/\s+/g, '')
  if (/^#?[0-9a-f]{6,}-[0-9a-f]{6,}$/i.test(subject.trim())) add(3, 'temat jak numer seryjny')
  if (plain.length < 4 && !(email?.attachments ?? []).length) add(3, 'pusta treść')
  const cjk = (rawText.match(/[぀-ヿ一-鿿]/g) || []).length
  if (cjk > 20 && cjk / Math.max(plain.length, 1) > 0.2) add(6, 'treść po japońsku/chińsku')
  if (h['list-unsubscribe']) add(1, 'mailing (List-Unsubscribe)')

  // Oferta po angielsku do polskiej firmy — prawie zawsze masówka.
  const sample = rawText.slice(0, 2000)
  const words = sample.split(/\s+/).filter(Boolean).length
  const en = (sample.match(/\b(the|and|your|you|we|our|for|with|to|of|it|if|is|are|me|this|business|website|help)\b/gi) || []).length
  const pl = (sample.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g) || []).length
  if (cs > 0 && pl < 3 && (en >= 8 || (words >= 15 && en / words > 0.2))) add(3, 'masowa oferta po angielsku')

  // 7. Sygnały „to klient" — nie dla listów z cechami phishingu, z marką banku/kuriera
  //    ani z wyraźną ofertą sprzedażową (spam też potrafi napisać „termin" czy „jazda").
  //    Klient wspominający Facebooka albo aplikację dostaje odliczenie normalnie.
  if (ph === 0 && !strongBrand && cs < 6 && a.dmarc !== 'fail') {
    if (BUSINESS.test(head)) add(-3, 'dotyczy voucherów / rezerwacji / jazd')
    if (/^\s*(re|odp|aw|fw|fwd|odp\.)\s*:/i.test(subject) && OUR_THREAD.test(fold(subject))) add(-3, 'odpowiedź w naszym wątku')
    if (FREEMAIL.test(dom) && a.dmarc === 'pass') add(-1, 'prywatna skrzynka z poprawnym podpisem')
  }

  return done()
}
