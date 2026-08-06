import { Link } from 'react-router-dom'
import { T } from '../lib/content.jsx'
import './footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="kerb" />
      <div className="wrap footer-in">
        <div className="footer-col">
          <img className="footer-logo" src="/img/2024_05_logo-grey.webp" alt="Fastline Supercars" />
          <p className="muted"><T k="ct.box.l1" /></p>
          <a className="footer-mail" href="mailto:rezerwacje@fastlinesupercars.pl"><T k="top.email" /></a>
          <p className="muted"><T k="ct.box.l2" /></p>
        </div>
        <div className="footer-col">
          <h4 className="footer-h">Menu</h4>
          <Link to="/o-nas">Dlaczego My</Link>
          <Link to="/oferta">Oferta</Link>
          <Link to="/kalendarz">Terminy</Link>
          <Link to="/kontakt">Kontakt</Link>
        </div>
        <div className="footer-col">
          <h4 className="footer-h">Tory</h4>
          <Link to="/tory/tor-modlin">Tor Modlin</Link>
          <Link to="/tory/tor-wroclaw">Tor Wrocław</Link>
          <Link to="/tory/autodrom-pomorze-pszczolki">Tor Pszczółki</Link>
          <Link to="/tory/tor-poznan">Tor Poznań</Link>
          <Link to="/tory/tor-lodz">Tor Łódź</Link>
        </div>
        <div className="footer-col">
          <h4 className="footer-h">Informacje</h4>
          <Link to="/regulamin-platnosci">Regulamin płatności</Link>
          <Link to="/polityka-prywatnosci">Polityka prywatności</Link>
          <Link to="/koszyk">Koszyk</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="wrap footer-bottom-in">
          <span><T k="ft.copy" /></span>
          <span className="footer-tag">#sportdrivingexperience</span>
        </div>
      </div>
    </footer>
  )
}
