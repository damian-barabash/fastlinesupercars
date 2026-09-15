// FASTLINESUPERCARS — przekierowanie poczty przychodzącej (Resend Inbound → skrzynka biura).
// Wdrażane z --no-verify-jwt (Resend nie wyśle nagłówka apikey).
//
// Po co: MX domeny wskazywał na stary hosting, a po przepięciu apeksu na GitHub Pages
// wskazywał już na serwer, który w ogóle nie przyjmuje poczty — listy klientów na
// rezerwacje@fastlinesupercars.pl odbijały się. Teraz MX prowadzi do Resend, a ta funkcja
// odbiera webhook `email.received` i wysyła list dalej na adres w MAIL_FORWARD_TO.
//
// Bezpieczeństwo i odporność, warstwami:
//   1. podpis Svix (RESEND_WEBHOOK_SECRET) — bez niego 401; okno czasowe 5 minut
//   2. treść i załączniki pobierane z API Resend po `email_id` (webhook niesie same metadane)
//   3. pętla zwrotna ucięta: nie przekazujemy odbić (mailer-daemon, puste return-path,
//      Auto-Submitted) ani listów z naszym własnym znacznikiem X-Fastline-Forward
// Osobny klucz dla poczty przychodzącej: RESEND_KEY obsługuje płatności i maile sklepu,
// nie chcemy go ruszać (odbieranie wymaga klucza z dostępem do `emails/receiving`).
const RESEND_KEY = Deno.env.get('RESEND_INBOUND_KEY') ?? Deno.env.get('RESEND_KEY') ?? ''
const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''
const FORWARD_TO = (Deno.env.get('MAIL_FORWARD_TO') ?? 'lukasz.kazmierczak@greywolfgroup.pl')
  .split(',').map((s) => s.trim()).filter(Boolean)
const FORWARD_FROM = Deno.env.get('MAIL_FORWARD_FROM') ?? 'rezerwacje@fastlinesupercars.pl'

// Załączniki: Resend przyjmuje do 40 MB na list, base64 puchnie o ~1/3 — tniemy wcześniej.
const MAX_ATTACH_BYTES = 12 * 1024 * 1024

const MARKER = 'X-Fastline-Forward'

const ok = (msg = 'ok') => new Response(msg, { status: 200 })
const fail = (msg: string, s = 400) => {
  console.error('mail-forward odrzucone:', msg)
  return new Response(msg, { status: s })
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Adres bez nazwy wyświetlanej: `Jan Kowalski <jan@x.pl>` → `jan@x.pl` */
function bareAddr(v: string): string {
  const m = String(v || '').match(/<([^>]+)>/)
  return (m ? m[1] : String(v || '')).trim().toLowerCase()
}

/** Nazwa wyświetlana nadawcy, jeśli jest; inaczej sam adres. */
function displayName(v: string): string {
  const m = String(v || '').match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/)
  const name = m ? m[1].trim() : ''
  return name || bareAddr(v)
}

/** Nazwa w polu `from` musi przejść przez parser adresu — cudzysłowy i nawiasy wycinamy. */
const safeName = (s: string) => s.replace(/["<>,;\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 78)

/**
 * Podpis Svix (tego używa Resend): base64(HMAC-SHA256(secret, "id.timestamp.body")),
 * nagłówek może nieść kilka podpisów rozdzielonych spacją, każdy w formie `v1,<sig>`.
 */
async function verifySvix(payload: string, h: Headers): Promise<{ ok: boolean; err?: string }> {
  if (!WEBHOOK_SECRET) return { ok: false, err: 'brak RESEND_WEBHOOK_SECRET' }
  const id = h.get('svix-id') || h.get('webhook-id')
  const ts = h.get('svix-timestamp') || h.get('webhook-timestamp')
  const sig = h.get('svix-signature') || h.get('webhook-signature')
  if (!id || !ts || !sig) return { ok: false, err: 'brak nagłówków podpisu' }

  const age = Math.abs(Date.now() / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > 300) return { ok: false, err: 'znacznik czasu poza oknem 5 min' }

  const raw = WEBHOOK_SECRET.startsWith('whsec_') ? WEBHOOK_SECRET.slice(6) : WEBHOOK_SECRET
  const key = await crypto.subtle.importKey(
    'raw', Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${payload}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  for (const part of sig.split(' ')) {
    const [ver, val] = part.split(',')
    if (ver === 'v1' && val && timingSafeEqual(val, expected)) return { ok: true }
  }
  return { ok: false, err: 'podpis nie zgadza się' }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function resendGet(path: string) {
  const r = await fetch(`https://api.resend.com/${path}`, { headers: { Authorization: `Bearer ${RESEND_KEY}` } })
  const txt = await r.text()
  if (!r.ok) throw new Error(`resend GET ${path}: ${r.status} ${txt.slice(0, 300)}`)
  return txt ? JSON.parse(txt) : null
}

/** Resend potrafi oddać treść jako data URI (`html_format`) — rozpakowujemy do zwykłego HTML. */
function fromDataUri(v: string | null | undefined): string {
  const s = String(v ?? '')
  if (!s.startsWith('data:')) return s
  const comma = s.indexOf(',')
  if (comma < 0) return ''
  const meta = s.slice(5, comma)
  const body = s.slice(comma + 1)
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(body)
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    }
    return decodeURIComponent(body)
  } catch {
    return ''
  }
}

const b64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Odbicie od cudzej skrzynki nie może wrócić do nas i polecieć dalej — inaczej pętla bez końca. */
function isBounceOrLoop(email: any): { skip: boolean; why?: string } {
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(email?.headers ?? {})) headers[k.toLowerCase()] = String(v)

  if (headers[MARKER.toLowerCase()]) return { skip: true, why: 'nasz własny przekaz (znacznik)' }
  if (headers['auto-submitted'] && headers['auto-submitted'] !== 'no') return { skip: true, why: 'auto-submitted' }

  if ((headers['return-path'] || '').trim() === '<>') return { skip: true, why: 'puste return-path (odbicie)' }
  const from = bareAddr(email?.from || '')
  if (/^(mailer-daemon|postmaster|no-?reply@.*bounce)/i.test(from)) return { skip: true, why: `odbicie od ${from}` }
  return { skip: false }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('tylko POST', 405)
  const raw = await req.text()

  const v = await verifySvix(raw, req.headers)
  if (!v.ok) return fail(`podpis: ${v.err}`, 401)

  let event: any
  try { event = JSON.parse(raw) } catch { return fail('ciało nie jest JSON-em') }

  // Inne zdarzenia (delivered, bounced…) kwitujemy 200 — Resend nie ma czego ponawiać.
  if (event?.type !== 'email.received') return ok(`pominięte: ${event?.type ?? 'brak typu'}`)

  const emailId = event?.data?.email_id || event?.data?.id
  if (!emailId) return fail('brak email_id w zdarzeniu')

  try {
    const email = await resendGet(`emails/receiving/${emailId}`)

    const loop = isBounceOrLoop(email)
    if (loop.skip) {
      console.log(`mail-forward: ${emailId} pominięty — ${loop.why}`)
      return ok('pominięte (pętla/odbicie)')
    }

    const sender = String(email?.from || 'nieznany nadawca')
    const rcpt = String((email?.received_for?.[0]) || (email?.to?.[0]) || 'nieznany adres')
    const subject = String(email?.subject || '(bez tematu)')

    // Załączniki: w treści listu są tylko metadane BEZ `download_url` — link do pobrania
    // daje dopiero osobny endpoint `/attachments` (i wygasa po godzinie).
    const attachments: { filename: string; content: string }[] = []
    let dropped = 0
    let total = 0
    let files: any[] = []
    if ((email?.attachments ?? []).length) {
      try {
        files = (await resendGet(`emails/receiving/${emailId}/attachments`))?.data ?? []
      } catch (e) {
        console.error('mail-forward: nie udało się pobrać listy załączników', String(e).slice(0, 200))
        dropped = (email?.attachments ?? []).length
      }
    }
    for (const a of files) {
      const size = Number(a?.size ?? 0)
      if (!a?.download_url || total + size > MAX_ATTACH_BYTES) { dropped++; continue }
      try {
        const r = await fetch(a.download_url)
        if (!r.ok) { dropped++; continue }
        const buf = await r.arrayBuffer()
        if (total + buf.byteLength > MAX_ATTACH_BYTES) { dropped++; continue }
        total += buf.byteLength
        attachments.push({ filename: String(a.filename || 'zalacznik'), content: b64(buf) })
      } catch { dropped++ }
    }

    const bar = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#444;background:#f4f4f6;
            border-left:4px solid #c8102e;padding:10px 14px;margin:0 0 16px">
  <b>Wiadomość z ${esc(rcpt)}</b><br>
  Od: ${esc(sender)}<br>
  Temat: ${esc(subject)}
  ${dropped ? `<br><span style="color:#b00">Nie udało się dołączyć załączników: ${dropped}</span>` : ''}
</div>`

    const html = fromDataUri(email?.html)
    const text = String(email?.text ?? '')
    const body = html
      ? bar + html
      : bar + `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${esc(text || '(pusta treść)')}</pre>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${safeName(displayName(sender))} (via ${rcpt}) <${FORWARD_FROM}>`,
        to: FORWARD_TO,
        subject,
        html: body,
        ...(text ? { text: `Od: ${sender}\nDo: ${rcpt}\n\n${text}` } : {}),
        reply_to: bareAddr(sender) || undefined,
        headers: { [MARKER]: '1', 'X-Fastline-Original-To': rcpt },
        ...(attachments.length ? { attachments } : {}),
      }),
    })
    const out = await res.text()
    // Niepowodzenie wysyłki zwracamy jako 500 — wtedy Resend ponowi webhook zamiast zgubić list.
    if (!res.ok) return fail(`wysyłka: ${res.status} ${out.slice(0, 300)}`, 500)

    console.log(`mail-forward: ${rcpt} ← ${bareAddr(sender)} → ${FORWARD_TO.join(', ')} (zał. ${attachments.length})`)
    return ok('przekazane')
  } catch (e) {
    return fail(`błąd: ${String(e).slice(0, 300)}`, 500)
  }
})
