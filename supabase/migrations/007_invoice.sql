-- Dane do faktury VAT na firmę.
--
-- Klient w kroku „Dane" może zaznaczyć „Chcę fakturę na firmę" i podać NIP, nazwę firmy
-- i adres. Biuro wystawia fakturę ręcznie na podstawie tych danych (widać je w panelu
-- przy zamówieniu i w mailu „Nowe zamówienie").
--
-- `orders.invoice` (jsonb, NULL = paragon / bez faktury):
--   { "nip": "5260250274", "company": "…", "street": "…", "postal": "00-916", "city": "…" }
-- NIP zapisywany jako same cyfry, sprawdzony sumą kontrolną po stronie serwera (shop).

alter table public.orders
  add column if not exists invoice jsonb;
