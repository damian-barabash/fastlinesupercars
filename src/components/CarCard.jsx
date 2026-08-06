import { Link } from 'react-router-dom'
import { zl } from '../lib/api.js'
import './carcard.css'

export default function CarCard({ p }) {
  const specs = (p.short_specs?.length ? p.short_specs : p.full_specs || [])
    .slice(0, 2)
    .map((s) => (s.label ? `${s.label}: ${s.value}` : s.value))
  return (
    <Link to={`/produkt/${p.id}`} className="card carcard">
      <div className="carcard-img">
        <img src={p.cover} alt={p.name} loading="lazy" />
        <div className="carcard-shine" />
      </div>
      <div className="carcard-body">
        <h3 className="carcard-name">{p.name}</h3>
        <ul className="carcard-specs">
          {specs.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <div className="carcard-foot">
          <span className="carcard-price"><i>OD</i> {zl(p.price_from)}</span>
          <span className="carcard-go">Wybierz →</span>
        </div>
      </div>
    </Link>
  )
}
