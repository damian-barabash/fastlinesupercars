import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ContentProvider } from './lib/content.jsx'
import { startSmooth, stopSmooth, scrollTop } from './lib/smooth.js'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import SpeedFx from './components/SpeedFx.jsx'
import Home from './pages/Home.jsx'
import Oferta from './pages/Oferta.jsx'
import Produkt from './pages/Produkt.jsx'
import Tory from './pages/Tory.jsx'
import TorDetail from './pages/TorDetail.jsx'
import ONas from './pages/ONas.jsx'
import Kalendarz from './pages/Kalendarz.jsx'
import Kontakt from './pages/Kontakt.jsx'
import Koszyk from './pages/Koszyk.jsx'
import Dziekujemy from './pages/Dziekujemy.jsx'
import Legal from './pages/Legal.jsx'
import NotFound from './pages/NotFound.jsx'

const Admin = lazy(() => import('./admin/Admin.jsx'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { scrollTop() }, [pathname])
  return null
}

export default function App() {
  const { pathname } = useLocation()
  const isAdmin = pathname.startsWith('/admin')

  useEffect(() => {
    if (isAdmin) stopSmooth()
    else startSmooth()
  }, [isAdmin])

  if (isAdmin) {
    return (
      <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#9a9aa2' }}>Ładowanie panelu…</div>}>
        <Admin />
      </Suspense>
    )
  }

  return (
    <ContentProvider>
      <ScrollToTop />
      <SpeedFx />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/oferta" element={<Oferta />} />
        <Route path="/supersamochody-na-torze" element={<Navigate to="/oferta" replace />} />
        <Route path="/supersamochody" element={<Navigate to="/oferta" replace />} />
        <Route path="/produkt/:id" element={<Produkt />} />
        <Route path="/tory" element={<Tory />} />
        <Route path="/tory-wyscigowe" element={<Navigate to="/tory" replace />} />
        <Route path="/tory/:slug" element={<TorDetail />} />
        <Route path="/o-nas" element={<ONas />} />
        <Route path="/kalendarz" element={<Kalendarz />} />
        <Route path="/kontakt" element={<Kontakt />} />
        <Route path="/koszyk" element={<Koszyk />} />
        <Route path="/zamowienie" element={<Navigate to="/koszyk" replace />} />
        <Route path="/dziekujemy" element={<Dziekujemy />} />
        <Route path="/regulamin-platnosci" element={<Legal doc="regulamin" />} />
        <Route path="/polityka-prywatnosci" element={<Legal doc="privacy" />} />
        <Route path="/privacy-policy" element={<Navigate to="/polityka-prywatnosci" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </ContentProvider>
  )
}
