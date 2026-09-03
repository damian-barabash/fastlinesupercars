// FASTLINESUPERCARS — publiczna funkcja sklepu.
// Akcje: checkout (zamówienie + transakcja Tpay) | checkPromo | order (status) | contact
//        pay — WYŁĄCZNIE tryb testowy, za flagą SHOP_TEST_PAYMENTS=1
//
// Zasada: ceny liczy serwer z tabeli `products`. Klient przysyła tylko id produktu,
// wariant i sztuki — dzięki temu nowy produkt dodany w panelu działa od razu,
// a przesłanej z przeglądarki kwoty nie ma jak podrobić.
//
// Jedno pole „kod" w koszyku obsługuje dwa rodzaje kodów (naraz działa tylko jeden):
//   * `promo_codes` — kod procentowy, wielokrotnego użytku (np. FAST −10%)
//   * `vouchers` z `kind='amount'` — bon kwotowy, jednorazowy (np. 300 zł na koszyk).
//     Bon jest rezerwowany przy zakładaniu zamówienia i wypalany dopiero po potwierdzonej
//     płatności; gdy pokrywa całość, zamówienie realizuje się od razu, bez bramki.
import { CORS, J, db, esc, rpc, SITE, SB_URL, CONTACT_TO, sendMail, mailShell, fulfillOrder } from '../_shared/core.ts'
import { tpayConfigured, tpayCreateTransaction } from '../_shared/tpay.ts'

const TEST_PAYMENTS = Deno.env.get('SHOP_TEST_PAYMENTS') === '1'
const NOTIFY_URL = `${SB_URL}/functions/v1/tpay-notify`

type Item = { product_id: string; variant?: string; qty?: number }
type Customer = { name: string; email: string; phone?: string }
type CheckoutBody = { customer: Customer; gift_for?: string; items: Item[]; promo?: string; return_origin?: string }

/**
 * Adres powrotu z bramki. Bierzemy go z przeglądarki tylko wtedy, gdy jest na białej liście —
 * inaczej ktoś mógłby podstawić własną stronę „potwierdzenia płatności".
 */
function returnOrigin(raw?: string) {
  const o = (raw || '').replace(/\/$/, '')
  if (!o) return SITE
  if (o === SITE) return o
  // własna domena i jej subdomeny (draft.fastlinesupercars.pl, www., docelowo apex)
  if (/^https:\/\/([a-z0-9-]+\.)*fastlinesupercars\.pl$/i.test(o)) return o
  if (/^http:\/\/localhost(:\d+)?$/.test(o)) return o           // praca lokalna
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(o)) return o    // podgląd na GitHub Pages
  return SITE
}

const normCode = (raw?: string) => (raw || '').trim().toUpperCase().replace(/\s+/g, '')
const CODE_RE = /^[A-Z0-9_-]{2,32}$/

/** Kod rabatowy z tabeli `promo_codes` (tylko aktywne). Zwraca null, gdy kodu nie ma. */
async function getPromo(raw?: string) {
  const code = normCode(raw)
  if (!code || !CODE_RE.test(code)) return null
  const rows = await db(`promo_codes?code=eq.${encodeURIComponent(code)}&active=is.true&select=code,percent,min_grosze`)
  const r = rows?.[0]
  if (!r || !(+r.percent > 0)) return null
  return { code: r.code as string, percent: +r.percent, min: +(r.min_grosze || 0) }
}

type Applied = { kind: 'promo' | 'voucher'; code: string; percent?: number; amount?: number; discount: number }

/**
 * Rozpoznaje wpisany kod: najpierw kod procentowy, potem bon kwotowy.
 * Zwraca `{ applied }` albo `{ error }` z komunikatem po polsku (trafia wprost do koszyka).
 * Nic tu nie rezerwuje — to tylko wycena; blokadę bonu zakłada dopiero `checkout`.
 */
async function resolveCode(raw: string | undefined, subtotal: number): Promise<{ applied?: Applied; error?: string; unknown?: boolean }> {
  const code = normCode(raw)
  if (!code || !CODE_RE.test(code)) return { error: 'Nieprawidłowy kod rabatowy', unknown: true }

  const promo = await getPromo(code)
  if (promo) {
    if (subtotal < promo.min)
      return { error: `Kod ${promo.code} działa przy zakupach od ${(promo.min / 100).toFixed(0)} zł` }
    return { applied: { kind: 'promo', code: promo.code, percent: promo.percent, discount: Math.round(subtotal * promo.percent / 100) } }
  }

  const v = (await db(`vouchers?code=eq.${encodeURIComponent(code)}&select=id,code,kind,status,valid_until,amount_grosze,reserved_until`))?.[0]
  if (!v) return { error: 'Nieprawidłowy kod rabatowy', unknown: true }

  // kod vouchera na przejazd wpisany w koszyku — częsta pomyłka, warto wytłumaczyć
  if (v.kind !== 'amount')
    return { error: 'Ten kod to voucher na przejazd — nie płaci się nim w koszyku. Termin zarezerwujesz w zakładce Kalendarz.' }

  if (v.status !== 'active') return { error: `Voucher ${v.code} został już wykorzystany` }
  if (String(v.valid_until) < new Date().toISOString().slice(0, 10))
    return { error: `Voucher ${v.code} stracił ważność ${String(v.valid_until).split('-').reverse().join('.')}` }
  const used = (await db(`voucher_redemptions?voucher_id=eq.${v.id}&select=id`))?.length
  if (used) return { error: `Voucher ${v.code} został już wykorzystany` }
  if (v.reserved_until && new Date(v.reserved_until) > new Date())
    return { error: `Voucher ${v.code} jest właśnie używany przy innym zamówieniu. Spróbuj za chwilę.` }

  const amount = +(v.amount_grosze || 0)
  if (amount <= 0) return { error: `Voucher ${v.code} nie ma ustalonej wartości` }
  // bon jest jednorazowy: przy tańszym koszyku odejmujemy tyle, ile trzeba, a reszta przepada
  return { applied: { kind: 'voucher', code: v.code, amount, discount: Math.min(amount, subtotal) } }
}

/** Komunikat dla klienta z kodu błędu funkcji SQL `voucher_reserve`. */
function reserveError(err = '') {
  if (err.includes('VOUCHER_BUSY')) return 'Ten voucher jest właśnie używany przy innym zamówieniu. Spróbuj za chwilę.'
  if (err.includes('VOUCHER_EXPIRED')) return 'Ten voucher stracił ważność.'
  if (err.includes('VOUCHER_USED')) return 'Ten voucher został już wykorzystany.'
  if (err.includes('VOUCHER_NOT_FOUND') || err.includes('VOUCHER_NO_AMOUNT')) return 'Nieprawidłowy kod vouchera.'
  return 'Nie udało się zastosować vouchera. Spróbuj ponownie.'
}

/** Adres klienta zza proxy Supabase — do hamulca na zgadywanie kodów. */
const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60) || 'nieznany'

/**
 * Bon kwotowy jest wart realne pieniądze, więc pole „kod" nie może być darmową wyrocznią:
 * po 20 strzałach w nieistniejący kod z jednego adresu w 10 minut odpowiadamy 429.
 * Liczymy tylko kody, których w bazie w ogóle nie ma — pomyłka przy prawdziwym kodzie
 * (za mały koszyk, wygasły bon) nie zabiera klientowi prób.
 */
async function tooManyCodeTries(ip: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const rows = await db(`code_attempts?ip=eq.${encodeURIComponent(ip)}&at=gte.${since}&select=id`)
  return (rows?.length || 0) >= 20
}
async function noteCodeTry(ip: string, code: string) {
  try {
    await db('code_attempts', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ip, code: code.slice(0, 40) }),
    })
    // sprzątanie co jakiś czas, żeby tabela nie rosła w nieskończoność
    if (Math.random() < 0.05)
      await db(`code_attempts?at=lt.${new Date(Date.now() - 24 * 3600 * 1000).toISOString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  } catch (e) { console.error('code_attempts', e) }
}

type Line = { product_id: string; name: string; variant: string; price: number; qty: number }
type Built = { error?: Response; lines?: Line[]; subtotal?: number; discount?: number; applied?: Applied; total?: number }

/** Buduje pozycje zamówienia i sumę na podstawie aktualnych danych z bazy. */
async function buildOrder(body: CheckoutBody): Promise<Built> {
  const { customer, items } = body
  if (!customer?.name?.trim() || !customer?.email || !/.+@.+\..+/.test(customer.email))
    return { error: J({ error: 'Nieprawidłowe dane klienta' }, 400) }
  if (!Array.isArray(items) || !items.length) return { error: J({ error: 'Pusty koszyk' }, 400) }
  if (items.length > 20) return { error: J({ error: 'Za dużo pozycji w koszyku' }, 400) }

  const prods = await db(`products?select=*&active=eq.true`)
  const lines: { product_id: string; name: string; variant: string; price: number; qty: number }[] = []
  for (const it of items) {
    const p = prods.find((x: { id: string }) => x.id === it.product_id)
    if (!p) return { error: J({ error: `Nieznany produkt: ${it.product_id}` }, 400) }
    const qty = Math.min(Math.max(1, Math.floor(Number(it.qty) || 1)), 10)
    let price = p.price_from, variant = ''
    if (Array.isArray(p.variants) && p.variants.length) {
      const v = p.variants.find((v: { laps: string }) => v.laps === it.variant) || null
      if (!v) return { error: J({ error: `Wybierz liczbę okrążeń dla: ${p.name}` }, 400) }
      price = v.price; variant = v.laps
    }
    if (!Number.isFinite(price) || price <= 0)
      return { error: J({ error: `Produkt bez ceny: ${p.name}` }, 400) }
    lines.push({ product_id: p.id, name: p.name, variant, price, qty })
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)

  if (subtotal <= 0) return { error: J({ error: 'Nieprawidłowa kwota zamówienia' }, 400) }

  let discount = 0
  let applied: Applied | undefined
  if (body.promo) {
    const r = await resolveCode(body.promo, subtotal)
    if (r.error || !r.applied) return { error: J({ error: r.error || 'Nieprawidłowy kod rabatowy' }, 400) }
    applied = r.applied
    discount = Math.min(r.applied.discount, subtotal)   // do zera, nigdy poniżej
  }
  return { lines, subtotal, discount, applied, total: subtotal - discount }
}

/** Zamówienie + transakcja Tpay. Zwraca link do płatności — front tylko przekierowuje. */
async function checkout(body: CheckoutBody) {
  const built = await buildOrder(body)
  if (built.error) return built.error

  // prosty hamulec: jeden adres nie zakłada dziesiątek zamówień w kilka minut
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const recent = await db(`orders?customer_email=eq.${encodeURIComponent(body.customer.email.trim())}&created_at=gte.${since}&select=id`)
  if ((recent?.length || 0) >= 10) return J({ error: 'Zbyt wiele prób płatności. Spróbuj za kilka minut.' }, 429)

  const applied = built.applied
  let discount = built.discount!, total = built.total!

  const [order] = await db('orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_name: body.customer.name.trim(), customer_email: body.customer.email.trim(),
      customer_phone: (body.customer.phone || '').trim(), gift_for: (body.gift_for || '').trim(),
      items: built.lines, total, status: 'pending',
      subtotal_grosze: built.subtotal, discount_grosze: discount,
      discount_code: applied?.code || null, discount_kind: applied?.kind || null,
      // `notes` zostaje w dawnym formacie — na nim opiera się licznik użyć kodów w panelu
      notes: applied ? `promo:${applied.code} -${(discount / 100).toFixed(2)} zł` : '',
    }),
  })

  // Bon kwotowy blokujemy dopiero teraz, na konkretne zamówienie i atomowo (funkcja SQL),
  // żeby ten sam kod nie opłacił dwóch zamówień równolegle.
  if (applied?.kind === 'voucher') {
    const res = await rpc('voucher_reserve', { p_code: applied.code, p_order: order.id, p_subtotal: built.subtotal })
    if (!res.ok) {
      await db(`orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled', payment_error: `voucher: ${(res.error || '').slice(0, 200)}` }),
      })
      return J({ error: reserveError(res.error) }, 409)
    }
    // nominał mógł się zmienić między wyceną a rezerwacją — obowiązuje to, co zwróciła baza
    const realApplied = Math.min(+(res.data?.[0]?.v_applied || 0), built.subtotal!)
    if (realApplied !== discount) {
      discount = realApplied
      total = built.subtotal! - discount
      await db(`orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ total, discount_grosze: discount, notes: `promo:${applied.code} -${(discount / 100).toFixed(2)} zł` }),
      })
    }
  }

  // Bon pokrył całe zamówienie — nie ma czego wysyłać do bramki, realizujemy od razu.
  if (total === 0) {
    try {
      await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ payment_method: 'voucher' }) })
      const res = await fulfillOrder({ ...order, total, discount_grosze: discount, discount_code: applied!.code, discount_kind: applied!.kind }, 0)
      console.log(`checkout: #${order.number} opłacone voucherem ${applied!.code} → ${res.code}`)
      return J({ order_id: order.id, number: order.number, total: 0, paid: true, voucher_code: res.code })
    } catch (e) {
      console.error('checkout: realizacja zamówienia na 0 zł', e)
      await rpc('voucher_release', { p_order: order.id })   // kod ma wrócić do obiegu
      await db(`orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled', payment_error: String(e).slice(0, 300) }),
      })
      return J({ error: 'Nie udało się dokończyć zamówienia. Napisz do nas: ' + CONTACT_TO }, 502)
    }
  }

  // Tryb testowy (sekret SHOP_TEST_PAYMENTS=1) omija bramkę — w produkcji musi być wyłączony.
  if (TEST_PAYMENTS) {
    console.warn('checkout: TRYB TESTOWY — zamówienie bez realnej płatności')
    return J({ order_id: order.id, number: order.number, total, test_mode: true })
  }
  if (!tpayConfigured()) {
    console.error('checkout: brak konfiguracji Tpay')
    if (applied?.kind === 'voucher') await rpc('voucher_release', { p_order: order.id })
    return J({ error: 'Płatności online są chwilowo niedostępne. Napisz do nas: ' + CONTACT_TO }, 503)
  }

  try {
    const back = returnOrigin(body.return_origin)
    const desc = `Fastline Supercars — zamówienie #${order.number}`
    const tx = await tpayCreateTransaction({
      amountGrosze: total,
      description: desc,
      hiddenDescription: order.id,          // wraca jako tr_crc w powiadomieniu
      payerEmail: order.customer_email,
      payerName: order.customer_name,
      payerPhone: order.customer_phone || undefined,
      notificationUrl: NOTIFY_URL,
      successUrl: `${back}/dziekujemy?order=${order.id}`,
      errorUrl: `${back}/dziekujemy?order=${order.id}&error=1`,
    })
    await db(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tpay_id: tx.transactionId, tpay_title: tx.title, payment_url: tx.transactionPaymentUrl }),
    })
    return J({ order_id: order.id, number: order.number, total, payment_url: tx.transactionPaymentUrl })
  } catch (e) {
    console.error('checkout: tpay', e)
    // transakcja nie powstała — bon musi wrócić do obiegu, inaczej wisiałby zablokowany 2 h
    if (applied?.kind === 'voucher') await rpc('voucher_release', { p_order: order.id })
    await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ payment_error: String(e).slice(0, 300) }) })
    return J({ error: 'Nie udało się rozpocząć płatności. Spróbuj ponownie lub napisz: ' + CONTACT_TO }, 502)
  }
}

/** Wycena kodu w koszyku — kod procentowy albo bon kwotowy. Nic nie rezerwuje. */
async function checkPromo(body: { promo: string; subtotal: number }, ip: string) {
  const subtotal = Math.max(0, Math.round(Number(body.subtotal) || 0))
  if (await tooManyCodeTries(ip))
    return J({ valid: false, error: 'Zbyt wiele prób. Spróbuj za kilka minut.' }, 429)

  const r = await resolveCode(body.promo, subtotal)
  if (r.error || !r.applied) {
    if (r.unknown) await noteCodeTry(ip, normCode(body.promo))
    return J({ valid: false, error: r.error || 'Nieprawidłowy kod rabatowy' })
  }
  const a = r.applied
  return J({
    valid: true, kind: a.kind, code: a.code, discount: a.discount,
    ...(a.kind === 'promo' ? { percent: a.percent } : { amount: a.amount, covers_all: a.discount >= subtotal }),
  })
}

/** Tryb testowy — bez płatności. Domyślnie wyłączony; w produkcji NIE włączać. */
async function payTest(body: { order_id: string }) {
  if (!TEST_PAYMENTS) return J({ error: 'not allowed' }, 403)
  const order = (await db(`orders?id=eq.${body.order_id}&select=*`))?.[0]
  if (!order) return J({ error: 'Nie znaleziono zamówienia' }, 404)
  const res = await fulfillOrder(order, order.total)
  return J({ status: 'paid', voucher_code: res.code, valid_until: res.valid_until, test_mode: true })
}

/** Status zamówienia — używane przez stronę „Dziękujemy" (id zamówienia = UUID, nie do zgadnięcia). */
async function getOrder(body: { order_id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(body.order_id || '')) return J({ error: 'not found' }, 404)
  const o = (await db(`orders?id=eq.${body.order_id}&select=id,number,status,total,items,customer_name,customer_email,voucher_id,payment_url,discount_grosze,discount_code,discount_kind`))?.[0]
  if (!o) return J({ error: 'not found' }, 404)
  let voucher = null
  if (o.voucher_id) voucher = (await db(`vouchers?id=eq.${o.voucher_id}&select=code,valid_until,status`))?.[0]
  return J({
    id: o.id, number: o.number, status: o.status, total: o.total, items: o.items,
    customer_name: o.customer_name, customer_email: o.customer_email,
    discount: o.discount_grosze || 0, discount_code: o.discount_code || '', discount_kind: o.discount_kind || '',
    payment_url: o.status === 'pending' ? o.payment_url : null,
    voucher,
  })
}

async function contact(body: { name: string; email: string; phone?: string; message: string }) {
  if (!body?.name || !body?.email || !body?.message) return J({ error: 'Uzupełnij wszystkie pola' }, 400)
  if (!/.+@.+\..+/.test(body.email)) return J({ error: 'Nieprawidłowy adres e-mail' }, 400)
  const name = esc(body.name).slice(0, 200)
  const html = mailShell(`
    <div style="color:#c8102e;font-size:12px;letter-spacing:3px;font-weight:bold">FORMULARZ KONTAKTOWY</div>
    <h1 style="color:#fff;font-size:20px;margin:10px 0">Wiadomość od: ${name}</h1>
    <p style="color:#b9b9c0;font-size:14px">E-mail: ${esc(body.email)}${body.phone ? ` · Tel: ${esc(body.phone)}` : ''}</p>
    <p style="color:#fff;font-size:14px;line-height:1.8;white-space:pre-wrap">${esc(body.message).slice(0, 4000)}</p>
  `)
  const sent = await sendMail(CONTACT_TO, `[fastlinesupercars.pl] Wiadomość od ${name}`, html, undefined, body.email)
  if (!sent.ok) return J({ error: 'Nie udało się wysłać wiadomości', detail: sent.err }, 502)
  return J({ ok: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { action, ...body } = await req.json()
    if (action === 'checkout') return await checkout(body)
    if (action === 'createOrder') return await checkout(body)   // stara nazwa = ta sama ścieżka
    if (action === 'checkPromo') return await checkPromo(body, clientIp(req))
    if (action === 'order') return await getOrder(body)
    if (action === 'contact') return await contact(body)
    if (action === 'pay') return await payTest(body)
    if (action === 'health') return J({ ok: true, tpay: tpayConfigured(), test_payments: TEST_PAYMENTS, site: SITE, notify: NOTIFY_URL })
    return J({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return J({ error: String(e) }, 500)
  }
})
