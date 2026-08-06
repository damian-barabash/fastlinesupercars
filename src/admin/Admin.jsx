import { useEffect, useMemo, useState } from 'react'
import { adminApi, zl } from '../lib/api.js'
import { DEFAULTS } from '../data/defaults.js'
import './admin.css'

const TABS = ['Statystyki', 'Treści', 'Produkty', 'Zamówienia', 'Vouchery']

export default function Admin() {
  const [token, setToken] = useState(sessionStorage.getItem('fs_admin_token') || '')
  const [tab, setTab] = useState('Statystyki')

  useEffect(() => {
    const fn = () => setToken('')
    window.addEventListener('fs-admin-logout', fn)
    return () => window.removeEventListener('fs-admin-logout', fn)
  }, [])

  if (!token) return <Login onOk={(t) => { sessionStorage.setItem('fs_admin_token', t); setToken(t) }} />

  return (
    <div className="adm">
      <header className="adm-head">
        <img src="/img/2024_05_logo-grey.webp" alt="Fastline Supercars" className="adm-logo" />
        <nav className="adm-tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'is-active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <button className="adm-logout" onClick={() => { adminApi('logout').catch(() => {}); sessionStorage.removeItem('fs_admin_token'); setToken('') }}>
          Wyloguj
        </button>
      </header>
      <main className="adm-main">
        {tab === 'Statystyki' && <Stats />}
        {tab === 'Treści' && <Content />}
        {tab === 'Produkty' && <Products />}
        {tab === 'Zamówienia' && <Orders />}
        {tab === 'Vouchery' && <Vouchers />}
      </main>
    </div>
  )
}

function Login({ onOk }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const d = await adminApi('login', { username: u, password: p })
      onOk(d.token)
    } catch (e2) { setErr(e2.message) }
    setBusy(false)
  }
  return (
    <div className="adm-login">
      <form onSubmit={submit} className="adm-login-box carbon">
        <img src="/img/2024_05_logo-grey.webp" alt="" style={{ height: 40, marginBottom: 20 }} />
        <h1>Panel administracyjny</h1>
        <div className="field"><label>Login</label><input value={u} onChange={(e) => setU(e.target.value)} autoFocus /></div>
        <div className="field"><label>Hasło</label><input type="password" value={p} onChange={(e) => setP(e.target.value)} /></div>
        {err && <p className="adm-err">{err}</p>}
        <button className="btn btn-red" disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj'}</button>
      </form>
    </div>
  )
}

function Stats() {
  const [s, setS] = useState(null)
  useEffect(() => { adminApi('stats').then(setS).catch(() => {}) }, [])
  if (!s) return <p className="adm-muted">Ładowanie…</p>
  const items = [
    { label: 'Zamówienia', value: s.orders_total },
    { label: 'Opłacone', value: s.orders_paid },
    { label: 'Przychód', value: zl(s.revenue) },
    { label: 'Vouchery aktywne', value: s.vouchers_active },
    { label: 'Vouchery użyte', value: s.vouchers_used },
  ]
  return (
    <div className="adm-stats">
      {items.map((i) => (
        <div key={i.label} className="adm-stat carbon">
          <div className="adm-stat-val">{i.value}</div>
          <div className="adm-stat-label">{i.label}</div>
        </div>
      ))}
    </div>
  )
}

const GROUPS = {
  'Pasek górny / nawigacja': ['top.'],
  'Hero (strona główna)': ['hero.'],
  'Benefity': ['ben.'],
  'Flota / sekcje główna': ['fleet.', 'vban.', 'steps.'],
  'O nas (główna + podstrona)': ['about.', 'on.'],
  'Statystyki': ['stat.'],
  'FAQ': ['faq.'],
  'Opinie / kontakt / stopka': ['rev.', 'ct.', 'ft.'],
  'Oferta': ['of.'],
  'Kalendarz / tory': ['kal.', 'tory.'],
}

function Content() {
  const [rows, setRows] = useState(null)
  const [dirty, setDirty] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  useEffect(() => {
    adminApi('content.get').then((r) => {
      const over = {}
      for (const x of r) over[x.key] = x.value
      setRows({ ...DEFAULTS, ...over })
    }).catch(() => setRows({ ...DEFAULTS }))
  }, [])

  if (!rows) return <p className="adm-muted">Ładowanie…</p>

  async function save() {
    setSaving(true)
    try {
      await adminApi('content.set', { data: dirty })
      setDirty({})
      setSavedAt(Date.now())
    } catch (e) { alert('Błąd zapisu: ' + e.message) }
    setSaving(false)
  }

  const dirtyCount = Object.keys(dirty).length

  return (
    <div className="adm-content">
      <div className="adm-bar">
        <p className="adm-muted">Edytuj teksty strony — zmiany są widoczne po zapisaniu.</p>
        <button className="btn btn-red" disabled={!dirtyCount || saving} onClick={save}>
          {saving ? 'Zapisywanie…' : dirtyCount ? `Zapisz zmiany (${dirtyCount})` : savedAt ? '✓ Zapisano' : 'Brak zmian'}
        </button>
      </div>
      {Object.entries(GROUPS).map(([g, prefixes]) => {
        const keys = Object.keys(rows).filter((k) => prefixes.some((p) => k.startsWith(p)))
        if (!keys.length) return null
        return (
          <details key={g} className="adm-group" open={g.startsWith('Hero')}>
            <summary>{g} <span className="adm-muted">({keys.length})</span></summary>
            <div className="adm-group-in">
              {keys.map((k) => (
                <div key={k} className="field">
                  <label>{k}</label>
                  <textarea
                    rows={Math.min(6, Math.max(1, Math.ceil((rows[k] || '').length / 90)))}
                    value={rows[k]}
                    onChange={(e) => { setRows({ ...rows, [k]: e.target.value }); setDirty({ ...dirty, [k]: e.target.value }) }}
                  />
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function Products() {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => adminApi('products.list').then(setList).catch(() => {})
  useEffect(() => { load() }, [])

  if (!list) return <p className="adm-muted">Ładowanie…</p>

  async function save() {
    setBusy(true)
    try {
      const p = { ...edit }
      p.variants = typeof p.variants === 'string' ? JSON.parse(p.variants) : p.variants
      p.images = typeof p.images === 'string' ? p.images.split('\n').map((s) => s.trim()).filter(Boolean) : p.images
      // optimistic: update list immediately
      setList((l) => l.map((x) => (x.id === p.id ? { ...x, ...p } : x)))
      setEdit(null)
      await adminApi('products.save', { product: p })
      load()
    } catch (e) { alert('Błąd: ' + e.message) }
    setBusy(false)
  }

  async function uploadImg(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const b64 = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.readAsDataURL(f)
    })
    const d = await adminApi('upload', { name: f.name, base64: b64, type: f.type })
    setEdit((p) => ({ ...p, images: (typeof p.images === 'string' ? p.images : p.images.join('\n')) + '\n' + d.url }))
  }

  if (edit) {
    const imgs = typeof edit.images === 'string' ? edit.images : (edit.images || []).join('\n')
    const vars = typeof edit.variants === 'string' ? edit.variants : JSON.stringify(edit.variants || [], null, 1)
    return (
      <div className="adm-edit">
        <div className="adm-bar">
          <h2>{edit.name}</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>Anuluj</button>
            <button className="btn btn-red" disabled={busy} onClick={save}>{busy ? 'Zapisywanie…' : 'Zapisz'}</button>
          </div>
        </div>
        <div className="adm-edit-grid">
          <div className="field"><label>Nazwa</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="field"><label>Cena od (grosze)</label><input type="number" value={edit.price_from} onChange={(e) => setEdit({ ...edit, price_from: +e.target.value })} /></div>
          <div className="field"><label>Kolejność</label><input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: +e.target.value })} /></div>
          <div className="field"><label>Aktywny</label>
            <select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
              <option value="1">Tak</option><option value="0">Nie</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Podtytuł</label><input value={edit.subtitle || ''} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Opis</label><textarea rows={7} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Zdjęcia (jeden URL na linię) — <label className="adm-upload">dodaj plik<input type="file" accept="image/*" onChange={uploadImg} hidden /></label></label>
            <textarea rows={5} value={imgs} onChange={(e) => setEdit({ ...edit, images: e.target.value })} />
          </div>
          <div className="field"><label>Okładka (URL)</label><input value={edit.cover || ''} onChange={(e) => setEdit({ ...edit, cover: e.target.value })} /></div>
          <div className="field"><label>Szablon vouchera (storage path)</label><input value={edit.voucher_template || ''} onChange={(e) => setEdit({ ...edit, voucher_template: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Warianty JSON [{'{'}"laps","price"{'}'}]</label><textarea rows={7} value={vars} onChange={(e) => setEdit({ ...edit, variants: e.target.value })} /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr><th></th><th>Produkt</th><th>Cena od</th><th>Warianty</th><th>Aktywny</th><th></th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td><img src={p.cover} alt="" className="adm-thumb" /></td>
              <td><b>{p.name}</b><div className="adm-muted">{p.id}</div></td>
              <td>{zl(p.price_from)}</td>
              <td>{p.variants?.length || 0}</td>
              <td>{p.active ? '✓' : '—'}</td>
              <td><button className="adm-link" onClick={() => setEdit(p)}>Edytuj</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Orders() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => adminApi('orders.list', { status, search }).then(setRows).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [status, search])

  return (
    <div>
      <div className="adm-bar">
        <div className="adm-filters">
          <input placeholder="Szukaj: imię / e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Wszystkie</option>
            <option value="paid">Opłacone</option>
            <option value="pending">Oczekujące</option>
            <option value="cancelled">Anulowane</option>
          </select>
        </div>
      </div>
      {!rows ? <p className="adm-muted">Ładowanie…</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>#</th><th>Klient</th><th>Pozycje</th><th>Kwota</th><th>Status</th><th>Data</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} onClick={() => setOpen(open === o.id ? null : o.id)} className="adm-row-click">
                  <td>#{o.number}</td>
                  <td><b>{o.customer_name}</b><div className="adm-muted">{o.customer_email}</div>
                    {open === o.id && (
                      <div className="adm-order-detail">
                        {o.customer_phone && <div>Tel: {o.customer_phone}</div>}
                        {o.gift_for && <div>Prezent dla: <b>{o.gift_for}</b></div>}
                        {(o.items || []).map((it, i) => <div key={i}>· {it.qty}× {it.name} {it.variant}</div>)}
                      </div>
                    )}
                  </td>
                  <td>{(o.items || []).reduce((s, i) => s + i.qty, 0)}</td>
                  <td>{zl(o.total)}</td>
                  <td><span className={`adm-badge is-${o.status}`}>{o.status}</span></td>
                  <td className="adm-muted">{new Date(o.created_at).toLocaleString('pl-PL')}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="adm-muted">Brak zamówień</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Vouchers() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  const load = () => adminApi('vouchers.list', { status, search }).then(setRows).catch(() => {})
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [status, search])

  async function setVoucherStatus(v, s) {
    setRows((r) => r.map((x) => (x.id === v.id ? { ...x, status: s } : x)))
    try { await adminApi('vouchers.update', { id: v.id, status: s }) } catch (e) { alert(e.message); load() }
  }

  async function openPdf(v) {
    if (!v.pdf_path) return alert('Brak PDF dla tego vouchera')
    const d = await adminApi('voucherPdfUrl', { path: v.pdf_path })
    if (d.url) window.open(d.url, '_blank')
  }

  return (
    <div>
      <div className="adm-bar">
        <div className="adm-filters">
          <input placeholder="Szukaj: kod / odbiorca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Wszystkie</option>
            <option value="active">Aktywne</option>
            <option value="used">Użyte</option>
            <option value="expired">Wygasłe</option>
            <option value="cancelled">Anulowane</option>
          </select>
        </div>
      </div>
      {!rows ? <p className="adm-muted">Ładowanie…</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Kod</th><th>Odbiorca</th><th>Zawartość</th><th>Ważny do</th><th>Status</th><th>PDF</th><th></th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><b className="adm-code">{v.code}</b></td>
                  <td>{v.recipient}</td>
                  <td className="adm-muted" style={{ whiteSpace: 'pre-line', fontSize: 12 }}>{v.items_text}</td>
                  <td>{v.valid_until?.split('-').reverse().join('.')}</td>
                  <td><span className={`adm-badge is-${v.status}`}>{v.status}</span></td>
                  <td>{v.pdf_path ? <button className="adm-link" onClick={() => openPdf(v)}>Otwórz</button> : '—'}</td>
                  <td>
                    {v.status === 'active' && <button className="adm-link" onClick={() => setVoucherStatus(v, 'used')}>Oznacz użyty</button>}
                    {v.status === 'used' && <button className="adm-link" onClick={() => setVoucherStatus(v, 'active')}>Przywróć</button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="adm-muted">Brak voucherów</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
