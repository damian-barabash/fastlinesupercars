// Supabase raw REST client (anon) + shop edge function calls
export const SB_URL = 'https://jogueyhvdcmftqloxncz.supabase.co'
export const ANON_KEY = 'sb_publishable_up8ojG4CsBqojGO4C7ljQA_d634uBEx'

export async function rest(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (!r.ok) throw new Error(`rest ${path}: ${r.status}`)
  return r.json()
}

export async function shop(action, body = {}) {
  const r = await fetch(`${SB_URL}/functions/v1/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action, ...body }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `shop ${action}: ${r.status}`)
  return d
}

export async function adminApi(action, body = {}) {
  const token = sessionStorage.getItem('fs_admin_token') || ''
  const r = await fetch(`${SB_URL}/functions/v1/admin-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ action, token, ...body }),
  })
  const d = await r.json().catch(() => ({}))
  if (r.status === 401 && action !== 'login') {
    sessionStorage.removeItem('fs_admin_token')
    window.dispatchEvent(new Event('fs-admin-logout'))
  }
  if (!r.ok) throw new Error(d.error || `admin ${action}: ${r.status}`)
  return d
}

// pełne grosze pokazujemy zawsze dwucyfrowo: 2158,20 zł (nie 2158,2 zł)
export const zl = (grosze) => {
  const v = (grosze || 0) / 100
  const dec = Number.isInteger(v) ? 0 : 2
  return v.toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' zł'
}
