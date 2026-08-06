import LEGAL from '../data/legal.json'
import { Reveal } from '../components/Reveal.jsx'
import './legal.css'

export default function Legal({ doc }) {
  const blocks = LEGAL[doc] || []
  const title = doc === 'regulamin' ? 'Regulamin płatności' : 'Polityka prywatności'
  return (
    <main className="section">
      <div className="wrap legal">
        <Reveal>
          <span className="r-label">Informacje</span>
          <h1 className="h-lg" style={{ marginTop: 14, marginBottom: 36 }}>{title}</h1>
        </Reveal>
        <div className="legal-body">
          {blocks.map((b, i) =>
            b.t === 'h'
              ? <h2 key={i} className="legal-h">{b.x}</h2>
              : b.t === 'li'
                ? <li key={i} className="legal-li">{b.x}</li>
                : <p key={i}>{b.x}</p>
          )}
        </div>
      </div>
    </main>
  )
}
