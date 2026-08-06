import { useProducts } from '../lib/products.js'
import { Reveal, Stagger, Item } from '../components/Reveal.jsx'
import CarCard from '../components/CarCard.jsx'
import ContactSection from '../components/ContactSection.jsx'
import { T } from '../lib/content.jsx'
import './oferta.css'

export default function Oferta() {
  const products = useProducts()
  const cars = products.filter((p) => p.id !== 'voucher')
  const voucher = products.find((p) => p.id === 'voucher')
  return (
    <main>
      <section className="section page-head">
        <div className="wrap">
          <Reveal>
            <span className="r-label"><T k="of.kicker" /></span>
            <h1 className="h-xl" style={{ marginTop: 14, maxWidth: 900 }}><T k="of.title" /></h1>
            <p className="muted page-head-intro"><T k="of.intro" /></p>
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Stagger className="oferta-grid">
            {cars.map((p) => <Item key={p.id}><CarCard p={p} /></Item>)}
            {voucher && <Item key="voucher"><CarCard p={voucher} /></Item>}
          </Stagger>
        </div>
      </section>

      <section className="oferta-gain">
        <div className="kerb" />
        <div className="wrap oferta-gain-in">
          <Reveal>
            <h2 className="h-lg"><T k="of.gain.title" /></h2>
          </Reveal>
          <Stagger className="oferta-gain-list">
            {[1, 2, 3].map((i) => (
              <Item key={i} className="oferta-gain-item">
                <span className="oferta-gain-num">{String(i).padStart(2, '0')}</span>
                <T k={`of.gain.${i}`} as="p" />
              </Item>
            ))}
          </Stagger>
        </div>
        <div className="kerb" />
      </section>

      <ContactSection />
    </main>
  )
}
