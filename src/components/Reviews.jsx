import REVIEWS from '../data/reviews.json'
import { Stagger, Item } from './Reveal.jsx'
import './reviews.css'

export default function Reviews() {
  return (
    <Stagger className="reviews">
      {REVIEWS.map((r) => (
        <Item key={r.name} className="review card">
          <svg className="review-helmet" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3a8.5 8.5 0 0 0-8.5 8.5V16a2 2 0 0 0 2 2h9L21 13v-1.5A8.5 8.5 0 0 0 12 3Z" />
            <path d="M8 12.5h13" />
          </svg>
          <p className="review-text">{r.text}</p>
          <div className="review-name">{r.name}</div>
        </Item>
      ))}
    </Stagger>
  )
}
