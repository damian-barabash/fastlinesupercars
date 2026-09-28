import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getCart, updateQty, removeFromCart, clearCart, cartTotal } from '../lib/cart.js'
import { useProducts, productPrice, isOpenAmount, amountLabel } from '../lib/products.js'
import { shop, zl } from '../lib/api.js'
import { Reveal } from '../components/Reveal.jsx'
import { gtmBeginCheckout } from '../lib/gtm.js'
import './koszyk.css'

const STEPS = ['Koszyk', 'Dane', 'Podsumowanie', 'Płatność']

// płynne przeliczanie kwoty (rabat „wlatuje" w cenę i suma zjeżdża w dół)
function useCountTo(value, ms = 620) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current, b = value
    if (a === b) return
    let raf = 0
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      const e = 1 - Math.pow(1 - t, 3)
      const v = Math.round(a + (b - a) * e)
      setShown(v)
      from.current = v
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

export default function Koszyk() {
  const products = useProducts()
  const nav = useNavigate()
  const [items, setItems] = useState(getCart())
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ name: '', email: '', phone: '', gift_for: '', gift: false, terms: false })
  const [err, setErr] = useState('')
  const [promo, setPromo] = useState('')
  // zastosowane kody, rabaty się sumują: [{kind:'promo'|'voucher', code, discount, percent?, amount?}]
  const [codes, setCodes] = useState([])
  const [promoErr, setPromoErr] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const [payBusy, setPayBusy] = useState(false)
  const [pending, setPending] = useState(null)       // lista kodów czekająca, aż rabat doleci do kwoty
  const [fly, setFly] = useState(null)
  const promoRef = useRef(null)
  const totalRef = useRef(null)

  useEffect(() => {
    const fn = () => setItems(getCart())
    window.addEventListener('fs-cart', fn)
    return () => window.removeEventListener('fs-cart', fn)
  }, [])

  const total = useMemo(() => cartTotal(items, products), [items, products])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const rows = items.map((it) => {
    const p = products.find((x) => x.id === it.product_id)
    const price = p ? productPrice(p, it.variant, it.amount) : 0
    // przy voucherze z dowolną kwotą w miejscu wariantu pokazujemy wybraną wartość
    return { ...it, p, price, variant: isOpenAmount(p) ? amountLabel(price) : it.variant }
  })

  function goStep(n) {
    setErr('')
    if (n >= 1 && items.length === 0) return
    if (n >= 2) {
      if (!form.name.trim() || !/.+@.+\..+/.test(form.email)) { setErr('Uzupełnij imię i poprawny e-mail'); setStep(1); return }
    }
    if (n >= 3 && !form.terms) { setErr('Zaakceptuj regulamin płatności'); setStep(2); return }
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Serwer zawsze wycenia CAŁĄ listę kodów naraz: bony odejmują się od tego, co zostało po
  // kodach procentowych, więc rabat jednego kodu zależy od pozostałych.
  const checkCodes = (list) => shop('checkPromo', { codes: list, subtotal: total })

  async function applyPromo(e) {
    e?.preventDefault?.()
    const code = promo.trim().toUpperCase().replace(/\s+/g, '')
    if (!code || promoBusy) return
    if (codes.some((c) => c.code === code)) { setPromoErr(`Kod ${code} jest już dodany`); return }
    setPromoBusy(true)
    setPromoErr('')
    try {
      const d = await checkCodes([...codes.map((c) => c.code), code])
      const applied = d.applied || []
      setPromoErr((d.errors || []).map((x) => x.error).join(' · ') || (d.valid === false ? d.error || '' : ''))
      const gain = applied.reduce((s, c) => s + c.discount, 0) - discountSum
      if (applied.some((c) => c.code === code)) setPromo('')
      // rabat leci z pola kodu prosto w kwotę „Razem", dopiero po wylądowaniu zmienia sumę
      const from = promoRef.current?.getBoundingClientRect()
      const to = totalRef.current?.getBoundingClientRect()
      if (gain > 0 && from && to) {
        setFly({
          label: `−${zl(gain)}`,
          x: from.left + from.width / 2, y: from.top + from.height / 2,
          dx: to.left + to.width / 2 - (from.left + from.width / 2),
          dy: to.top + to.height / 2 - (from.top + from.height / 2),
        })
        setPending(applied)
      } else {
        setCodes(applied)
      }
    } catch (err) {
      setPromoErr(err.message)
    }
    setPromoBusy(false)
  }

  async function removeCode(code) {
    const rest = codes.filter((c) => c.code !== code)
    setCodes(rest)          // od razu, bez czekania na serwer; rabaty bonów przeliczy odpowiedź
    setPromoErr('')
    if (!rest.length) return
    try {
      const d = await checkCodes(rest.map((c) => c.code))
      setCodes(d.applied || [])
      setPromoErr((d.errors || []).map((x) => x.error).join(' · '))
    } catch (err) { setPromoErr(err.message) }
  }

  // koszyk zmienił się po dodaniu kodów (powrót do kroku 1) — rabaty trzeba policzyć od nowa
  const pricedFor = useRef(total)
  useEffect(() => {
    if (pricedFor.current === total) return
    pricedFor.current = total
    if (!codes.length) return
    checkCodes(codes.map((c) => c.code))
      .then((d) => { setCodes(d.applied || []); setPromoErr((d.errors || []).map((x) => x.error).join(' · ')) })
      .catch((err) => setPromoErr(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  function landPromo() {
    setFly(null)
    if (pending) { setCodes(pending); setPending(null) }
  }

  const discountSum = codes.reduce((s, c) => s + c.discount, 0)
  const discount = Math.min(discountSum, total)
  const grandTotal = total - discount
  const shownTotal = useCountTo(grandTotal)
  const codeLabel = (c) => c.kind === 'voucher' ? `Voucher ${c.code}` : `Rabat ${c.code}${c.percent ? ` (−${c.percent}%)` : ''}`
  const onlyVouchers = codes.length > 0 && codes.every((c) => c.kind === 'voucher')
  // kody pokryły całe zamówienie — nie ma czego wysyłać do bramki
  const fullyCovered = discount > 0 && grandTotal === 0

  // Płatność: serwer zakłada zamówienie (ceny liczy sam) i tworzy transakcję Tpay,
  // my tylko przekierowujemy do bramki. Zamówienie zostaje `pending` do czasu
  // potwierdzenia z Tpay (webhook) — nic nie jest opłacone „na słowo" przeglądarki.
  async function payNow() {
    if (payBusy) return
    setErr('')
    setPayBusy(true)
    gtmBeginCheckout(rows.map((r) => ({ ...r, name: r.p?.name })), grandTotal)
    try {
      const d = await shop('checkout', {
        customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
        gift_for: form.gift ? form.gift_for.trim() : '',
        items: items.map((i) => ({ product_id: i.product_id, variant: i.variant, qty: i.qty, ...(i.amount != null ? { amount: i.amount } : {}) })),
        ...(codes.length ? { codes: codes.map((c) => c.code) } : {}),
        return_origin: window.location.origin,   // serwer i tak przyjmie tylko adres z białej listy
      })
      clearCart()
      if (d.payment_url) { window.location.assign(d.payment_url); return }
      // bon pokrył całość (albo tryb testowy) — zamówienie jest już zrealizowane po stronie serwera
      nav(`/dziekujemy?order=${d.order_id}${d.test_mode ? '&test=1' : ''}`)
    } catch (e) {
      setErr(e.message || 'Nie udało się rozpocząć płatności')
      setPayBusy(false)
    }
  }

  if (items.length === 0 && step === 0) {
    return (
      <main className="section wrap tac koszyk-empty">
        <div className="ghost-num" style={{ fontSize: 120 }}>0</div>
        <h1 className="h-lg">Twój koszyk jest pusty</h1>
        <p className="muted" style={{ marginTop: 10 }}>Wybierz samochód i liczbę okrążeń, a voucher PDF dostaniesz od razu na e-mail.</p>
        <Link to="/oferta" className="btn btn-red" style={{ marginTop: 28 }}>Zobacz ofertę</Link>
      </main>
    )
  }

  return (
    <main className="section koszyk">
      <div className="wrap">
        {/* stepper */}
        <Reveal>
          <div className="stepper">
            {STEPS.map((s, i) => (
              <button
                key={s}
                className={`stepper-item ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`}
                onClick={() => i < step && goStep(i)}
              >
                <span className="stepper-num">{i < step ? '✓' : i + 1}</span>
                <span className="stepper-label">{s}</span>
                {i < STEPS.length - 1 && <i className="stepper-line" />}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="koszyk-grid">
          <div className="koszyk-main">
            {/* STEP 0: cart */}
            {step === 0 && (
              <Reveal className="koszyk-items">
                {rows.map((r, i) => (
                  <div key={i} className="koszyk-item card">
                    {r.p && <img src={r.p.cover} alt="" className="koszyk-item-img" />}
                    <div className="koszyk-item-body">
                      <div className="koszyk-item-name">{r.p?.name || r.product_id}</div>
                      {r.variant && <div className="koszyk-item-variant">{r.variant}</div>}
                      <div className="koszyk-item-price">{zl(r.price)}</div>
                    </div>
                    <div className="koszyk-item-qty">
                      <button onClick={() => updateQty(i, r.qty - 1)} aria-label="Mniej">−</button>
                      <span>{r.qty}</span>
                      <button onClick={() => updateQty(i, r.qty + 1)} aria-label="Więcej">+</button>
                    </div>
                    <button className="koszyk-item-del" onClick={() => removeFromCart(i)} aria-label="Usuń">✕</button>
                  </div>
                ))}
                <div className="koszyk-actions">
                  <Link to="/oferta" className="btn btn-ghost">← Dodaj więcej</Link>
                  <button className="btn btn-red" onClick={() => goStep(1)}>Dalej: dane →</button>
                </div>
              </Reveal>
            )}

            {/* STEP 1: dane */}
            {step === 1 && (
              <Reveal className="koszyk-form">
                <h2 className="h-md">Twoje dane</h2>
                <div className="koszyk-form-grid">
                  <div className="field"><label>Imię i nazwisko *</label><input value={form.name} onChange={set('name')} autoComplete="name" /></div>
                  <div className="field"><label>E-mail *</label><input type="email" value={form.email} onChange={set('email')} autoComplete="email" /></div>
                  <div className="field"><label>Telefon</label><input value={form.phone} onChange={set('phone')} autoComplete="tel" /></div>
                </div>
                <label className="koszyk-check">
                  <input type="checkbox" checked={form.gift} onChange={set('gift')} />
                  <span>To prezent — wpisz imię i nazwisko obdarowanego (pojawi się na voucherze)</span>
                </label>
                {form.gift && (
                  <div className="field"><label>Voucher dla</label><input value={form.gift_for} onChange={set('gift_for')} placeholder="np. Szymona Łęczkiewicza" /></div>
                )}
                {err && <p className="koszyk-err">{err}</p>}
                <div className="koszyk-actions">
                  <button className="btn btn-ghost" onClick={() => goStep(0)}>← Wróć</button>
                  <button className="btn btn-red" onClick={() => goStep(2)}>Dalej: podsumowanie →</button>
                </div>
              </Reveal>
            )}

            {/* STEP 2: summary */}
            {step === 2 && (
              <Reveal className="koszyk-summary">
                <h2 className="h-md">Podsumowanie</h2>
                <div className="koszyk-sum-box carbon">
                  {rows.map((r, i) => (
                    <div key={i} className="koszyk-sum-row">
                      <span>{r.qty}× {r.p?.name}{r.variant ? ` · ${r.variant}` : ''}</span>
                      <b>{zl(r.price * r.qty)}</b>
                    </div>
                  ))}
                  <AnimatePresence initial={false}>
                    {codes.map((c) => (
                      <motion.div
                        key={c.code}
                        className="koszyk-sum-row koszyk-sum-discount"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      >
                        <span>{codeLabel(c)}</span><b>−{zl(c.discount)}</b>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div className="koszyk-sum-row koszyk-sum-total">
                    <span>Razem</span>
                    <b ref={totalRef} className={discount > 0 ? 'is-cut' : ''}>{zl(shownTotal)}</b>
                  </div>
                </div>
                <form className="koszyk-promo" onSubmit={applyPromo}>
                  <div className="field" ref={promoRef}>
                    <label>Kod rabatowy lub voucher</label>
                    <input
                      value={promo}
                      onChange={(e) => { setPromo(e.target.value); setPromoErr('') }}
                      placeholder={codes.length ? 'Kolejny kod' : 'np. FAST albo BON-XXXX-XXXX'}
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </div>
                  <button type="submit" className="btn btn-ghost koszyk-promo-btn" disabled={promoBusy || !promo.trim()}>
                    {promoBusy ? <><span className="koszyk-spin" /> Sprawdzam</> : 'Zastosuj'}
                  </button>
                </form>
                {promoErr && <p className="koszyk-err">{promoErr}</p>}
                {codes.length > 0 && (
                  <ul className="koszyk-codes">
                    <AnimatePresence initial={false}>
                      {codes.map((c) => (
                        <motion.li key={c.code} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
                          <span className="koszyk-code-name">✓ {c.code}</span>
                          <span className="koszyk-code-info">
                            {c.kind === 'voucher' ? `voucher ${zl(c.amount)}` : `−${c.percent}%`} · −{zl(c.discount)}
                          </span>
                          <button type="button" onClick={() => removeCode(c.code)} aria-label={`Usuń kod ${c.code}`} disabled={promoBusy || !!pending}>✕</button>
                          {c.kind === 'voucher' && c.amount > c.discount && (
                            <small>Voucher jest jednorazowy — niewykorzystana część ({zl(c.amount - c.discount)}) przepada.</small>
                          )}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
                {discount > 0 && (
                  <p className="koszyk-promo-ok">
                    {fullyCovered
                      ? '✓ Kody pokrywają całe zamówienie'
                      : <>✓ {codes.length > 1 ? `Rabaty sumują się — oszczędzasz ${zl(discount)}` : `Oszczędzasz ${zl(discount)}`}, do zapłaty {zl(grandTotal)}</>}
                  </p>
                )}
                <AnimatePresence>
                  {fly && (
                    <motion.div
                      className="koszyk-fly"
                      style={{ left: fly.x, top: fly.y }}
                      initial={{ x: '-50%', y: '-50%', scale: 0.4, opacity: 0 }}
                      animate={{ x: `calc(-50% + ${fly.dx}px)`, y: `calc(-50% + ${fly.dy}px)`, scale: [0.4, 1.15, 0.75], opacity: [0, 1, 1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.75, ease: [0.22, 0.8, 0.3, 1], times: [0, 0.35, 1] }}
                      onAnimationComplete={landPromo}
                    >
                      {fly.label}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="koszyk-sum-meta">
                  <p><b>{form.name}</b> · {form.email}{form.phone ? ` · ${form.phone}` : ''}</p>
                  {form.gift && form.gift_for && <p>Voucher dla: <b>{form.gift_for}</b></p>}
                  <p className="muted">Voucher PDF (ważny 1 rok) wyślemy na e-mail od razu po opłaceniu.</p>
                </div>
                <label className="koszyk-check">
                  <input type="checkbox" checked={form.terms} onChange={set('terms')} />
                  <span>Akceptuję <Link to="/regulamin-platnosci" target="_blank" className="red">regulamin płatności</Link> *</span>
                </label>
                {err && <p className="koszyk-err">{err}</p>}
                <div className="koszyk-actions">
                  <button className="btn btn-ghost" onClick={() => goStep(1)}>← Wróć</button>
                  <button className="btn btn-red" onClick={() => goStep(3)}>Dalej: płatność →</button>
                </div>
              </Reveal>
            )}

            {/* STEP 3: payment (Tpay stub) */}
            {step === 3 && (
              <Reveal className="koszyk-pay">
                <h2 className="h-md">Płatność</h2>
                <div className="koszyk-pay-box">
                  <div className="koszyk-pay-method is-active">
                    <span className="koszyk-pay-radio" />
                    <div>
                      <b>{fullyCovered ? (onlyVouchers ? 'Opłacone voucherem' : 'Opłacone kodami') : 'Płatność online'}</b>
                      <p className="muted">{fullyCovered ? `${codes.map((c) => c.code).join(' + ')} — pokrywa całe zamówienie` : 'BLIK, karta, szybki przelew — Tpay'}</p>
                    </div>
                    <span className="koszyk-pay-total">{zl(grandTotal)}</span>
                  </div>
                </div>
                {discount > 0 && (
                  <p className="koszyk-promo-ok" style={{ marginBottom: 12 }}>
                    ✓ {codes.map(codeLabel).join(' + ')} — taniej o {zl(discount)}
                  </p>
                )}
                <p className="muted" style={{ fontSize: 13 }}>
                  {fullyCovered
                    ? 'Nie musisz nic dopłacać. Po potwierdzeniu zamówienia voucher PDF wyślemy na Twój e-mail.'
                    : 'Po kliknięciu „Zapłać" przeniesiemy Cię do bezpiecznej bramki Tpay. Voucher PDF wyślemy na e-mail od razu po zaksięgowaniu płatności.'}
                </p>
                {err && <p className="koszyk-err">{err}</p>}
                <div className="koszyk-actions">
                  <button className="btn btn-ghost" onClick={() => goStep(2)} disabled={payBusy}>← Wróć</button>
                  <button className="btn btn-red koszyk-paybtn" onClick={payNow} disabled={payBusy}>
                    {payBusy
                      ? <><span className="koszyk-spin" /> {fullyCovered ? 'Realizuję zamówienie…' : 'Przekierowuję do Tpay…'}</>
                      : fullyCovered ? 'Potwierdź zamówienie' : `Zapłać ${zl(grandTotal)}`}
                  </button>
                </div>
              </Reveal>
            )}
          </div>

          {/* side summary */}
          {step < 2 && rows.length > 0 && (
            <aside className="koszyk-side carbon">
              <h3 className="h-md">Razem</h3>
              <div className="koszyk-side-total">{zl(total)}</div>
              <ul className="produkt-usp">
                <li>Voucher ważny <b>1 rok</b></li>
                <li><b>14 dni</b> na zwrot</li>
                <li>PDF od razu na e-mail</li>
              </ul>
            </aside>
          )}
        </div>
      </div>
    </main>
  )
}
