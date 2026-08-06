// Voucher template manager: upload new template JPGs and visually arrange
// the text layout (drag blocks on the preview; positions saved per template).
import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../lib/api.js'

const DEFAULT_LAYOUT = {
  name: { x: 0.235, y: 0.335, size: 0.085, maxW: 0.40 },
  items: { x: 0.235, y: 0.575, size: 0.048, maxW: 0.42, gap: 0.062 },
  valid: { x: 0.792, y: 0.908, size: 0.030 },
  code: { x: 0.792, y: 0.9515, size: 0.030 },
}

const BLOCKS = [
  { id: 'name', label: 'Imię i nazwisko', sample: 'SZYMONA ŁĘCZKIEWICZA', bold: true },
  { id: 'items', label: 'Lista zakupów', sample: ['ALPINE A110 — 5 OKRĄŻEŃ', 'TOYOTA GR YARIS — 2 OKRĄŻENIA'] },
  { id: 'valid', label: 'Ważność', sample: 'Ważność: 06.08.2027' },
  { id: 'code', label: 'Kod', sample: 'Kod vouchera: FS-XXXX-XXXX' },
]

export default function Templates() {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null) // { path, url, layout }
  const [saving, setSaving] = useState(false)
  const [upName, setUpName] = useState('')

  const load = () => adminApi('templates.list').then(setList).catch((e) => alert(e.message))
  useEffect(() => { load() }, [])

  async function uploadTemplate(file) {
    if (!upName.trim()) { alert('Najpierw wpisz nazwę szablonu (np. Lamborghini Huracan)'); return }
    const b64 = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.readAsDataURL(file)
    })
    try {
      await adminApi('templates.upload', { name: upName.trim(), base64: b64, type: file.type })
      setUpName('')
      load()
    } catch (e) { alert('Błąd: ' + e.message) }
  }

  async function del(t) {
    if (!confirm(`Usunąć szablon ${t.name}?`)) return
    try {
      await adminApi('templates.delete', { path: t.path })
      load()
    } catch (e) { alert(e.message) }
  }

  async function saveLayout() {
    setSaving(true)
    try {
      await adminApi('templates.saveLayout', { path: edit.path, layout: edit.layout })
      setList((l) => l.map((t) => (t.path === edit.path ? { ...t, layout: edit.layout } : t)))
      setEdit(null)
    } catch (e) { alert('Błąd zapisu: ' + e.message) }
    setSaving(false)
  }

  if (!list) return <p className="adm-muted">Ładowanie…</p>

  if (edit) {
    return (
      <TemplateEditor
        edit={edit}
        setEdit={setEdit}
        onSave={saveLayout}
        saving={saving}
      />
    )
  }

  return (
    <div>
      <div className="adm-bar">
        <div>
          <h2 className="adm-h">Szablony voucherów</h2>
          <p className="adm-muted">Tła PDF-ów. „Edytuj układ" pozwala przesuwać teksty (imię, zakupy, ważność, kod) na szablonie.</p>
        </div>
        <div className="adm-filters">
          <input placeholder="Nazwa nowego szablonu…" value={upName} onChange={(e) => setUpName(e.target.value)} />
          <label className="btn btn-red" style={{ cursor: 'pointer' }}>
            + Wgraj szablon
            <input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadTemplate(f); e.target.value = '' }} />
          </label>
        </div>
      </div>
      <div className="adm-tpls">
        {list.map((t) => (
          <div key={t.path} className="adm-card adm-tpl">
            <div className="adm-tpl-preview">
              {t.url ? <img src={t.url} alt={t.name} loading="lazy" /> : <span className="adm-muted">brak podglądu</span>}
            </div>
            <div className="adm-tpl-meta">
              <b>{t.name.replace(/\.(jpg|png)$/i, '')}</b>
              <span className="adm-muted">{t.layout ? 'własny układ tekstów' : 'układ domyślny'}</span>
              <div className="adm-tpl-actions">
                <button className="adm-btn-sec" onClick={() => setEdit({ path: t.path, url: t.url, layout: structuredClone(t.layout || DEFAULT_LAYOUT) })}>Edytuj układ</button>
                <button className="adm-icon-btn adm-del" title="Usuń szablon" onClick={() => del(t)}>✕</button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="adm-muted">Brak szablonów</p>}
      </div>
    </div>
  )
}

function TemplateEditor({ edit, setEdit, onSave, saving }) {
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const [sel, setSel] = useState('name')

  function startDrag(e, id) {
    e.preventDefault()
    setSel(id)
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = { id, rect }
    const move = (ev) => {
      const d = dragRef.current
      if (!d) return
      const x = Math.min(0.98, Math.max(0.02, (ev.clientX - d.rect.left) / d.rect.width))
      const y = Math.min(0.98, Math.max(0.0, (ev.clientY - d.rect.top) / d.rect.height))
      setEdit((s) => ({ ...s, layout: { ...s.layout, [d.id]: { ...s.layout[d.id], x, y } } }))
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function bumpSize(delta) {
    setEdit((s) => {
      const b = s.layout[sel]
      const size = Math.min(0.2, Math.max(0.012, +(b.size + delta).toFixed(4)))
      return { ...s, layout: { ...s.layout, [sel]: { ...b, size } } }
    })
  }

  const canvasH = () => canvasRef.current?.getBoundingClientRect().height || 400

  return (
    <div>
      <div className="adm-bar">
        <div>
          <h2 className="adm-h">Układ tekstów</h2>
          <p className="adm-muted">Przeciągnij bloki na właściwe miejsca. Zaznaczony blok: <b>{BLOCKS.find((b) => b.id === sel)?.label}</b> — rozmiar czcionki:</p>
        </div>
        <div className="adm-bar-btns">
          <button className="adm-btn-sec" onClick={() => bumpSize(-0.004)}>A−</button>
          <button className="adm-btn-sec" onClick={() => bumpSize(+0.004)}>A+</button>
          <button className="adm-btn-sec" onClick={() => setEdit(null)}>Anuluj</button>
          <button className="btn btn-red" disabled={saving} onClick={onSave}>{saving ? 'Zapisywanie…' : 'Zapisz układ'}</button>
        </div>
      </div>
      <div className="adm-card" style={{ padding: 10 }}>
        <div className="adm-tpl-canvas" ref={canvasRef}>
          <img src={edit.url} alt="" draggable={false} />
          {BLOCKS.map((b) => {
            const L = edit.layout[b.id]
            const fs = L.size * canvasH()
            const lines = Array.isArray(b.sample) ? b.sample : [b.sample]
            return (
              <div
                key={b.id}
                className={`adm-tpl-block ${sel === b.id ? 'is-sel' : ''}`}
                style={{ left: `${L.x * 100}%`, top: `${L.y * 100}%` }}
                onPointerDown={(e) => startDrag(e, b.id)}
                title={b.label}
              >
                {lines.map((ln, i) => (
                  <div
                    key={i}
                    className="adm-tpl-line"
                    style={{
                      fontSize: fs,
                      fontWeight: b.bold ? 700 : 500,
                      marginTop: i > 0 ? (edit.layout.items.gap * canvasH() - fs) : 0,
                    }}
                  >{ln}</div>
                ))}
                <span className="adm-tpl-tag">{b.label}</span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="adm-muted">Imię i lista zakupów są wyśrodkowane względem punktu, w którym je ustawisz. Długie teksty zmniejszają się automatycznie w PDF.</p>
    </div>
  )
}
