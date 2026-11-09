/* Girlanda lampek u góry sekcji: dwa zwisające przewody, żarówki w ciepłych kolorach mrugają
   w swoim rytmie. Pozycje liczone raz (krzywa zwisu), bez losowania przy renderze. */
const COLORS = [
  ['#ffd98a', 'rgba(255,200,90,.75)'],
  ['#fff4dc', 'rgba(255,240,200,.7)'],
  ['#ff6b5e', 'rgba(255,90,70,.7)'],
  ['#ffe3a3', 'rgba(255,215,130,.75)'],
]
const STRANDS = [
  { n: 22, top: -4, sag: 58 },
  { n: 17, top: -14, sag: 96 },
]

export default function Lights() {
  return (
    <div className="xm-lights" aria-hidden="true">
      <svg viewBox="0 0 1000 150" preserveAspectRatio="none">
        {STRANDS.map((s, i) => (
          <path key={i} vectorEffect="non-scaling-stroke" d={`M0 ${s.top} Q500 ${s.top + s.sag * 2} 1000 ${s.top}`} />
        ))}
      </svg>
      {STRANDS.flatMap((s, si) => [...Array(s.n)].map((_, k) => {
        const u = (k + 0.5) / s.n
        const y = s.top + s.sag * 4 * u * (1 - u)          // ta sama krzywa co ścieżka Q (wierzchołek w połowie)
        const [c, g] = COLORS[(k + si * 2) % COLORS.length]
        const tilt = (0.5 - u) * -28                       // żarówki odchylają się zgodnie z nachyleniem przewodu
        return (
          <i key={`${si}-${k}`} className={`xm-bulb ${k % 2 ? 'is-odd' : ''}`}
            style={{ left: `${u * 100}%`, top: `${y}px`, '--c': c, '--g': g, '--r': `${tilt}deg`, '--d': `${2.4 + ((k * 7 + si * 3) % 5) * 0.45}s`, '--dl': `${-((k * 13 + si * 5) % 9) * 0.37}s` }} />
        )
      }))}
    </div>
  )
}
