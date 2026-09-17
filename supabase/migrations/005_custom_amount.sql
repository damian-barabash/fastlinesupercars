-- Produkt z kwotą wybieraną przez klienta (np. „Voucher": klient wpisuje wartość, min. 200 zł).
-- `amount_min` ustawione → cena pozycji to kwota przysłana z koszyka, sprawdzona przez serwer
-- w granicach [amount_min, amount_max]; `price_from` pozostaje kwotą domyślną w formularzu.
-- NULL = zwykły produkt o stałej cenie / wariantach. Kwoty w groszach, pełne złote.
alter table public.products
  add column if not exists amount_min integer,
  add column if not exists amount_max integer;

alter table public.products drop constraint if exists products_amount_range;
alter table public.products add constraint products_amount_range check (
  amount_min is null
  or (amount_min > 0 and amount_min % 100 = 0
      and (amount_max is null or (amount_max >= amount_min and amount_max % 100 = 0)))
);

update public.products
   set amount_min = 20000, amount_max = 1000000, price_from = 89900
 where id = 'voucher';
