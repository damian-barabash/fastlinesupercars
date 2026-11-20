import { useEffect, useMemo, useState } from 'react'
import { adminApi, zl } from '../lib/api.js'

// Black Week: kod BLACK = „1+1" (drugi taki sam voucher gratis).
// Włącznik kodu + lista zamówień, w których klient go użył (każde ma dwa vouchery).

const fmt = (d) => (d ? new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const FILTERS = [
  ['all', 'Wszystkie'],
  ['paid', 'Opłacone'],
  ['pending', 'Oczekujące'],
]

export default function BlackWeek() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)

  const load = () => adminApi('black.get').then(setData).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const orders = data?.orders || []
  const paid = orders.filter((o) => o.status === 'paid')
  const rows = useMemo(() => orders.filter((o) => filter === 'all' || (filter === 'paid' ? o.status === 'paid' : o.status !== 'paid')), [orders, filter])

  async function toggle() {
    const on = !data.active
    const msg = on
      ? `Włączyć kod ${data.code}?\n\nKażde zamówienie z tym kodem dostanie drugi taki sam voucher gratis.`
      : `Wyłączyć kod ${data.code}?\n\nKlienci zobaczą komunikat, że kod nie jest aktywny. Wystawione vouchery zostają ważne.`
    if (!confirm(msg)) return
    setBusy(true)
    try { await adminApi('black.set', { active: on }); await load() } catch (e) { alert(e.message) }
    setBusy(false)
  }

  async function openPdf(e, v) {
    e.stopPropagation()
    const d = await adminApi('voucherPdfUrl', { path: v.pdf_path })
    if (d.url) window.open(d.url, '_blank')
  }

  if (err) return <p className="adm-err">{err}</p>
  if (!data) return <p className="adm-muted">Ładowanie…</p>

  const voucherCell = (v, label) => v ? (
    <div className="adm-bw-voucher">
      <span className="adm-muted">{label}{v.recipient ? ` · ${v.recipient}` : ''}</span>
      <div>
        <b className="adm-code" style={{ fontSize: 13 }}>{v.code}</b>
        <span className={`adm-badge is-${v.status}`}>{v.status}</span>
        {v.pdf_path && <button className="adm-link" onClick={(e) => openPdf(e, v)}>PDF</button>}
      </div>
    </div>
  ) : null

  return (
    <div>
      <div className="adm-bar">
        <h2 className="adm-h">Black Week</h2>
      </div>

      <div className={`adm-card adm-bw-code ${data.active ? 'is-on' : ''}`}>
        <div className="adm-bw-code-name">{data.code}</div>
        <div className="adm-bw-code-info">
          <div className="adm-bw-code-title">
            Drugi taki sam voucher gratis
            <span className={`adm-badge ${data.active ? 'is-active' : 'is-cancelled'}`}>{data.active ? 'Aktywny' : 'Wyłączony'}</span>
          </div>
          <p className="adm-muted">
            Klient wpisuje kod w koszyku (krok „Podsumowanie"), strona przechodzi w ciemny motyw i prosi o imię do drugiego vouchera.
            Po płatności dostaje mailem dwa PDF-y z osobnymi kodami. Kod nie obniża ceny i nie łączy się z kodami procentowymi.
          </p>
        </div>
        <button className={`adm-btn-sec ${data.active ? '' : 'adm-btn-go'}`} disabled={busy} onClick={toggle}>
          {data.active ? 'Wyłącz kod' : 'Włącz kod'}
        </button>
      </div>

      <div className="adm-stats">
        {[
          [paid.length, 'Opłacone zamówienia'],
          [zl(paid.reduce((s, o) => s + o.total, 0)), 'Przychód'],
          [paid.filter((o) => o.bonus_voucher).length, 'Vouchery gratis'],
          [orders.length - paid.length, 'Nieopłacone'],
        ].map(([v, l]) => (
          <div key={l} className="adm-card adm-stat"><div className="adm-stat-val">{v}</div><div className="adm-stat-label">{l}</div></div>
        ))}
      </div>

      <div className="adm-subtabs" style={{ margin: '18px 0 12px' }}>
        {FILTERS.map(([id, l]) => <button key={id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{l}</button>)}
      </div>

      {!rows.length ? <p className="adm-muted">Brak zamówień z kodem {data.code}.</p> : (
        <div className="adm-table-wrap adm-card">
          <table className="adm-table">
            <thead><tr><th>#</th><th>Klient</th><th>Zamówienie</th><th>Vouchery</th><th>Kwota</th><th>Status</th><th>Data</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="adm-row-click" onClick={() => setOpen(open === o.id ? null : o.id)}>
                  <td>#{o.number}</td>
                  <td><b>{o.customer_name}</b>{o.invoice && <span className="adm-pill adm-pill-fv">FV</span>}<div className="adm-muted">{o.customer_email}</div>
                    {open === o.id && (
                      <div className="adm-order-detail">
                        {o.customer_phone && <div>Tel: {o.customer_phone}</div>}
                        {o.invoice && <div className="adm-order-invoice"><b>Faktura VAT:</b> {o.invoice.company}<br />NIP {o.invoice.nip} · {o.invoice.street}, {o.invoice.postal} {o.invoice.city}</div>}
                        {o.notes && <div>{o.notes}</div>}
                        {o.tpay_title && <div>Tpay: <b>{o.tpay_title}</b>{o.paid_amount ? ` · wpłacono ${zl(o.paid_amount)}` : ''}</div>}
                        {o.payment_error && <div className="adm-order-err">Płatność: {o.payment_error}</div>}
                      </div>
                    )}
                  </td>
                  <td>
                    {(o.items || []).map((it, i) => <div key={i}>{it.qty}× {it.name}{it.variant ? ` — ${it.variant}` : ''}</div>)}
                    <div className="adm-muted">gratis dla: {o.bonus_for || o.gift_for || o.customer_name}</div>
                  </td>
                  <td>
                    {o.voucher || o.bonus_voucher
                      ? <>{voucherCell(o.voucher, 'Kupiony')}{voucherCell(o.bonus_voucher, 'Gratis')}</>
                      : <span className="adm-muted">—</span>}
                  </td>
                  <td>{zl(o.total)}</td>
                  <td><span className={`adm-badge is-${o.status}`}>{o.status}</span></td>
                  <td className="adm-muted">{fmt(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
