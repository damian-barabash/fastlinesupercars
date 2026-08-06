// FASTLINESUPERCARS — admin-api edge function
// login | logout | content.get/set | products.list/save | orders.list | vouchers.list/update | upload | voucherPdfUrl | stats
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
        let q = 'vouchers?select=*&order=created_at.desc&limit=500'
        if (body.status) q += `&status=eq.${encodeURIComponent(body.status)}`
        if (body.product) q += `&product_id=eq.${encodeURIComponent(body.product)}`
        if (body.source) q += `&source=eq.${encodeURIComponent(body.source)}`
        if (body.search) q += `&or=(code.ilike.*${encodeURIComponent(body.search)}*,recipient.ilike.*${encodeURIComponent(body.search)}*)`
        return J(await db(q))
      }

      case 'vouchers.generate': {
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
          db('orders?select=status,total,created_at'),
          db('vouchers?select=status'),
        ])
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
