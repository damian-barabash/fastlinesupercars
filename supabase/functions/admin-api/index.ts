// FASTLINESUPERCARS — admin-api edge function
// login | logout | content.get/set | products.list/save | orders.list
// vouchers.list/update/generate/import/batches/delete/deleteBatch | promos.list/save/delete
// templates.* | upload | voucherPdfUrl | stats
//
// Vouchery są dwóch rodzajów (kolumna `kind`, migracja 004):
//   * `product` — kod na konkretny przejazd, realizowany przy rezerwacji terminu
//   * `amount`  — bon kwotowy, którym płaci się w koszyku (jednorazowy, nominał w `amount_grosze`)
import { compare } from 'https://esm.sh/bcrypt-ts@5.0.2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

async function requireSession(token: string) {
  if (!token) return null
  const rows = await db(`admin_sessions?token=eq.${encodeURIComponent(token)}&select=*`)
  const s = rows?.[0]
  if (!s || new Date(s.expires_at) < new Date()) return null
  return s
}

/** Kody bez znaków, które da się pomylić (0/O, 1/I/L) — mają być czytelne z wydruku. */
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUWXYZ'
const CODE_DIGITS = '23456789'
function randomTail(letters = 4, digits = 4) {
  const rnd = crypto.getRandomValues(new Uint8Array(letters + digits))
  let s = ''
  for (let i = 0; i < letters; i++) s += CODE_CHARS[rnd[i] % CODE_CHARS.length]
  for (let i = 0; i < digits; i++) s += CODE_DIGITS[rnd[letters + i] % CODE_DIGITS.length]
  return s
}
const normCode = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '')
const CODE_RE = /^[A-Z0-9_-]{4,32}$/

/** `+1 rok` albo podana data (YYYY-MM-DD). */
function validUntil(raw?: string) {
  const d = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const v = new Date(); v.setFullYear(v.getFullYear() + 1)
  return v.toISOString().slice(0, 10)
}

/** Które z podanych kodów już istnieją w bazie (sprawdzane porcjami, żeby URL nie puchł). */
async function existingCodes(codes: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200)
    const rows = await db(`vouchers?code=in.(${chunk.map((c) => `"${c}"`).join(',')})&select=code`)
    for (const r of rows || []) out.add(r.code)
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { action, token, ...body } = await req.json()

    if (action === 'login') {
      const admins = await db(`admins?username=eq.${encodeURIComponent(body.username || '')}&select=*`)
      const a = admins?.[0]
      if (!a || !(await compare(body.password || '', a.pass_hash))) return J({ error: 'Błędny login lub hasło' }, 401)
      const t = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
      const exp = new Date(Date.now() + 12 * 3600 * 1000).toISOString()
      await db('admin_sessions', { method: 'POST', body: JSON.stringify({ token: t, username: a.username, expires_at: exp }) })
      await db(`admin_sessions?expires_at=lt.${new Date().toISOString()}`, { method: 'DELETE' })
      return J({ token: t, username: a.username, expires_at: exp })
    }

    const session = await requireSession(token)
    if (!session) return J({ error: 'unauthorized' }, 401)

    switch (action) {
      case 'logout':
        await db(`admin_sessions?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' })
        return J({ ok: true })

      case 'content.get':
        return J(await db('site_content?select=key,value'))

      case 'content.set': {
        const entries = Object.entries(body.data || {}).map(([key, value]) => ({ key, value: String(value), updated_at: new Date().toISOString() }))
        if (entries.length)
          await db('site_content', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(entries) })
        return J({ ok: true, saved: entries.length })
      }

      case 'products.list':
        return J(await db('products?select=*&order=sort.asc'))

      case 'products.save': {
        const p = body.product
        if (!p?.id) return J({ error: 'no id' }, 400)
        p.updated_at = new Date().toISOString()
        await db('products', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(p) })
        return J({ ok: true })
      }

      case 'products.delete':
        await db(`products?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' })
        return J({ ok: true })

      case 'orders.delete':
        await db(`orders?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' })
        return J({ ok: true })

      case 'orders.list': {
        let q = 'orders?select=*&order=created_at.desc&limit=200'
        if (body.status) q += `&status=eq.${encodeURIComponent(body.status)}`
        if (body.search) q += `&or=(customer_name.ilike.*${encodeURIComponent(body.search)}*,customer_email.ilike.*${encodeURIComponent(body.search)}*)`
        const orders = await db(q)
        // attach voucher (code, pdf, status) to each paid order
        const ids = orders.filter((o: { voucher_id?: string }) => o.voucher_id).map((o: { voucher_id: string }) => o.voucher_id)
        if (ids.length) {
          const vs = await db(`vouchers?id=in.(${ids.join(',')})&select=id,code,pdf_path,status,valid_until`)
          const byId: Record<string, unknown> = {}
          for (const v of vs) byId[v.id] = v
          for (const o of orders) if (o.voucher_id) o.voucher = byId[o.voucher_id] || null
        }
        return J(orders)
      }

      case 'vouchers.list': {
        let q = `vouchers?select=*&order=created_at.desc&limit=${Math.min(+body.limit || 500, 5000)}`
        if (body.status) q += `&status=eq.${encodeURIComponent(body.status)}`
        if (body.product) q += `&product_id=eq.${encodeURIComponent(body.product)}`
        if (body.source) q += `&source=eq.${encodeURIComponent(body.source)}`
        if (body.kind) q += `&kind=eq.${encodeURIComponent(body.kind)}`
        if (body.batch) q += `&batch=eq.${encodeURIComponent(body.batch)}`
        if (body.search) q += `&or=(code.ilike.*${encodeURIComponent(body.search)}*,recipient.ilike.*${encodeURIComponent(body.search)}*,note.ilike.*${encodeURIComponent(body.search)}*)`
        const rows = await db(q)

        // dla bonów kwotowych: przy którym zamówieniu zostały wykorzystane
        const amountIds = (rows || []).filter((v: { kind: string }) => v.kind === 'amount').map((v: { id: string }) => v.id)
        if (amountIds.length) {
          const reds = await db(`voucher_redemptions?voucher_id=in.(${amountIds.join(',')})&select=voucher_id,order_id,amount_grosze,created_at`)
          const orderIds = [...new Set((reds || []).map((r: { order_id: string }) => r.order_id))]
          const orders = orderIds.length ? await db(`orders?id=in.(${orderIds.join(',')})&select=id,number,customer_name,total`) : []
          const orderById: Record<string, unknown> = {}
          for (const o of orders || []) orderById[o.id] = o
          const byVoucher: Record<string, unknown> = {}
          for (const r of reds || []) byVoucher[r.voucher_id] = { ...r, order: orderById[r.order_id] || null }
          for (const v of rows) if (byVoucher[v.id]) v.redemption = byVoucher[v.id]
        }
        return J(rows)
      }

      case 'vouchers.batches': {
        // lista partii (import/generacja) — do filtra i pobierania kodów paczkami
        const rows = await db('vouchers?select=batch,kind,amount_grosze,status,created_at&batch=neq.&order=created_at.desc&limit=5000')
        const by: Record<string, { batch: string; kind: string; count: number; active: number; value: number; created_at: string }> = {}
        for (const v of rows || []) {
          by[v.batch] ??= { batch: v.batch, kind: v.kind, count: 0, active: 0, value: 0, created_at: v.created_at }
          by[v.batch].count++
          if (v.status === 'active') by[v.batch].active++
          by[v.batch].value += +(v.amount_grosze || 0)
          if (v.created_at > by[v.batch].created_at) by[v.batch].created_at = v.created_at
        }
        return J(Object.values(by).sort((a, b) => b.created_at.localeCompare(a.created_at)))
      }

      case 'vouchers.generate': {
        // Bon kwotowy: { kind:'amount', amount_grosze, count, prefix?, valid_until?, note?, batch? }
        if (body.kind === 'amount') {
          const amount = Math.round(Number(body.amount_grosze) || 0)
          if (!(amount > 0 && amount <= 10_000_000)) return J({ error: 'Podaj wartość bonu (1–100 000 zł)' }, 400)
          const count = Math.min(Math.max(1, +body.count || 1), 500)
          const prefix = normCode(body.prefix || 'BON').replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BON'
          const valid = validUntil(body.valid_until)
          const batch = String(body.batch || `gen ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`).slice(0, 60)
          const note = String(body.note || '').slice(0, 200)

          // kody losujemy z zapasem i odsiewamy kolizje z bazą (kod jest unikalny globalnie)
          const wanted = new Set<string>()
          for (let guard = 0; wanted.size < count && guard < count * 20; guard++) wanted.add(`${prefix}-${randomTail()}`)
          const taken = await existingCodes([...wanted])
          const codes = [...wanted].filter((c) => !taken.has(c)).slice(0, count)
          if (codes.length < count) return J({ error: 'Nie udało się wylosować tylu unikalnych kodów — spróbuj ponownie' }, 500)

          const rows = codes.map((code) => ({
            code, kind: 'amount', amount_grosze: amount, source: 'import', status: 'active',
            valid_until: valid, batch, note, items_text: `Bon o wartości ${(amount / 100).toFixed(2)} zł`,
          }))
          const inserted = await db('vouchers', { method: 'POST', body: JSON.stringify(rows) })
          return J({ ok: true, kind: 'amount', batch, amount_grosze: amount, valid_until: valid, codes: inserted.map((r: { code: string }) => r.code) })
        }

        // body: { product_id, variant?, count, prefix? } → N new import-codes
        const prods = await db(`products?id=eq.${encodeURIComponent(body.product_id)}&select=id,name`)
        const prod = prods?.[0]
        if (!prod) return J({ error: 'Nieznany produkt' }, 400)
        const count = Math.min(Math.max(1, +body.count || 1), 100)
        const auto = prod.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
        const lapDigit = (body.variant || '').match(/\d+/)?.[0] || ''
        const prefix = ((body.prefix || auto) + lapDigit).toUpperCase().replace(/[^A-Z0-9]/g, '')
        const chars = 'ABCDEFGHJKLMNPRSTUWXYZ'
        const digits = '23456789'
        const valid = new Date(); valid.setFullYear(valid.getFullYear() + 1)
        const rows = []
        for (let i = 0; i < count; i++) {
          const rnd = crypto.getRandomValues(new Uint8Array(8))
          let tail = ''
          for (let j = 0; j < 4; j++) tail += chars[rnd[j] % chars.length]
          for (let j = 4; j < 8; j++) tail += digits[rnd[j] % digits.length]
          rows.push({
            code: prefix + tail,
            items_text: `${prod.name}${body.variant ? ' — ' + body.variant : ''}`,
            product_id: prod.id, variant: body.variant || '', source: 'import',
            status: 'active', valid_until: valid.toISOString().slice(0, 10),
          })
        }
        const inserted = await db('vouchers', { method: 'POST', body: JSON.stringify(rows) })
        return J({ ok: true, codes: inserted.map((r: { code: string }) => r.code) })
      }

      case 'vouchers.import': {
        // body: { rows: [{code?, amount_grosze, valid_until?, note?, recipient?}], batch?, default_amount_grosze?, default_valid_until? }
        // Plik (Excel/CSV) rozbiera panel — tutaj przychodzi już gotowa lista wierszy.
        const src = Array.isArray(body.rows) ? body.rows : []
        if (!src.length) return J({ error: 'Brak wierszy do zaimportowania' }, 400)
        if (src.length > 2000) return J({ error: 'Maksymalnie 2000 kodów na raz' }, 400)

        const batch = String(body.batch || `import ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`).slice(0, 60)
        const defAmount = Math.round(Number(body.default_amount_grosze) || 0)
        const defValid = validUntil(body.default_valid_until)
        const prefix = normCode(body.prefix || 'BON').replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BON'

        const skipped: { row: number; code: string; reason: string }[] = []
        const prepared: { code: string; amount: number; valid: string; note: string; recipient: string; row: number }[] = []
        const seen = new Set<string>()

        for (let i = 0; i < src.length; i++) {
          const r = src[i] || {}
          const rowNo = +r.row || i + 1
          let code = normCode(r.code)
          if (!code) {                                   // plik bez kolumny „kod" → losujemy
            for (let guard = 0; guard < 50; guard++) {
              const c = `${prefix}-${randomTail()}`
              if (!seen.has(c)) { code = c; break }
            }
          }
          if (!CODE_RE.test(code)) { skipped.push({ row: rowNo, code, reason: 'kod: 4–32 znaki, litery/cyfry/-/_' }); continue }
          if (seen.has(code)) { skipped.push({ row: rowNo, code, reason: 'duplikat w pliku' }); continue }
          const amount = Math.round(Number(r.amount_grosze) || defAmount)
          if (!(amount > 0 && amount <= 10_000_000)) { skipped.push({ row: rowNo, code, reason: 'brak poprawnej kwoty' }); continue }
          seen.add(code)
          prepared.push({
            code, amount, valid: validUntil(r.valid_until || body.default_valid_until) || defValid,
            note: String(r.note || '').slice(0, 200), recipient: String(r.recipient || '').slice(0, 120), row: rowNo,
          })
        }

        const taken = await existingCodes(prepared.map((p) => p.code))
        const toInsert = prepared.filter((p) => {
          if (taken.has(p.code)) { skipped.push({ row: p.row, code: p.code, reason: 'kod już istnieje w bazie' }); return false }
          return true
        })

        let added = 0
        for (let i = 0; i < toInsert.length; i += 500) {
          const chunk = toInsert.slice(i, i + 500).map((p) => ({
            code: p.code, kind: 'amount', amount_grosze: p.amount, source: 'import', status: 'active',
            valid_until: p.valid, batch, note: p.note, recipient: p.recipient,
            items_text: `Bon o wartości ${(p.amount / 100).toFixed(2)} zł`,
          }))
          const ins = await db('vouchers', { method: 'POST', body: JSON.stringify(chunk) })
          added += ins?.length || 0
        }
        return J({
          ok: true, batch, added,
          value_grosze: toInsert.reduce((s2, p) => s2 + p.amount, 0),
          skipped: skipped.sort((a, b) => a.row - b.row).slice(0, 200),
          skipped_total: skipped.length,
          codes: toInsert.map((p) => p.code),
        })
      }

      case 'vouchers.delete': {
        // wykorzystanego bonu nie kasujemy — to ślad księgowy; do wycofania służy status `cancelled`
        const v = (await db(`vouchers?id=eq.${encodeURIComponent(body.id)}&select=id,code,order_id,status`))?.[0]
        if (!v) return J({ error: 'Nie znaleziono vouchera' }, 404)
        const used = (await db(`voucher_redemptions?voucher_id=eq.${v.id}&select=id`))?.length
        if (used || v.order_id) return J({ error: `Voucher ${v.code} był użyty przy zamówieniu — możesz go tylko anulować` }, 400)
        await db(`vouchers?id=eq.${v.id}`, { method: 'DELETE' })
        return J({ ok: true })
      }

      case 'vouchers.deleteBatch': {
        // kasuje z partii tylko kody nietknięte; użyte zostają i są raportowane
        const batch = String(body.batch || '')
        if (!batch) return J({ error: 'Podaj partię' }, 400)
        const rows = await db(`vouchers?batch=eq.${encodeURIComponent(batch)}&select=id,code,order_id,status`)
        if (!rows?.length) return J({ error: 'Pusta partia' }, 404)
        const reds = await db(`voucher_redemptions?voucher_id=in.(${rows.map((r: { id: string }) => r.id).join(',')})&select=voucher_id`)
        const usedIds = new Set((reds || []).map((r: { voucher_id: string }) => r.voucher_id))
        const removable = rows.filter((r: { id: string; order_id?: string }) => !usedIds.has(r.id) && !r.order_id)
        for (let i = 0; i < removable.length; i += 200)
          await db(`vouchers?id=in.(${removable.slice(i, i + 200).map((r: { id: string }) => r.id).join(',')})`, { method: 'DELETE' })
        return J({ ok: true, deleted: removable.length, kept: rows.length - removable.length })
      }

      case 'templates.list': {
        // storage objects under templates/ + saved layouts + signed preview URLs
        const lr = await fetch(`${SB_URL}/storage/v1/object/list/vouchery`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: 'templates/', limit: 100, sortBy: { column: 'name', order: 'asc' } }),
        })
        const objs = (await lr.json()) as { name: string }[]
        const layouts = await db('voucher_templates?select=path,layout')
        const layoutBy: Record<string, unknown> = {}
        for (const l of layouts || []) layoutBy[l.path] = l.layout
        const out = []
        for (const o of objs) {
          if (!o.name || o.name.startsWith('.')) continue
          const path = `templates/${o.name}`
          const sr = await fetch(`${SB_URL}/storage/v1/object/sign/vouchery/${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: 3600 }),
          })
          const sd = await sr.json().catch(() => ({}))
          out.push({ path, name: o.name, url: sd.signedURL ? `${SB_URL}/storage/v1${sd.signedURL}` : null, layout: layoutBy[path] || null })
        }
        return J(out)
      }

      case 'templates.upload': {
        // body: { name, base64, type } → vouchery/templates/<slug>.<ext>
        const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0))
        const ext = (body.type === 'image/png') ? 'png' : 'jpg'
        const slug = String(body.name || 'szablon').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'szablon'
        const path = `templates/${slug}.${ext}`
        const r = await fetch(`${SB_URL}/storage/v1/object/vouchery/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': body.type || 'image/jpeg', 'x-upsert': 'true' },
          body: bytes,
        })
        if (!r.ok) return J({ error: await r.text() }, 500)
        return J({ ok: true, path })
      }

      case 'templates.saveLayout': {
        await db('voucher_templates', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ path: body.path, layout: body.layout, updated_at: new Date().toISOString() }),
        })
        return J({ ok: true })
      }

      case 'templates.delete': {
        const inUse = await db(`products?voucher_template=eq.${encodeURIComponent(body.path)}&select=id`)
        if (inUse?.length) return J({ error: `Szablon używany przez: ${inUse.map((p: { id: string }) => p.id).join(', ')}` }, 400)
        await fetch(`${SB_URL}/storage/v1/object/vouchery/${body.path}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        })
        await db(`voucher_templates?path=eq.${encodeURIComponent(body.path)}`, { method: 'DELETE' })
        return J({ ok: true })
      }

      case 'settings.get': {
        const rows = await db('settings?select=key,value')
        const m: Record<string, string> = {}
        for (const r of rows) m[r.key] = r.value
        return J(m)
      }

      case 'settings.set': {
        const entries = Object.entries(body.data || {}).map(([key, value]) => ({ key, value: String(value) }))
        if (entries.length)
          await db('settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(entries) })
        return J({ ok: true })
      }

      case 'promos.list': {
        // kody + ile razy każdy został użyty w opłaconych zamówieniach.
        // Nowe zamówienia mają `discount_code`; starsze (sprzed migracji 004) tylko `notes`.
        const [codes, orders] = await Promise.all([
          db('promo_codes?select=*&order=created_at.desc'),
          db('orders?status=eq.paid&notes=like.promo:*&select=notes,discount_code,discount_kind,discount_grosze'),
        ])
        const uses: Record<string, number> = {}
        const saved: Record<string, number> = {}
        for (const o of orders || []) {
          const code = String(o.discount_code || /^promo:([A-Z0-9_-]+)/i.exec(o.notes || '')?.[1] || '').toUpperCase()
          if (!code || o.discount_kind === 'voucher') continue
          uses[code] = (uses[code] || 0) + 1
          saved[code] = (saved[code] || 0) + (+o.discount_grosze || 0)
        }
        return J((codes || []).map((c: { code: string }) => ({ ...c, uses: uses[c.code] || 0, saved_grosze: saved[c.code] || 0 })))
      }

      case 'promos.save': {
        const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '')
        if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return J({ error: 'Kod: 2–32 znaki, litery/cyfry/-/_' }, 400)
        const percent = Math.round(Number(body.percent))
        if (!(percent >= 1 && percent <= 100)) return J({ error: 'Rabat musi być między 1 a 100%' }, 400)
        const min_grosze = Math.max(0, Math.round(Number(body.min_grosze) || 0))
        const row = { code, percent, min_grosze, active: body.active !== false, note: String(body.note || '').slice(0, 200) }
        await db('promo_codes', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) })
        return J({ ok: true, code })
      }

      case 'promos.delete':
        await db(`promo_codes?code=eq.${encodeURIComponent(String(body.code || ''))}`, { method: 'DELETE' })
        return J({ ok: true })

      case 'vouchers.update': {
        const patch: Record<string, unknown> = {}
        if (body.status) {
          patch.status = body.status
          patch.used_at = body.status === 'used' ? new Date().toISOString() : null
        }
        await db(`vouchers?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
        return J({ ok: true })
      }

      case 'voucherPdfUrl': {
        const r = await fetch(`${SB_URL}/storage/v1/object/sign/vouchery/${body.path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: 3600 }),
        })
        const d = await r.json().catch(() => ({}))
        if (!d.signedURL) console.error('sign fail', r.status, JSON.stringify(d))
        return J({ url: d.signedURL ? `${SB_URL}/storage/v1${d.signedURL}` : null })
      }

      case 'upload': {
        // body: { name, base64, type } → media bucket, returns public URL
        const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0))
        const path = `${Date.now()}-${(body.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '-')}`
        const r = await fetch(`${SB_URL}/storage/v1/object/media/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': body.type || 'application/octet-stream', 'x-upsert': 'true' },
          body: bytes,
        })
        if (!r.ok) return J({ error: await r.text() }, 500)
        return J({ url: `${SB_URL}/storage/v1/object/public/media/${path}` })
      }

      case 'stats': {
        const [orders, vouchers] = await Promise.all([
          db('orders?select=status,total,created_at,discount_grosze,discount_kind'),
          db('vouchers?select=status,kind,amount_grosze'),
        ])
        const bony = (vouchers || []).filter((v: { kind: string }) => v.kind === 'amount')
        const sumBony = (f: (v: { status: string }) => boolean) =>
          bony.filter(f).reduce((s2: number, v: { amount_grosze: number }) => s2 + (+v.amount_grosze || 0), 0)
        // monthly aggregation
        const byMonth: Record<string, { month: string; orders: number; paid: number; revenue: number }> = {}
        for (const o of orders) {
          const m = String(o.created_at || '').slice(0, 7)
          if (!m) continue
          byMonth[m] ??= { month: m, orders: 0, paid: 0, revenue: 0 }
          byMonth[m].orders++
          if (o.status === 'paid') { byMonth[m].paid++; byMonth[m].revenue += o.total }
        }
        const paid = orders.filter((o: { status: string }) => o.status === 'paid')
        return J({
          months: Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)),
          orders_total: orders.length,
          orders_paid: paid.length,
          revenue: paid.reduce((s: number, o: { total: number }) => s + o.total, 0),
          vouchers_active: vouchers.filter((v: { status: string }) => v.status === 'active').length,
          vouchers_used: vouchers.filter((v: { status: string }) => v.status === 'used').length,
          // bony kwotowe: ile wydano, ile jeszcze „wisi" jako zobowiązanie, ile już zrealizowano
          bony_count: bony.length,
          bony_active: bony.filter((v: { status: string }) => v.status === 'active').length,
          bony_value_active: sumBony((v) => v.status === 'active'),
          bony_value_used: sumBony((v) => v.status === 'used'),
          bony_discount_given: paid.reduce((s2: number, o: { discount_kind?: string; discount_grosze?: number }) =>
            s2 + (o.discount_kind === 'voucher' ? (+o.discount_grosze || 0) : 0), 0),
        })
      }

      default:
        return J({ error: 'unknown action' }, 400)
    }
  } catch (e) {
    console.error(e)
    return J({ error: String(e) }, 500)
  }
})
