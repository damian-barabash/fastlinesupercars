import { useLayoutEffect, useRef, useState } from 'react'

/* Podgląd vouchera świątecznego = prawdziwy szablon (ten sam co w PDF) + teksty w tych samych
   miejscach co w PDF (`DEFAULT_LAYOUT` w supabase/functions/_shared/core.ts): imię pod „DLA",
   pozycja pod „PRZEJAZD PO TORZE SPORTOWYM", ważność i kod w prawym dolnym rogu.
   Rozmiary w `cqw` — podgląd skaluje się razem z kartą. */

export const TEMPLATE_IDS = ['porsche-911', 'toyota-gr-supra', 'alpine-a110', 'bmw-m2', 'mercedes-a45s-amg', 'focus-rs', 'toyota-gr-yaris', 'pakiet-niemiecki', 'pakiet-japonski']
export const tplOf = (productId) => (TEMPLATE_IDS.includes(productId) ? productId : 'porsche-911')
export const tplSrc = (productId, small = false) => `/swieta/v/${tplOf(productId)}${small ? '-s' : ''}.webp`

/** Tekst dopasowany do szerokości pola (jak `fitSize` w PDF) — zmniejszany skalą, środek zostaje na miejscu. */
function Fit({ text, className, maxW }) {
  const ref = useRef(null)
  const [s, setS] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.parentElement
    const fit = () => {
      const limit = box.clientWidth * maxW
      const w = el.scrollWidth
      setS(w > limit && w > 0 ? limit / w : 1)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [text, maxW])
  return <span ref={ref} className={className} style={{ '--fit': s }}>{text}</span>
}

export default function GiftVoucher({ productId, name, line, code, placeholder = 'IMIĘ', className = '', small = false }) {
  const shown = (name || '').trim()
  return (
    <div className={`gv ${className}`}>
      <img src={tplSrc(productId, small)} alt="" draggable="false" width="1400" height="674" />
      <div className="gv-txt" aria-hidden="true">
        <Fit key={`n-${shown}`} className={`gv-name ${shown ? '' : 'is-empty'}`} text={(shown || placeholder).toUpperCase()} maxW={0.4} />
        {line && <Fit className="gv-line" text={line.toUpperCase()} maxW={0.42} />}
        <span className="gv-valid">Ważność: 12 miesięcy</span>
        <span className="gv-code">Kod vouchera: {code || 'FS-••••-••••'}</span>
      </div>
      <i className="gv-shine" />
    </div>
  )
}
