import { Link } from 'react-router-dom'
import { T } from '../lib/content.jsx'
import { useProducts } from '../lib/products.js'
import { addToCart } from '../lib/cart.js'
import { Reveal, Stagger, Item } from '../components/Reveal.jsx'
import CarCard from '../components/CarCard.jsx'
import Faq from '../components/Faq.jsx'
import Reviews from '../components/Reviews.jsx'
import ContactSection from '../components/ContactSection.jsx'
import './home.css'

const BEN_ICONS = [
  '/img/2024_06_ikona-medal.svg',
  '/img/2024_06_ikona-minutnik.svg',
  '/img/2024_06_ikona-samochody.svg',
  '/img/2025_05_ikona-wymiana-2.svg',
]

const GALLERY = [
  '/img/gal-1.webp',
  '/img/gal-2.webp',
  '/img/gal-3.webp',
  '/img/gal-4.webp',
  '/img/gal-5.webp',
  '/img/gal-6.webp',
  '/img/gal-7.webp',
  '/img/gal-8.webp',
]

export default function Home() {
  const products = useProducts()
  const cars = products.filter((p) => p.id !== 'voucher')
  const voucher = products.find((p) => p.id === 'voucher')

  return (
    <main>
      {/* HERO — original Maserati banner with FAST -10% promo */}
      <section className="hero">
        <img src="/img/hero-banner-maserati.webp" alt="Zarezerwuj swoją przejażdżkę marzeń — Maserati MC20 na torze. 10% zniżki z kodem FAST na zakupy powyżej 500 zł" className="hero-img" fetchPriority="high" />
        <div className="hero-overlay wrap">
          <div className="hero-ctas">
            <Link to="/oferta" className="btn btn-red hero-btn">Wybierz auto&nbsp;&nbsp;»</Link>
            <Link to="/produkt/voucher" className="btn btn-white hero-btn">Kup voucher</Link>
          </div>
        </div>
      </section>

      {/* BENEFITS — dark carbon band like original */}
      <section className="benefits-sec carbon">
        <div className="wrap">
          <Stagger className="benefits">
            {[1, 2, 3, 4].map((i) => (
              <Item key={i} className="benefit">
                <img src={BEN_ICONS[i - 1]} alt="" className="benefit-icon" loading="lazy" />
                <div>
                  <h3 className="benefit-title"><T k={`ben.${i}.title`} /></h3>
                  <p className="benefit-text"><T k={`ben.${i}.text`} /></p>
                </div>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* FLEET — white section */}
      <section className="section" id="oferta">
        <div className="wrap">
          <Reveal className="tac">
            <span className="r-label" style={{ justifyContent: 'center' }}><T k="fleet.label" /></span>
            <h2 className="h-lg" style={{ marginTop: 14 }}><T k="fleet.title" /></h2>
          </Reveal>
          <Stagger className="fleet-grid">
            {cars.map((p) => <Item key={p.id}><CarCard p={p} /></Item>)}
          </Stagger>
        </div>
      </section>

      {/* VOUCHER — dark photo band (marshal with checkered flag) */}
      {voucher && (
        <section className="vban">
          <img src="/img/voucher-tlo.webp" alt="" className="vban-bg" loading="lazy" />
          <div className="wrap vban-in">
            <Reveal className="vban-copy">
              <span className="r-label vban-label"><T k="vban.label" /></span>
              <h2 className="h-lg" style={{ marginTop: 12 }}><T k="vban.title" /></h2>
              <p className="vban-text"><T k="vban.text" /></p>
              <div className="vban-ctas">
                <button
                  className="btn btn-red"
                  onClick={() => { addToCart({ product_id: 'voucher', variant: '', name: voucher.name }) }}
                ><T k="vban.cta" /></button>
                <Link to="/produkt/voucher" className="btn btn-white">Szczegóły</Link>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="vban-img">
              <img src="/img/voucher-karta.webp" alt="Voucher Fastline Supercars" loading="lazy" />
            </Reveal>
          </div>
        </section>
      )}

      {/* 3 STEPS — original road graphic */}
      <section className="section steps-sec">
        <div className="wrap">
          <Reveal className="tac"><h2 className="h-lg"><T k="steps.title" /></h2></Reveal>
          <Reveal delay={0.1}>
            <img src="/img/kroki-mapa.webp" alt="1. Wybierz auto, pojedynek lub szkolenie. 2. Wybierz termin, opłać zlecenie. 3. Spełniasz marzenia!" className="steps-map" loading="lazy" />
          </Reveal>
          <Stagger className="steps">
            {[1, 2, 3].map((i) => (
              <Item key={i} className="step">
                <div className="step-num">{String(i).padStart(2, '0')}</div>
                <h3 className="h-md"><T k={`steps.${i}.title`} /></h3>
                <p className="muted"><T k={`steps.${i}.text`} /></p>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ABOUT — panorama band */}
      <section className="about-band">
        <img src="/img/flota-panorama.webp" alt="" className="about-band-bg" loading="lazy" />
        <div className="wrap about-band-in">
          <Reveal className="about-card">
            <span className="r-label"><T k="about.label" /></span>
            <h2 className="h-lg" style={{ marginTop: 12 }}><T k="about.title" /></h2>
            <div className="about-copy">
              <T k="about.p1" as="p" />
              <T k="about.p2" as="p" />
              <T k="about.p3" as="p" />
              <T k="about.p4" as="p" className="about-strong" />
            </div>
            <Link to="/o-nas" className="btn btn-red" style={{ marginTop: 24 }}>Poznaj nas&nbsp;&nbsp;»</Link>
          </Reveal>
        </div>
      </section>

      {/* STATS — white strip */}
      <section className="stats-sec">
        <div className="wrap">
          <Stagger className="stats">
            {[1, 2, 3, 4].map((i) => (
              <Item key={i} className="stat">
                <div className="stat-num"><T k={`stat.${i}.num`} /></div>
                <div className="stat-label"><T k={`stat.${i}.label`} /></div>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* GALLERY — action photos mosaic */}
      <section className="section gal-sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal className="tac">
            <span className="r-label" style={{ justifyContent: 'center' }}>Galeria</span>
            <h2 className="h-lg" style={{ marginTop: 14, marginBottom: 40 }}>Nasze auta w akcji</h2>
          </Reveal>
          <Stagger className="gal-grid">
            {GALLERY.map((src, i) => (
              <Item key={src} className={`gal-item ${i === 0 || i === 5 ? 'gal-wide' : ''}`}>
                <img src={src} alt="Fastline Supercars na torze" loading="lazy" />
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* FAQ */}
      <section className="section faq-sec">
        <div className="wrap faq-grid">
          <Reveal>
            <span className="r-label">FAQ</span>
            <h2 className="h-lg" style={{ marginTop: 14 }}><T k="faq.title" /></h2>
          </Reveal>
          <Reveal delay={0.1}><Faq /></Reveal>
        </div>
      </section>

      {/* REVIEWS — dark photo band */}
      <section className="rev-sec">
        <img src="/img/opinie-tlo.webp" alt="" className="rev-bg" loading="lazy" />
        <div className="wrap rev-in">
          <Reveal className="tac">
            <span className="r-label rev-label" style={{ justifyContent: 'center' }}>Opinie</span>
            <h2 className="h-lg" style={{ marginTop: 14, marginBottom: 42, color: '#fff' }}><T k="rev.title" /></h2>
          </Reveal>
          <Reviews />
        </div>
      </section>

      <ContactSection />
    </main>
  )
}
