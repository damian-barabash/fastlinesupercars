import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { getCart, cartCount, cartTotal } from '../lib/cart.js'
import { useProducts } from '../lib/products.js'
import { zl } from '../lib/api.js'
import { T } from '../lib/content.jsx'
import './nav.css'

const TORY_LINKS = [
  { to: '/tory/tor-modlin', label: 'Tor Modlin' },
  { to: '/tory/tor-wroclaw', label: 'Tor Wrocław' },
  { to: '/tory/autodrom-pomorze-pszczolki', label: 'Tor Pszczółki' },
  { to: '/tory/tor-poznan', label: 'Tor Poznań' },
  { to: '/tory/tor-lodz', label: 'Tor Łódź' },
]

const STEPS = [
  ['1', 'wybierz produkt'],
  ['2', 'uzupełnij dane'],
  ['3', 'zapłać'],
  ['4', 'Jedź!'],
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const products = useProducts()
  const loc = useLocation()

  useEffect(() => {
    const fn = () => setTick((t) => t + 1)
    window.addEventListener('fs-cart', fn)
    window.addEventListener('storage', fn)
    return () => { window.removeEventListener('fs-cart', fn); window.removeEventListener('storage', fn) }
  }, [])

  useEffect(() => { setOpen(false) }, [loc.pathname])

  const { count, total } = useMemo(() => {
    const items = getCart()
    return { count: items.reduce((s, i) => s + i.qty, 0), total: cartTotal(items, products) }
  }, [tick, products])

  return (
    <header className="hdr carbon">
      <div className="topbar">
        <div className="wrap topbar-in">
          <a className="topbar-mail" href="mailto:rezerwacje@fastlinesupercars.pl">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="1"/><path d="m2 7 10 7L22 7"/></svg>
            <T k="top.email" />
          </a>
          <div className="topbar-steps">
            {STEPS.map(([n, t], i) => (
              <span className="tstep" key={n}>
                <b>{n}</b> {t}
                {i < 3 && <svg className="tstep-chev" width="14" height="12" viewBox="0 0 14 12"><path d="M2 0h4l6 6-6 6H2l6-6z" fill="#e10600"/></svg>}
              </span>
            ))}
          </div>
          <Link to="/koszyk" className="topbar-cart">
            <span>{zl(total)}</span>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6L5 3H2" /><circle cx="9" cy="20" r="1.6" /><circle cx="18" cy="20" r="1.6" />
            </svg>
            {count > 0 && <i className="topbar-cart-badge">{count}</i>}
          </Link>
        </div>
      </div>
      <div className="wrap nav-in">
        <Link to="/" className="nav-logo" aria-label="Fastline Supercars">
          <img src="/img/2024_05_logo-grey.webp" alt="Fastline Supercars" />
        </Link>
        <nav className={`nav-links ${open ? 'nav-open' : ''}`}>
          <NavLink to="/o-nas">Dlaczego My</NavLink>
          <NavLink to="/oferta">Oferta</NavLink>
          <div className="nav-drop">
            <NavLink to="/tory">Tory <span className="nav-caret">▾</span></NavLink>
            <div className="nav-drop-menu">
              {TORY_LINKS.map((t) => <NavLink key={t.to} to={t.to}>{t.label}</NavLink>)}
            </div>
          </div>
          <NavLink to="/kalendarz">Terminy</NavLink>
          <NavLink to="/kontakt">Kontakt</NavLink>
          <div className="nav-cta-mobile">
            <Link to="/produkt/voucher" className="btn btn-red">Kup voucher</Link>
            <Link to="/kalendarz" className="btn btn-red">Mam voucher</Link>
          </div>
        </nav>
        <div className="nav-right">
          <Link to="/produkt/voucher" className="btn btn-red nav-cta">Kup voucher</Link>
          <Link to="/kalendarz" className="btn btn-red nav-cta">Mam voucher</Link>
          <button className={`nav-burger ${open ? 'is-open' : ''}`} onClick={() => setOpen(!open)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  )
}
