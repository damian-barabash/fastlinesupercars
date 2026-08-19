// Tpay Open API — klient (OAuth + tworzenie transakcji) i weryfikacja powiadomień (JWS RS256).
// Sekrety wyłącznie z env funkcji edge; nigdy nie trafiają do frontu ani do repo.
import * as x509 from 'https://esm.sh/@peculiar/x509@1.12.3'

x509.cryptoProvider.set(crypto as unknown as Crypto)

const ENV = (Deno.env.get('TPAY_ENV') ?? 'production').toLowerCase()
export const SANDBOX = ENV === 'sandbox' || ENV === 'test'

export const TPAY_API = SANDBOX ? 'https://openapi.sandbox.tpay.com' : 'https://api.tpay.com'
const SECURE_HOST = SANDBOX ? 'https://secure.sandbox.tpay.com' : 'https://secure.tpay.com'
const ROOT_CA_URL = `${SECURE_HOST}/x509/tpay-jws-root.pem`

const CLIENT_ID = Deno.env.get('TPAY_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('TPAY_CLIENT_SECRET') ?? ''

export const tpayConfigured = () => !!(CLIENT_ID && CLIENT_SECRET)

// ---------- OAuth ----------
let token = '', tokenExp = 0

export async function tpayToken(): Promise<string> {
  if (!tpayConfigured()) throw new Error('TPAY_NOT_CONFIGURED')
  const now = Date.now()
  if (token && now < tokenExp) return token
  const r = await fetch(`${TPAY_API}/oauth/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`tpay oauth ${r.status}: ${txt.slice(0, 200)}`)
  const d = JSON.parse(txt)
  token = d.access_token
  // odejmujemy minutę zapasu, żeby nie trafić w wygaśnięcie w trakcie żądania
  tokenExp = now + Math.max(60, (d.expires_in || 7200) - 60) * 1000
  return token
}

// ---------- transakcja ----------
export type TpayTransaction = {
  transactionId: string
  title: string
  status: string
  transactionPaymentUrl: string
}

export async function tpayCreateTransaction(input: {
  amountGrosze: number
  description: string
  hiddenDescription: string      // nasze id zamówienia — wraca w powiadomieniu jako tr_crc
  payerEmail: string
  payerName: string
  payerPhone?: string
  notificationUrl: string
  successUrl: string
  errorUrl: string
  lang?: string
}): Promise<TpayTransaction> {
  const t = await tpayToken()
  const body = {
    amount: Number((input.amountGrosze / 100).toFixed(2)),
    currency: 'PLN',
    description: input.description.slice(0, 128),
    hiddenDescription: input.hiddenDescription,
    lang: input.lang || 'pl',
    payer: {
      email: input.payerEmail,
      name: input.payerName.slice(0, 96),
      ...(input.payerPhone ? { phone: input.payerPhone } : {}),
    },
    callbacks: {
      notification: { url: input.notificationUrl },
      payerUrls: { success: input.successUrl, error: input.errorUrl },
    },
  }
  const r = await fetch(`${TPAY_API}/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`tpay transactions ${r.status}: ${txt.slice(0, 300)}`)
  const d = JSON.parse(txt)
  if (!d.transactionPaymentUrl) throw new Error(`tpay: brak transactionPaymentUrl (${txt.slice(0, 200)})`)
  return d as TpayTransaction
}

// ---------- weryfikacja powiadomienia (X-JWS-Signature, RS256) ----------
const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const bytesToB64url = (u8: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let rootCache: x509.X509Certificate | null = null
const certCache = new Map<string, x509.X509Certificate>()

async function fetchCert(url: string): Promise<x509.X509Certificate> {
  const hit = certCache.get(url)
  if (hit) return hit
  const r = await fetch(url)
  if (!r.ok) throw new Error(`cert fetch ${url}: ${r.status}`)
  const cert = new x509.X509Certificate(await r.text())
  certCache.set(url, cert)
  return cert
}

/**
 * Weryfikuje odłączony podpis JWS powiadomienia Tpay zgodnie z dokumentacją:
 * x5u musi wskazywać na host Tpay, certyfikat musi być podpisany przez root CA Tpay
 * i ważny, a podpis musi zgadzać się z `header.base64url(body)`.
 */
export async function verifyTpayJws(signature: string, rawBody: string): Promise<{ ok: boolean; err?: string }> {
  try {
    const parts = signature.trim().split('.')
    if (parts.length !== 3) return { ok: false, err: 'zły format JWS' }
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])))
    const x5u: string = header.x5u || ''
    if (!x5u.startsWith(`${SECURE_HOST}/`)) return { ok: false, err: `x5u spoza Tpay: ${x5u}` }

    const cert = await fetchCert(x5u)
    const now = new Date()
    if (now < cert.notBefore || now > cert.notAfter) return { ok: false, err: 'certyfikat poza okresem ważności' }

    if (!rootCache) rootCache = await fetchCert(ROOT_CA_URL)
    const chainOk = await cert.verify({ publicKey: rootCache, signatureOnly: true })
    if (!chainOk) return { ok: false, err: 'certyfikat nie pochodzi od root CA Tpay' }

    return await verifyDetachedJws(signature, rawBody, cert)
  } catch (e) {
    return { ok: false, err: String(e) }
  }
}

/**
 * Sama kryptografia odłączonego JWS (bez sprawdzania, czyj to certyfikat) —
 * wydzielone, żeby dało się przetestować podpisem własnym kluczem.
 */
export async function verifyDetachedJws(
  signature: string, rawBody: string, cert: x509.X509Certificate,
): Promise<{ ok: boolean; err?: string }> {
  try {
    const [headerB64, payloadB64, sigB64] = signature.trim().split('.')
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)))
    if (header.alg !== 'RS256') return { ok: false, err: `nieobsługiwany alg ${header.alg}` }

    // podpis jest odłączony: payload = base64url(surowe ciało żądania)
    const bodyB64 = bytesToB64url(new TextEncoder().encode(rawBody))
    if (payloadB64 && payloadB64 !== bodyB64) return { ok: false, err: 'payload JWS nie zgadza się z ciałem żądania' }

    const key = await cert.publicKey.export({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, ['verify'])
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64 || bodyB64}`),
    )
    return ok ? { ok: true } : { ok: false, err: 'podpis nie zgadza się' }
  } catch (e) {
    return { ok: false, err: String(e) }
  }
}

export { x509 }

/** Dodatkowa (opcjonalna) kontrola: md5sum = md5(id + tr_id + tr_amount + tr_crc + security_code). */
export async function md5(s: string): Promise<string> {
  // Deno nie ma md5 w SubtleCrypto — mała implementacja (tylko do kontroli sumy Tpay).
  const { crypto: stdCrypto } = await import('https://deno.land/std@0.224.0/crypto/mod.ts')
  const buf = await stdCrypto.subtle.digest('MD5', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
