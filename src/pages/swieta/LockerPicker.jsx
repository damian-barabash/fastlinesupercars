import { useEffect, useRef, useState } from "react";
import { lockerByCode, lockersNear, geocode, myPosition, isLockerCode, addressOf, fmtKm, WARSZAWA } from "./inpost";
import "./locker.css";

/* Paczkomat chosen right on the page: 1) search list (address / city / code / my location), 2) map pop-up.
   value = picked point { code, street, post, city, desc, hours, lat, lng } | null */
const TX = {
  pl: {
    list: "WYSZUKAJ NA LIŚCIE", listD: "Wpisz miasto, ulicę albo kod paczkomatu", map: "WYBIERZ NA MAPIE", mapD: "Wszystkie paczkomaty InPost na mapie",
    ph: "np. Marszałkowska 10, Warszawa albo WAW01M", near: "W pobliżu mnie", nearest: "Najbliżej", none: "Nie znaleźliśmy paczkomatu — spróbuj innego adresu.",
    down: "Wyszukiwarka InPost nie odpowiada — spróbuj za chwilę.", geoErr: "Nie udało się ustalić lokalizacji — wpisz adres.", searching: "Szukam…",
    change: "ZMIEŃ", onMap: "POKAŻ NA MAPIE", pick: "WYBIERZ TEN PACZKOMAT", picked: "WYBRANY", close: "Zamknij", mapT: "WYBIERZ PACZKOMAT",
    zoom: "Przybliż mapę, żeby zobaczyć paczkomaty", inView: "Paczkomaty w okolicy", h247: "Czynny 24/7", other: "Inne miejsca:", loading: "Ładuję mapę…",
  },
  en: {
    list: "SEARCH THE LIST", listD: "Type a city, street or locker code", map: "PICK ON THE MAP", mapD: "All InPost lockers on a map",
    ph: "e.g. Marszałkowska 10, Warsaw or WAW01M", near: "Near me", nearest: "Closest to", none: "No locker found — try another address.",
    down: "InPost search is not responding — try again in a moment.", geoErr: "Could not get your location — type an address.", searching: "Searching…",
    change: "CHANGE", onMap: "SHOW ON MAP", pick: "PICK THIS LOCKER", picked: "SELECTED", close: "Close", mapT: "PICK A LOCKER",
    zoom: "Zoom in to see the lockers", inView: "Lockers around", h247: "Open 24/7", other: "Other places:", loading: "Loading the map…",
  },
};

export default function LockerPicker({ value, onPick, en = false }) {
  const X = TX[en ? "en" : "pl"];
  const [mode, setMode] = useState(null);       // null | "list"
  const [map, setMap] = useState(false);
  const pick = (p) => { onPick(p); setMode(null); setMap(false); };

  return (
    <div className="lk">
      {value ? (
        <div className="lk-sel" key={value.code}>
          <PinIcon />
          <div className="lk-sel__txt">
            <span className="lk-sel__tag">{X.picked}</span>
            <b>{value.code}</b>
            <span>{addressOf(value)}</span>
            {value.desc && <small>{value.desc}{value.hours === "24/7" ? ` · ${X.h247}` : ""}</small>}
          </div>
          <div className="lk-sel__btns">
            <button type="button" onClick={() => setMode(mode === "list" ? null : "list")}>{X.change}</button>
            <button type="button" onClick={() => setMap(true)}>{X.onMap}</button>
          </div>
        </div>
      ) : (
        <div className="lk-opts">
          <button type="button" className={`lk-opt ${mode === "list" ? "on" : ""}`} onClick={() => setMode(mode === "list" ? null : "list")}>
            <SearchIcon /><b>{X.list}</b><small>{X.listD}</small>
          </button>
          <button type="button" className="lk-opt" onClick={() => setMap(true)}>
            <MapIcon /><b>{X.map}</b><small>{X.mapD}</small>
          </button>
        </div>
      )}
      {mode === "list" && <LockerSearch X={X} current={value} onPick={pick} />}
      {map && <LockerMap X={X} current={value} onPick={pick} onClose={() => setMap(false)} />}
    </div>
  );
}

/* ---------- 1. list search ---------- */
function useLockerSearch(q) {
  const [st, setSt] = useState({ busy: false, items: [], places: [], place: null, err: "" });
  const [origin, setOrigin] = useState(null);   // forced point (my location / other place)
  useEffect(() => { setOrigin(null); }, [q]);
  useEffect(() => {
    const s = q.trim();
    if (!origin && s.length < 3) { setSt({ busy: false, items: [], places: [], place: null, err: "" }); return; }
    const ac = new AbortController();
    setSt((o) => ({ ...o, busy: true, err: "" }));
    const t = setTimeout(async () => {
      try {
        if (!origin && isLockerCode(s)) {
          const p = await lockerByCode(s, ac.signal);
          if (p) return setSt({ busy: false, items: [p], places: [], place: null, err: "" });
        }
        let places = [], place = origin;
        if (!place) { places = await geocode(s, ac.signal); place = places[0]; }
        if (!place) return setSt({ busy: false, items: [], places: [], place: null, err: "none" });
        let items = await lockersNear(place, { meters: place.city ? 4000 : 2000, limit: 40, signal: ac.signal });
        if (items.length < 3) items = await lockersNear(place, { meters: 8000, limit: 40, signal: ac.signal });
        setSt((o) => ({ busy: false, items: items.slice(0, 8), places: origin ? o.places : places, place, err: items.length ? "" : "none" }));
      } catch (e) { if (e.name !== "AbortError") setSt({ busy: false, items: [], places: [], place: null, err: "down" }); }
    }, origin ? 0 : 450);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q, origin]);
  return [st, setOrigin];
}

function LockerSearch({ X, current, onPick }) {
  const [q, setQ] = useState("");
  const [geoErr, setGeoErr] = useState(false);
  const [st, setOrigin] = useLockerSearch(q);
  const near = () => { setGeoErr(false); myPosition().then((p) => setOrigin({ ...p, label: X.near })).catch(() => setGeoErr(true)); };

  return (
    <div className="lk-list">
      <div className="lk-search">
        <SearchIcon />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={X.ph} autoFocus aria-label={X.listD} />
        <button type="button" className="lk-near" onClick={near}><GpsIcon /><span>{X.near}</span></button>
      </div>
      {st.busy && <p className="lk-note"><i className="lk-spin" />{X.searching}</p>}
      {!st.busy && (st.err || geoErr) && <p className="lk-note lk-note--err">{geoErr ? X.geoErr : st.err === "down" ? X.down : X.none}</p>}
      {!st.busy && st.place && st.items.length > 0 && <p className="lk-note">{X.nearest}: <b>{st.place.label}</b></p>}
      {!st.busy && st.places.length > 1 && (
        <div className="lk-places"><span>{X.other}</span>{st.places.slice(1, 5).map((p) => <button type="button" key={p.label} onClick={() => setOrigin(p)}>{p.label}</button>)}</div>
      )}
      <ul className="lk-res">
        {st.items.map((p, i) => (
          <li key={p.code} style={{ "--i": i }}>
            <button type="button" className={current?.code === p.code ? "on" : ""} onClick={() => onPick(p)}>
              <PinIcon />
              <span className="lk-res__t"><b>{p.code}</b><span>{addressOf(p)}</span>{p.desc && <small>{p.desc}</small>}</span>
              {p.km != null && <em>{fmtKm(p.km)}</em>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 2. map pop-up (Leaflet + OpenStreetMap, loaded only when opened) ---------- */
function LockerMap({ X, current, onPick, onClose }) {
  const box = useRef(null);
  const api = useRef({});
  const [ready, setReady] = useState(false);
  const [list, setList] = useState([]);
  const [far, setFar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(current || null);
  const [q, setQ] = useState("");
  const [sugg, setSugg] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    document.documentElement.classList.add("swl-lock");
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { document.documentElement.classList.remove("swl-lock"); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  useEffect(() => {
    let dead = false, timer = 0, ac = null;
    Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([mod]) => {
      if (dead || !box.current) return;
      const L = mod.default || mod;
      const start = current?.lat ? current : WARSZAWA;
      const map = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], current ? 16 : 13);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      const marks = new Map();
      const icon = (on) => L.divIcon({ className: "", html: `<span class="lk-pin${on ? " is-on" : ""}"><i></i></span>`, iconSize: [30, 40], iconAnchor: [15, 38] });
      api.current = {
        map, L,
        mark(code) { marks.forEach((m, c) => m.setIcon(icon(c === code))); },
        load() {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            if (map.getZoom() < 12) { setFar(true); layer.clearLayers(); marks.clear(); setList([]); return; }
            setFar(false); setBusy(true);
            ac?.abort(); ac = new AbortController();
            const c = map.getCenter();
            const meters = Math.min(15000, c.distanceTo(map.getBounds().getNorthEast()));
            try {
              const pts = await lockersNear({ lat: c.lat, lng: c.lng }, { meters, limit: 400, signal: ac.signal });
              const keep = new Set(pts.map((p) => p.code));
              marks.forEach((m, code) => { if (!keep.has(code)) { layer.removeLayer(m); marks.delete(code); } });
              pts.forEach((p) => {
                if (marks.has(p.code)) return;
                const m = L.marker([p.lat, p.lng], { icon: icon(api.current.active === p.code), title: p.code, keyboard: false }).on("click", () => setActive(p));
                m.addTo(layer); marks.set(p.code, m);
              });
              setList(pts.slice(0, 40)); setErr("");
            } catch (e) { if (e.name !== "AbortError") setErr(X.down); }
            setBusy(false);
          }, 250);
        },
      };
      map.on("moveend", () => api.current.load());
      api.current.load();
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
    }).catch(() => setErr(X.down));
    return () => { dead = true; clearTimeout(timer); ac?.abort(); api.current.map?.remove(); api.current = {}; };
  }, []); // eslint-disable-line

  useEffect(() => { if (!api.current.map) return; api.current.active = active?.code; api.current.mark(active?.code); }, [active, ready]);

  /* search box: locker code → jump to it, otherwise address suggestions */
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setSugg([]); return; }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        if (isLockerCode(s)) {
          const p = await lockerByCode(s, ac.signal);
          if (p) { setSugg([]); fly(p, 17); setActive(p); return; }
        }
        setSugg(await geocode(s, ac.signal));
      } catch (e) { /* offline — keep the map */ }
    }, 400);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q]); // eslint-disable-line

  const fly = (p, z = 15) => api.current.map?.flyTo([p.lat, p.lng], z, { duration: 0.8 });
  const goPlace = (p) => { setSugg([]); setQ(p.label); fly(p, p.city ? 13 : 16); };
  const near = () => myPosition().then((p) => fly(p, 15)).catch(() => setErr(X.geoErr));
  const choose = (p) => { setActive(p); fly(p, Math.max(16, api.current.map?.getZoom() || 16)); };

  return (
    <div className="lk-modal" data-lenis-prevent role="dialog" aria-modal="true" aria-label={X.mapT}>
      <div className="lk-modal__bg" onClick={onClose} />
      <div className="lk-modal__box">
        <header className="lk-modal__head">
          <b>{X.mapT}</b>
          <div className="lk-search lk-search--map">
            <SearchIcon />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={X.ph} aria-label={X.ph} onKeyDown={(e) => e.key === "Enter" && sugg[0] && goPlace(sugg[0])} />
            <button type="button" className="lk-near" onClick={near} title={X.near}><GpsIcon /><span>{X.near}</span></button>
            {sugg.length > 0 && (
              <ul className="lk-sugg">{sugg.map((p) => <li key={p.label}><button type="button" onClick={() => goPlace(p)}>{p.label}</button></li>)}</ul>
            )}
          </div>
          <button type="button" className="lk-x" onClick={onClose} aria-label={X.close}>×</button>
        </header>
        <div className="lk-modal__body">
          <aside className="lk-side">
            <span className="lk-side__h">{X.inView}{busy && <i className="lk-spin" />}</span>
            {far && <p className="lk-note">{X.zoom}</p>}
            <ul className="lk-res lk-res--side">
              {list.map((p) => (
                <li key={p.code}>
                  <button type="button" className={active?.code === p.code ? "on" : ""} onClick={() => choose(p)}>
                    <PinIcon /><span className="lk-res__t"><b>{p.code}</b><span>{addressOf(p)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="lk-mapwrap">
            <div ref={box} className="lk-map" />
            {!ready && !err && <p className="lk-map__load"><i className="lk-spin" />{X.loading}</p>}
            {far && <p className="lk-map__hint">{X.zoom}</p>}
            {err && <p className="lk-map__hint lk-map__hint--err">{err}</p>}
            {active && (
              <div className="lk-card" key={active.code}>
                <button type="button" className="lk-card__x" onClick={() => setActive(null)} aria-label={X.close}>×</button>
                <PinIcon />
                <div className="lk-card__t">
                  <b>{active.code}</b>
                  <span>{addressOf(active)}</span>
                  {active.desc && <small>{active.desc}{active.hours === "24/7" ? ` · ${X.h247}` : ""}</small>}
                </div>
                <button type="button" className="lk-card__go" onClick={() => onPick(active)}>{X.pick}<span className="btn__arrow">›</span></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- icons ---------- */
const PinIcon = () => (<svg className="lk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z" fill="currentColor" /><rect x="8.6" y="6.6" width="6.8" height="6.8" fill="#fff" /><path d="M8.6 10h6.8M12 6.6v6.8" stroke="currentColor" strokeWidth="1.2" /></svg>);
const SearchIcon = () => (<svg className="lk-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" strokeLinecap="square" /></svg>);
const MapIcon = () => (<svg className="lk-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" strokeLinejoin="round" /><path d="M9 4v13.5M15 6.5V20" /></svg>);
const GpsIcon = () => (<svg className="lk-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" /></svg>);
