import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CONSENT_KEY, cookieChoice, pxPageView } from '../lib/pixel.js'
import { lockScroll } from '../lib/smooth.js'
import './cookiebar.css'

// strony czytelne przed wyborem: polityka, do której prowadzi link z okna, i regulamin
const FREE = ['/polityka-prywatnosci', '/regulamin-platnosci']

// Zgoda na cookies — jak na FRA: pełnoekranowa blokada, strona czeka na wybór.
// „Akceptuję" od razu startuje Meta Pixel i wysyła odsłonę bieżącej strony.
export default function CookieBar() {
  const { pathname } = useLocation()
  const [pending, setPending] = useState(() => !cookieChoice())
  const [asked, setAsked] = useState(false)   // otwarte z linku „Ustawienia cookies" w stopce
  const open = asked || (pending && !FREE.some((p) => pathname.startsWith(p)))

  useEffect(() => {
    const reopen = () => setAsked(true)
    window.addEventListener('fs-cookies-open', reopen)
    return () => window.removeEventListener('fs-cookies-open', reopen)
  }, [])

  useEffect(() => {
    if (!open) return
    document.documentElement.classList.add('ck-lock'); lockScroll(true)
    return () => { document.documentElement.classList.remove('ck-lock'); lockScroll(false) }
  }, [open])

  const choose = (v) => {
    const before = cookieChoice()
    try { localStorage.setItem(CONSENT_KEY, v) } catch { /* tryb prywatny — okno wróci przy następnej wizycie */ }
    setPending(false); setAsked(false)
    // wycofanie zgody: piksel jest już w pamięci strony — przeładowanie go zdejmuje
    if (before === 'all' && v !== 'all') { window.location.reload(); return }
    if (v === 'all' && before !== 'all') pxPageView()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="ckw" className="ckw" data-lenis-prevent
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          <motion.aside className="ckb carbon" role="dialog" aria-modal="true" aria-labelledby="ckb-t"
            initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.1 }}>
            <img className="ckb-logo" src="/img/2024_05_logo-grey.webp" alt="Fastline Supercars" />
            <h2 className="ckb-t" id="ckb-t">Pliki cookies</h2>
            <p className="ckb-p">
              Niezbędne pliki cookies pozwalają działać sklepowi. Za Twoją zgodą używamy też marketingowych (Meta),
              żeby pokazywać Ci nasze reklamy i mierzyć ich skuteczność. Zgodę możesz w każdej chwili wycofać.{' '}
              <Link to="/polityka-prywatnosci" className="ckb-more">Polityka prywatności</Link>
            </p>
            <div className="ckb-btns">
              <button type="button" className="btn btn-red" onClick={() => choose('all')}>Akceptuję</button>
              <button type="button" className="btn ckb-no" onClick={() => choose('essential')}>Tylko niezbędne</button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
