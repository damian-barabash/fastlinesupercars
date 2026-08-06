import { Link } from 'react-router-dom'
import { TORY } from '../data/tory.js'
import { Reveal, Stagger, Item } from '../components/Reveal.jsx'
import ContactSection from '../components/ContactSection.jsx'
import { T } from '../lib/content.jsx'
import './tory.css'

export default function Tory() {
  return (
    <main>
      <section className="section page-head">
        <div className="wrap">
          <Reveal>
            <span className="r-label">Tory</span>
            <h1 className="h-xl" style={{ marginTop: 14 }}><T k="tory.title" /></h1>
          </Reveal>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Stagger className="tory-grid">
            {TORY.map((t) => (
              <Item key={t.slug}>
                <Link to={`/tory/${t.slug}`} className="card tor-card">
                  <div className="tor-card-map">
                    <img src={t.map} alt={`Nitka toru — ${t.name}`} loading="lazy" />
                  </div>
                  <div className="tor-card-body">
                    <h3 className="h-md">{t.name}</h3>
                    <div className="tor-card-stats">
                      {t.stats.slice(0, 2).map((s) => (
                        <span key={s.label}><b>{s.num}</b> {s.label}</span>
                      ))}
                    </div>
                    <span className="tor-card-go">Zobacz tor →</span>
                  </div>
                </Link>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>
      <ContactSection />
    </main>
  )
}
