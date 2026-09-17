import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProducts, productPrice, isOpenAmount, AMOUNT_MAX_DEFAULT } from '../lib/products.js'
import { addToCart } from '../lib/cart.js'
import { gtmAddToCart } from '../lib/gtm.js'
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
  const [amountTxt, setAmountTxt] = useState(null)   // null = kwota domyślna produktu

  const chosen = variant || p?.variants?.[0]?.laps || ''
  const open = isOpenAmount(p)
  const minZl = open ? p.amount_min / 100 : 0
  const maxZl = open ? (p.amount_max ?? AMOUNT_MAX_DEFAULT) / 100 : 0
  const amountStr = amountTxt ?? (open ? String(p.price_from / 100) : '')
  const amountZl = amountStr === '' ? NaN : Number(amountStr)
  const amountErr = !open ? '' :
    !Number.isFinite(amountZl) ? 'Wpisz kwotę vouchera' :
    amountZl < minZl ? `Minimalna kwota to ${zl(minZl * 100)}` :
    amountZl > maxZl ? `Maksymalna kwota to ${zl(maxZl * 100)}` : ''
  const amount = open && !amountErr ? amountZl * 100 : undefined
  const price = useMemo(() => (p ? productPrice(p, chosen, amount) : 0), [p, chosen, amount])
  const presets = open ? [300, 500, p.price_from / 100, 1500].filter((v, i, a) => v >= minZl && v <= maxZl && a.indexOf(v) === i).sort((a, b) => a - b) : []
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
    if (amountErr) return
    const line = { product_id: p.id, variant: !open && p.variants?.length ? chosen : '', name: p.name, ...(open ? { amount } : {}) }
    addToCart(line)
    gtmAddToCart({ ...line, price, qty: 1 })
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

            {open && (
              <div className="produkt-variants">
                <div className="produkt-variants-label">Wybierz lub wpisz kwotę:</div>
                <div className="produkt-variants-grid produkt-amount-presets">
                  {presets.map((v) => (
                    <button
                      key={v}
                      className={`produkt-variant ${amountZl === v ? 'is-active' : ''}`}
                      onClick={() => setAmountTxt(String(v))}
                    >
                      <span className="produkt-variant-laps">{zl(v * 100)}</span>
                    </button>
                  ))}
                </div>
                <p className="produkt-seat muted">Minimalna wartość vouchera: {zl(minZl * 100)}. Obdarowany wykorzysta ją na dowolny przejazd.</p>
              </div>
            )}

            <div className="produkt-buy carbon">
              <div>
                <div className="produkt-price-label">{open ? 'Wartość vouchera' : 'Cena'}</div>
                {open ? (
                  <label className={`produkt-amount ${amountErr ? 'is-bad' : ''}`}>
                    <input
                      className="produkt-price"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="Wartość vouchera w złotych"
                      aria-invalid={!!amountErr}
                      value={amountStr}
                      size={Math.max(3, amountStr.length)}
                      onChange={(e) => setAmountTxt(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 5))}
                      onKeyDown={(e) => { if (e.key === 'Enter') add(false) }}
                    />
                    <span className="produkt-price">zł</span>
                  </label>
                ) : (
                  <div className="produkt-price">{zl(price)}</div>
                )}
                {amountErr && <div className="produkt-amount-err" role="alert">{amountErr}</div>}
              </div>
              <div className="produkt-buy-btns">
                <button className={`btn btn-red ${added ? 'is-added' : ''}`} onClick={() => add(false)} disabled={!!amountErr}>
                  {added ? '✓ Dodano' : 'Dodaj do koszyka'}
                </button>
                <button className="btn btn-ghost" onClick={() => add(true)} disabled={!!amountErr}>Kup teraz</button>
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
