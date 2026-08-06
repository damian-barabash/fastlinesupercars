// Lenis smooth scrolling (public pages only)
import Lenis from 'lenis'

let lenis = null

export function startSmooth() {
  if (lenis || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true })
  const raf = (t) => { lenis?.raf(t); if (lenis) requestAnimationFrame(raf) }
  requestAnimationFrame(raf)
}

export function stopSmooth() {
  lenis?.destroy()
  lenis = null
}

export function scrollTop(immediate = true) {
  if (lenis) lenis.scrollTo(0, { immediate })
  else window.scrollTo(0, 0)
}
