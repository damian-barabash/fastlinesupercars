import { useEffect, useState } from 'react'
import { adminApi } from '../lib/api.js'

// Kwarantanna poczty przychodzącej: listy na rezerwacje@, które filtr w `mail-forward`
// uznał za spam i NIE przekazał do biura. Tu można je przejrzeć, przekazać mimo to
// i dopisać nadawcę do listy zaufanych albo blokowanych (settings mail_allow / mail_block).

const fmt = (d) => new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const addrOf = (v) => (String(v || '').match(/<([^>]+)>/)?.[1] || String(v || '')).trim().toLowerCase()
const splitList = (v) => String(v || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)

export default function Spam() {
  const [status, setStatus] = useState('held')
  const [rows, setRows] = useState(null)
  const [held30, setHeld30] = useState(0)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [allow, setAllow] = useState('')
  const [block, setBlock] = useState('')
  const [listsSaved, setListsSaved] = useState(true)

  const load = () => {
    setErr('')
    adminApi('spam.list', { status })
      .then((r) => { setRows(r.rows || []); setHeld30(r.held_30d || 0) })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [status])
  useEffect(() => {
    adminApi('settings.get').then((m) => {
      setAllow(splitList(m.mail_allow).join('\n'))
      setBlock(splitList(m.mail_block).join('\n'))
    }).catch(() => {})
  }, [])

  const saveLists = async (a = allow, b = block) => {
    await adminApi('settings.set', { data: { mail_allow: splitList(a).join('\n'), mail_block: splitList(b).join('\n') } })
    setListsSaved(true)
  }

  const release = async (r, trust) => {
    setBusy(r.email_id); setMsg(''); setErr('')
    try {
      await adminApi('spam.release', { email_id: r.email_id })
      if (trust) {
        const a = addrOf(r.from_addr)
        if (a && !splitList(allow).includes(a)) {
          const next = [...splitList(allow), a].join('\n')
          setAllow(next)
          await saveLists(next, block)
        }
      }
      setMsg(`Przekazano do biura: „${r.subject || '(bez tematu)'}”${trust ? ' — nadawca dodany do zaufanych' : ''}`)
      load()
    } catch (e) {
      setErr(e.message)
    } finally { setBusy('') }
  }

  const del = async (r) => {
    setBusy(r.email_id); setErr('')
    try { await adminApi('spam.delete', { email_id: r.email_id }); load() } catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  return (
    <div>
      <div className="adm-bar">
        <h2 className="adm-h">Spam <span className="adm-count">{held30}</span></h2>
      </div>
      <p className="adm-muted" style={{ marginBottom: 16, maxWidth: 760 }}>
        Listy na <b>rezerwacje@fastlinesupercars.pl</b>, które filtr uznał za spam (podszywanie się pod Facebooka,
        banki, kurierów, oferty SEO i stron, boty w formularzu) — <b>nie trafiły do skrzynki biura</b>.
        Jeśli coś jest prawdziwą wiadomością, kliknij „Przekaż". Licznik = zatrzymane w ostatnich 30 dniach.
      </p>

      <div className="adm-subtabs">
        {[['held', 'Zatrzymane'], ['released', 'Przekazane ręcznie'], ['all', 'Wszystkie']].map(([id, l]) => (
          <button key={id} className={status === id ? 'is-active' : ''} onClick={() => setStatus(id)}>{l}</button>
        ))}
      </div>

      {msg && <p className="adm-spam-ok">{msg}</p>}
      {err && <p className="adm-err" style={{ marginBottom: 12 }}>{err}</p>}

      <div className="adm-table-wrap adm-card" style={{ padding: 0 }}>
        <table className="adm-table adm-spam-table">
          <thead><tr><th className="adm-spam-dcol">Data</th><th>Od / temat</th><th>Pkt</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={4} className="adm-muted">Ładowanie…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={4} className="adm-muted">Pusto — nic nie zostało zatrzymane.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.email_id} className={open === r.email_id ? 'is-open' : ''}>
                <td className="adm-spam-dcol" style={{ whiteSpace: 'nowrap' }}>{fmt(r.received_at)}</td>
                <td className="adm-spam-main" onClick={() => setOpen(open === r.email_id ? null : r.email_id)}>
                  <div className="adm-spam-date">{fmt(r.received_at)}</div>
                  <div className="adm-spam-from">{r.from_addr}</div>
                  <div className="adm-spam-subj">{r.subject || '(bez tematu)'}</div>
                  {open === r.email_id ? (
                    <div className="adm-spam-more">
                      <div className="adm-spam-snippet">{r.snippet || '(brak treści)'}</div>
                      <ul className="adm-spam-reasons">{(r.reasons || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                      {r.status === 'released' && <div className="adm-muted">Przekazany {r.released_at ? fmt(r.released_at) : ''}{r.released_by ? ` przez ${r.released_by}` : ''}</div>}
                    </div>
                  ) : (
                    <div className="adm-muted adm-spam-why">{(r.reasons || []).slice(0, 2).join(' · ')}</div>
                  )}
                </td>
                <td><span className="adm-spam-score">{r.score}</span></td>
                <td className="adm-spam-actions">
                  {r.status === 'held' ? (
                    <>
                      <button className={`adm-btn-sec ${busy === r.email_id ? 'is-busy' : ''}`} onClick={() => release(r, false)}>Przekaż</button>
                      <button className={`adm-btn-sec ${busy === r.email_id ? 'is-busy' : ''}`} title="Przekaż i zawsze przepuszczaj tego nadawcę" onClick={() => release(r, true)}>Przekaż i ufaj</button>
                    </>
                  ) : <span className="adm-badge is-active">przekazany</span>}
                  <button className="adm-icon-btn adm-del" title="Usuń z listy" onClick={() => del(r)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adm-card">
        <h3 className="adm-card-title">Listy nadawców <span className="adm-muted">— adres (jan@firma.pl) albo cała domena (firma.pl), jeden w linii</span></h3>
        <div className="adm-spam-lists">
          <div className="field">
            <label>Zawsze przepuszczaj</label>
            <textarea rows={6} value={allow} onChange={(e) => { setAllow(e.target.value); setListsSaved(false) }} placeholder="np. partner.pl" />
          </div>
          <div className="field">
            <label>Zawsze blokuj</label>
            <textarea rows={6} value={block} onChange={(e) => { setBlock(e.target.value); setListsSaved(false) }} placeholder="np. searchindex.pro" />
          </div>
        </div>
        <button className="btn btn-red" disabled={listsSaved} onClick={() => saveLists().catch((e) => setErr(e.message))}>
          {listsSaved ? 'Zapisane' : 'Zapisz listy'}
        </button>
      </div>
    </div>
  )
}
