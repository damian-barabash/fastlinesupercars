// Visual on-page content editor (FIQ-style): renders the real site pages
// with contenteditable texts; changes are collected and saved in one batch.
import { useRef, useState } from 'react'
import { ContentProvider } from '../lib/content.jsx'
import { adminApi } from '../lib/api.js'

async function uploadFile(file) {
  const b64 = await new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.readAsDataURL(file)
  })
  const d = await adminApi('upload', { name: file.name, base64: b64, type: file.type })
  return d.url
}
import Nav from '../components/Nav.jsx'
import Footer from '../components/Footer.jsx'
import Home from '../pages/Home.jsx'
import Oferta from '../pages/Oferta.jsx'
import ONas from '../pages/ONas.jsx'
import Tory from '../pages/Tory.jsx'
import Kontakt from '../pages/Kontakt.jsx'
import Kalendarz from '../pages/Kalendarz.jsx'

const PAGES = [
  ['home', 'Strona główna', Home],
  ['oferta', 'Oferta', Oferta],
  ['onas', 'O nas', ONas],
  ['tory', 'Tory', Tory],
  ['kalendarz', 'Kalendarz', Kalendarz],
  ['kontakt', 'Kontakt', Kontakt],
]

export default function VisualEditor() {
  const [page, setPage] = useState('home')
  const [dirty, setDirty] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const dirtyRef = useRef({})

  const Cmp = PAGES.find(([id]) => id === page)[2]

  function onDirty(key, value) {
    dirtyRef.current = { ...dirtyRef.current, [key]: value }
    setDirty(dirtyRef.current)
  }

  async function save() {
    setSaving(true)
    try {
      await adminApi('content.set', { data: dirtyRef.current })
      dirtyRef.current = {}
      setDirty({})
      setSavedAt(Date.now())
    } catch (e) { alert('Błąd zapisu: ' + e.message) }
    setSaving(false)
  }

  const dirtyCount = Object.keys(dirty).length

  return (
    <div className="ve">
      <div className="ve-bar">
        <div className="ve-pages">
          {PAGES.map(([id, label]) => (
            <button key={id} className={page === id ? 'is-active' : ''} onClick={() => setPage(id)}>{label}</button>
          ))}
        </div>
        <div className="ve-bar-right">
          <span className="adm-muted">Kliknij tekst, aby edytować · kliknij zdjęcie, aby je podmienić · potem zapisz.</span>
          <button className="btn btn-red" disabled={!dirtyCount || saving} onClick={save}>
            {saving ? 'Zapisywanie…' : dirtyCount ? `Zapisz zmiany (${dirtyCount})` : savedAt ? '✓ Zapisano' : 'Brak zmian'}
          </button>
        </div>
      </div>
      <div
        className="ve-canvas"
        onClickCapture={(e) => {
          // block navigation & cart actions inside the preview
          const a = e.target.closest('a')
          if (a) { e.preventDefault(); e.stopPropagation() }
        }}
      >
        <ContentProvider editing onDirty={onDirty} onUpload={uploadFile}>
          <Nav />
          <Cmp />
          <Footer />
        </ContentProvider>
      </div>
    </div>
  )
}
