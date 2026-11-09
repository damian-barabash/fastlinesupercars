import { useEffect, useMemo, useState } from 'react'
import { adminApi, zl } from '../lib/api.js'

// Vouchery świąteczne (/swieta-2026): tryb strony TEST/LIVE, cena wysyłki InPost,
// lista zamówień z kampanii i wysyłka wydruków do Paczkomatów („Do wysłania" → „Wysłane").

const fmt = (d) => (d ? new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const FILTERS = [
  ['all', 'Wszystkie'],
  ['ship', 'Do wysłania'],
  ['shipped', 'Wysłane'],
  ['live', 'Opłacone'],
  ['test', 'Testowe'],
]

export default function Gifts() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [shipNo, setShipNo] = useState({})
  const [fee, setFee] = useState('')
  const [busy, setBusy] = useState('')

  const load = () => adminApi('gifts.list').then((d) => { setData(d); setFee(String(d.inpost / 100)) }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const orders = data?.orders || []
  const paidReal = orders.filter((o) => o.status === 'paid' && !o.is_test)
  const toShip = orders.filter((o) => o.status === 'paid' && o.delivery === 'inpost' && !o.shipped_at && !o.is_test)
  const rows = useMemo(() => orders.filter((o) => {
    if (filter === 'ship') return o.status === 'paid' && o.delivery === 'inpost' && !o.shipped_at
    if (filter === 'shipped') return !!o.shipped_at
    if (filter === 'live') return o.status === 'paid' && !o.is_test
    if (filter === 'test') return o.is_test
    return true
  }), [orders, filter])

  async function setMode(mode) {
    const msg = mode === 'live'
      ? 'Włączyć PŁATNOŚCI na stronie świątecznej?\n\nOd tej chwili klienci płacą przez Tpay, a biuro dostaje kopie zamówień.'
      : 'Przełączyć stronę świąteczną w TRYB TESTOWY?\n\nVouchery będą powstawać bez płatności (mail tylko do kupującego).'
    if (!confirm(msg)) return
    setBusy('mode')
    try { await adminApi('gifts.settings', { mode }); await load() } catch (e) { alert(e.message) }
    setBusy('')
  }
  async function saveFee() {
    const g = Math.round(parseFloat(String(fee).replace(',', '.')) * 100)
    if (!Number.isFinite(g) || g < 0) { alert('Podaj kwotę w zł'); return }
    setBusy('fee')
    try { await adminApi('gifts.settings', { inpost: g }); await load() } catch (e) { alert(e.message) }
    setBusy('')
  }
  async function ship(o) {
    setBusy(o.id)
    try { await adminApi('gifts.ship', { id: o.id, shipping_no: shipNo[o.id] || '' }); await load() } catch (e) { alert(e.message) }
    setBusy('')
  }
  async function unship(o) {
    if (!confirm(`Cofnąć „wysłane" dla #${o.number}?`)) return
    setBusy(o.id)
    try { await adminApi('gifts.unship', { id: o.id }); await load() } catch (e) { alert(e.message) }
    setBusy('')
  }
  async function openPdf(e, v) {
    e.stopPropagation()
    const d = await adminApi('voucherPdfUrl', { path: v.pdf_path })
    if (d.url) window.open(d.url, '_blank')
  }

  if (err) return <p className="adm-err">{err}</p>
  if (!data) return <p className="adm-muted">Ładowanie…</p>
  const live = data.mode === 'live'

  return (
    <div>
      <div className="adm-bar">
        <h2 className="adm-h">Vouchery świąteczne</h2>
        <a className="adm-btn-sec" href="/swieta-2026" target="_blank" rel="noreferrer">Otwórz stronę ↗</a>
      </div>

      <div className="adm-card adm-gift-mode">
        <div>
          <div className="adm-card-title">Tryb strony /swieta-2026</div>
          <div className={`adm-gift-badge ${live ? 'is-live' : ''}`}>{live ? 'LIVE — płatności Tpay' : 'TEST — bez płatności'}</div>
          <p className="adm-muted" style={{ marginTop: 8 }}>
            {live
              ? 'Klienci płacą przez Tpay, biuro dostaje kopię każdego zamówienia.'
              : 'Voucher powstaje od razu bez płatności, mail idzie tylko na adres wpisany w formularzu. Testowe zamówienia nie liczą się do statystyk.'}
          </p>
        </div>
        <div className="adm-gift-actions">
          {live
            ? <button className="adm-btn-sec" disabled={busy === 'mode'} onClick={() => setMode('test')}>Przełącz na TEST</button>
            : <button className="adm-btn-sec adm-btn-go" disabled={busy === 'mode'} onClick={() => setMode('live')}>Włącz płatności</button>}
          <label className="adm-gift-fee">Wydruk + InPost
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /> zł
            <button className="adm-btn-sec" disabled={busy === 'fee' || String(data.inpost / 100) === fee} onClick={saveFee}>Zapisz</button>
          </label>
        </div>
      </div>

      <div className="adm-stats">
        {[
          [paidReal.length, 'Opłacone vouchery'],
          [zl(paidReal.reduce((s, o) => s + o.total, 0)), 'Przychód'],
          [toShip.length, 'Do wysłania (InPost)'],
          [orders.filter((o) => o.is_test).length, 'Testowe'],
        ].map(([v, l]) => (
          <div key={l} className="adm-card adm-stat"><div className="adm-stat-val">{v}</div><div className="adm-stat-label">{l}</div></div>
        ))}
      </div>

      <div className="adm-subtabs" style={{ margin: '18px 0 12px' }}>
        {FILTERS.map(([id, l]) => <button key={id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{l}</button>)}
      </div>

      {!rows.length ? <p className="adm-muted">Brak zamówień.</p> : (
        <div className="adm-table-wrap adm-card">
          <table className="adm-table">
            <thead><tr><th>#</th><th>Kupujący</th><th>Prezent</th><th>Dostawa</th><th>Kwota</th><th>Voucher</th><th>Data</th></tr></thead>
            <tbody>
              {rows.map((o) => {
                const it = o.items?.[0] || {}
                const dd = o.delivery_data || {}
                return (
                  <tr key={o.id} className="adm-row-click" onClick={() => setOpen(open === o.id ? null : o.id)}>
                    <td>#{o.number}{o.is_test && <span className="adm-pill adm-gift-test">TEST</span>}</td>
                    <td><b>{o.customer_name}</b>{o.invoice && <span className="adm-pill adm-pill-fv">FV</span>}<div className="adm-muted">{o.customer_email}</div>
                      {open === o.id && (
                        <div className="adm-order-detail">
                          {o.customer_phone && <div>Tel: {o.customer_phone}</div>}
                          {o.invoice && <div className="adm-order-invoice"><b>Faktura VAT:</b> {o.invoice.company}<br />NIP {o.invoice.nip} · {o.invoice.street}, {o.invoice.postal} {o.invoice.city}</div>}
                          {o.notes && <div>{o.notes}</div>}
                          {o.tpay_title && <div>Tpay: <b>{o.tpay_title}</b></div>}
                          {o.payment_error && <div className="adm-order-err">{o.payment_error}</div>}
                        </div>
                      )}
                    </td>
                    <td>Dla <b>{o.gift_for}</b><div className="adm-muted">{it.name}{it.variant ? ` — ${it.variant}` : ''}</div></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {o.delivery === 'inpost' ? (
                        <div className="adm-gift-ship">
                          <b>Paczkomat {dd.locker}</b>
                          <div className="adm-muted">{dd.address}</div>
                          <div className="adm-muted">{dd.name} · {dd.phone}</div>
                          {o.shipped_at ? (
                            <div className="adm-gift-shipped">✓ Wysłane {fmt(o.shipped_at)}{o.shipping_no ? ` · ${o.shipping_no}` : ''}
                              <button className="adm-link" onClick={() => unship(o)}>cofnij</button></div>
                          ) : o.status === 'paid' ? (
                            <div className="adm-gift-shipform">
                              <input placeholder="nr przesyłki (opcjonalnie)" value={shipNo[o.id] || ''} onChange={(e) => setShipNo({ ...shipNo, [o.id]: e.target.value })} />
                              <button className="adm-btn-sec" disabled={busy === o.id} onClick={() => ship(o)}>Wysłane ✓</button>
                            </div>
                          ) : null}
                        </div>
                      ) : <span className="adm-muted">E-mail</span>}
                    </td>
                    <td>{zl(o.total)}{o.delivery_fee ? <div className="adm-muted">w tym InPost {zl(o.delivery_fee)}</div> : null}<div className="adm-muted">{o.status === 'paid' ? (o.is_test ? 'test' : 'opłacone') : o.status === 'pending' ? 'czeka na płatność' : o.status}</div></td>
                    <td>{o.voucher ? <><b className="adm-code">{o.voucher.code}</b>{o.voucher.pdf_path && <div><button className="adm-link" onClick={(e) => openPdf(e, o.voucher)}>PDF</button></div>}</> : <span className="adm-muted">—</span>}</td>
                    <td className="adm-muted">{fmt(o.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
