import { useEffect, useMemo, useState } from 'react'
import { adminApi, zl } from '../lib/api.js'
import { DEFAULTS } from '../data/defaults.js'
import VisualEditor from './VisualEditor.jsx'
import Templates from './Templates.jsx'
import './admin.css'

const TABS = [
  ['stats', 'Statystyki'],
  ['editor', 'Edycja strony'],
  ['products', 'Produkty'],
  ['orders', 'Zamówienia'],
  ['vouchers', 'Vouchery'],
  ['templates', 'Szablony'],
]

// grosze <-> złote helpers for form fields
const toZl = (g) => (g == null ? '' : String(g / 100).replace('.', ','))
const toGr = (z) => Math.round(parseFloat(String(z).replace(',', '.').replace(/[^\d.,-]/g, '') || 0) * 100)

export default function Admin() {
  const [token, setToken] = useState(sessionStorage.getItem('fs_admin_token') || '')
  const [tab, setTab] = useState('stats')

  useEffect(() => {
    const fn = () => setToken('')
    window.addEventListener('fs-admin-logout', fn)
    return () => window.removeEventListener('fs-admin-logout', fn)
  }, [])

  if (!token) return <Login onOk={(t) => { sessionStorage.setItem('fs_admin_token', t); setToken(t) }} />

  return (
    <div className="adm">
      <header className="adm-head">
        <div className="adm-head-brand">
          <img src="/img/2024_05_logo-grey.webp" alt="Fastline Supercars" className="adm-logo" />
          <span className="adm-head-title">Panel</span>
        </div>
        <nav className="adm-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <button className="adm-logout" onClick={() => { adminApi('logout').catch(() => {}); sessionStorage.removeItem('fs_admin_token'); setToken('') }}>
          Wyloguj
        </button>
      </header>
      <main className="adm-main">
        {tab === 'stats' && <Stats />}
        {tab === 'editor' && <VisualEditor />}
        {tab === 'products' && <Products />}
        {tab === 'orders' && <Orders />}
        {tab === 'vouchers' && <Vouchers />}
        {tab === 'templates' && <Templates />}
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
      <form onSubmit={submit} className="adm-login-box">
        <img src="/img/2024_05_logo-grey.webp" alt="Fastline Supercars" className="adm-login-logo" />
        <h1>Panel administracyjny</h1>
        <div className="field"><label>Login</label><input value={u} onChange={(e) => setU(e.target.value)} autoFocus /></div>
        <div className="field"><label>Hasło</label><input type="password" value={p} onChange={(e) => setP(e.target.value)} /></div>
        {err && <p className="adm-err">{err}</p>}
        <button className="btn btn-red" disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj'}</button>
      </form>
    </div>
  )
}

/* ---------- helpers ---------- */

async function uploadFile(file) {
  const b64 = await new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.readAsDataURL(file)
  })
  const d = await adminApi('upload', { name: file.name, base64: b64, type: file.type })
  return d.url
}

function UploadBtn({ onDone, children = 'Wgraj plik', className = 'adm-btn-sec' }) {
  const [busy, setBusy] = useState(false)
  return (
    <label className={`${className} ${busy ? 'is-busy' : ''}`}>
      {busy ? 'Wgrywanie…' : children}
      <input type="file" accept="image/*" hidden disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        setBusy(true)
        try { onDone(await uploadFile(f)) } catch (err) { alert('Błąd: ' + err.message) }
        setBusy(false)
        e.target.value = ''
      }} />
    </label>
  )
}

/* ---------- Statystyki ---------- */

function Stats() {
  const [s, setS] = useState(null)
  const [promo, setPromo] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    adminApi('stats').then(setS).catch(() => {})
    adminApi('settings.get').then((m) => setPromo({
      code: m.promo_code || '', percent: m.promo_percent || '10', min: String((+(m.promo_min_grosze || 0)) / 100),
    })).catch(() => {})
  }, [])
  if (!s) return <p className="adm-muted">Ładowanie…</p>
  const MONTH_NAMES = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień']
  const monthLabel = (m) => { const [y, mm] = m.split('-'); return `${MONTH_NAMES[+mm - 1]} ${y}` }
  const items = [
    { label: 'Vouchery aktywne', value: s.vouchers_active },
    { label: 'Vouchery użyte', value: s.vouchers_used },
    { label: 'Przychód łącznie', value: zl(s.revenue) },
  ]
  async function savePromo() {
    setSaving(true)
    try {
      await adminApi('settings.set', { data: { promo_code: promo.code.trim().toUpperCase(), promo_percent: promo.percent, promo_min_grosze: String(Math.round(parseFloat(String(promo.min).replace(',', '.')) * 100) || 0) } })
    } catch (e) { alert(e.message) }
    setSaving(false)
  }
  return (
    <div>
      <h2 className="adm-h">Statystyki</h2>
      <div className="adm-stats">
        {items.map((i) => (
          <div key={i.label} className="adm-card adm-stat">
            <div className="adm-stat-val">{i.value}</div>
            <div className="adm-stat-label">{i.label}</div>
          </div>
        ))}
      </div>
      <div className="adm-card adm-table-wrap" style={{ padding: 0 }}>
        <table className="adm-table">
          <thead><tr><th>Miesiąc</th><th>Zamówienia</th><th>Opłacone</th><th>Przychód</th></tr></thead>
          <tbody>
            {(s.months || []).map((m) => (
              <tr key={m.month}>
                <td style={{ textTransform: 'capitalize' }}><b>{monthLabel(m.month)}</b></td>
                <td>{m.orders}</td>
                <td>{m.paid}</td>
                <td><b>{zl(m.revenue)}</b></td>
              </tr>
            ))}
            {!(s.months || []).length && <tr><td colSpan={4} className="adm-muted">Brak danych</td></tr>}
          </tbody>
        </table>
      </div>
      {promo && (
        <div className="adm-card adm-promo">
          <h3 className="adm-card-title">Kod rabatowy <span className="adm-muted">(baner na stronie głównej)</span></h3>
          <div className="adm-promo-grid">
            <div className="field"><label>Kod</label><input value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value })} /></div>
            <div className="field"><label>Rabat %</label><input type="number" value={promo.percent} onChange={(e) => setPromo({ ...promo, percent: e.target.value })} /></div>
            <div className="field"><label>Min. zakupy (zł)</label><input value={promo.min} onChange={(e) => setPromo({ ...promo, min: e.target.value })} /></div>
            <button className="btn btn-red" disabled={saving} onClick={savePromo}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Produkty (visual editor, prices in zł) ---------- */



const slugify = (name) => name.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ł/g, 'l')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const BLANK_PRODUCT = {
  id: '', name: '', subtitle: '', description: '', images: [], cover: '',
  voucher_template: 'templates/alpine-a110.jpg', variants: [], price_from: 0,
  sort: 100, active: true, category: ['pelna-oferta'],
  short_specs: [], full_specs: [],
  tracks: ['Tor Łódź', 'Tor Modlin', 'Tor Wrocław', 'Tor Pszczółki', 'Tor Poznań'],
}

function Products() {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState([])

  const load = () => adminApi('products.list').then(setList).catch(() => {})
  useEffect(() => {
    load()
    adminApi('templates.list').then((ts) => setTemplates(ts.map((t) => t.path))).catch(() => {})
  }, [])

  if (!list) return <p className="adm-muted">Ładowanie…</p>

  function openEdit(p, isNew = false) {
    setEdit({
      ...p,
      isNew,
      images: [...(p.images || [])],
      variants: (p.variants || []).map((v) => ({ laps: v.laps, priceZl: toZl(v.price) })),
      priceFromZl: isNew ? '' : toZl(p.price_from),
    })
  }

  async function del(p) {
    if (!confirm(`Usunąć produkt „${p.name}"? Zniknie ze strony. Tej operacji nie można cofnąć.`)) return
    setList((l) => l.filter((x) => x.id !== p.id))
    try { await adminApi('products.delete', { id: p.id }) } catch (e) { alert(e.message); load() }
  }

  async function save() {
    if (!edit.name.trim()) return alert('Podaj nazwę produktu')
    let id = edit.id
    if (edit.isNew) {
      id = slugify(edit.name)
      if (!id) return alert('Podaj nazwę produktu')
      if (list.some((x) => x.id === id)) return alert(`Produkt o adresie „${id}" już istnieje — zmień nazwę`)
    }
    setBusy(true)
    try {
      const variants = edit.variants
        .filter((v) => v.laps.trim())
        .map((v) => ({ laps: v.laps.trim(), price: toGr(v.priceZl) }))
      const price_from = variants.length ? Math.min(...variants.map((v) => v.price)) : toGr(edit.priceFromZl)
      const p = {
        id, name: edit.name, subtitle: edit.subtitle, description: edit.description,
        images: edit.images, cover: edit.cover || edit.images[0] || '',
        voucher_template: edit.voucher_template, variants, price_from,
        sort: edit.sort, active: edit.active, category: edit.category,
        short_specs: edit.short_specs, full_specs: edit.full_specs, tracks: edit.tracks,
      }
      setList((l) => (edit.isNew ? [...l, p] : l.map((x) => (x.id === p.id ? { ...x, ...p } : x))))
      setEdit(null)
      await adminApi('products.save', { product: p })
      load()
    } catch (e) { alert('Błąd: ' + e.message) }
    setBusy(false)
  }

  if (edit) {
    return (
      <div>
        <div className="adm-bar">
          <h2 className="adm-h">{edit.isNew ? "Nowy produkt" : edit.name}</h2>
          <div className="adm-bar-btns">
            <button className="adm-btn-sec" onClick={() => setEdit(null)}>Anuluj</button>
            <button className="btn btn-red" disabled={busy} onClick={save}>{busy ? 'Zapisywanie…' : 'Zapisz produkt'}</button>
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title">Podstawowe</h3>
          <div className="adm-form-grid">
            <div className="field"><label>Nazwa</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="field"><label>Kolejność</label><input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: +e.target.value })} /></div>
            <div className="field"><label>Widoczny na stronie</label>
              <select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                <option value="1">Tak</option><option value="0">Nie</option>
              </select>
            </div>
            <div className="field adm-span"><label>Podtytuł</label><input value={edit.subtitle || ''} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></div>
            <div className="field adm-span"><label>Opis</label><textarea rows={6} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title">Warianty i ceny <span className="adm-muted">(ceny w złotych)</span></h3>
          <div className="adm-variants">
            {edit.variants.map((v, i) => (
              <div key={i} className="adm-variant-row">
                <input className="adm-variant-laps" value={v.laps} placeholder="np. 3 okrążenia"
                  onChange={(e) => setEdit({ ...edit, variants: edit.variants.map((x, j) => j === i ? { ...x, laps: e.target.value } : x) })} />
                <div className="adm-price-input">
                  <input value={v.priceZl} placeholder="0"
                    onChange={(e) => setEdit({ ...edit, variants: edit.variants.map((x, j) => j === i ? { ...x, priceZl: e.target.value } : x) })} />
                  <span>zł</span>
                </div>
                <button className="adm-icon-btn" title="Usuń wariant"
                  onClick={() => setEdit({ ...edit, variants: edit.variants.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="adm-btn-sec" onClick={() => setEdit({ ...edit, variants: [...edit.variants, { laps: '', priceZl: '' }] })}>+ Dodaj wariant</button>
            {edit.variants.length === 0 && (
              <div className="adm-price-input" style={{ marginTop: 10 }}>
                <label style={{ marginRight: 10 }}>Cena stała:</label>
                <input value={edit.priceFromZl} onChange={(e) => setEdit({ ...edit, priceFromZl: e.target.value })} />
                <span>zł</span>
              </div>
            )}
            {edit.variants.length > 0 && <p className="adm-muted">„Cena od" na stronie = najtańszy wariant.</p>}
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title">Zdjęcia <span className="adm-muted">(kliknij zdjęcie, aby ustawić okładkę)</span></h3>
          <div className="adm-prod-imgs">
            {edit.images.map((url, i) => (
              <div key={url + i} className={`adm-prod-img ${edit.cover === url ? 'is-cover' : ''}`}>
                <img src={url} alt="" onClick={() => setEdit({ ...edit, cover: url })} />
                {edit.cover === url && <span className="adm-cover-badge">Okładka</span>}
                <div className="adm-prod-img-btns">
                  <button className="adm-icon-btn" title="W lewo" disabled={i === 0} onClick={() => {
                    const a = [...edit.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setEdit({ ...edit, images: a })
                  }}>←</button>
                  <button className="adm-icon-btn" title="Usuń" onClick={() => setEdit({ ...edit, images: edit.images.filter((_, j) => j !== i) })}>✕</button>
                  <button className="adm-icon-btn" title="W prawo" disabled={i === edit.images.length - 1} onClick={() => {
                    const a = [...edit.images]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setEdit({ ...edit, images: a })
                  }}>→</button>
                </div>
              </div>
            ))}
            <UploadBtn className="adm-prod-img-add" onDone={(url) => setEdit({ ...edit, images: [...edit.images, url] })}>+ Dodaj zdjęcie</UploadBtn>
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title">Szablon vouchera PDF</h3>
          <div className="field" style={{ maxWidth: 360 }}>
            <select value={edit.voucher_template} onChange={(e) => setEdit({ ...edit, voucher_template: e.target.value })}>
              {(templates.length ? templates : [edit.voucher_template]).map((t) => <option key={t} value={t}>{t.replace('templates/', '').replace(/\.(jpg|png)$/i, '')}</option>)}
            </select>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="adm-bar">
        <h2 className="adm-h">Produkty</h2>
        <button className="btn btn-red" onClick={() => openEdit(BLANK_PRODUCT, true)}>+ Dodaj produkt</button>
      </div>
      <div className="adm-table-wrap adm-card">
        <table className="adm-table">
          <thead><tr><th></th><th>Produkt</th><th>Cena od</th><th>Warianty</th><th>Widoczny</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><img src={p.cover} alt="" className="adm-thumb" /></td>
                <td><b>{p.name}</b><div className="adm-muted">{p.id}</div></td>
                <td>{zl(p.price_from)}</td>
                <td>{p.variants?.length || 0}</td>
                <td>{p.active ? <span className="adm-badge is-active">tak</span> : <span className="adm-badge">nie</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="adm-btn-sec" onClick={() => openEdit(p)}>Edytuj</button>{' '}
                  <button className="adm-icon-btn adm-del" title="Usuń produkt" onClick={() => del(p)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------- Zamówienia ---------- */

function Orders() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => adminApi('orders.list', { status, search }).then(setRows).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [status, search])

  async function del(o) {
    if (!confirm(`Usunąć zamówienie #${o.number} (${o.customer_name})? Tej operacji nie można cofnąć.`)) return
    setRows((r) => r.filter((x) => x.id !== o.id))
    try { await adminApi('orders.delete', { id: o.id }) } catch (e) { alert(e.message) }
  }

  async function openPdf(e, v) {
    e.stopPropagation()
    const d = await adminApi('voucherPdfUrl', { path: v.pdf_path })
    if (d.url) window.open(d.url, '_blank')
  }

  return (
    <div>
      <div className="adm-bar">
        <h2 className="adm-h">Zamówienia</h2>
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
        <div className="adm-table-wrap adm-card">
          <table className="adm-table">
            <thead><tr><th>#</th><th>Klient</th><th>Voucher</th><th>Kwota</th><th>Status</th><th>Data</th><th></th></tr></thead>
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
                        {o.notes && <div>{o.notes}</div>}
                      </div>
                    )}
                  </td>
                  <td>
                    {o.voucher ? (
                      <>
                        <b className="adm-code" style={{ fontSize: 13 }}>{o.voucher.code}</b>
                        <div className="adm-order-vactions">
                          <span className={`adm-badge is-${o.voucher.status}`}>{o.voucher.status}</span>
                          {o.voucher.pdf_path && <button className="adm-link" onClick={(e) => openPdf(e, o.voucher)}>PDF</button>}
                        </div>
                      </>
                    ) : <span className="adm-muted">—</span>}
                  </td>
                  <td>{zl(o.total)}</td>
                  <td><span className={`adm-badge is-${o.status}`}>{o.status}</span></td>
                  <td className="adm-muted">{new Date(o.created_at).toLocaleString('pl-PL')}</td>
                  <td><button className="adm-icon-btn adm-del" title="Usuń zamówienie" onClick={(e) => { e.stopPropagation(); del(o) }}>✕</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="adm-muted">Brak zamówień</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------- Vouchery ---------- */

function Vouchers() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState('')
  const [products, setProducts] = useState([])
  const [gen, setGen] = useState({ product_id: '', variant: '', count: 5, prefix: '' })
  const [genBusy, setGenBusy] = useState(false)
  const [genOpen, setGenOpen] = useState(false)

  useEffect(() => { adminApi('products.list').then(setProducts).catch(() => {}) }, [])

  // only imported/generated codes here — vouchers from shop purchases live with their orders
  const load = () => adminApi('vouchers.list', { status, search, product, source: 'import' }).then(setRows).catch(() => {})
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [status, search, product])

  const genProduct = products.find((p) => p.id === gen.product_id)

  async function generate() {
    if (!gen.product_id) return alert('Wybierz produkt')
    setGenBusy(true)
    try {
      const d = await adminApi('vouchers.generate', gen)
      alert(`Wygenerowano ${d.codes.length} kodów:\n\n${d.codes.join('\n')}`)
      load()
    } catch (e) { alert(e.message) }
    setGenBusy(false)
  }

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
        <div>
          <h2 className="adm-h">Vouchery</h2>
          <p className="adm-muted">Kody z importu i wygenerowane. Vouchery z zakupów znajdziesz przy zamówieniach.</p>
        </div>
        <div className="adm-filters">
          <input placeholder="Szukaj: kod / odbiorca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Status: wszystkie</option>
            <option value="active">Aktywne</option>
            <option value="used">Użyte</option>
            <option value="expired">Wygasłe</option>
            <option value="cancelled">Anulowane</option>
          </select>
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Produkt: wszystkie</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn-red" onClick={() => setGenOpen(!genOpen)}>{genOpen ? 'Zamknij' : '+ Dodaj kody'}</button>
        </div>
      </div>
      {genOpen && (
        <div className="adm-card adm-gen">
          <div className="field">
            <label>Produkt</label>
            <select value={gen.product_id} onChange={(e) => setGen({ ...gen, product_id: e.target.value, variant: '' })}>
              <option value="">— wybierz —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Wariant</label>
            <select value={gen.variant} onChange={(e) => setGen({ ...gen, variant: e.target.value })}>
              <option value="">— bez wariantu —</option>
              {(genProduct?.variants || []).map((v) => <option key={v.laps} value={v.laps}>{v.laps}</option>)}
            </select>
          </div>
          <div className="field"><label>Ilość</label><input type="number" min="1" max="100" value={gen.count} onChange={(e) => setGen({ ...gen, count: +e.target.value })} /></div>
          <div className="field"><label>Prefiks (opcjonalnie)</label><input value={gen.prefix} placeholder="auto" onChange={(e) => setGen({ ...gen, prefix: e.target.value })} /></div>
          <button className="btn btn-red" disabled={genBusy} onClick={generate}>{genBusy ? 'Generowanie…' : 'Generuj'}</button>
        </div>
      )}
      {!rows ? <p className="adm-muted">Ładowanie…</p> : (
        <div className="adm-table-wrap adm-card">
          <table className="adm-table">
            <thead><tr><th>Kod</th><th>Odbiorca</th><th>Zawartość</th><th>Ważny do</th><th>Status</th><th>PDF</th><th></th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><b className="adm-code">{v.code}</b></td>
                  <td>{v.recipient || <span className="adm-muted">—</span>}</td>
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
