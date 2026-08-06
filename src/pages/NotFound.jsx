import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="section wrap tac" style={{ paddingBlock: 140 }}>
      <div className="ghost-num" style={{ fontSize: 150 }}>404</div>
      <h1 className="h-lg" style={{ marginTop: 10 }}>Wypadłeś z toru</h1>
      <p className="muted" style={{ marginTop: 12 }}>Ta strona nie istnieje — wracaj na prostą.</p>
      <Link to="/" className="btn btn-red" style={{ marginTop: 30 }}>Strona główna</Link>
    </main>
  )
}
