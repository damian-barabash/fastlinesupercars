// FASTLINESUPERCARS — publiczna funkcja sklepu.
// Akcje: checkout (zamówienie + transakcja Tpay) | checkPromo | order (status) | contact
//        pay — WYŁĄCZNIE tryb testowy, za flagą SHOP_TEST_PAYMENTS=1
//
// Zasada: ceny liczy serwer z tabeli `products`. Klient przysyła tylko id produktu,
// wariant i sztuki — dzięki temu nowy produkt dodany w panelu działa od razu,
// a przesłanej z przeglądarki kwoty nie ma jak podrobić.
import { CORS, J, db, esc, SITE, SB_URL, CONTACT_TO, sendMail, mailShell, fulfillOrder } from '../_shared/core.ts'
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
  if (/^http:\/\/localhost(:\d+)?$/.test(o)) return o          // praca lokalna
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(o)) return o   // podgląd na GitHub Pages
  return SITE
}

async function getPromo() {
  const rows = await db(`settings?key=in.(promo_code,promo_percent,promo_min_grosze)&select=key,value`)
  const m: Record<string, string> = {}
  for (const r of rows || []) m[r.key] = r.value
  return { code: (m.promo_code || '').trim(), percent: +(m.promo_percent || 0), min: +(m.promo_min_grosze || 0) }
}

type Line = { product_id: string; name: string; variant: string; price: number; qty: number }
type Built = { error?: Response; lines?: Line[]; subtotal?: number; discount?: number; promoUsed?: string; total?: number }

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

  let discount = 0, promoUsed = ''
  if (body.promo) {
    const promo = await getPromo()
    if (promo.code && body.promo.trim().toUpperCase() === promo.code.toUpperCase() && promo.percent > 0) {
      if (subtotal < promo.min) return { error: J({ error: `Kod ${promo.code} działa od ${(promo.min / 100).toFixed(0)} zł` }, 400) }
      discount = Math.round(subtotal * promo.percent / 100)
      promoUsed = promo.code.toUpperCase()
    } else {
      return { error: J({ error: 'Nieprawidłowy kod rabatowy' }, 400) }
    }
  }
  const total = subtotal - discount
  if (total <= 0) return { error: J({ error: 'Nieprawidłowa kwota zamówienia' }, 400) }
  return { lines, subtotal, discount, promoUsed, total }
}

/** Zamówienie + transakcja Tpay. Zwraca link do płatności — front tylko przekierowuje. */
async function checkout(body: CheckoutBody) {
  const built = await buildOrder(body)
  if (built.error) return built.error

  // prosty hamulec: jeden adres nie zakłada dziesiątek zamówień w kilka minut
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const recent = await db(`orders?customer_email=eq.${encodeURIComponent(body.customer.email.trim())}&created_at=gte.${since}&select=id`)
  if ((recent?.length || 0) >= 10) return J({ error: 'Zbyt wiele prób płatności. Spróbuj za kilka minut.' }, 429)

  const [order] = await db('orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_name: body.customer.name.trim(), customer_email: body.customer.email.trim(),
      customer_phone: (body.customer.phone || '').trim(), gift_for: (body.gift_for || '').trim(),
      items: built.lines, total: built.total, status: 'pending',
      notes: built.promoUsed ? `promo:${built.promoUsed} -${(built.discount! / 100).toFixed(2)} zł` : '',
    }),
  })

  // Tryb testowy (sekret SHOP_TEST_PAYMENTS=1) omija bramkę — w produkcji musi być wyłączony.
  if (TEST_PAYMENTS) {
    console.warn('checkout: TRYB TESTOWY — zamówienie bez realnej płatności')
    return J({ order_id: order.id, number: order.number, total: order.total, test_mode: true })
  }
  if (!tpayConfigured()) {
    console.error('checkout: brak konfiguracji Tpay')
    return J({ error: 'Płatności online są chwilowo niedostępne. Napisz do nas: ' + CONTACT_TO }, 503)
  }

  try {
    const back = returnOrigin(body.return_origin)
    const desc = `Fastline Supercars — zamówienie #${order.number}`
    const tx = await tpayCreateTransaction({
      amountGrosze: order.total,
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
    return J({ order_id: order.id, number: order.number, total: order.total, payment_url: tx.transactionPaymentUrl })
  } catch (e) {
    console.error('checkout: tpay', e)
    await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ payment_error: String(e).slice(0, 300) }) })
    return J({ error: 'Nie udało się rozpocząć płatności. Spróbuj ponownie lub napisz: ' + CONTACT_TO }, 502)
  }
}

async function checkPromo(body: { promo: string; subtotal: number }) {
  const promo = await getPromo()
  if (!promo.code || (body.promo || '').trim().toUpperCase() !== promo.code.toUpperCase())
    return J({ valid: false, error: 'Nieprawidłowy kod rabatowy' })
  if ((body.subtotal || 0) < promo.min)
    return J({ valid: false, error: `Kod ${promo.code} działa przy zakupach od ${(promo.min / 100).toFixed(0)} zł` })
  return J({ valid: true, percent: promo.percent, discount: Math.round((body.subtotal || 0) * promo.percent / 100) })
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
  const o = (await db(`orders?id=eq.${body.order_id}&select=id,number,status,total,items,customer_name,customer_email,voucher_id,payment_url`))?.[0]
  if (!o) return J({ error: 'not found' }, 404)
  let voucher = null
  if (o.voucher_id) voucher = (await db(`vouchers?id=eq.${o.voucher_id}&select=code,valid_until,status`))?.[0]
  return J({
    id: o.id, number: o.number, status: o.status, total: o.total, items: o.items,
    customer_name: o.customer_name, customer_email: o.customer_email,
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
    if (action === 'checkPromo') return await checkPromo(body)
    if (action === 'order') return await getOrder(body)
    if (action === 'contact') return await contact(body)
    if (action === 'pay') return await payTest(body)
    if (action === 'health') return J({ ok: true, tpay: tpayConfigured(), test_payments: TEST_PAYMENTS })
    return J({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return J({ error: String(e) }, 500)
  }
})
