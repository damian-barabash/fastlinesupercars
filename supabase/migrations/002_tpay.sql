-- Tpay: dane transakcji przy zamówieniu.
-- Kwota do zapłaty NIGDY nie pochodzi z przeglądarki — liczy ją `shop.checkout`
-- z tabeli `products`, a webhook `tpay-notify` porównuje wpłatę z `orders.total`.
alter table public.orders
  add column if not exists tpay_id text,          -- transactionId z Tpay
  add column if not exists tpay_title text,       -- czytelny numer transakcji (TR-XXX-XXXX)
  add column if not exists payment_url text,      -- link do bramki (ważny do opłacenia)
  add column if not exists paid_amount integer,   -- realnie wpłacone grosze (z powiadomienia)
  add column if not exists payment_error text;    -- powód niepowodzenia płatności

create index if not exists orders_tpay_id_idx on public.orders (tpay_id);
