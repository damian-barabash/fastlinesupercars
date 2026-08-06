import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { shop, zl } from '../lib/api.js'
import './dziekujemy.css'

// Optimistic thank-you: order is created & paid in the background while the
// driver already sees the confirmation screen filling in.
export default function Dziekujemy() {
  const [phase, setPhase] = useState('processing') // processing | paid | error
  const [order, setOrder] = useState(null)
  const [voucher, setVoucher] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const pending = sessionStorage.getItem('fs_pending_order')
    const doneOrder = sessionStorage.getItem('fs_done_order')

    async function run() {
      try {
        if (pending) {
          const payload = JSON.parse(pending)
          const created = await shop('createOrder', payload)
          setOrder({ number: created.number, total: created.total, email: payload.customer.email })
          const paid = await shop('pay', { order_id: created.order_id })
          sessionStorage.removeItem('fs_pending_order')
          sessionStorage.setItem('fs_done_order', JSON.stringify({
            number: created.number, total: created.total, email: payload.customer.email,
            code: paid.voucher_code, valid_until: paid.valid_until,
          }))
          setVoucher({ code: paid.voucher_code, valid_until: paid.valid_until })
          setPhase('paid')
        } else if (doneOrder) {
          const d = JSON.parse(doneOrder)
          setOrder(d)
          setVoucher({ code: d.code, valid_until: d.valid_until })
          setPhase('paid')
        } else {
          setPhase('empty')
        }
      } catch (e) {
        console.error(e)
        setPhase('error')
      }
    }
    run()
  }, [])

  if (phase === 'empty') {
    return (
      <main className="section wrap tac dz">
        <h1 className="h-lg">Brak zamówienia</h1>
        <Link to="/oferta" className="btn btn-red" style={{ marginTop: 26 }}>Zobacz ofertę</Link>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main className="section wrap tac dz">
        <h1 className="h-lg">Coś poszło nie tak</h1>
        <p className="muted" style={{ marginTop: 12 }}>
          Nie udało się przetworzyć płatności. Napisz do nas: rezerwacje@fastlinesupercars.pl
        </p>
        <Link to="/koszyk" className="btn btn-red" style={{ marginTop: 26 }}>Wróć do koszyka</Link>
      </main>
    )
  }

  const valid = voucher?.valid_until ? voucher.valid_until.split('-').reverse().join('.') : ''

  return (
    <main className="section dz">
      <div className="wrap dz-in">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} className="dz-badge">
          {phase === 'paid' ? '✓' : <span className="dz-spinner" />}
        </motion.div>
        <h1 className="h-xl">Dziękujemy{order ? `, zamówienie #${order.number}` : ''}!</h1>
        <p className="dz-lead muted">
          {phase === 'paid'
            ? <>Płatność potwierdzona. Voucher PDF wysłaliśmy na <b style={{ color: '#fff' }}>{order?.email}</b>.</>
            : 'Przetwarzamy Twoją płatność i generujemy voucher — potrwa to kilka sekund…'}
        </p>

        <div className={`dz-voucher carbon ${phase === 'paid' ? 'is-ready' : ''}`}>
          <div className="dz-voucher-label">Kod vouchera</div>
          <div className="dz-voucher-code">
            {voucher?.code || <span className="dz-code-skeleton">FS-····-····</span>}
          </div>
          <div className="dz-voucher-valid">
            {valid ? <>Ważny do: <b>{valid}</b></> : 'Ważny 1 rok od zakupu'}
          </div>
        </div>

        <div className="dz-next">
          <h2 className="h-md">Następny krok?</h2>
          <p className="muted">Zarezerwuj termin przejazdu na wybranym torze — podasz swój kod vouchera.</p>
          <div className="dz-ctas">
            <Link to="/kalendarz" className="btn btn-red">Zarezerwuj termin →</Link>
            <Link to="/" className="btn btn-ghost">Strona główna</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
