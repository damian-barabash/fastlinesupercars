import { useState } from 'react'
import { T, useContent } from '../lib/content.jsx'
import './faq.css'

export default function Faq() {
  const [open, setOpen] = useState(0)
  const { c } = useContent()
  const items = [1, 2, 3, 4, 5, 6].filter((i) => c[`faq.${i}.q`])
  return (
    <div className="faq">
      {items.map((i, idx) => (
        <div key={i} className={`faq-item ${open === idx ? 'is-open' : ''}`}>
          <button className="faq-q" onClick={() => setOpen(open === idx ? -1 : idx)}>
            <span className="faq-num">{String(idx + 1).padStart(2, '0')}</span>
            <T k={`faq.${i}.q`} />
            <span className="faq-plus" aria-hidden>+</span>
          </button>
          <div className="faq-a" style={{ gridTemplateRows: open === idx ? '1fr' : '0fr' }}>
            <div className="faq-a-in"><T k={`faq.${i}.a`} as="p" /></div>
          </div>
        </div>
      ))}
    </div>
  )
}
