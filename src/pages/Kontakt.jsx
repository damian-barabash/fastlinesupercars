import ContactSection from '../components/ContactSection.jsx'
import { Reveal } from '../components/Reveal.jsx'

export default function Kontakt() {
  return (
    <main>
      <section className="section page-head" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <Reveal>
            <span className="r-label">Fastline Supercars</span>
            <h1 className="h-xl" style={{ marginTop: 14 }}>Kontakt</h1>
          </Reveal>
        </div>
      </section>
      <ContactSection />
    </main>
  )
}
