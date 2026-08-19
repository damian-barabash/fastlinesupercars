// FASTLINESUPERCARS — webhook Tpay (jedyne miejsce, które oznacza zamówienie jako opłacone).
// Wdrażane z --no-verify-jwt (Tpay nie wyśle nagłówka apikey).
//
// Bezpieczeństwo, warstwami:
//   1. podpis X-JWS-Signature (RS256, certyfikat Tpay z x5u, łańcuch do root CA Tpay) — wymagany
//   2. opcjonalnie md5sum (gdy ustawione TPAY_MERCHANT_ID + TPAY_SECURITY_CODE)
//   3. kwota i identyfikator zamówienia porównywane z bazą — kwoty NIGDY nie bierzemy z żądania
import { db, fulfillOrder } from '../_shared/core.ts'
import { verifyTpayJws, md5 } from '../_shared/tpay.ts'

const MERCHANT_ID = Deno.env.get('TPAY_MERCHANT_ID') ?? ''
const SECURITY_CODE = Deno.env.get('TPAY_SECURITY_CODE') ?? ''
const SKIP_JWS = Deno.env.get('TPAY_SKIP_JWS') === '1'

const TRUE = (s = 200) => new Response('TRUE', { status: s, headers: { 'Content-Type': 'text/plain' } })
const FAIL = (msg: string, s = 400) => {
  console.error('tpay-notify odrzucone:', msg)
  return new Response(`FALSE ${msg}`, { status: s, headers: { 'Content-Type': 'text/plain' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return FAIL('tylko POST', 405)
  const raw = await req.text()

  // 1. podpis
  const sig = req.headers.get('x-jws-signature') || req.headers.get('X-JWS-Signature')
  if (sig) {
    const v = await verifyTpayJws(sig, raw)
    if (!v.ok) return FAIL(`podpis JWS: ${v.err}`, 403)
  } else if (SKIP_JWS) {
    console.warn('tpay-notify: BRAK podpisu JWS, przepuszczone przez TPAY_SKIP_JWS=1')
  } else {
    return FAIL('brak nagłówka X-JWS-Signature', 403)
  }

  const f = new URLSearchParams(raw)
  const trCrc = f.get('tr_crc') || ''
  const trId = f.get('tr_id') || ''
  const trAmount = f.get('tr_amount') || '0'
  const trPaid = f.get('tr_paid') || '0'
  const trStatus = (f.get('tr_status') || '').toLowerCase()
  const currency = (f.get('tr_currency') || 'PLN').toUpperCase()

  // 2. md5sum (jeśli skonfigurowane)
  if (MERCHANT_ID && SECURITY_CODE) {
    const expected = await md5(`${MERCHANT_ID}${trId}${trAmount}${trCrc}${SECURITY_CODE}`)
    if ((f.get('md5sum') || '').toLowerCase() !== expected) return FAIL('md5sum nie zgadza się', 403)
  }

  if (!/^[0-9a-f-]{36}$/i.test(trCrc)) return FAIL(`tr_crc nie jest id zamówienia: ${trCrc}`)
  const order = (await db(`orders?id=eq.${trCrc}&select=*`))?.[0]
  if (!order) return FAIL(`nie znaleziono zamówienia ${trCrc}`, 404)

  // zwrot / obciążenie zwrotne — unieważniamy voucher
  if (trStatus === 'chargeback') {
    await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'chargeback' }) })
    if (order.voucher_id)
      await db(`vouchers?id=eq.${order.voucher_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
    console.warn(`tpay-notify: chargeback zamówienia #${order.number}`)
    return TRUE()
  }

  if (trStatus !== 'true') {
    await db(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_error: `tr_status=${trStatus} ${f.get('tr_error') || ''}`.trim() }),
    })
    return TRUE() // powiadomienie przyjęte, ale zamówienie nieopłacone
  }

  // 3. kwota — porównujemy z sumą policzoną przez serwer przy tworzeniu zamówienia
  const paidGrosze = Math.round(parseFloat(trPaid.replace(',', '.')) * 100)
  if (currency !== 'PLN') return FAIL(`waluta ${currency}`, 400)
  if (!Number.isFinite(paidGrosze) || paidGrosze < order.total) {
    await db(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_error: `niedopłata: ${trPaid} z ${(order.total / 100).toFixed(2)}`, paid_amount: paidGrosze }),
    })
    return FAIL(`niedopłata dla #${order.number}: ${trPaid} < ${(order.total / 100).toFixed(2)}`)
  }

  // UWAGA: w powiadomieniu `tr_id` to czytelny tytuł transakcji (TR-XXX-XXXXXXX),
  // a nie ULID zwracany przy tworzeniu — porównujemy więc z `tpay_title`.
  if (trId && order.tpay_title && order.tpay_title !== trId && order.tpay_id !== trId)
    console.warn(`tpay-notify: #${order.number} tr_id ${trId} ≠ zapisane ${order.tpay_title} / ${order.tpay_id}`)

  try {
    const res = await fulfillOrder(order, paidGrosze)
    console.log(`tpay-notify: #${order.number} ${res.already ? 'już opłacone' : 'opłacone → voucher ' + res.code}`)
  } catch (e) {
    // TRUE nie zwracamy — Tpay ponowi powiadomienie i voucher powstanie przy kolejnej próbie
    console.error('tpay-notify: realizacja nie powiodła się', e)
    return FAIL('błąd realizacji zamówienia', 500)
  }
  return TRUE()
})
