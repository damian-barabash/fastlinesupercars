import { useEffect } from 'react'

/* Oswald — ta sama czcionka, którą PDF wpisuje imię na voucher. Ładowana tylko na stronach
   świątecznych, żeby reszta serwisu nie pobierała jej na darmo. */
const HREF = 'https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&display=swap&subset=latin-ext'

export function useOswald() {
  useEffect(() => {
    if (document.querySelector(`link[href="${HREF}"]`)) return
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = HREF
    document.head.appendChild(l)
  }, [])
}
