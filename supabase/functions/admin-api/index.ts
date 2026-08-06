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

      case 'orders.list': {
        let q = 'orders?select=*&order=created_at.desc&limit=200'
        if (body.status) q += `&status=eq.${encodeURIComponent(body.status)}`
        if (body.search) q += `&or=(customer_name.ilike.*${encodeURIComponent(body.search)}*,customer_email.ilike.*${encodeURIComponent(body.search)}*)`
        return J(await db(q))
      }

      case 'vouchers.list': {
        let q = 'vouchers?select=*&order=created_at.desc&limit=300'
        if (body.status) q += `&status=eq.${encodeURIComponent(body.status)}`
        if (body.search) q += `&or=(code.ilike.*${encodeURIComponent(body.search)}*,recipient.ilike.*${encodeURIComponent(body.search)}*)`
        return J(await db(q))
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
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: 3600 }),
        })
        const d = await r.json()
        return J({ url: d.signedURL ? `${SB_URL}/storage/v1${d.signedURL}` : null })
      }

      case 'upload': {
        // body: { name, base64, type } → media bucket, returns public URL
        const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0))
        const path = `${Date.now()}-${(body.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '-')}`
        const r = await fetch(`${SB_URL}/storage/v1/object/media/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': body.type || 'application/octet-stream', 'x-upsert': 'true' },
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
        const paid = orders.filter((o: { status: string }) => o.status === 'paid')
        return J({
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
