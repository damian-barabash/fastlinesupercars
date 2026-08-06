import { Link, useParams } from 'react-router-dom'
import { TORY } from '../data/tory.js'
import { Reveal, Stagger, Item } from '../components/Reveal.jsx'
import ContactSection from '../components/ContactSection.jsx'
import './tory.css'

export default function TorDetail() {
  const { slug } = useParams()
  const t = TORY.find((x) => x.slug === slug)
  if (!t) {
    return (
      <main className="section wrap tac">
        <h1 className="h-lg">Nie znaleziono toru</h1>
        <Link to="/tory" className="btn btn-red" style={{ marginTop: 24 }}>Wszystkie tory</Link>
      </main>
    )
  }
  const others = TORY.filter((x) => x.slug !== slug)
  return (
    <main>
      <section className="section page-head tor-head">
        <div className="wrap tor-head-grid">
          <Reveal>
            <span className="r-label">Tor wyścigowy</span>
            <h1 className="h-xl" style={{ marginTop: 14 }}>{t.name}</h1>
            <div className="tor-opis">
              {t.opis.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <Link to="/kalendarz" className="btn btn-red" style={{ marginTop: 28 }}>Zarezerwuj termin</Link>
          </Reveal>
          <Reveal delay={0.12} className="tor-map-panel carbon">
            <span className="r-label">Nitka toru</span>
            <img src={t.map} alt={`Nitka toru — ${t.name}`} className="tor-map-img" />
          </Reveal>
        </div>
      </section>

      {/* charakterystyka */}
      <section className="tor-stats-sec">
        <div className="wrap">
          <Stagger className="tor-stats">
            {t.stats.map((s) => (
              <Item key={s.label} className="tor-stat">
                <div className="tor-stat-num">{s.num}</div>
                <div className="tor-stat-label">{s.label}</div>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* sections */}
      {t.sections.length > 0 && (
        <section className="section">
          <div className="wrap tor-sections">
            {t.sections.map((s, i) => (
              <Reveal key={i} className="tor-section">
                <h2 className="h-md">{s.h}</h2>
                {s.p.map((par, j) => <p key={j} className="tor-par">{par}</p>)}
                {s.li && (
                  <ul className="tor-list">
                    {s.li.map((li, j) => <li key={j}>{li}</li>)}
                  </ul>
                )}
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* map + address */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <span className="r-label">Lokalizacja</span>
            <h2 className="h-lg" style={{ marginTop: 12, marginBottom: 10 }}>{t.address}</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <iframe
              title={`Mapa — ${t.name}`}
              className="tor-gmap"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps?q=${encodeURIComponent(t.mapQuery)}&output=embed`}
            />
          </Reveal>
        </div>
      </section>

      {/* other tracks */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <span className="r-label">Pozostałe tory</span>
          </Reveal>
          <div className="tor-others">
            {others.map((o) => (
              <Link key={o.slug} to={`/tory/${o.slug}`} className="tor-other card">
                <img src={o.map} alt="" loading="lazy" />
                <span>{o.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <ContactSection />
    </main>
  )
}
