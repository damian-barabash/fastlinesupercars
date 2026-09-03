// FASTLINESUPERCARS — wspólny rdzeń funkcji edge (baza, storage, PDF vouchera, maile,
// realizacja opłaconego zamówienia). Używane przez `shop` i `tpay-notify`.
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'

export const SB_URL = Deno.env.get('SUPABASE_URL')!
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const RESEND_KEY = Deno.env.get('RESEND_KEY') ?? ''
export const FROM = Deno.env.get('SHOP_FROM_EMAIL') ?? 'Fastline Supercars <rezerwacja@fastlinesupercars.pl>'
export const CONTACT_TO = 'rezerwacje@fastlinesupercars.pl'
export const SITE = (Deno.env.get('SITE_URL') ?? 'https://fastlinesupercars.pl').replace(/\/$/, '')

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const J = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

export async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`db ${path}: ${r.status} ${await r.text()}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

/**
 * Wywołanie funkcji SQL (`/rest/v1/rpc/...`). Operacje na bonach kwotowych muszą być atomowe,
 * a tego nie da się zrobić kilkoma zapytaniami REST — stąd funkcje w bazie (migracja 004).
 * Zwraca `{ ok, data, error }` zamiast rzucać, bo błąd („bon zajęty") jest tu normalną odpowiedzią.
 */
export async function rpc(fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const txt = await r.text()
  let body: any = null
  try { body = txt ? JSON.parse(txt) : null } catch { /* nie-JSON zostaje w tekście */ }
  if (!r.ok) return { ok: false, error: String(body?.message || txt || r.status) }
  return { ok: true, data: body }
}

// UWAGA: żądania do Storage z wnętrza funkcji edge wymagają nagłówka `apikey`,
// sam Authorization nie wystarcza (Kong zwraca 400).
export async function storageGet(path: string): Promise<ArrayBuffer> {
  const r = await fetch(`${SB_URL}/storage/v1/object/vouchery/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  })
  if (!r.ok) throw new Error(`storage get ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return await r.arrayBuffer()
}

export async function storagePut(path: string, body: Uint8Array, type: string) {
  const r = await fetch(`${SB_URL}/storage/v1/object/vouchery/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': type, 'x-upsert': 'true' },
    body,
  })
  if (!r.ok) throw new Error(`storage put ${path}: ${r.status} ${await r.text()}`)
}

export function voucherCode() {
  const chars = 'ABCDEFGHJKLMNPRSTUWXYZ23456789'
  const rnd = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += chars[rnd[i] % chars.length] }
  return `FS-${s}`
}

export const zl = (g: number) => (g / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' zł'
export const b64 = (u8: Uint8Array) => {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode(...u8.subarray(i, i + chunk))
  return btoa(bin)
}
export const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ---------- PDF ----------
// Layout: fractions of image size; x = text center, y = top of text, size = of height.
export const DEFAULT_LAYOUT = {
  name: { x: 0.235, y: 0.335, size: 0.085, maxW: 0.40 },
  items: { x: 0.235, y: 0.575, size: 0.048, maxW: 0.42, gap: 0.062 },
  valid: { x: 0.792, y: 0.908, size: 0.030 },
  code: { x: 0.792, y: 0.9515, size: 0.030 },
}
type Layout = typeof DEFAULT_LAYOUT

export async function makeVoucherPdf(opts: {
  template: string; recipient: string; lines: string[]; validUntil: string; code: string; layout?: Partial<Layout>
}): Promise<Uint8Array> {
  const [jpgBuf, fontSemi, fontBold] = await Promise.all([
    storageGet(opts.template),
    storageGet('assets/Oswald-SemiBold.ttf'),
    storageGet('assets/Oswald-Bold.ttf'),
  ])
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const [semi, bold] = await Promise.all([pdf.embedFont(fontSemi), pdf.embedFont(fontBold)])
  const img = await pdf.embedJpg(jpgBuf)
  const SCALE = 0.25
  const W = img.width * SCALE, H = img.height * SCALE
  const page = pdf.addPage([W, H])
  page.drawImage(img, { x: 0, y: 0, width: W, height: H })

  const white = rgb(1, 1, 1)
  const L: Layout = {
    name: { ...DEFAULT_LAYOUT.name, ...(opts.layout?.name || {}) },
    items: { ...DEFAULT_LAYOUT.items, ...(opts.layout?.items || {}) },
    valid: { ...DEFAULT_LAYOUT.valid, ...(opts.layout?.valid || {}) },
    code: { ...DEFAULT_LAYOUT.code, ...(opts.layout?.code || {}) },
  }

  const fitSize = (text: string, font: typeof bold, want: number, maxW: number) => {
    let s = want
    while (s > 8 && font.widthOfTextAtSize(text, s) > maxW) s -= 1
    return s
  }
  const drawAt = (text: string, cx: number, top: number, font: typeof bold, size: number) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: cx * W - w / 2, y: H - top * H - size, size, font, color: white })
  }

  const name = opts.recipient.toUpperCase()
  const nameSize = fitSize(name, bold, H * L.name.size, W * L.name.maxW)
  drawAt(name, L.name.x, L.name.y, bold, nameSize)

  let top = L.items.y
  for (const raw of opts.lines.slice(0, 5)) {
    const line = raw.toUpperCase()
    const s = fitSize(line, semi, H * L.items.size, W * L.items.maxW)
    drawAt(line, L.items.x, top, semi, s)
    top += L.items.gap
  }

  drawAt(`Ważność: ${opts.validUntil}`, L.valid.x, L.valid.y, semi, H * L.valid.size)
  drawAt(`Kod vouchera: ${opts.code}`, L.code.x, L.code.y, semi, H * L.code.size)

  return await pdf.save()
}

// ---------- maile ----------
export async function sendMail(
  to: string, subject: string, html: string,
  attachments?: { filename: string; content: string }[],
  replyTo?: string,
): Promise<{ ok: boolean; err?: string }> {
  if (!RESEND_KEY) { console.error('resend: brak RESEND_KEY'); return { ok: false, err: 'no-key' } }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, attachments, ...(replyTo ? { reply_to: replyTo } : {}) }),
    })
    const txt = await r.text()
    if (!r.ok) { console.error('resend fail', r.status, txt); return { ok: false, err: `${r.status} ${txt.slice(0, 200)}` } }
    return { ok: true }
  } catch (e) {
    console.error('resend throw', e)
    return { ok: false, err: String(e) }
  }
}

export const mailShell = (inner: string) => `
<div style="margin:0;padding:0;background:#0d0d0f;font-family:Arial,Helvetica,sans-serif">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0f;padding:24px 0">
  <tr><td align="center">
   <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
    <tr><td style="background:#c8102e;height:6px;font-size:0">&nbsp;</td></tr>
    <tr><td style="background:#131316;padding:28px 36px">
      <img src="${SB_URL}/storage/v1/object/public/media/brand/logo-grey.png" alt="Fastline Supercars" width="190" style="display:block;width:190px;height:auto" />
      <div style="color:#8a8a92;font-size:11px;letter-spacing:3px;margin-top:10px">#SPORTDRIVINGEXPERIENCE</div>
    </td></tr>
    <tr><td style="background:#1a1a1e;padding:36px">${inner}</td></tr>
    <tr><td style="background:#131316;padding:20px 36px;color:#8a8a92;font-size:12px;line-height:1.7">
      rezerwacje@fastlinesupercars.pl · pon–pt 10:00–17:00<br>
      © ${new Date().getFullYear()} Fastlinesupercars.pl
    </td></tr>
    <tr><td style="background:#c8102e;height:6px;font-size:0">&nbsp;</td></tr>
   </table>
  </td></tr>
 </table>
</div>`

// ---------- realizacja opłaconego zamówienia ----------
type OrderRow = {
  id: string; number: number; status: string; total: number
  customer_name: string; customer_email: string; customer_phone?: string
  gift_for?: string; notes?: string; voucher_id?: string | null
  subtotal_grosze?: number | null; discount_grosze?: number | null
  discount_code?: string | null; discount_kind?: string | null
  items: { product_id: string; name: string; variant: string; price: number; qty: number }[]
}

/**
 * Wystawia voucher (kod + PDF), zapisuje go, oznacza zamówienie jako opłacone
 * i wysyła maile (klient + kopia do biura). Idempotentne: dla zamówienia już
 * opłaconego zwraca istniejący voucher i nic nie wysyła ponownie.
 */
export async function fulfillOrder(order: OrderRow, paidAmount?: number) {
  if (order.status === 'paid') {
    const v = order.voucher_id ? (await db(`vouchers?id=eq.${order.voucher_id}&select=code,valid_until`))?.[0] : null
    return { already: true, code: v?.code as string | undefined, valid_until: v?.valid_until as string | undefined }
  }

  // szablon vouchera = produkt pierwszej pozycji; brak szablonu → domyślny
  const prods = await db('products?select=id,name,voucher_template')
  const first = prods.find((p: { id: string }) => p.id === order.items[0].product_id)
  const template = first?.voucher_template || 'templates/alpine-a110.jpg'
  const code = voucherCode()
  const valid = new Date(); valid.setFullYear(valid.getFullYear() + 1)
  const validISO = valid.toISOString().slice(0, 10)
  const validPL = validISO.split('-').reverse().join('.')
  const recipient = order.gift_for || order.customer_name
  const lines = order.items.map((it) => `${it.qty > 1 ? it.qty + '× ' : ''}${it.name}${it.variant ? ' — ' + it.variant : ''}`)

  let pdfPath = '', pdfBytes: Uint8Array | null = null
  try {
    const tpl = (await db(`voucher_templates?path=eq.${encodeURIComponent(template)}&select=layout`))?.[0]
    pdfBytes = await makeVoucherPdf({ template, recipient, lines, validUntil: validPL, code, layout: tpl?.layout })
    pdfPath = `pdf/${code}.pdf`
    await storagePut(pdfPath, pdfBytes, 'application/pdf')
  } catch (e) {
    // brak szablonu nie może zablokować płatności — voucher powstaje, PDF dosyłamy ręcznie
    console.error('pdf fail', e)
  }

  const [voucher] = await db('vouchers', {
    method: 'POST',
    body: JSON.stringify({
      code, order_id: order.id, recipient, items_text: lines.join('\n'),
      template, pdf_path: pdfPath, valid_until: validISO, status: 'active',
    }),
  })
  await db(`orders?id=eq.${order.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'paid', paid_at: new Date().toISOString(), voucher_id: voucher.id,
      ...(paidAmount != null ? { paid_amount: paidAmount } : {}),
    }),
  })

  // Bon kwotowy użyty przy tym zamówieniu wypalamy dopiero teraz, gdy płatność jest pewna.
  // Funkcja SQL jest idempotentna, więc powtórka powiadomienia z Tpay niczego nie zdejmie drugi raz.
  // Błąd tutaj nie może wywrócić realizacji — zamówienie jest opłacone, voucher już wystawiony.
  if (order.discount_kind === 'voucher') {
    try {
      const red = await rpc('voucher_redeem', { p_order: order.id })
      const st = red.data?.[0]
      if (!red.ok || !st || (st.v_status !== 'redeemed' && st.v_status !== 'already'))
        console.error(`bon: #${order.number} nie wypalony (${red.error || st?.v_status || 'brak odpowiedzi'})`)
      else
        console.log(`bon: #${order.number} ${st.v_code} ${st.v_status}`)
    } catch (e) {
      console.error('bon: wyjątek przy wypalaniu', e)
    }
  }

  const discountRow = (order.discount_grosze || 0) > 0 ? `
    <tr>
      <td style="padding:10px 0;color:#7ddc9a;font-size:14px;border-bottom:1px solid #2a2a30">${order.discount_kind === 'voucher' ? 'Voucher' : 'Rabat'} ${esc(order.discount_code || '')}</td>
      <td style="padding:10px 0;color:#7ddc9a;font-size:14px;border-bottom:1px solid #2a2a30" align="right">−${zl(order.discount_grosze!)}</td>
    </tr>` : ''

  const itemsRows = order.items.map((it) => `
    <tr>
      <td style="padding:10px 0;color:#fff;font-size:14px;border-bottom:1px solid #2a2a30">${esc(it.name)}${it.variant ? ` <span style="color:#8a8a92">· ${esc(it.variant)}</span>` : ''} <span style="color:#8a8a92">× ${it.qty}</span></td>
      <td style="padding:10px 0;color:#fff;font-size:14px;border-bottom:1px solid #2a2a30" align="right">${zl(it.price * it.qty)}</td>
    </tr>`).join('')

  const html = mailShell(`
    <div style="color:#c8102e;font-size:12px;letter-spacing:3px;font-weight:bold">POTWIERDZENIE ZAKUPU</div>
    <h1 style="color:#fff;font-size:24px;margin:10px 0 4px">Dziękujemy, ${esc(order.customer_name.split(' ')[0])}!</h1>
    <p style="color:#b9b9c0;font-size:14px;line-height:1.7;margin:12px 0 24px">
      Twoje zamówienie <b style="color:#fff">#${order.number}</b> zostało opłacone.
      W załączniku znajdziesz <b style="color:#fff">voucher PDF</b> — gotowy do wydruku lub podarowania.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemsRows}${discountRow}
      <tr><td style="padding:14px 0;color:#8a8a92;font-size:13px;letter-spacing:1px">RAZEM</td>
      <td style="padding:14px 0;color:#fff;font-size:20px;font-weight:bold" align="right">${zl(order.total)}</td></tr>
    </table>
    <div style="background:#131316;border:1px solid #2a2a30;padding:18px 22px;margin:8px 0 24px">
      <div style="color:#8a8a92;font-size:11px;letter-spacing:2px">KOD VOUCHERA</div>
      <div style="color:#fff;font-size:26px;font-weight:bold;letter-spacing:4px;margin-top:4px">${code}</div>
      <div style="color:#8a8a92;font-size:12px;margin-top:6px">Ważny do: <span style="color:#fff">${validPL}</span></div>
    </div>
    <p style="color:#b9b9c0;font-size:14px;line-height:1.7">Następny krok — zarezerwuj termin przejazdu:</p>
    <a href="${SITE}/kalendarz" style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;font-weight:bold;letter-spacing:2px;font-size:14px;padding:14px 34px">ZAREZERWUJ TERMIN</a>
  `)

  const attachments = pdfBytes ? [{ filename: `Voucher-${code}.pdf`, content: b64(pdfBytes) }] : undefined
  const sent = await sendMail(order.customer_email, `Voucher ${code} — potwierdzenie zakupu #${order.number}`, html, attachments)

  // kopia dla biura — każde opłacone zamówienie ląduje w skrzynce rezerwacji
  await sendMail(CONTACT_TO, `Nowe zamówienie #${order.number} — ${order.customer_name} (${zl(order.total)})`, mailShell(`
    <div style="color:#c8102e;font-size:12px;letter-spacing:3px;font-weight:bold">NOWE ZAMÓWIENIE</div>
    <h1 style="color:#fff;font-size:20px;margin:10px 0">#${order.number} · ${zl(order.total)}</h1>
    <p style="color:#b9b9c0;font-size:14px;line-height:1.8">
      Klient: <b style="color:#fff">${esc(order.customer_name)}</b><br>
      E-mail: ${esc(order.customer_email)}${order.customer_phone ? `<br>Tel: ${esc(order.customer_phone)}` : ''}
      ${order.gift_for ? `<br>Voucher dla: <b style="color:#fff">${esc(order.gift_for)}</b>` : ''}
      ${order.notes ? `<br>${esc(order.notes)}` : ''}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemsRows}${discountRow}</table>
    <div style="color:#8a8a92;font-size:13px;margin-top:18px">Kod vouchera: <b style="color:#fff">${code}</b> · ważny do ${validPL}</div>
    ${pdfPath ? '' : '<div style="color:#ff6b6b;font-size:13px;margin-top:10px">UWAGA: nie udało się wygenerować PDF (brak szablonu?) — wyślij voucher ręcznie.</div>'}
    ${sent.ok ? '' : '<div style="color:#ff6b6b;font-size:13px;margin-top:10px">UWAGA: e-mail do klienta nie został wysłany!</div>'}
  `), attachments)

  return { already: false, code, valid_until: validISO, mail_sent: sent.ok, pdf: !!pdfPath }
}
