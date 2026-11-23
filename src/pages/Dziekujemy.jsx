import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { shop } from '../lib/api.js'
import { gtmPurchase } from '../lib/gtm.js'
import { pxPurchase } from '../lib/pixel.js'
import './dziekujemy.css'

// Powrót z bramki Tpay. Statusu płatności NIE ustala przeglądarka — pytamy serwer
// o zamówienie, dopóki webhook Tpay nie oznaczy go jako opłacone.
const POLL_MS = 1800
const GIVE_UP_MS = 90_000

export default function Dziekujemy() {
  const [params] = useSearchParams()
  const orderId = params.get('order') || ''
  const isError = params.get('error') === '1'
  const isTest = params.get('test') === '1'

  const [phase, setPhase] = useState(orderId ? 'processing' : 'empty') // processing | paid | slow | failed | empty
  const [order, setOrder] = useState(null)

  // Bez „ref-guardu": w StrictMode efekt uruchamia się dwa razy, a jego sprzątanie
  // ustawiłoby `stop` pierwszej pętli — drugie wywołanie musi wystartować własną.
  useEffect(() => {
    if (!orderId) return
    let stop = false
    const t0 = Date.now()

    async function loop() {
      // tryb testowy (bez Tpay) — realizacja zamówienia po stronie serwera
      if (isTest) { try { await shop('pay', { order_id: orderId }) } catch { /* pokaże się niżej */ } }
      let misses = 0
      while (!stop) {
        try {
          const d = await shop('order', { order_id: orderId })
          setOrder(d)
          misses = 0
          if (d.status === 'paid' && d.voucher?.code) {
            setPhase('paid')
            // jeden `purchase` na zamówienie, nawet po odświeżeniu strony
            const key = `fs_gtm_purchase_${d.id}`
            if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); gtmPurchase(d) }
            if (!isTest) pxPurchase(d)   // Meta: tylko prawdziwe zamówienia, raz na zamówienie
            return
          }
          if (d.status === 'chargeback') { setPhase('failed'); return }
          // powrót z bramki z błędem — nie ma na co czekać
          if (isError) { setPhase('failed'); return }
        } catch (e) {
          // nieznane zamówienie (zły link) — nie ma sensu odpytywać dalej
          if (/not found/i.test(e.message || '')) { setPhase(isError ? 'failed' : 'empty'); return }
          if (++misses >= 5) { setPhase('slow'); return }
        }
        if (Date.now() - t0 > GIVE_UP_MS) { setPhase('slow'); return }
        await new Promise((r) => setTimeout(r, POLL_MS))
      }
    }
    loop()
    return () => { stop = true }
  }, [orderId, isTest, isError])

  // Black Week (kod BLACK, 1+1): strona podziękowania zostaje w ciemnym motywie koszyka
  const bonus = order?.bonus || null
  useEffect(() => {
    if (!bonus) return
    document.documentElement.classList.add('bw')
    return () => document.documentElement.classList.remove('bw')
  }, [!!bonus])

  if (phase === 'empty') {
    return (
      <main className="section wrap tac dz">
        <h1 className="h-lg">Brak zamówienia</h1>
        <Link to="/oferta" className="btn btn-red" style={{ marginTop: 26 }}>Zobacz ofertę</Link>
      </main>
    )
  }

  if (phase === 'failed') {
    return (
      <main className="section wrap tac dz">
        <h1 className="h-lg">Płatność nie doszła do skutku</h1>
        <p className="muted" style={{ marginTop: 12, maxWidth: 560, marginInline: 'auto' }}>
          {order?.number ? <>Zamówienie <b>#{order.number}</b> czeka na opłacenie. </> : null}
          Możesz spróbować ponownie — nic nie zostało pobrane. W razie problemów napisz:{' '}
          <a className="red" href="mailto:rezerwacje@fastlinesupercars.pl">rezerwacje@fastlinesupercars.pl</a>
        </p>
        <div className="dz-ctas" style={{ justifyContent: 'center' }}>
          {order?.payment_url && <a className="btn btn-red" href={order.payment_url}>Zapłać ponownie</a>}
          <Link to="/koszyk" className="btn btn-ghost">Wróć do koszyka</Link>
        </div>
      </main>
    )
  }

  const voucher = order?.voucher
  const valid = voucher?.valid_until ? voucher.valid_until.split('-').reverse().join('.') : ''

  return (
    <main className="section dz">
      <div className="wrap dz-in">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} className="dz-badge">
          {phase === 'paid' ? '✓' : <span className="dz-spinner" />}
        </motion.div>
        <h1 className="h-xl">Dziękujemy{order?.customer_name ? `, ${order.customer_name}` : ''}!</h1>
        {order?.number && <div className="dz-order-no">Zamówienie <b>#{order.number}</b></div>}
        <p className="dz-lead muted">
          {phase === 'paid'
            ? <>Płatność potwierdzona. {bonus ? 'Dwa vouchery PDF wysłaliśmy' : 'Voucher PDF wysłaliśmy'} na <b style={{ color: 'var(--ink)' }}>{order?.customer_email}</b>.</>
            : phase === 'slow'
              ? <>Płatność jest jeszcze przetwarzana przez bank. {bonus ? 'Oba vouchery' : 'Voucher'} PDF wyślemy na <b style={{ color: 'var(--ink)' }}>{order?.customer_email}</b> automatycznie, gdy tylko wpłata zostanie zaksięgowana — nie musisz nic robić.</>
              : `Potwierdzamy płatność i generujemy ${bonus ? 'Twoje vouchery' : 'Twój voucher'} — to potrwa kilka sekund…`}
        </p>

        {phase !== 'slow' && (
          <div className={bonus ? 'dz-vouchers' : undefined}>
            <div className={`dz-voucher carbon ${phase === 'paid' ? 'is-ready' : ''}`}>
              <div className="dz-voucher-label">{bonus ? `Voucher dla: ${voucher?.recipient || order.customer_name}` : 'Kod vouchera'}</div>
              <div className="dz-voucher-code">
                {voucher?.code || <span className="dz-code-skeleton">FS-····-····</span>}
              </div>
              <div className="dz-voucher-valid">
                {valid ? <>Ważny do: <b>{valid}</b></> : 'Ważny 1 rok od zakupu'}
              </div>
            </div>
            {bonus && (
              <motion.div
                className={`dz-voucher dz-voucher-free carbon ${phase === 'paid' ? 'is-ready' : ''}`}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }}
              >
                <div className="dz-voucher-label"><i>Gratis</i> Voucher dla: {bonus.for}</div>
                <div className="dz-voucher-code">
                  {bonus.voucher?.code || <span className="dz-code-skeleton">FS-····-····</span>}
                </div>
                <div className="dz-voucher-valid">
                  {valid ? <>Ważny do: <b>{valid}</b></> : 'Ważny 1 rok od zakupu'}
                </div>
              </motion.div>
            )}
          </div>
        )}

        <div className="dz-next">
          <h2 className="h-md">Następny krok?</h2>
          <p className="muted">{bonus
            ? 'Zarezerwuj terminy przejazdów na wybranym torze — każdy voucher ma własny kod i rezerwuje się osobno.'
            : 'Zarezerwuj termin przejazdu na wybranym torze — podasz swój kod vouchera.'}</p>
          <div className="dz-ctas">
            {phase === 'slow' && order?.payment_url
              ? <a className="btn btn-red" href={order.payment_url}>Dokończ płatność</a>
              : <Link to="/kalendarz" className="btn btn-red">Zarezerwuj termin →</Link>}
            <Link to="/" className="btn btn-ghost">Strona główna</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
