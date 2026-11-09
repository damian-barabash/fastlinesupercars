-- 009 — vouchery świąteczne (/swieta-2026): kampania, dostawa (e-mail / wydruk do Paczkomatu InPost),
-- tryb testowy bez płatności. Zamówienia ze strony świątecznej to zwykłe `orders` z `campaign`.

alter table orders
  add column if not exists campaign      text,                       -- 'swieta-2026' | null (zwykły koszyk)
  add column if not exists delivery      text,                       -- 'email' | 'inpost'
  add column if not exists delivery_fee  integer not null default 0, -- grosze, wliczone w `total`
  add column if not exists delivery_data jsonb,                      -- {locker, address, phone, name}
  add column if not exists shipped_at    timestamptz,
  add column if not exists shipping_no   text,
  add column if not exists is_test       boolean not null default false;

alter table orders drop constraint if exists orders_delivery_check;
alter table orders add constraint orders_delivery_check check (delivery is null or delivery in ('email', 'inpost'));

create index if not exists orders_campaign_idx on orders (campaign, created_at desc) where campaign is not null;

-- tryb strony świątecznej: 'test' (voucher bez płatności, mail tylko do kupującego) | 'live' (Tpay)
insert into settings (key, value) values
  ('gift_mode', 'test'),
  ('gift_inpost_grosze', '5000')
on conflict (key) do nothing;
