/* InPost lockers — public points API (no key, CORS *) + address search through Photon (OpenStreetMap).
   Only real Paczkomaty: name like WAW01M (the same rule as the server), status "Operating". */
const API = "https://api-shipx-pl.easypack24.net/v1/points";
const FIELDS = "name,status,location,location_description,opening_hours,address_details";
const CODE_RE = /^[A-Z]{3}\d{1,4}[A-Z]{0,3}$/;
export const POLAND = { lat: 51.9194, lng: 19.1451 };
export const WARSZAWA = { lat: 52.2297, lng: 21.0122 };

export const normCode = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");
export const isLockerCode = (s) => CODE_RE.test(normCode(s));

function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toPoint(it, from) {
  const a = it.address_details || {};
  const p = {
    code: it.name,
    lat: it.location?.latitude, lng: it.location?.longitude,
    street: [a.street, a.building_number].filter(Boolean).join(" "),
    post: a.post_code || "", city: a.city || "",
    desc: it.location_description || "", hours: it.opening_hours || "",
  };
  if (from) p.km = km(from, p);
  return p;
}
const usable = (it) => CODE_RE.test(it.name || "") && it.status === "Operating" && it.location;

/* "Marszałkowska 94, 00-510 Warszawa" */
export const addressOf = (p) => (p ? [p.street, [p.post, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
export const fmtKm = (v) => (v == null ? "" : v < 1 ? `${Math.round(v * 1000)} m` : `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} km`);

const cache = new Map();
async function get(url, signal) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  cache.set(url, d);
  return d;
}

export async function lockerByCode(code, signal) {
  const c = normCode(code);
  if (!CODE_RE.test(c)) return null;
  const d = await get(`${API}?name=${encodeURIComponent(c)}&fields=${FIELDS}`, signal);
  const it = (d.items || []).find(usable);
  return it ? toPoint(it) : null;
}

/* lockers around a point, nearest first */
export async function lockersNear({ lat, lng }, { meters = 3000, limit = 60, signal } = {}) {
  const url = `${API}?relative_point=${lat.toFixed(5)},${lng.toFixed(5)}&max_distance=${Math.round(meters)}&limit=${limit}&type=parcel_locker&fields=${FIELDS}`;
  const d = await get(url, signal);
  const from = { lat, lng };
  return (d.items || []).filter(usable).map((it) => toPoint(it, from)).sort((a, b) => a.km - b.km);
}

/* address / city / postcode → places (Poland only) */
export async function geocode(q, signal) {
  const s = String(q || "").trim();
  if (s.length < 3) return [];
  const d = await get(`https://photon.komoot.io/api/?q=${encodeURIComponent(s)}&limit=6&bbox=14.07,49.0,24.15,54.84`, signal);
  const seen = new Set();
  return (d.features || []).map((f) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry?.coordinates || [];
    const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : p.name;
    const label = [street, [p.postcode, p.city || (p.type === "city" ? "" : p.county)].filter(Boolean).join(" ")].filter(Boolean).join(", ") || p.name;
    return { label, lat, lng, city: p.type === "city" || p.type === "district" };
  }).filter((g) => g.lat && g.label && !seen.has(g.label) && seen.add(g.label));
}

export function myPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("nogeo"));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
}
