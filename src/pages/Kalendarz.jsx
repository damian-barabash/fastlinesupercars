import { useEffect, useRef } from 'react'
import { Reveal } from '../components/Reveal.jsx'
import { T } from '../lib/content.jsx'

// Booking widget from panel.fastlinesupercars.pl (kalendarz-fs)
export default function Kalendarz() {
  const host = useRef(null)

  useEffect(() => {
    const s = document.createElement('script')
    s.src = 'https://panel.fastlinesupercars.pl/widget.js'
    s.defer = true
    document.body.appendChild(s)
    return () => { s.remove() }
  }, [])

  return (
    <main>
      <section className="section page-head" style={{ paddingBottom: 24 }}>
        <div className="wrap">
          <Reveal>
            <span className="r-label">Kalendarz</span>
            <h1 className="h-xl" style={{ marginTop: 14 }}><T k="kal.title" /></h1>
            <p className="muted" style={{ marginTop: 14, maxWidth: 720 }}><T k="kal.info" /></p>
          </Reveal>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 24 }}>
        <div className="wrap">
          {/* kalendarz-fs widget mounts here (same embed as WP: <div id="fs-kalendarz">) */}
          <div ref={host} id="fs-kalendarz" style={{ minHeight: 420 }} />
        </div>
      </section>
    </main>
  )
}
