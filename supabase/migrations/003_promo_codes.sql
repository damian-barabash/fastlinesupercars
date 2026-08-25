-- Kody rabatowe: wiele kodów zamiast jednego w `settings`.
-- Każdy kod ma własny procent i minimalną kwotę; `active=false` wyłącza go bez kasowania.
-- Sprawdzanie kodu i naliczanie rabatu robi wyłącznie serwer (`shop.checkPromo` / `shop.checkout`).
create table if not exists public.promo_codes (
  code        text primary key,                       -- zawsze wielkie litery, bez spacji
  percent     integer not null check (percent between 1 and 100),
  min_grosze  integer not null default 0 check (min_grosze >= 0),
  active      boolean not null default true,
  note        text not null default '',               -- opis dla admina (np. „kampania IG 09/2026")
  created_at  timestamptz not null default now()
);
alter table public.promo_codes enable row level security;  -- brak polityk = tylko service role

-- przeniesienie dotychczasowego kodu z `settings`
insert into public.promo_codes (code, percent, min_grosze, note)
select upper(trim(c.value)), greatest(1, least(100, coalesce(nullif(p.value, '')::int, 10))), coalesce(nullif(m.value, '')::int, 0), 'baner na stronie głównej'
from settings c
left join settings p on p.key = 'promo_percent'
left join settings m on m.key = 'promo_min_grosze'
where c.key = 'promo_code' and coalesce(trim(c.value), '') <> ''
on conflict (code) do nothing;
