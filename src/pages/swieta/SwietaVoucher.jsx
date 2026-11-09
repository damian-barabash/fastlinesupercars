import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useProducts, isOpenAmount } from '../../lib/products.js'
import { shop, zl } from '../../lib/api.js'
import { scrollToEl, lockScroll } from '../../lib/smooth.js'
import { gtmAddToCart, gtmBeginCheckout, gtmPurchase } from '../../lib/gtm.js'
import GiftVoucher, { TEMPLATE_IDS } from './GiftVoucher.jsx'
import LockerPicker from './LockerPicker.jsx'
import { addressOf } from './inpost.js'
import { useOswald } from './fonts.js'
import { GiftIco } from './Swieta.jsx'
import Lights from './Lights.jsx'
import { createPortal } from 'react-dom'
import './swieta.css'

/* /swieta-2026/voucher — konfigurator vouchera świątecznego.
   PREZENT → OPCJE → DLA KOGO (+ e-mail / Paczkomat) → DANE → GOTOWE, potem voucher wsuwa się do koperty
   i odlatuje. Ceny i kwoty liczy serwer (`shop` checkout z `campaign`); tryb testowy (settings.gift_mode)
   wystawia voucher bez płatności i wysyła go tylko na podany e-mail, tryb live przekierowuje do Tpay. */

const CAMPAIGN = 'swieta-2026'
const STEPS = [['prezent', 'Prezent'], ['opcje', 'Opcje'], ['dla', 'Dla kogo'], ['dane', 'Dane'], ['gotowe', 'Gotowe']]
const NAME_TIPS = ['Taty', 'Mamy', 'Męża', 'Żony', 'Brata', 'Siostry', 'Szefa']
const AMOUNT_TILES = [30000, 50000, 89900, 150000]
const ease = [0.22, 1, 0.36, 1]

const normNip = (v) => (v || '').replace(/^\s*PL/i, '').replace(/[\s-]/g, '')
function nipValid(nip) {
  if (!/^\d{10}$/.test(nip)) return false
  const sum = [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((s, k, i) => s + k * Number(nip[i]), 0) % 11
  return sum !== 10 && sum === Number(nip[9])
}
const amountLabel = (g) => `Wartość ${(g / 100).toLocaleString('pl-PL').replace(/\s/g, ' ')} zł`
const short = (name) => name.replace(/^Nowe\s+/i, '')

export default function SwietaVoucher() {
  useOswald()
  const nav = useNavigate()
  const products = useProducts()
  const gifts = useMemo(() => products
    .filter((p) => TEMPLATE_IDS.includes(p.id) || isOpenAmount(p))
    .sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99)), [products])

  const [info, setInfo] = useState({ mode: 'test', inpost: 5000 })
  useEffect(() => { shop('giftInfo').then(setInfo).catch(() => {}) }, [])

  const [step, setStep] = useState(0)
  const [pid, setPid] = useState(null)
  const [variant, setVariant] = useState('')
  const [amountTxt, setAmountTxt] = useState('')
  const [forName, setForName] = useState('')
  const [delivery, setDelivery] = useState('email')
  const [inpost, setInpost] = useState({ point: null, phone: '', name: '' })
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [wantInvoice, setWantInvoice] = useState(false)
  const [inv, setInv] = useState({ nip: '', company: '', street: '', postal: '', city: '' })
  const [nipState, setNipState] = useState({ busy: false, msg: '', ok: false, for: '' })
  const [terms, setTerms] = useState(false)
  const [codes, setCodes] = useState([])
  const [codeIn, setCodeIn] = useState('')
  const [codeErr, setCodeErr] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pack, setPack] = useState(false)
  const bodyRef = useRef(null)

  const p = gifts.find((x) => x.id === pid) || null
  const open = isOpenAmount(p)
  const amount = open ? Math.round(Number(String(amountTxt).replace(/\s/g, '').replace(',', '.')) * 100) : null
  const amountMin = p?.amount_min ?? 20000
  const amountMax = p?.amount_max ?? 1000000
  const amountOk = open && Number.isInteger(amount) && amount % 100 === 0 && amount >= amountMin && amount <= amountMax
  const price = !p ? 0 : open ? (amountOk ? amount : 0) : (p.variants?.find((v) => v.laps === variant)?.price || 0)
  const fee = delivery === 'inpost' ? info.inpost : 0
  const discount = Math.min(codes.reduce((s, c) => s + c.discount, 0), price)
  const toPay = price - discount + fee
  const line = !p ? '' : open ? (amountOk ? `${p.name} — ${amountLabel(amount)}` : p.name) : `${p.name}${variant ? ` — ${variant}` : ''}`
  const test = info.mode !== 'live'

  const pick = (x) => {
    setPid(x.id); setErr(''); setCodes([]); setCodeErr('')
    if (isOpenAmount(x)) { setVariant(''); setAmountTxt(String((x.price_from || 89900) / 100)) }
    else setVariant(x.variants?.[0]?.laps && x.variants.length === 1 ? x.variants[0].laps : '')
  }

  // rabaty wyceniane na nowo, gdy zmienia się cena prezentu
  const pricedFor = useRef(0)
  useEffect(() => {
    if (pricedFor.current === price) return
    pricedFor.current = price
    if (!codes.length || !price) return
    shop('checkPromo', { codes: codes.map((c) => c.code), subtotal: price })
      .then((d) => { setCodes(d.applied || []); setCodeErr((d.errors || []).map((x) => x.error).join(' · ')) })
      .catch((e) => setCodeErr(e.message))
  }, [price]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addCode(e) {
    e?.preventDefault?.()
    const code = codeIn.trim().toUpperCase().replace(/\s+/g, '')
    if (!code || codeBusy) return
    if (codes.some((c) => c.code === code)) { setCodeErr(`Kod ${code} jest już dodany`); return }
    setCodeBusy(true); setCodeErr('')
    try {
      const d = await shop('checkPromo', { codes: [...codes.map((c) => c.code), code], subtotal: price })
      const applied = d.applied || []
      if (test && applied.some((c) => c.kind === 'voucher')) {
        setCodeErr('W trybie testowym bony kwotowe są wyłączone — działają kody rabatowe')
        setCodes(applied.filter((c) => c.kind !== 'voucher'))
      } else {
        setCodes(applied)
        setCodeErr((d.errors || []).map((x) => x.error).join(' · '))
      }
      if (applied.some((c) => c.code === code)) setCodeIn('')
    } catch (er) { setCodeErr(er.message) }
    setCodeBusy(false)
  }
  const removeCode = (code) => {
    const rest = codes.filter((c) => c.code !== code)
    setCodes(rest); setCodeErr('')
    if (rest.length) shop('checkPromo', { codes: rest.map((c) => c.code), subtotal: price }).then((d) => setCodes(d.applied || [])).catch(() => {})
  }

  // faktura — NIP z sumą kontrolną, dane z Białej listy MF (ta sama akcja co w koszyku)
  const nipDigits = normNip(inv.nip)
  useEffect(() => {
    if (!wantInvoice || !nipValid(nipDigits) || nipState.for === nipDigits) return
    setNipState({ busy: true, msg: '', ok: false, for: nipDigits })
    shop('nip', { nip: nipDigits })
      .then((d) => {
        setInv((cur) => ({ ...cur, company: d.company || cur.company, street: d.street || cur.street, postal: d.postal || cur.postal, city: d.city || cur.city }))
        setNipState({ busy: false, ok: true, for: nipDigits, msg: 'Dane z rejestru VAT — sprawdź i popraw, jeśli trzeba' })
      })
      .catch((e) => setNipState({ busy: false, ok: false, for: nipDigits, msg: e.message || 'Wpisz dane ręcznie' }))
  }, [nipDigits, wantInvoice]) // eslint-disable-line react-hooks/exhaustive-deps
  const setI = (k) => (e) => {
    let v = e.target.value
    if (k === 'postal') { const d = v.replace(/\D/g, '').slice(0, 5); v = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d }
    setInv({ ...inv, [k]: v })
  }

  /* ---- walidacja kroków ---- */
  const problem = (k = STEPS[step][0]) => {
    if (k === 'prezent' && !p) return 'Wybierz prezent'
    if (k === 'opcje') {
      if (open && !amountOk) return `Kwota od ${zl(amountMin)} do ${zl(amountMax)}, w pełnych złotych`
      if (!open && !variant) return 'Wybierz liczbę okrążeń'
    }
    if (k === 'dla') {
      if (forName.trim().length < 2) return 'Wpisz imię osoby, która dostanie prezent'
      if (delivery === 'inpost') {
        if (!inpost.point) return 'Wybierz paczkomat'
        if (inpost.phone.replace(/\D/g, '').length < 9) return 'Podaj telefon do powiadomień InPost'
      }
    }
    if (k === 'dane') {
      if (!form.name.trim() || !/.+@.+\..+/.test(form.email) || form.phone.replace(/\D/g, '').length < 9) return 'Uzupełnij imię i nazwisko, e-mail i telefon'
      if (wantInvoice) {
        if (!nipValid(nipDigits)) return 'Podaj poprawny NIP firmy'
        if (!inv.company.trim() || !inv.street.trim() || !inv.city.trim()) return 'Uzupełnij dane firmy do faktury'
        if (!/^\d{2}-\d{3}$/.test(inv.postal)) return 'Kod pocztowy w formacie 00-000'
      }
    }
    if (k === 'gotowe' && !terms) return 'Zaakceptuj regulamin'
    return ''
  }
  const toBody = () => requestAnimationFrame(() => {
    const hdr = document.querySelector('.hdr')?.offsetHeight || 0
    if (bodyRef.current && bodyRef.current.getBoundingClientRect().top < hdr) scrollToEl(bodyRef.current, hdr + 12)
  })
  const go = (n) => {
    if (n > step) {
      for (let i = step; i < n; i++) { const pr = problem(STEPS[i][0]); if (pr) { setErr(pr); return } }
    }
    setErr(''); setStep(n); toBody()
    if (STEPS[n][0] === 'gotowe' && p) gtmAddToCart({ product_id: p.id, name: p.name, variant: open ? amountLabel(amount) : variant, price, qty: 1 })
  }
  const next = () => go(Math.min(step + 1, STEPS.length - 1))

  const startPack = () => {
    const pr = problem('gotowe')
    if (pr) { setErr(pr); return }
    setErr('')
    gtmBeginCheckout([{ product_id: p.id, name: p.name, variant: open ? amountLabel(amount) : variant, price, qty: 1 }], toPay)
    setPack(true)
  }
  const createOrder = () => shop('checkout', {
    campaign: CAMPAIGN,
    customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
    gift_for: forName.trim(),
    invoice: wantInvoice ? { ...inv, nip: nipDigits } : null,
    items: [{ product_id: p.id, qty: 1, ...(open ? { amount } : { variant }) }],
    ...(codes.length ? { codes: codes.map((c) => c.code) } : {}),
    delivery,
    delivery_data: delivery === 'inpost' ? { locker: inpost.point.code, address: addressOf(inpost.point), phone: inpost.phone.trim(), name: (inpost.name || form.name).trim() } : null,
    return_origin: window.location.origin,
  })

  const k = STEPS[step][0]

  return (
    <div className="xm xm-cfg">
      <section className="xm-cfg-head">
        <div className="xm-hero-bg" aria-hidden="true" />
        <Lights />
        <div className="wrap">
          <Link to="/swieta-2026" className="xm-back">← Święta 2026</Link>
          <h1 className="xm-h2">Twój voucher <span className="xm-red">świąteczny</span></h1>
          <Track step={step} onPick={(i) => i < step && go(i)} />
        </div>
      </section>
      {test && <div className="xm-test"><b>TRYB TESTOWY</b> voucher powstaje bez płatności, e-mail trafia tylko na podany adres</div>}

      <section className="xm-cfg-body" ref={bodyRef}>
        <div className={`wrap xm-cfg-grid is-${k}`}>
          <aside className="xm-side">
            <TiltCard>
              <GiftVoucher productId={p?.id || 'porsche-911'} name={forName} line={p ? line : ''} placeholder={p ? 'IMIĘ' : 'TWÓJ PREZENT'} />
            </TiltCard>
            <div className="xm-side-meta">
              <span className="xm-live"><i />Podgląd na żywo — tak wygląda PDF</span>
              {p && price > 0 && <b className="xm-side-price">{zl(price)}{fee ? <small> + {zl(fee)} InPost</small> : null}</b>}
            </div>
          </aside>

          <div className="xm-main">
            <AnimatePresence mode="wait">
              <motion.div key={k} className="xm-card" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease }}>
                <span className="xm-steptag">Krok {step + 1} / {STEPS.length}</span>

                {k === 'prezent' && (
                  <>
                    <h2 className="xm-t">Wybierz prezent</h2>
                    <div className="xm-gifts">
                      {gifts.map((x, i) => (
                        <motion.button key={x.id} type="button" className={`xm-gift ${pid === x.id ? 'on' : ''}`} onClick={() => pick(x)}
                          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: i * 0.04, ease }}>
                          <span className="xm-gift-img"><img src={`/swieta/v/${TEMPLATE_IDS.includes(x.id) ? x.id : 'porsche-911'}-s.webp`} alt="" loading="lazy" /></span>
                          <span className="xm-gift-txt">
                            <b>{isOpenAmount(x) ? 'Voucher na dowolną kwotę' : short(x.name)}</b>
                            <small>{isOpenAmount(x) ? `od ${zl(x.amount_min)}` : `od ${zl(x.price_from)}`}</small>
                          </span>
                          <span className="xm-tick">✓</span>
                        </motion.button>
                      ))}
                    </div>
                  </>
                )}

                {k === 'opcje' && p && (
                  <>
                    <h2 className="xm-t">{open ? 'Wartość vouchera' : 'Ile okrążeń?'}</h2>
                    <p className="xm-s">{open ? 'Obdarowany wykorzysta ją na dowolny przejazd z naszej oferty.' : short(p.name)}</p>
                    {open ? (
                      <>
                        <div className="xm-amounts">
                          {AMOUNT_TILES.map((a) => (
                            <button key={a} type="button" className={amount === a ? 'on' : ''} onClick={() => setAmountTxt(String(a / 100))}>{zl(a)}</button>
                          ))}
                        </div>
                        <label className={`xm-amount ${amountTxt && !amountOk ? 'is-bad' : ''}`}>
                          <span>Inna kwota</span>
                          <input inputMode="numeric" value={amountTxt} onChange={(e) => setAmountTxt(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} />
                          <i>zł</i>
                        </label>
                        <p className="xm-hint">Minimum {zl(amountMin)}, w pełnych złotych.</p>
                      </>
                    ) : (
                      <div className="xm-laps">
                        {(p.variants || []).map((v) => (
                          <button key={v.laps} type="button" className={variant === v.laps ? 'on' : ''} onClick={() => setVariant(v.laps)}>
                            <span className="xm-laps-n">{parseInt(v.laps, 10) || '•'}</span>
                            <span className="xm-laps-w">{v.laps.replace(/^\d+\s*/, '')}</span>
                            <b>{zl(v.price)}</b>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {k === 'dla' && (
                  <>
                    <h2 className="xm-t">Dla kogo?</h2>
                    <p className="xm-s">Wpisz imię tak, jak ma się pojawić na voucherze po słowie „DLA” — np. Łukasza, Ani, Taty.</p>
                    <label className="xm-name">
                      <span>DLA</span>
                      <input value={forName} onChange={(e) => setForName(e.target.value.replace(/\s+/g, ' ').slice(0, 40))} placeholder="np. Łukasza" maxLength={40} autoComplete="off" />
                      <i>{forName.length}/40</i>
                    </label>
                    <div className="xm-tips"><span>Podpowiedzi:</span>{NAME_TIPS.map((n) => <button key={n} type="button" onClick={() => setForName(n)}>{n}</button>)}</div>

                    <h3 className="xm-h">Jak dostarczyć voucher?</h3>
                    <div className="xm-modes">
                      <button type="button" className={`xm-mode ${delivery === 'email' ? 'on' : ''}`} onClick={() => setDelivery('email')}>
                        <MailIco /><b>E-mail</b><small>Voucher PDF od razu po zamówieniu</small><em>0 zł</em>
                      </button>
                      <button type="button" className={`xm-mode ${delivery === 'inpost' ? 'on' : ''}`} onClick={() => setDelivery('inpost')}>
                        <BoxIco /><b>Wydruk + Paczkomat</b><small>Elegancki wydruk w kopercie do Paczkomatu InPost, PDF na e-mail od razu</small><em>+{zl(info.inpost)}</em>
                      </button>
                    </div>
                    <AnimatePresence>
                      {delivery === 'inpost' && (
                        <motion.div className="xm-inpost" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }}>
                          <div className="xm-inpost-in">
                            <span className="xm-lbl">Paczkomat</span>
                            <LockerPicker value={inpost.point} onPick={(pt) => { setInpost((o) => ({ ...o, point: pt })); setErr('') }} />
                            <div className="xm-fields">
                              <label className="xm-f"><span>Telefon do powiadomień InPost *</span><input value={inpost.phone} onChange={(e) => setInpost({ ...inpost, phone: e.target.value })} inputMode="tel" autoComplete="tel" /></label>
                              <label className="xm-f"><span>Odbiorca paczki</span><input value={inpost.name} onChange={(e) => setInpost({ ...inpost, name: e.target.value })} placeholder="jak w danych zamawiającego" autoComplete="name" /></label>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {k === 'dane' && (
                  <>
                    <h2 className="xm-t">Twoje dane</h2>
                    <p className="xm-s">Na ten adres wyślemy voucher PDF i potwierdzenie.</p>
                    <div className="xm-fields">
                      <label className="xm-f"><span>Imię i nazwisko *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
                      <label className="xm-f"><span>Telefon *</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="tel" /></label>
                      <label className="xm-f xm-f-full"><span>E-mail *</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
                    </div>
                    <label className="xm-check"><input type="checkbox" checked={wantInvoice} onChange={(e) => setWantInvoice(e.target.checked)} /><i />Chcę fakturę VAT na firmę</label>
                    <AnimatePresence>
                      {wantInvoice && (
                        <motion.div className="xm-fields xm-inv" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }}>
                          <label className="xm-f xm-f-full"><span>NIP *</span><input value={inv.nip} onChange={setI('nip')} inputMode="numeric" placeholder="np. 526-025-02-74" /></label>
                          {nipState.busy && <p className="xm-hint xm-f-full">Sprawdzam w rejestrze VAT…</p>}
                          {!nipState.busy && nipState.msg && <p className={`xm-hint xm-f-full ${nipState.ok ? 'is-ok' : 'is-bad'}`}>{nipState.msg}</p>}
                          <label className="xm-f xm-f-full"><span>Nazwa firmy *</span><input value={inv.company} onChange={setI('company')} /></label>
                          <label className="xm-f xm-f-full"><span>Ulica i numer *</span><input value={inv.street} onChange={setI('street')} /></label>
                          <label className="xm-f"><span>Kod pocztowy *</span><input value={inv.postal} onChange={setI('postal')} inputMode="numeric" placeholder="00-000" /></label>
                          <label className="xm-f"><span>Miasto *</span><input value={inv.city} onChange={setI('city')} /></label>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {k === 'gotowe' && p && (
                  <>
                    <h2 className="xm-t">Sprawdź i zapakuj</h2>
                    <dl className="xm-sum">
                      <div><dt>Prezent</dt><dd>{line}</dd></div>
                      <div><dt>Dla</dt><dd><b>{forName}</b></dd></div>
                      <div><dt>Dostawa</dt><dd>{delivery === 'inpost' ? <>Wydruk do Paczkomatu <b>{inpost.point?.code}</b><br /><small>{addressOf(inpost.point)}</small></> : <>E-mail · {form.email}</>}</dd></div>
                      <div><dt>Ważność</dt><dd>12 miesięcy od zakupu</dd></div>
                      <div><dt>Cena</dt><dd>{zl(price)}</dd></div>
                      {fee > 0 && <div><dt>Wydruk + InPost</dt><dd>{zl(fee)}</dd></div>}
                      {codes.map((c) => (
                        <div key={c.code} className="is-disc"><dt>{c.kind === 'voucher' ? 'Voucher' : 'Rabat'} {c.code}{c.percent ? ` (−${c.percent}%)` : ''}</dt><dd>−{zl(c.discount)} <button type="button" onClick={() => removeCode(c.code)} aria-label="Usuń kod">✕</button></dd></div>
                      ))}
                      <div className="is-total"><dt>Do zapłaty</dt><dd>{zl(toPay)}</dd></div>
                    </dl>
                    <form className="xm-code" onSubmit={addCode}>
                      <input value={codeIn} onChange={(e) => setCodeIn(e.target.value)} placeholder="Masz kod rabatowy?" aria-label="Kod rabatowy" />
                      <button type="submit" disabled={!codeIn.trim() || codeBusy}>{codeBusy ? '…' : 'Dodaj'}</button>
                    </form>
                    {codeErr && <p className="xm-hint is-bad">{codeErr}</p>}
                    <label className="xm-check"><input type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErr('') }} /><i />Akceptuję <Link to="/regulamin-platnosci" target="_blank">regulamin płatności</Link></label>
                    <button type="button" className="btn btn-red xm-btn xm-pack" onClick={startPack}>
                      <GiftIco />{test ? 'Zapakuj voucher' : `Zapakuj i zapłać ${zl(toPay)}`}
                    </button>
                    {test && <p className="xm-hint">Tryb testowy — bez płatności.</p>}
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {err && <div className="xm-err" role="alert">{err}</div>}
            <div className="xm-foot">
              <button type="button" className="xm-foot-back" onClick={() => (step ? go(step - 1) : nav('/swieta-2026'))}>← Wstecz</button>
              {k !== 'gotowe' && (
                <>
                  <div className="xm-foot-sum">{p && price > 0 && <><span>{short(p.name)}</span><b>{zl(price + fee)}</b></>}</div>
                  <button type="button" className={`btn xm-btn xm-light xm-next ${problem() ? 'is-locked' : ''}`} onClick={next}>Dalej<span className="xm-arrow">→</span></button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {pack && (
        <PackShow productId={p.id} forName={forName} line={line} email={form.email} delivery={delivery} locker={inpost.point?.code}
          create={createOrder} onClose={() => setPack(false)}
          onAgain={() => { setPack(false); setStep(0); setPid(null); setForName(''); setCodes([]); setTerms(false) }}
          onPaid={(r) => { if (!r.test) gtmPurchase({ number: r.number, total: r.total, items: [{ product_id: p.id, name: p.name, variant, price, qty: 1 }] }) }} />
      )}
    </div>
  )
}

/* Postęp jak tor: czerwona linia, auto na bieżącym kroku, szachownica na mecie. */
function Track({ step, onPick }) {
  const pct = (step / (STEPS.length - 1)) * 100
  return (
    <div className="xm-track">
      <div className="xm-track-line"><i style={{ width: `${pct}%` }} /></div>
      <span className="xm-track-car" style={{ left: `${pct}%` }}><CarIco /></span>
      <ol>
        {STEPS.map(([key, label], i) => (
          <li key={key} className={`${i < step ? 'done' : ''} ${i === step ? 'on' : ''}`} style={{ left: `${(i / (STEPS.length - 1)) * 100}%` }}>
            <button type="button" onClick={() => onPick(i)} disabled={i >= step}><span>{i < step ? '✓' : i + 1}</span><small>{label}</small></button>
          </li>
        ))}
      </ol>
      <span className="xm-track-flag" aria-hidden="true" />
    </div>
  )
}

/* Karta pochyla się za kursorem i łapie odblask (desktop). */
function TiltCard({ children }) {
  const ref = useRef(null)
  const onMove = (e) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`)
    el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`)
  }
  const reset = () => { const el = ref.current; if (!el) return; el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg') }
  return <div ref={ref} className="xm-tilt" onPointerMove={onMove} onPointerLeave={reset}>{children}</div>
}

/* Finał: voucher wsuwa się do czarnej koperty, klapka się zamyka, pieczęć z logo, koperta odjeżdża
   z prędkością — w tym czasie serwer wystawia voucher. Potem „Wszystko jest na mailu" albo bramka Tpay. */
function PackShow({ productId, forName, line, email, delivery, locker, create, onClose, onAgain, onPaid }) {
  const [phase, setPhase] = useState('lift')
  const [res, setRes] = useState(null)
  const req = useRef(null)
  useEffect(() => {
    document.documentElement.classList.add('swl-lock'); lockScroll(true)
    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))
    const r = (req.current ||= create().then((d) => ({ ok: true, ...d })).catch((e) => ({ ok: false, error: e.message || 'Brak połączenia' })))
    at(650, () => setPhase('insert'))
    at(1500, () => setPhase('close'))
    at(2150, () => setPhase('seal'))
    const minDone = new Promise((ok) => at(2950, ok))
    let alive = true
    Promise.all([r, minDone]).then(([d]) => {
      if (!alive) return
      setRes(d)
      if (!d.ok) { setPhase('error'); return }
      setPhase('fly')
      at(1100, () => {
        if (d.payment_url) { window.location.assign(d.payment_url); return }
        onPaid?.(d)
        setPhase('done')
      })
    })
    return () => { alive = false; timers.forEach(clearTimeout); document.documentElement.classList.remove('swl-lock'); lockScroll(false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // portal do <body>: przodkowie mają transform / clip-path, które obcinałyby `position: fixed`
  return createPortal(
    <div className={`xm-pk is-${phase}`} role="dialog" aria-live="polite" data-lenis-prevent>
      <div className="xm-pk-bg" />
      {phase !== 'done' && (
        <div className="xm-pk-stage">
          <div className="xm-env">
            <div className="xm-env-back" />
            <div className="xm-env-letter"><GiftVoucher productId={productId} name={forName} line={line} /></div>
            <div className="xm-env-front"><span>DLA {forName.toUpperCase()}</span></div>
            <div className="xm-env-flap" />
            <div className="xm-env-seal"><b>FS</b></div>
            <span className="xm-env-lines" />
          </div>
          <p className="xm-pk-msg">{phase === 'error' ? 'Nie udało się zapakować vouchera' : phase === 'fly' ? (res?.payment_url ? 'Przechodzimy do płatności…' : 'Leci do Ciebie!') : 'Pakujemy prezent…'}</p>
          {phase === 'error' && (
            <div className="xm-pk-err">
              <p>{res?.error}</p>
              <button type="button" className="btn xm-btn xm-light" onClick={onClose}>Wróć i popraw</button>
            </div>
          )}
        </div>
      )}
      {phase === 'done' && (
        <motion.div className="xm-done" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease }}>
          {res?.test && <span className="xm-testtag">Tryb testowy</span>}
          <h2 className="xm-h2">Wszystko jest <span className="xm-red">na mailu</span></h2>
          <p className="xm-lead">Voucher dla <b>{forName}</b> właśnie poleciał na <b>{email}</b>.</p>
          {res?.voucher_code && <div className="xm-done-code"><small>Kod vouchera</small><b>{res.voucher_code}</b></div>}
          {delivery === 'inpost' && <p className="xm-hint">Wydruk w kopercie wyślemy do Paczkomatu <b>{locker}</b> — numer przesyłki przyjdzie SMS-em od InPost.</p>}
          <div className="xm-done-btns">
            <button type="button" className="btn xm-btn xm-light" onClick={onAgain}><GiftIco />Kolejny voucher</button>
            <Link to="/" className="btn xm-ghost">Strona główna</Link>
          </div>
        </motion.div>
      )}
    </div>,
    document.body,
  )
}

const MailIco = () => (<svg className="xm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 7 9-7" strokeLinejoin="round" /></svg>)
const BoxIco = () => (<svg className="xm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9" strokeLinejoin="round" /></svg>)
const CarIco = () => (<svg viewBox="0 0 40 16" aria-hidden="true"><path d="M2 12.5c0-2 1.2-3 3.2-3.4L11 8l5.5-4.2C18 2.7 19.6 2.3 21.5 2.3H27c2.2 0 3.6.8 4.8 2.4L34 8l2.6.7c1.3.4 1.9 1.3 1.9 2.6v1.2H35" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="10" cy="12.6" r="2.5" fill="currentColor" /><circle cx="30.5" cy="12.6" r="2.5" fill="currentColor" /><path d="M13 12.5h14" stroke="currentColor" strokeWidth="1.8" /></svg>)
