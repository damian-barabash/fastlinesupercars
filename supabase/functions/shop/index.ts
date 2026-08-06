// FASTLINESUPERCARS — shop edge function
// Actions: createOrder | pay (stub → paid + voucher PDF + emails) | order | contact
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_KEY') ?? ''
const FROM = Deno.env.get('SHOP_FROM_EMAIL') ?? 'Fastline Supercars <rezerwacja@fastlinesupercars.pl>'
const CONTACT_TO = 'rezerwacje@fastlinesupercars.pl'
const SITE = 'https://fastlinesupercars.pl'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const J = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function db(path: string, init: RequestInit = {}) {
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

async function storageGet(path: string): Promise<ArrayBuffer> {
  const r = await fetch(`${SB_URL}/storage/v1/object/vouchery/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  })
  if (!r.ok) throw new Error(`storage get ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return await r.arrayBuffer()
}

async function storagePut(path: string, body: Uint8Array, type: string) {
  const r = await fetch(`${SB_URL}/storage/v1/object/vouchery/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': type, 'x-upsert': 'true' },
    body,
  })
  if (!r.ok) throw new Error(`storage put ${path}: ${r.status} ${await r.text()}`)
}

function voucherCode() {
  const chars = 'ABCDEFGHJKLMNPRSTUWXYZ23456789'
  const rnd = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += chars[rnd[i] % chars.length] }
  return `FS-${s}`
}

const zl = (g: number) => (g / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' zł'
const b64 = (u8: Uint8Array) => {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode(...u8.subarray(i, i + chunk))
  return btoa(bin)
}

// ---------- PDF ----------
async function makeVoucherPdf(opts: {
  template: string; recipient: string; lines: string[]; validUntil: string; code: string
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
  const colX = W * 0.235 // center of left text column

  const fitSize = (text: string, font: typeof bold, want: number, maxW: number) => {
    let s = want
    while (s > 8 && font.widthOfTextAtSize(text, s) > maxW) s -= 1
    return s
  }
  const centered = (text: string, y: number, font: typeof bold, size: number) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: colX - w / 2, y, size, font, color: white })
  }

  // Recipient name — under "DLA"
  const name = opts.recipient.toUpperCase()
  const nameSize = fitSize(name, bold, H * 0.085, W * 0.40)
  centered(name, H * (1 - 0.335) - nameSize, bold, nameSize)

  // Purchased items — under the underlined headline (which sits ~0.50-0.55 of height)
  let y = H * (1 - 0.575)
  const lineGap = H * 0.062
  for (const raw of opts.lines.slice(0, 5)) {
    const line = raw.toUpperCase()
    const s = fitSize(line, semi, H * 0.048, W * 0.42)
    const w = semi.widthOfTextAtSize(line, s)
    page.drawText(line, { x: colX - w / 2, y: y - s, size: s, font: semi, color: white })
    y -= lineGap
  }

  // Ważność + kod — bottom right, under FASTLINE SUPERCARS
  const dSize = H * 0.030
  const dat = `Ważność: ${opts.validUntil}`
  const datW = semi.widthOfTextAtSize(dat, dSize)
  const rightCx = W * 0.792
  page.drawText(dat, { x: rightCx - datW / 2, y: H * 0.062, size: dSize, font: semi, color: white })
  const cod = `Kod vouchera: ${opts.code}`
  const codW = semi.widthOfTextAtSize(cod, dSize)
  page.drawText(cod, { x: rightCx - codW / 2, y: H * 0.062 - dSize * 1.45, size: dSize, font: semi, color: white })

  return await pdf.save()
}

// ---------- emails ----------
async function sendMail(to: string, subject: string, html: string, attachments?: { filename: string; content: string }[]) {
  if (!RESEND_KEY) return
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, attachments }),
  })
  if (!r.ok) console.error('resend fail', r.status, await r.text())
}

const mailShell = (inner: string) => `
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

// ---------- actions ----------
type Item = { product_id: string; variant?: string; qty?: number }

async function getPromo() {
  const rows = await db(`settings?key=in.(promo_code,promo_percent,promo_min_grosze)&select=key,value`)
  const m: Record<string, string> = {}
  for (const r of rows || []) m[r.key] = r.value
  return { code: (m.promo_code || '').trim(), percent: +(m.promo_percent || 0), min: +(m.promo_min_grosze || 0) }
}

async function createOrder(body: { customer: { name: string; email: string; phone?: string }; gift_for?: string; items: Item[]; promo?: string }) {
  const { customer, items } = body
  if (!customer?.name || !customer?.email || !/.+@.+\..+/.test(customer.email)) return J({ error: 'Nieprawidłowe dane klienta' }, 400)
  if (!Array.isArray(items) || !items.length) return J({ error: 'Pusty koszyk' }, 400)
  const prods = await db(`products?select=*&active=eq.true`)
  const lines: { product_id: string; name: string; variant: string; price: number; qty: number }[] = []
  for (const it of items) {
    const p = prods.find((x: { id: string }) => x.id === it.product_id)
    if (!p) return J({ error: `Nieznany produkt: ${it.product_id}` }, 400)
    const qty = Math.min(Math.max(1, it.qty || 1), 10)
    let price = p.price_from, variant = ''
    if (Array.isArray(p.variants) && p.variants.length) {
      const v = p.variants.find((v: { laps: string }) => v.laps === it.variant) || null
      if (!v) return J({ error: `Wybierz liczbę okrążeń dla: ${p.name}` }, 400)
      price = v.price; variant = v.laps
    }
    lines.push({ product_id: p.id, name: p.name, variant, price, qty })
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)

  // promo code (e.g. FAST = -10% for orders >= 500 zł)
  let discount = 0, promoUsed = ''
  if (body.promo) {
    const promo = await getPromo()
    if (promo.code && body.promo.trim().toUpperCase() === promo.code.toUpperCase() && promo.percent > 0) {
      if (subtotal >= promo.min) {
        discount = Math.round(subtotal * promo.percent / 100)
        promoUsed = promo.code.toUpperCase()
      } else {
        return J({ error: `Kod ${promo.code} działa od ${(promo.min / 100).toFixed(0)} zł` }, 400)
      }
    } else {
      return J({ error: 'Nieprawidłowy kod rabatowy' }, 400)
    }
  }
  const total = subtotal - discount

  const [order] = await db('orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_name: customer.name.trim(), customer_email: customer.email.trim(),
      customer_phone: (customer.phone || '').trim(), gift_for: (body.gift_for || '').trim(),
      items: lines, total, status: 'pending',
      notes: promoUsed ? `promo:${promoUsed} -${(discount / 100).toFixed(2)} zł` : '',
    }),
  })
  return J({ order_id: order.id, number: order.number, total, subtotal, discount, promo: promoUsed })
}

async function checkPromo(body: { promo: string; subtotal: number }) {
  const promo = await getPromo()
  if (!promo.code || (body.promo || '').trim().toUpperCase() !== promo.code.toUpperCase())
    return J({ valid: false, error: 'Nieprawidłowy kod rabatowy' })
  if ((body.subtotal || 0) < promo.min)
    return J({ valid: false, error: `Kod ${promo.code} działa przy zakupach od ${(promo.min / 100).toFixed(0)} zł` })
  return J({ valid: true, percent: promo.percent, discount: Math.round((body.subtotal || 0) * promo.percent / 100) })
}

async function pay(body: { order_id: string }) {
  const orders = await db(`orders?id=eq.${body.order_id}&select=*`)
  const order = orders?.[0]
  if (!order) return J({ error: 'Nie znaleziono zamówienia' }, 404)
  if (order.status === 'paid') {
    const v = order.voucher_id ? (await db(`vouchers?id=eq.${order.voucher_id}&select=code,valid_until`))?.[0] : null
    return J({ status: 'paid', voucher_code: v?.code, valid_until: v?.valid_until })
  }

  // voucher: template of FIRST cart item, all purchases listed
  const prods = await db('products?select=id,name,voucher_template')
  const first = prods.find((p: { id: string }) => p.id === order.items[0].product_id)
  const template = first?.voucher_template || 'templates/alpine-a110.jpg'
  const code = voucherCode()
  const valid = new Date(); valid.setFullYear(valid.getFullYear() + 1)
  const validISO = valid.toISOString().slice(0, 10)
  const validPL = validISO.split('-').reverse().join('.')
  const recipient = order.gift_for || order.customer_name
  const lines = order.items.map((it: { name: string; variant: string; qty: number }) =>
    `${it.qty > 1 ? it.qty + '× ' : ''}${it.name}${it.variant ? ' — ' + it.variant : ''}`)

  let pdfPath = '', pdfBytes: Uint8Array | null = null
  try {
    pdfBytes = await makeVoucherPdf({ template, recipient, lines, validUntil: validPL, code })
    pdfPath = `pdf/${code}.pdf`
    await storagePut(pdfPath, pdfBytes, 'application/pdf')
  } catch (e) {
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
    body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), voucher_id: voucher.id }),
  })

  const itemsRows = order.items.map((it: { name: string; variant: string; price: number; qty: number }) => `
    <tr>
      <td style="padding:10px 0;color:#fff;font-size:14px;border-bottom:1px solid #2a2a30">${it.qty}× ${it.name}${it.variant ? ` <span style="color:#8a8a92">· ${it.variant}</span>` : ''}</td>
      <td style="padding:10px 0;color:#fff;font-size:14px;border-bottom:1px solid #2a2a30" align="right">${zl(it.price * it.qty)}</td>
    </tr>`).join('')

  const html = mailShell(`
    <div style="color:#c8102e;font-size:12px;letter-spacing:3px;font-weight:bold">POTWIERDZENIE ZAKUPU</div>
    <h1 style="color:#fff;font-size:24px;margin:10px 0 4px">Dziękujemy, ${order.customer_name.split(' ')[0]}!</h1>
    <p style="color:#b9b9c0;font-size:14px;line-height:1.7;margin:12px 0 24px">
      Twoje zamówienie <b style="color:#fff">#${order.number}</b> zostało opłacone.
      W załączniku znajdziesz <b style="color:#fff">voucher PDF</b> — gotowy do wydruku lub podarowania.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemsRows}
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
  await sendMail(order.customer_email, `Voucher ${code} — potwierdzenie zakupu #${order.number}`, html, attachments)

  return J({ status: 'paid', voucher_code: code, valid_until: validISO })
}

async function getOrder(body: { order_id: string }) {
  const o = (await db(`orders?id=eq.${body.order_id}&select=id,number,status,total,items,customer_name,voucher_id`))?.[0]
  if (!o) return J({ error: 'not found' }, 404)
  let voucher = null
  if (o.voucher_id) voucher = (await db(`vouchers?id=eq.${o.voucher_id}&select=code,valid_until,status`))?.[0]
  return J({ ...o, voucher })
}

async function contact(body: { name: string; email: string; phone?: string; message: string }) {
  if (!body?.name || !body?.email || !body?.message) return J({ error: 'Uzupełnij wszystkie pola' }, 400)
  const html = mailShell(`
    <div style="color:#c8102e;font-size:12px;letter-spacing:3px;font-weight:bold">FORMULARZ KONTAKTOWY</div>
    <h1 style="color:#fff;font-size:20px;margin:10px 0">Wiadomość od: ${body.name}</h1>
    <p style="color:#b9b9c0;font-size:14px">E-mail: ${body.email}${body.phone ? ` · Tel: ${body.phone}` : ''}</p>
    <p style="color:#fff;font-size:14px;line-height:1.8;white-space:pre-wrap">${body.message.slice(0, 4000)}</p>
  `)
  await sendMail(CONTACT_TO, `[fastlinesupercars.pl] Wiadomość od ${body.name}`, html)
  return J({ ok: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { action, ...body } = await req.json()
    if (action === 'createOrder') return await createOrder(body)
    if (action === 'checkPromo') return await checkPromo(body)
    if (action === 'pay') return await pay(body)
    if (action === 'order') return await getOrder(body)
    if (action === 'contact') return await contact(body)
    return J({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return J({ error: String(e) }, 500)
  }
})
