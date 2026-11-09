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

/** Przewinięcie do elementu (z odstępem na nagłówek) — przez Lenis, gdy działa. */
export function scrollToEl(el, offset = 0) {
  if (!el) return
  const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset)
  if (lenis) lenis.scrollTo(y, { duration: 0.9 })
  else window.scrollTo({ top: y, behavior: 'smooth' })
}

/** Blokada przewijania strony (pop-upy) — Lenis też musi stanąć. */
export function lockScroll(on) {
  if (on) lenis?.stop(); else lenis?.start()
}
