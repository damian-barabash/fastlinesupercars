import { useState } from 'react'
import { T } from '../lib/content.jsx'
import { shop } from '../lib/api.js'
import { Reveal } from './Reveal.jsx'
import './contact.css'

export default function ContactSection() {
  const [state, setState] = useState('idle') // idle | sending | done | error
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setState('sending')
    try {
      await shop('contact', form)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <section className="section contact-sec" id="kontakt">
      <div className="wrap">
        <Reveal>
          <span className="r-label"><T k="ct.label" /></span>
          <h2 className="h-lg" style={{ marginTop: 14 }}><T k="ct.title" /></h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 18 }}><T k="ct.sub" /></p>
        </Reveal>
        <div className="contact-grid">
          <Reveal delay={0.1} className="contact-info carbon">
            <h3 className="h-md"><T k="ct.box.title" /></h3>
            <p className="muted"><T k="ct.box.l1" /></p>
            <a className="contact-mail" href="mailto:rezerwacje@fastlinesupercars.pl"><T k="top.email" /></a>
            <p className="muted"><T k="ct.box.l2" /></p>
            <div className="contact-flag" aria-hidden />
          </Reveal>
          <Reveal delay={0.18}>
            {state === 'done' ? (
              <div className="contact-done">
                <div className="contact-done-badge">✓</div>
                <h3 className="h-md">Dziękujemy za wiadomość!</h3>
                <p className="muted">Odpowiemy w ciągu 24h.</p>
              </div>
            ) : (
              <form className="contact-form" onSubmit={submit}>
                <div className="contact-form-row">
                  <div className="field"><label>Imię i nazwisko</label><input required value={form.name} onChange={set('name')} /></div>
                  <div className="field"><label>E-mail</label><input type="email" required value={form.email} onChange={set('email')} /></div>
                </div>
                <div className="field"><label>Telefon (opcjonalnie)</label><input value={form.phone} onChange={set('phone')} /></div>
                <div className="field"><label>Wiadomość</label><textarea rows={5} required value={form.message} onChange={set('message')} /></div>
                {state === 'error' && <p className="contact-err">Nie udało się wysłać — spróbuj ponownie lub napisz na rezerwacje@fastlinesupercars.pl</p>}
                <button className="btn btn-red" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Wysyłanie…' : <T k="ct.form.cta" />}
                </button>
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
