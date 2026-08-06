import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
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

export default function Home() {
  const products = useProducts()
  const cars = products.filter((p) => p.id !== 'voucher')
  const voucher = products.find((p) => p.id === 'voucher')
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const carY = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '32%'])

  return (
    <main>
      {/* HERO */}
      <section className="hero" ref={heroRef}>
        <motion.div className="hero-bg" style={{ y: bgY }} aria-hidden />
        <div className="hero-grid-lines" aria-hidden />
        <div className="wrap hero-in">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="hero-kicker"><T k="hero.kicker" /></span>
            <h1 className="hero-title">
              <T k="hero.title1" as="span" />
              <em><T k="hero.title2" as="span" /></em>
            </h1>
            <p className="hero-lead"><T k="hero.lead" /></p>
            <div className="hero-ctas">
              <Link to="/oferta" className="btn btn-red"><T k="hero.cta1" /></Link>
              <Link to="/produkt/voucher" className="btn btn-ghost"><T k="hero.cta2" /></Link>
            </div>
          </motion.div>
          <motion.div
            className="hero-car"
            style={{ y: carY }}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src="/img/2023_04_g-6.webp" alt="Porsche 911 4 GTS" fetchpriority="high" />
          </motion.div>
        </div>
        <div className="hero-kerb kerb" />
      </section>

      {/* MARQUEE */}
      <div className="marquee" aria-hidden>
        <div className="marquee-inner">
          {[0, 1].map((n) => (
            <span key={n}>
              PORSCHE 911 4 GTS <b>●</b> TOYOTA GR SUPRA <b>●</b> ALPINE A110 <b>●</b> BMW M2 <b>●</b> MERCEDES A45S AMG <b>●</b> FORD FOCUS RS <b>●</b> TOYOTA GR YARIS <b>●</b> PAKIET NIEMIECKI <b>●</b> PAKIET JAPOŃSKI <b>●</b>&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* BENEFITS */}
      <section className="section benefits-sec">
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

      {/* FLEET */}
      <section className="section" id="oferta">
        <div className="wrap">
          <Reveal>
            <span className="r-label"><T k="fleet.label" /></span>
            <h2 className="h-lg" style={{ marginTop: 14, maxWidth: 700 }}><T k="fleet.title" /></h2>
          </Reveal>
          <Stagger className="fleet-grid">
            {cars.map((p) => <Item key={p.id}><CarCard p={p} /></Item>)}
          </Stagger>
        </div>
      </section>

      {/* VOUCHER BANNER */}
      {voucher && (
        <section className="vban">
          <div className="kerb" />
          <div className="wrap vban-in">
            <Reveal className="vban-copy">
              <span className="r-label" style={{ color: 'rgba(255,255,255,.75)' }}><T k="vban.label" /></span>
              <h2 className="h-lg" style={{ marginTop: 12 }}><T k="vban.title" /></h2>
              <p className="vban-text"><T k="vban.text" /></p>
              <div className="vban-ctas">
                <button
                  className="btn btn-white"
                  onClick={() => { addToCart({ product_id: 'voucher', variant: '', name: voucher.name }) }}
                ><T k="vban.cta" /></button>
                <Link to="/produkt/voucher" className="btn btn-ghost">Szczegóły</Link>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="vban-img">
              <img src={voucher.cover} alt="Voucher podarunkowy" loading="lazy" />
            </Reveal>
          </div>
          <div className="kerb" />
        </section>
      )}

      {/* 3 STEPS */}
      <section className="section">
        <div className="wrap">
          <Reveal><h2 className="h-lg tac"><T k="steps.title" /></h2></Reveal>
          <Stagger className="steps">
            {[1, 2, 3].map((i) => (
              <Item key={i} className="step carbon">
                <div className="ghost-num step-num">{i}</div>
                <h3 className="h-md"><T k={`steps.${i}.title`} /></h3>
                <p className="muted"><T k={`steps.${i}.text`} /></p>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ABOUT */}
      <section className="section about-sec">
        <div className="wrap about-grid">
          <Reveal className="about-img">
            <img src="/img/2024_05_new-project-38.webp" alt="Fastline Supercars na torze" loading="lazy" />
            <div className="about-img-frame" aria-hidden />
          </Reveal>
          <Reveal delay={0.12}>
            <span className="r-label"><T k="about.label" /></span>
            <h2 className="h-lg" style={{ marginTop: 14 }}><T k="about.title" /></h2>
            <div className="about-copy">
              <T k="about.p1" as="p" />
              <T k="about.p2" as="p" />
              <T k="about.p3" as="p" />
              <T k="about.p4" as="p" className="about-strong" />
            </div>
            <Link to="/o-nas" className="btn btn-ghost" style={{ marginTop: 26 }}>Poznaj nas</Link>
          </Reveal>
        </div>
      </section>

      {/* STATS */}
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

      {/* FAQ */}
      <section className="section">
        <div className="wrap faq-grid">
          <Reveal>
            <span className="r-label">FAQ</span>
            <h2 className="h-lg" style={{ marginTop: 14 }}><T k="faq.title" /></h2>
          </Reveal>
          <Reveal delay={0.1}><Faq /></Reveal>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <span className="r-label">Opinie</span>
            <h2 className="h-lg" style={{ marginTop: 14, marginBottom: 42 }}><T k="rev.title" /></h2>
          </Reveal>
          <Reviews />
        </div>
      </section>

      <ContactSection />
    </main>
  )
}
