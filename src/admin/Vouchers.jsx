// Panel: zakładka „Vouchery" — kody na przejazd (kind='product') i bony kwotowe (kind='amount').
//
// Bon kwotowy to kod o wartości w złotych, którym klient płaci w koszyku. Można go tu:
//   * wygenerować (dowolna ilość, z prefiksem i terminem ważności),
//   * wkleić ręcznie listą gotowych kodów (np. z wydruku),
//   * wczytać z pliku Excel/CSV z mapowaniem kolumn (kod / kwota / ważność / notatka / odbiorca).
// Kody z każdej operacji można od razu pobrać jako CSV — bez tego lista 200 kodów jest bezużyteczna.
import { useEffect, useMemo, useState } from 'react'
import { adminApi, zl } from '../lib/api.js'
import { parseSheet, toGrosze, toDate, guessMapping, looksLikeHeader } from './sheet.js'

const toGr = (z) => Math.round(parseFloat(String(z).replace(',', '.').replace(/[^\d.,-]/g, '') || 0) * 100)
const plDate = (d) => (d ? String(d).split('-').reverse().join('.') : '—')
/** 1 kod, 2–4 kody, 5+ kodów (i wyjątek dla 12–14). */
const plKod = (n) => {
  const ost = n % 10, dwie = n % 100
  if (n === 1) return 'kod'
  if (ost >= 2 && ost <= 4 && !(dwie >= 12 && dwie <= 14)) return 'kody'
  return 'kodów'
}
const COL_LETTER = (i) => String.fromCharCode(65 + (i % 26))

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------- wynik operacji: lista kodów do skopiowania / pobrania ---------- */

function CodesResult({ title, codes, amountGrosze, validUntil, report, onClose }) {
  if (!codes?.length && !report?.skipped_total) return null
  return (
    <div className="adm-card adm-codes-result">
      <div className="adm-bar" style={{ marginBottom: 12 }}>
        <h3 className="adm-card-title" style={{ margin: 0 }}>{title} — {codes.length} {plKod(codes.length)}</h3>
        <div className="adm-bar-btns">
          <button className="adm-btn-sec" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Kopiuj</button>
          <button className="adm-btn-sec" onClick={() => downloadCsv(
            `bony-${new Date().toISOString().slice(0, 10)}.csv`,
            [['Kod', 'Wartość (zł)', 'Ważny do'], ...codes.map((c) => [c, amountGrosze ? (amountGrosze / 100).toFixed(2) : '', validUntil || ''])],
          )}>Pobierz CSV</button>
          <button className="adm-icon-btn" title="Zamknij" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="adm-codes-box">{codes.join('\n')}</div>
      {report?.skipped_total > 0 && (
        <div className="adm-import-report">
          Pominięto <b>{report.skipped_total}</b> {plKod(report.skipped_total)}:
          <ul>{report.skipped.slice(0, 10).map((s2, i) => <li key={i}>wiersz {s2.row}: {s2.code || '—'} — {s2.reason}</li>)}</ul>
          {report.skipped.length > 10 && <span className="adm-hint">…i {report.skipped_total - 10} więcej</span>}
        </div>
      )}
    </div>
  )
}

/* ---------- generator bonów kwotowych ---------- */

function AmountGenerator({ onDone }) {
  const [mode, setMode] = useState('auto')       // auto = losowane kody, manual = wklejone
  const [form, setForm] = useState({ amount: '300', count: 10, prefix: 'BON', valid: '', note: '', batch: '' })
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const manualCodes = useMemo(
    () => manual.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean),
    [manual],
  )

  async function run() {
    setErr(''); setBusy(true)
    try {
      const amount_grosze = toGr(form.amount)
      if (!(amount_grosze > 0)) throw new Error('Podaj wartość bonu w złotych')
      if (mode === 'auto') {
        const d = await adminApi('vouchers.generate', {
          kind: 'amount', amount_grosze, count: +form.count || 1, prefix: form.prefix,
          valid_until: form.valid, note: form.note, batch: form.batch || undefined,
        })
        onDone({ title: 'Wygenerowane bony', codes: d.codes, amountGrosze: amount_grosze, validUntil: d.valid_until })
      } else {
        if (!manualCodes.length) throw new Error('Wklej przynajmniej jeden kod')
        const d = await adminApi('vouchers.import', {
          rows: manualCodes.map((code, i) => ({ code, row: i + 1 })),
          default_amount_grosze: amount_grosze, default_valid_until: form.valid,
          batch: form.batch || undefined,
        })
        onDone({ title: 'Dodane bony', codes: d.codes, amountGrosze: amount_grosze, validUntil: form.valid, report: d })
        setManual('')
      }
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div>
      <div className="adm-subtabs">
        <button className={mode === 'auto' ? 'is-active' : ''} onClick={() => setMode('auto')}>Wygeneruj kody</button>
        <button className={mode === 'manual' ? 'is-active' : ''} onClick={() => setMode('manual')}>Wklej własne kody</button>
      </div>

      <div className="adm-gen">
        <div className="field"><label>Wartość bonu (zł)</label><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="300" /></div>
        {mode === 'auto' && (
          <>
            <div className="field"><label>Ilość</label><input type="number" min="1" max="500" value={form.count} onChange={(e) => setForm({ ...form, count: +e.target.value })} /></div>
            <div className="field"><label>Prefiks kodu</label><input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} placeholder="BON" /></div>
          </>
        )}
        <div className="field"><label>Ważny do</label><input type="date" value={form.valid} onChange={(e) => setForm({ ...form, valid: e.target.value })} /><span className="adm-hint">puste = rok od dziś</span></div>
        <div className="field"><label>Partia</label><input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} placeholder="auto (data)" /></div>
        <div className="field"><label>Notatka</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="np. akcja świąteczna" /></div>
        <button className="btn btn-red" disabled={busy} onClick={run}>
          {busy ? 'Zapisywanie…' : mode === 'auto' ? 'Generuj bony' : `Dodaj ${manualCodes.length || ''} ${plKod(manualCodes.length)}`}
        </button>
      </div>

      {mode === 'manual' && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>Kody (jeden na linię albo po przecinku)</label>
          <textarea rows={6} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={'BON-1234-ABCD\nBON-5678-EFGH'} />
          <span className="adm-hint">Rozpoznano {manualCodes.length} {plKod(manualCodes.length)}. Wszystkie dostaną wartość i termin z pól powyżej.</span>
        </div>
      )}
      {err && <p className="adm-err">{err}</p>}
    </div>
  )
}

/* ---------- import z pliku ---------- */

const NONE = ''

function ImportPanel({ onDone }) {
  const [sheet, setSheet] = useState(null)          // { rows, width, name }
  const [header, setHeader] = useState(true)
  const [map, setMap] = useState({ code: NONE, amount: NONE, valid: NONE, note: NONE, recipient: NONE })
  const [defs, setDefs] = useState({ amount: '', valid: '', batch: '', prefix: 'BON' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState(null)

  async function pick(file) {
    setErr(''); setReport(null)
    try {
      const s = await parseSheet(file)
      const hdr = looksLikeHeader(s.rows)
      const body = hdr ? s.rows.slice(1) : s.rows
      const g = guessMapping(hdr ? s.rows[0] : [], body)
      setSheet({ ...s, name: file.name })
      setHeader(hdr)
      setMap({
        code: g.code ?? NONE, amount: g.amount ?? NONE, valid: g.valid ?? NONE,
        note: g.note ?? NONE, recipient: g.recipient ?? NONE,
      })
      setDefs((d) => ({ ...d, batch: d.batch || file.name.replace(/\.[^.]+$/, '').slice(0, 60) }))
    } catch (e) { setSheet(null); setErr(e.message) }
  }

  const dataRows = sheet ? (header ? sheet.rows.slice(1) : sheet.rows) : []
  const headerCells = sheet && header ? sheet.rows[0] : []
  const colLabel = (i) => (header && headerCells[i] ? `${COL_LETTER(i)} · ${headerCells[i]}` : `Kolumna ${COL_LETTER(i)}`)
  const cell = (r, i) => (i === NONE || i == null ? '' : r[i] ?? '')

  // wiersze przeliczone tak, jak polecą na serwer — na nich stoi podgląd i walidacja
  const prepared = useMemo(() => dataRows.map((r, i) => {
    const amount = map.amount === NONE ? toGr(defs.amount) : toGrosze(cell(r, map.amount))
    return {
      row: i + (header ? 2 : 1),
      code: String(cell(r, map.code) || '').trim().toUpperCase(),
      amount_grosze: amount || toGr(defs.amount),
      valid_until: map.valid === NONE ? defs.valid : (toDate(cell(r, map.valid)) || defs.valid),
      note: String(cell(r, map.note) || ''),
      recipient: String(cell(r, map.recipient) || ''),
    }
  }), [dataRows, map, defs, header])

  const problems = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const p of prepared) {
      if (p.code && !/^[A-Z0-9_-]{4,32}$/.test(p.code)) out.push({ ...p, why: 'kod ma niedozwolone znaki' })
      else if (p.code && seen.has(p.code)) out.push({ ...p, why: 'duplikat w pliku' })
      else if (!(p.amount_grosze > 0)) out.push({ ...p, why: 'brak kwoty' })
      if (p.code) seen.add(p.code)
    }
    return out
  }, [prepared])

  const okCount = prepared.length - problems.length

  async function runImport() {
    setBusy(true); setErr('')
    const batch = defs.batch || `import ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
    const acc = { added: 0, codes: [], skipped: [], skipped_total: 0 }
    try {
      for (let i = 0; i < prepared.length; i += 500) {
        const d = await adminApi('vouchers.import', {
          rows: prepared.slice(i, i + 500), batch, prefix: defs.prefix,
          default_amount_grosze: toGr(defs.amount), default_valid_until: defs.valid,
        })
        acc.added += d.added
        acc.codes.push(...(d.codes || []))
        acc.skipped.push(...(d.skipped || []))
        acc.skipped_total += d.skipped_total || 0
      }
      setReport(acc)
      onDone({ title: `Zaimportowane bony (${batch})`, codes: acc.codes, validUntil: defs.valid, report: acc })
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="adm-import">
      <div className="adm-import-drop">
        <label className="adm-btn-sec">
          Wybierz plik (.xlsx, .csv)
          <input type="file" hidden accept=".xlsx,.csv,.tsv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
        </label>
        <span className="adm-hint">
          {sheet ? `${sheet.name} — ${dataRows.length} wierszy` : 'Excel (.xlsx) albo CSV. Kolumny dopasujesz w następnym kroku.'}
        </span>
      </div>
      {err && <p className="adm-err">{err}</p>}

      {sheet && (
        <>
          <label className="adm-check">
            <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
            <span>Pierwszy wiersz to nagłówki</span>
          </label>

          <div className="adm-form-grid" style={{ marginTop: 12 }}>
            {[
              ['code', 'Kolumna z kodem', 'puste = kody wygenerujemy'],
              ['amount', 'Kolumna z kwotą', 'puste = wartość domyślna niżej'],
              ['valid', 'Kolumna z ważnością', 'puste = termin domyślny'],
              ['note', 'Kolumna z notatką', ''],
              ['recipient', 'Kolumna z odbiorcą', ''],
            ].map(([key, label, hint]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <select value={map[key]} onChange={(e) => setMap({ ...map, [key]: e.target.value === NONE ? NONE : +e.target.value })}>
                  <option value={NONE}>— brak —</option>
                  {Array.from({ length: sheet.width }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
                </select>
                {hint && <span className="adm-hint">{hint}</span>}
              </div>
            ))}
            <div className="field"><label>Wartość domyślna (zł)</label><input value={defs.amount} onChange={(e) => setDefs({ ...defs, amount: e.target.value })} placeholder="np. 300" /></div>
            <div className="field"><label>Ważność domyślna</label><input type="date" value={defs.valid} onChange={(e) => setDefs({ ...defs, valid: e.target.value })} /><span className="adm-hint">puste = rok od dziś</span></div>
            <div className="field"><label>Partia</label><input value={defs.batch} onChange={(e) => setDefs({ ...defs, batch: e.target.value })} /></div>
            {map.code === NONE && (
              <div className="field"><label>Prefiks losowanych kodów</label><input value={defs.prefix} onChange={(e) => setDefs({ ...defs, prefix: e.target.value.toUpperCase() })} /></div>
            )}
          </div>

          <div className="adm-table-wrap" style={{ marginTop: 14 }}>
            <table className="adm-table">
              <thead><tr><th>#</th><th>Kod</th><th>Wartość</th><th>Ważny do</th><th>Odbiorca</th><th>Notatka</th></tr></thead>
              <tbody>
                {prepared.slice(0, 8).map((p) => (
                  <tr key={p.row}>
                    <td className="adm-muted">{p.row}</td>
                    <td><b className="adm-code">{p.code || <span className="adm-muted">(wylosujemy)</span>}</b></td>
                    <td className={p.amount_grosze > 0 ? '' : 'adm-err-cell'}>{p.amount_grosze > 0 ? zl(p.amount_grosze) : 'brak'}</td>
                    <td>{p.valid_until ? plDate(p.valid_until) : <span className="adm-muted">rok od dziś</span>}</td>
                    <td className="adm-muted">{p.recipient || '—'}</td>
                    <td className="adm-muted">{p.note || '—'}</td>
                  </tr>
                ))}
                {prepared.length > 8 && <tr><td colSpan={6} className="adm-muted">…i {prepared.length - 8} więcej</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="adm-import-sum">
            <b>{okCount}</b> {plKod(okCount)} {okCount === 1 ? 'gotowy' : plKod(okCount) === 'kody' ? 'gotowe' : 'gotowych'} do importu
            {problems.length > 0 && <> · <span className="adm-err-cell">{problems.length} do pominięcia</span>: {problems.slice(0, 3).map((p) => `w. ${p.row} (${p.why})`).join(', ')}{problems.length > 3 ? '…' : ''}</>}
            {okCount > 0 && <> · łączna wartość <b>{zl(prepared.filter((p) => p.amount_grosze > 0).reduce((s, p) => s + p.amount_grosze, 0))}</b></>}
          </div>

          <button className="btn btn-red" disabled={busy || okCount === 0} onClick={runImport}>
            {busy ? 'Importuję…' : `Importuj ${okCount} ${plKod(okCount)}`}
          </button>

          {report && (
            <div className="adm-import-report">
              Dodano <b>{report.added}</b>. Pominięto <b>{report.skipped_total}</b>.
              {report.skipped.length > 0 && (
                <ul>{report.skipped.slice(0, 10).map((s, i) => <li key={i}>wiersz {s.row}: {s.code || '—'} — {s.reason}</li>)}</ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- generator kodów na produkt (dotychczasowy) ---------- */

function ProductGenerator({ products, onDone }) {
  const [gen, setGen] = useState({ product_id: '', variant: '', count: 5, prefix: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const genProduct = products.find((p) => p.id === gen.product_id)

  async function run() {
    if (!gen.product_id) return setErr('Wybierz produkt')
    setBusy(true); setErr('')
    try {
      const d = await adminApi('vouchers.generate', gen)
      onDone({ title: 'Wygenerowane kody na przejazd', codes: d.codes })
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div>
      <div className="adm-gen">
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
        <button className="btn btn-red" disabled={busy} onClick={run}>{busy ? 'Generowanie…' : 'Generuj'}</button>
      </div>
      {err && <p className="adm-err">{err}</p>}
    </div>
  )
}

/* ---------- zakładka ---------- */

export default function Vouchers() {
  const [rows, setRows] = useState(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState('')
  const [kind, setKind] = useState('amount')      // najczęstsza praca to bony kwotowe
  const [batch, setBatch] = useState('')
  const [products, setProducts] = useState([])
  const [batches, setBatches] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [addTab, setAddTab] = useState('amount')  // amount | import | product
  const [result, setResult] = useState(null)

  useEffect(() => { adminApi('products.list').then(setProducts).catch(() => {}) }, [])
  const loadBatches = () => adminApi('vouchers.batches').then(setBatches).catch(() => {})
  useEffect(() => { loadBatches() }, [])

  // kody z zakupów w sklepie żyją przy zamówieniach — tutaj tylko import/generacja
  const load = () => adminApi('vouchers.list', {
    status, search, batch, kind,
    product: kind === 'product' ? product : '',
    source: kind === 'amount' ? '' : 'import',
    limit: 2000,
  }).then(setRows).catch(() => {})

  useEffect(() => {
    setRows(null)
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [status, search, product, kind, batch])

  function afterAdd(res) {
    setResult(res)
    setAddOpen(false)
    setKind(res.title.includes('przejazd') ? 'product' : 'amount')
    loadBatches()
    load()
  }

  async function setVoucherStatus(v, s) {
    setRows((r) => r.map((x) => (x.id === v.id ? { ...x, status: s } : x)))
    try { await adminApi('vouchers.update', { id: v.id, status: s }) } catch (e) { alert(e.message); load() }
  }

  async function removeVoucher(v) {
    if (!confirm(`Usunąć kod ${v.code}? Tej operacji nie można cofnąć.`)) return
    try {
      await adminApi('vouchers.delete', { id: v.id })
      setRows((r) => r.filter((x) => x.id !== v.id))
      loadBatches()
    } catch (e) { alert(e.message) }
  }

  async function removeBatch(b) {
    if (!confirm(`Usunąć niewykorzystane kody z partii „${b.batch}"? (${b.count} ${plKod(b.count)})`)) return
    try {
      const d = await adminApi('vouchers.deleteBatch', { batch: b.batch })
      alert(`Usunięto ${d.deleted}. Zostawiono ${d.kept} (użyte przy zamówieniach).`)
      setBatch(''); loadBatches(); load()
    } catch (e) { alert(e.message) }
  }

  async function openPdf(v) {
    if (!v.pdf_path) return alert('Brak PDF dla tego vouchera')
    const d = await adminApi('voucherPdfUrl', { path: v.pdf_path })
    if (d.url) window.open(d.url, '_blank')
  }

  const isAmount = kind !== 'product'
  const total = (rows || []).reduce((s, v) => s + (+v.amount_grosze || 0), 0)
  const activeValue = (rows || []).filter((v) => v.status === 'active').reduce((s, v) => s + (+v.amount_grosze || 0), 0)
  const batchRow = batches.find((b) => b.batch === batch)

  return (
    <div>
      <div className="adm-bar">
        <div>
          <h2 className="adm-h">Vouchery</h2>
          <p className="adm-muted">
            {isAmount
              ? 'Bony kwotowe — kody o wartości w złotych, którymi klient płaci w koszyku. Jednorazowe.'
              : 'Kody na przejazd z importu i generatora. Vouchery z zakupów znajdziesz przy zamówieniach.'}
          </p>
        </div>
        <div className="adm-filters">
          <input placeholder="Szukaj: kod / odbiorca / notatka…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={kind} onChange={(e) => { setKind(e.target.value); setBatch('') }}>
            <option value="amount">Bony kwotowe</option>
            <option value="product">Na przejazd</option>
            <option value="">Wszystkie</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Status: wszystkie</option>
            <option value="active">Aktywne</option>
            <option value="used">Wykorzystane</option>
            <option value="expired">Wygasłe</option>
            <option value="cancelled">Anulowane</option>
          </select>
          {kind === 'product' && (
            <select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Produkt: wszystkie</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">Partia: wszystkie</option>
            {batches.map((b) => <option key={b.batch} value={b.batch}>{b.batch} ({b.count})</option>)}
          </select>
          <button className="btn btn-red" onClick={() => { setResult(null); setAddOpen(!addOpen) }}>{addOpen ? 'Zamknij' : '+ Dodaj kody'}</button>
        </div>
      </div>

      {addOpen && (
        <div className="adm-card">
          <div className="adm-subtabs adm-subtabs-main">
            <button className={addTab === 'amount' ? 'is-active' : ''} onClick={() => setAddTab('amount')}>Bon kwotowy</button>
            <button className={addTab === 'import' ? 'is-active' : ''} onClick={() => setAddTab('import')}>Import z pliku</button>
            <button className={addTab === 'product' ? 'is-active' : ''} onClick={() => setAddTab('product')}>Kod na przejazd</button>
          </div>
          {addTab === 'amount' && <AmountGenerator onDone={afterAdd} />}
          {addTab === 'import' && <ImportPanel onDone={afterAdd} />}
          {addTab === 'product' && <ProductGenerator products={products} onDone={afterAdd} />}
        </div>
      )}

      {result && <CodesResult {...result} onClose={() => setResult(null)} />}

      {isAmount && rows && rows.length > 0 && (
        <div className="adm-stats adm-stats-slim">
          <div className="adm-card adm-stat"><div className="adm-stat-val">{rows.length}</div><div className="adm-stat-label">Kodów na liście</div></div>
          <div className="adm-card adm-stat"><div className="adm-stat-val">{zl(activeValue)}</div><div className="adm-stat-label">Wartość aktywnych (zobowiązanie)</div></div>
          <div className="adm-card adm-stat"><div className="adm-stat-val">{zl(total)}</div><div className="adm-stat-label">Wartość nominalna razem</div></div>
        </div>
      )}

      {batchRow && (
        <div className="adm-batchbar">
          Partia <b>{batchRow.batch}</b>: {batchRow.count} {plKod(batchRow.count)}, aktywnych {batchRow.active}
          <div className="adm-bar-btns">
            <button className="adm-btn-sec" onClick={() => downloadCsv(`${batchRow.batch}.csv`, [
              ['Kod', 'Wartość (zł)', 'Ważny do', 'Status'],
              ...(rows || []).map((v) => [v.code, v.amount_grosze ? (v.amount_grosze / 100).toFixed(2) : '', v.valid_until, v.status]),
            ])}>Pobierz CSV partii</button>
            <button className="adm-btn-sec adm-btn-danger" onClick={() => removeBatch(batchRow)}>Usuń niewykorzystane</button>
          </div>
        </div>
      )}

      {!rows ? <p className="adm-muted">Ładowanie…</p> : (
        <div className="adm-table-wrap adm-card">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>{isAmount ? 'Wartość' : 'Zawartość'}</th>
                <th>Ważny do</th>
                <th>Status</th>
                <th>{isAmount ? 'Wykorzystany przy' : 'Odbiorca'}</th>
                <th>Partia / notatka</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>
                    <b className="adm-code">{v.code}</b>
                    {kind === '' && <div className="adm-muted">{v.kind === 'amount' ? 'kwotowy' : 'na przejazd'}</div>}
                  </td>
                  <td>{v.kind === 'amount'
                    ? <b>{zl(v.amount_grosze || 0)}</b>
                    : <span className="adm-muted" style={{ whiteSpace: 'pre-line', fontSize: 12 }}>{v.items_text}</span>}</td>
                  <td>{plDate(v.valid_until)}</td>
                  <td><span className={`adm-badge is-${v.status}`}>{v.status}</span></td>
                  <td>
                    {v.kind === 'amount'
                      ? (v.redemption?.order
                        ? <>#{v.redemption.order.number} <div className="adm-muted">{v.redemption.order.customer_name} · −{zl(v.redemption.amount_grosze)}</div></>
                        : <span className="adm-muted">{v.reserved_until && new Date(v.reserved_until) > new Date() ? 'w trakcie płatności' : '—'}</span>)
                      : (v.recipient || <span className="adm-muted">—</span>)}
                  </td>
                  <td className="adm-muted">{[v.batch, v.note].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {v.kind !== 'amount' && v.pdf_path && <button className="adm-link" onClick={() => openPdf(v)}>PDF</button>}{' '}
                    {v.status === 'active' && <button className="adm-link" onClick={() => setVoucherStatus(v, v.kind === 'amount' ? 'cancelled' : 'used')}>
                      {v.kind === 'amount' ? 'Anuluj' : 'Oznacz użyty'}
                    </button>}
                    {(v.status === 'cancelled' || v.status === 'used') && !v.redemption && (
                      <button className="adm-link" onClick={() => setVoucherStatus(v, 'active')}>Przywróć</button>
                    )}{' '}
                    {!v.redemption && !v.order_id && (
                      <button className="adm-icon-btn adm-del" title="Usuń kod" onClick={() => removeVoucher(v)}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="adm-muted">Brak kodów — dodaj je przyciskiem „+ Dodaj kody"</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button className="adm-btn-sec" onClick={() => downloadCsv(
            `vouchery-${new Date().toISOString().slice(0, 10)}.csv`,
            [['Kod', 'Rodzaj', 'Wartość (zł)', 'Ważny do', 'Status', 'Partia', 'Notatka'],
              ...rows.map((v) => [v.code, v.kind === 'amount' ? 'kwotowy' : 'na przejazd',
                v.amount_grosze ? (v.amount_grosze / 100).toFixed(2) : '', v.valid_until, v.status, v.batch, v.note])],
          )}>Pobierz widoczną listę (CSV)</button>
        </div>
      )}
    </div>
  )
}
