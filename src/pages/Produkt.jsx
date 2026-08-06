import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProducts, productPrice } from '../lib/products.js'
import { addToCart } from '../lib/cart.js'
import { zl } from '../lib/api.js'
import { Reveal } from '../components/Reveal.jsx'
import CarCard from '../components/CarCard.jsx'
import Faq from '../components/Faq.jsx'
import { T } from '../lib/content.jsx'
import './produkt.css'

export default function Produkt() {
  const { id } = useParams()
  const products = useProducts()
  const nav = useNavigate()
  const p = products.find((x) => x.id === id)
  const [variant, setVariant] = useState('')
  const [img, setImg] = useState(0)
  const [added, setAdded] = useState(false)

  const chosen = variant || p?.variants?.[0]?.laps || ''
  const price = useMemo(() => (p ? productPrice(p, chosen) : 0), [p, chosen])
  const others = useMemo(() => products.filter((x) => x.id !== id && x.id !== 'voucher').slice(0, 3), [products, id])

  if (!p) {
    return (
      <main className="section wrap tac">
        <h1 className="h-lg">Nie znaleziono produktu</h1>
        <Link to="/oferta" className="btn btn-red" style={{ marginTop: 24 }}>Wróć do oferty</Link>
      </main>
    )
  }

  function add(goCheckout) {
    addToCart({ product_id: p.id, variant: p.variants?.length ? chosen : '', name: p.name })
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
    if (goCheckout) nav('/koszyk')
  }

  const gallery = p.images?.length ? p.images : [p.cover]

  return (
    <main>
      <section className="section produkt-hero">
        <div className="wrap produkt-grid">
          {/* gallery */}
          <Reveal className="produkt-gallery">
            <div className="produkt-main-img card">
              <img src={gallery[img]} alt={p.name} />
            </div>
            {gallery.length > 1 && (
              <div className="produkt-thumbs">
                {gallery.slice(0, 8).map((src, i) => (
                  <button key={i} className={`produkt-thumb ${i === img ? 'is-active' : ''}`} onClick={() => setImg(i)}>
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </Reveal>

          {/* configurator */}
          <Reveal delay={0.1} className="produkt-conf">
            <span className="r-label">Zamów przejazd</span>
            <h1 className="h-lg" style={{ marginTop: 12 }}>{p.name}</h1>
            {p.subtitle && <p className="muted produkt-sub">{p.subtitle}</p>}

            {p.variants?.length > 0 && (
              <div className="produkt-variants">
                <div className="produkt-variants-label">Wybierz liczbę okrążeń:</div>
                <div className="produkt-variants-grid">
                  {p.variants.map((v) => (
                    <button
                      key={v.laps}
                      className={`produkt-variant ${chosen === v.laps ? 'is-active' : ''}`}
                      onClick={() => setVariant(v.laps)}
                    >
                      <span className="produkt-variant-laps">{v.laps}</span>
                      <span className="produkt-variant-price">{zl(v.price)}</span>
                    </button>
                  ))}
                </div>
                <p className="produkt-seat muted">Usiądź jako: kierowca lub pasażer — decydujesz na miejscu.</p>
              </div>
            )}

            <div className="produkt-buy carbon">
              <div>
                <div className="produkt-price-label">Cena</div>
                <div className="produkt-price">{zl(price)}</div>
              </div>
              <div className="produkt-buy-btns">
                <button className={`btn btn-red ${added ? 'is-added' : ''}`} onClick={() => add(false)}>
                  {added ? '✓ Dodano' : 'Dodaj do koszyka'}
                </button>
                <button className="btn btn-ghost" onClick={() => add(true)}>Kup teraz</button>
              </div>
            </div>

            <ul className="produkt-usp">
              <li>Voucher ważny <b>1 rok</b> od daty zakupu</li>
              <li><b>14 dni</b> na zwrot</li>
              <li>Możliwość wymiany prezentu</li>
              <li>PDF z voucherem od razu na e-mail</li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* description + specs */}
      <section className="section produkt-desc-sec">
        <div className="wrap produkt-desc-grid">
          <Reveal>
            <span className="r-label">Opis auta</span>
            <h2 className="h-md" style={{ marginTop: 12 }}><T k="hero.kicker" as="span" style={{ display: 'none' }} />Siła, moc oraz solidna dawka adrenaliny</h2>
            <div className="produkt-desc">
              {(p.description || '').split('\n\n').filter(Boolean).map((par, i) => <p key={i}>{par}</p>)}
              {!p.description && <p className="muted">Skontaktuj się z nami, aby poznać szczegóły tego produktu.</p>}
            </div>
          </Reveal>
          {p.full_specs?.length > 0 && (
            <Reveal delay={0.1} className="produkt-specs carbon">
              <h3 className="h-md">Dane techniczne</h3>
              <table>
                <tbody>
                  {p.full_specs.map((s, i) => (
                    <tr key={i}><td>{s.label}</td><td>{s.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          )}
        </div>
      </section>

      {/* voucher realization FAQ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <span className="r-label">Realizacja vouchera</span>
            <h2 className="h-lg" style={{ marginTop: 12, marginBottom: 36 }}>Co musisz wiedzieć</h2>
          </Reveal>
          <Reveal delay={0.08}><Faq /></Reveal>
        </div>
      </section>

      {/* other cars */}
      {others.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal>
              <span className="r-label">Zobacz też</span>
              <h2 className="h-lg" style={{ marginTop: 12, marginBottom: 36 }}>Pozostałe samochody</h2>
            </Reveal>
            <div className="grid produkt-others">
              {others.map((o) => <CarCard key={o.id} p={o} />)}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
