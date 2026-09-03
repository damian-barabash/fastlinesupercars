// Czytanie arkuszy (XLSX / CSV) w przeglądarce — bez żadnej biblioteki.
//
// Panel wczytuje pliki z kodami bonów, które przychodzą z zewnątrz (drukarnia, partner,
// arkusz Google). Zamiast dokładać ~400 kB SheetJS-a do panelu, korzystamy z tego,
// co przeglądarka ma sama: XLSX to ZIP z XML-ami, więc wystarczy czytnik ZIP-a
// (`DecompressionStream('deflate-raw')`) i `DOMParser` do XML-a.
//
// Obsługiwane: .xlsx (pierwszy arkusz), .csv / .tsv / .txt (średnik, przecinek, tabulator, |).
// Stary binarny .xls nie jest obsługiwany — trzeba zapisać jako .xlsx albo CSV.

/* ---------- ZIP ---------- */

/** Wpisy ZIP-a czytamy z centralnego katalogu — jego stopka (EOCD) leży na końcu pliku. */
function zipEntries(buf) {
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let eocd = -1
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('To nie jest plik XLSX (brak stopki ZIP)')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const out = []
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOff = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen))
    out.push({ name, method, compSize, localOff })
    p += 46 + nameLen + extraLen + commentLen
  }
  return { dv, u8, entries: out }
}

async function zipRead(zip, name) {
  const e = zip.entries.find((x) => x.name === name)
  if (!e) return null
  // nagłówek lokalny ma własne długości nazwy i pola „extra" — dane zaczynają się dopiero za nimi
  const nameLen = zip.dv.getUint16(e.localOff + 26, true)
  const extraLen = zip.dv.getUint16(e.localOff + 28, true)
  const start = e.localOff + 30 + nameLen + extraLen
  const raw = zip.u8.subarray(start, start + e.compSize)
  if (e.method === 0) return new TextDecoder().decode(raw)
  if (e.method !== 8) throw new Error(`Nieobsługiwana kompresja w pliku (${e.method})`)
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}

/* ---------- XLSX ---------- */

const colIndex = (ref) => {
  const m = /^([A-Z]+)/.exec(ref || '')
  if (!m) return 0
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

async function parseXlsx(buf) {
  const zip = zipEntries(buf)
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml')

  // teksty trzymane są osobno, komórki tylko na nie wskazują
  const shared = []
  const ssXml = await zipRead(zip, 'xl/sharedStrings.xml')
  if (ssXml) {
    for (const si of xml(ssXml).getElementsByTagName('si')) {
      let s = ''
      for (const t of si.getElementsByTagName('t')) s += t.textContent
      shared.push(s)
    }
  }

  const sheetName = zip.entries.map((e) => e.name)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0]
  if (!sheetName) throw new Error('Nie znaleziono arkusza w pliku')
  const sheet = xml(await zipRead(zip, sheetName))

  const rows = []
  for (const row of sheet.getElementsByTagName('row')) {
    const cells = []
    for (const c of row.getElementsByTagName('c')) {
      const i = colIndex(c.getAttribute('r'))
      const t = c.getAttribute('t')
      let v = ''
      if (t === 'inlineStr') {
        for (const el of c.getElementsByTagName('t')) v += el.textContent
      } else {
        const val = c.getElementsByTagName('v')[0]?.textContent ?? ''
        v = t === 's' ? (shared[+val] ?? '') : val
      }
      cells[i] = String(v).trim()
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = ''
    rows.push(cells)
  }
  return rows
}

/* ---------- CSV ---------- */

function parseCsv(text) {
  const body = text.replace(/^﻿/, '')
  const head = body.split(/\r?\n/)[0] || ''
  const delim = [';', ',', '\t', '|']
    .map((d) => [d, head.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0]

  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(cell.trim()); cell = '' }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows
}

/* ---------- wejście ---------- */

/**
 * Wczytuje plik i zwraca `{ rows, columns }`, gdzie `rows` to tablica tablic (surowe komórki),
 * a `columns` to litery/nagłówki do wyboru w mapowaniu kolumn.
 * Puste wiersze są odrzucane.
 */
export async function parseSheet(file) {
  const name = (file.name || '').toLowerCase()
  let rows
  if (name.endsWith('.xlsx')) {
    rows = await parseXlsx(await file.arrayBuffer())
  } else if (name.endsWith('.xls')) {
    throw new Error('Stary format .xls nie jest obsługiwany — zapisz plik jako .xlsx albo CSV')
  } else {
    rows = parseCsv(await file.text())
  }
  rows = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
  if (!rows.length) throw new Error('Plik jest pusty')
  const width = Math.max(...rows.map((r) => r.length))
  rows = rows.map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? '').trim()))
  return { rows, width }
}

/* ---------- rozpoznawanie wartości ---------- */

/** „300", „300,00", „1 234,56", „300 zł", „300.00 PLN" → grosze. */
export function toGrosze(raw) {
  if (raw == null) return 0
  const s = String(raw).replace(/\s| /g, '').replace(/(zł|pln|PLN)/gi, '')
  if (!s) return 0
  // przecinek jako separator dziesiętny (polski zapis), kropka jako tysiące → i odwrotnie
  let n = s
  if (s.includes(',') && s.includes('.')) n = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) n = s.replace(',', '.')
  const v = parseFloat(n)
  return Number.isFinite(v) ? Math.round(v * 100) : 0
}

/** Data z komórki: „2027-01-31", „31.01.2027", „31/01/2027" albo liczba dni Excela. */
export function toDate(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // Excel liczy dni od 1899-12-30 (z pominięciem swojego błędu z 1900 r.)
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseFloat(s) * 86400000)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
  }
  return ''
}

/** Zgadywanie, która kolumna jest którą — po nagłówku, a jak się nie da, po zawartości. */
export function guessMapping(header, rows) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-ząćęłńóśźż]/g, '')
  const find = (...words) => {
    const i = header.findIndex((h) => words.some((w) => norm(h).includes(w)))
    return i < 0 ? null : i
  }
  const map = {
    code: find('kod', 'code', 'voucher', 'bon', 'numer'),
    amount: find('kwot', 'warto', 'nomina', 'amount', 'cena', 'value'),
    valid: find('waz', 'waż', 'termin', 'valid', 'data'),
    note: find('notat', 'opis', 'uwag', 'note', 'komentarz'),
    recipient: find('odbiorc', 'imie', 'imię', 'nazwisk', 'klient', 'name'),
  }
  // brak nagłówków: kolumna z kodami to ta, w której najwięcej pól wygląda jak kod
  if (map.code == null && rows.length) {
    const width = rows[0].length
    let best = null, bestScore = 0
    for (let c = 0; c < width; c++) {
      const score = rows.filter((r) => /^[A-Za-z0-9_-]{4,32}$/.test(r[c] || '') && /[A-Za-z]/.test(r[c] || '')).length
      if (score > bestScore) { bestScore = score; best = c }
    }
    if (bestScore >= Math.max(1, rows.length * 0.6)) map.code = best
  }
  if (map.amount == null && rows.length) {
    const width = rows[0].length
    for (let c = 0; c < width; c++) {
      if (c === map.code) continue
      const hits = rows.filter((r) => toGrosze(r[c]) > 0).length
      if (hits >= Math.max(1, rows.length * 0.6)) { map.amount = c; break }
    }
  }
  return map
}

/** Czy pierwszy wiersz wygląda na nagłówki (nie ma w nim kwot ani typowych kodów). */
export function looksLikeHeader(rows) {
  if (rows.length < 2) return false
  const first = rows[0]
  const hasWords = first.some((c) => /[a-ząćęłńóśźż]{3,}/i.test(c) && !/^[A-Z0-9_-]{4,32}$/.test(c))
  const hasNumbers = first.filter((c) => toGrosze(c) > 0).length
  return hasWords && !hasNumbers
}
