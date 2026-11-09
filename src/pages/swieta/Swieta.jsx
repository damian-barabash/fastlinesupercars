import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProducts } from '../../lib/products.js'
import { zl } from '../../lib/api.js'
import GiftVoucher, { TEMPLATE_IDS } from './GiftVoucher.jsx'
import { useOswald } from './fonts.js'
import Lights from './Lights.jsx'
import './swieta.css'

/* /swieta-2026 — świąteczna strona sprzedaży voucherów. Krótka: hero z pętlą wideo,
   trzy kroki, pas voucherów z CTA. Poza menu i sitemapą (noindex do odwołania — patrz seo.js). */

const GO = '/swieta-2026/voucher'
const ease = [0.22, 1, 0.36, 1]

export default function Swieta() {
  useOswald()
  const products = useProducts()
  const from = Math.min(...products.filter((p) => TEMPLATE_IDS.includes(p.id)).map((p) => p.price_from).filter(Boolean))
  const heroRef = useRef(null)

  // światło podąża za kursorem (tylko desktop, zmienne CSS — bez re-renderów)
  useEffect(() => {
    const el = heroRef.current
    if (!el || window.matchMedia('(hover: none)').matches) return
    let raf = 0
    const on = (e) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
        el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
        // przechył kart voucherów (−0,5…0,5)
        el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
        el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
      })
    }
    el.addEventListener('pointermove', on)
    return () => { el.removeEventListener('pointermove', on); cancelAnimationFrame(raf) }
  }, [])

  const words = [['Najszybszy', ''], ['prezent', 'xm-red'], ['na Święta!', '']]

  return (
    <div className="xm">
      <section className="xm-hero" ref={heroRef}>
        <div className="xm-hero-bg" aria-hidden="true"><Sparks n={26} /></div>
        <Lights />
        <div className="wrap xm-hero-in">
         <div className="xm-hero-txt">
          <h1 className="xm-h1">
            {words.map(([w, c], i) => (
              <motion.span key={w} className={c} initial={{ opacity: 0, y: '0.5em', filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: 0.12 + i * 0.12, ease }}>
                {w}
              </motion.span>
            ))}
          </h1>
          <motion.p className="xm-lead" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5, ease }}>
            Przejazd supersamochodem po torze z&nbsp;imieniem bliskiej osoby na voucherze.
            PDF od razu na e-mail — albo wydruk w&nbsp;kopercie prosto do Paczkomatu.
          </motion.p>
          <motion.div className="xm-cta-row" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.62, ease }}>
            <Link to={GO} className="btn xm-btn xm-light"><GiftIco />Stwórz voucher<span className="xm-arrow">→</span></Link>
            <span className="xm-meta">{Number.isFinite(from) ? <>od <b>{zl(from)}</b> · </> : null}ważny 12 miesięcy · 5 torów</span>
          </motion.div>
         </div>
          {/* vouchery wachlarzem: z tyłu BMW, z przodu Porsche z imieniem — tak wygląda prezent */}
          <motion.div className="xm-hero-cards" aria-hidden="true" initial={{ opacity: 0, y: 50, rotate: -12 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 1.1, delay: 0.3, ease }}>
            <div className="xm-hc-float">
              <GiftVoucher productId="bmw-m2" name="Ani" small className="xm-hc xm-hc-back" />
              <GiftVoucher productId="porsche-911" name="Łukasza" line="Nowe Porsche 911 4 GTS — 3 okrążenia" className="xm-hc xm-hc-front" />
            </div>
          </motion.div>
        </div>
        <motion.div className="xm-stage" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, delay: 0.35, ease }}>
          <LoopVideo />
        </motion.div>
      </section>

      <section className="xm-steps">
        <div className="wrap xm-steps-in">
          {[
            ['01', 'Wybierz auto', 'Porsche 911 GTS, GR Supra, BMW M2 i inne — albo voucher na dowolną kwotę.'],
            ['02', 'Wpisz imię', 'Pojawi się na voucherze po słowie „DLA”. Podgląd zobaczysz na żywo.'],
            ['03', 'Gotowe w minutę', 'Voucher PDF na e-mail od razu. Wydruk w kopercie do Paczkomatu: +50 zł.'],
          ].map(([n, t, d], i) => (
            <motion.div key={n} className="xm-step" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay: i * 0.1, ease }}>
              <span className="xm-step-n">{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="xm-reel">
        <div className="xm-reel-rows" aria-hidden="true">
          {[0, 1].map((row) => (
            <div key={row} className={`xm-reel-row ${row ? 'is-rev' : ''}`}>
              {[...Array(2)].flatMap((_, k) => (row ? [...TEMPLATE_IDS].reverse() : TEMPLATE_IDS).map((id) => (
                <GiftVoucher key={`${k}-${id}`} productId={id} name={NAMES[(TEMPLATE_IDS.indexOf(id) + row * 4) % NAMES.length]} small className="xm-reel-card" />
              )))}
            </div>
          ))}
        </div>
        <div className="xm-reel-cta">
          <h2 className="xm-h2">Prezent, który <span className="xm-red">ma moc</span></h2>
          <Link to={GO} className="btn xm-btn xm-light"><GiftIco />Stwórz voucher<span className="xm-arrow">→</span></Link>
        </div>
      </section>
    </div>
  )
}

const NAMES = ['Łukasza', 'Ani', 'Taty', 'Kasi', 'Michała', 'Mamy', 'Szefa', 'Oli', 'Brata']

/* Pętla z ElevenLabs: poziomo 16:9, na telefonie kwadrat. Gra tylko w kadrze.
   Gdy pliku jeszcze nie ma (albo przeglądarka go nie odtworzy) — lewitujący voucher jako zastępstwo. */
function LoopVideo() {
  const ref = useRef(null)
  const [failed, setFailed] = useState(false)
  const [square] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches)
  // jeden plik wybrany z góry: kwadrat na telefonie; WebM (mniejszy) poza Safari, w Safari MP4
  const [src] = useState(() => {
    if (typeof document === 'undefined') return ''
    const apple = /Apple/.test(navigator.vendor || '')
    const webm = !apple && document.createElement('video').canPlayType('video/webm; codecs="vp9"')
    return `/swieta/loop-${square ? '1x1' : '16x9'}.${webm ? 'webm' : 'mp4'}`
  })
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause() }, { threshold: 0.1 })
    io.observe(v)
    return () => io.disconnect()
  }, [failed])
  if (failed) {
    return (
      <div className="xm-fallback">
        <GiftVoucher productId="porsche-911" name="Łukasza" className="xm-float" />
      </div>
    )
  }
  return (
    <div className="xm-video">
      <video ref={ref} src={src} muted loop playsInline autoPlay preload="auto" poster={square ? '/swieta/loop-poster-1x1.jpg' : '/swieta/loop-poster.jpg'} onError={() => setFailed(true)} />
    </div>
  )
}

function Sparks({ n }) {
  // stałe pozycje (bez losowania przy każdym renderze)
  return [...Array(n)].map((_, i) => {
    const x = (i * 37.7) % 100, y = (i * 53.3) % 100
    return <i key={i} className="xm-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-(i * 0.71) % 6}s`, '--s': `${0.5 + ((i * 7) % 10) / 10}` }} />
  })
}

export const GiftIco = () => (
  <svg className="xm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M3.5 9h17v4h-17zM5 13v8h14v-8M12 9v12" strokeLinejoin="round" />
    <path d="M12 9c-1.6-3.4-5.6-4-5.6-1.6C6.4 9 12 9 12 9zm0 0c1.6-3.4 5.6-4 5.6-1.6C17.6 9 12 9 12 9z" strokeLinejoin="round" />
  </svg>
)
