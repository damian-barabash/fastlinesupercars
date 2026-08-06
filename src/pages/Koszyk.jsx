import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCart, updateQty, removeFromCart, clearCart, cartTotal } from '../lib/cart.js'
import { useProducts, productPrice } from '../lib/products.js'
import { zl } from '../lib/api.js'
import { Reveal } from '../components/Reveal.jsx'
import './koszyk.css'

const STEPS = ['Koszyk', 'Dane', 'Podsumowanie', 'Płatność']

export default function Koszyk() {
  const products = useProducts()
  const nav = useNavigate()
  const [items, setItems] = useState(getCart())
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ name: '', email: '', phone: '', gift_for: '', gift: false, terms: false })
  const [err, setErr] = useState('')

  useEffect(() => {
    const fn = () => setItems(getCart())
    window.addEventListener('fs-cart', fn)
    return () => window.removeEventListener('fs-cart', fn)
  }, [])

  const total = useMemo(() => cartTotal(items, products), [items, products])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const rows = items.map((it) => {
    const p = products.find((x) => x.id === it.product_id)
    return { ...it, p, price: p ? productPrice(p, it.variant) : 0 }
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

  // Optimistic payment: navigate to /dziekujemy immediately; order+pay run there in background
  function payNow() {
    const payload = {
      customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
      gift_for: form.gift ? form.gift_for.trim() : '',
      items: items.map((i) => ({ product_id: i.product_id, variant: i.variant, qty: i.qty })),
    }
    sessionStorage.setItem('fs_pending_order', JSON.stringify(payload))
    clearCart()
    nav('/dziekujemy')
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
                  <div className="koszyk-sum-row koszyk-sum-total">
                    <span>Razem</span><b>{zl(total)}</b>
                  </div>
                </div>
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
                <div className="koszyk-pay-box carbon">
                  <div className="koszyk-pay-method is-active">
                    <span className="koszyk-pay-radio" />
                    <div>
                      <b>Płatność online</b>
                      <p className="muted">BLIK, karta, szybki przelew — Tpay</p>
                    </div>
                    <span className="koszyk-pay-total">{zl(total)}</span>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 13 }}>
                  Po kliknięciu „Zapłać" przetworzymy zamówienie i wygenerujemy Twój voucher.
                </p>
                <div className="koszyk-actions">
                  <button className="btn btn-ghost" onClick={() => goStep(2)}>← Wróć</button>
                  <button className="btn btn-red koszyk-paybtn" onClick={payNow}>Zapłać {zl(total)}</button>
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
