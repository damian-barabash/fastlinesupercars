import { Reveal } from '../components/Reveal.jsx'
import ContactSection from '../components/ContactSection.jsx'
import { T, Img } from '../lib/content.jsx'
import './onas.css'

export default function ONas() {
  return (
    <main>
      <section className="section page-head">
        <div className="wrap onas-grid">
          <Reveal>
            <span className="r-label"><T k="on.kicker" /></span>
            <h1 className="h-xl" style={{ marginTop: 14 }}><T k="on.title" /></h1>
            <div className="onas-copy">
              <T k="on.p0" as="p" className="onas-lead" />
              <T k="on.p1" as="p" />
              <T k="on.p2" as="p" />
              <T k="on.p3" as="p" />
              <T k="on.p4" as="p" className="onas-strong" />
            </div>
          </Reveal>
          <Reveal delay={0.12} className="onas-img">
            <Img k="img.onas_main" alt="Supersamochody Fastline" loading="lazy" />
            <div className="onas-img-frame" aria-hidden />
          </Reveal>
        </div>
      </section>

      <section className="onas-fra carbon">
        
        <div className="wrap onas-fra-in">
          <Reveal className="onas-fra-img">
            <Img k="img.onas_fra" alt="Mariusz Miękoś — Fastline Racing Academy" loading="lazy" />
          </Reveal>
          <Reveal delay={0.1}>
            <span className="r-label" style={{ color: 'rgba(255,255,255,.7)' }}>Szkolenia</span>
            <h2 className="h-lg" style={{ marginTop: 12 }}><T k="on.fra.title" /></h2>
            <T k="on.fra.text" as="p" className="onas-fra-text" />
            <a href="https://fastlineracingacademy.pl" target="_blank" rel="noreferrer" className="btn btn-white" style={{ marginTop: 26 }}>
              fastlineracingacademy.pl
            </a>
          </Reveal>
        </div>
        
      </section>

      <ContactSection />
    </main>
  )
}
