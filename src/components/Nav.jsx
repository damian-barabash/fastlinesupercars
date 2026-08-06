import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { cartCount } from '../lib/cart.js'
import { T } from '../lib/content.jsx'
import './nav.css'

const TORY_LINKS = [
  { to: '/tory/tor-modlin', label: 'Tor Modlin' },
  { to: '/tory/tor-wroclaw', label: 'Tor Wrocław' },
  { to: '/tory/autodrom-pomorze-pszczolki', label: 'Tor Pszczółki' },
  { to: '/tory/tor-poznan', label: 'Tor Poznań' },
  { to: '/tory/tor-lodz', label: 'Tor Łódź' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(cartCount())
  const loc = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const fn = () => setCount(cartCount())
    window.addEventListener('fs-cart', fn)
    window.addEventListener('storage', fn)
    return () => { window.removeEventListener('fs-cart', fn); window.removeEventListener('storage', fn) }
  }, [])

  useEffect(() => { setOpen(false) }, [loc.pathname])

  return (
    <>
      <div className="topbar">
        <div className="wrap topbar-in">
          <a className="topbar-mail" href="mailto:rezerwacje@fastlinesupercars.pl"><T k="top.email" /></a>
          <div className="topbar-steps">
            <T k="top.step1" /><i /><T k="top.step2" /><i /><T k="top.step3" /><i /><T k="top.step4" />
          </div>
        </div>
      </div>
      <header className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
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
          </nav>
          <div className="nav-right">
            <Link to="/koszyk" className="nav-cart" aria-label="Koszyk">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6L5 3H2" /><circle cx="9" cy="20" r="1.6" /><circle cx="18" cy="20" r="1.6" />
              </svg>
              {count > 0 && <span className="nav-cart-badge">{count}</span>}
            </Link>
            <button className={`nav-burger ${open ? 'is-open' : ''}`} onClick={() => setOpen(!open)} aria-label="Menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
