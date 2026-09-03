-- Vouchery kwotowe (bony do koszyka).
--
-- Dotychczas `vouchers` trzymało wyłącznie kody na konkretny przejazd (produkt + wariant),
-- realizowane przy rezerwacji terminu. Ta migracja dokłada drugi rodzaj kodu: **bon na kwotę**,
-- który klient wpisuje w koszyku i który obniża wartość zamówienia o swój nominał.
--
-- Zasady (ustalone z właścicielem):
--   * bon jest JEDNORAZOWY — po użyciu wypala się w całości, reszta nominału przepada
--     (bon 300 zł na koszyk 200 zł: odjęte 200 zł, kod zamknięty);
--   * jeśli bon pokrywa całe zamówienie, zamówienie jest realizowane bez bramki (0 zł);
--   * na jedno zamówienie działa jeden kod — albo procentowy `promo_codes`, albo bon.
--
-- Kwoty liczy wyłącznie serwer. Przeglądarka przysyła sam ciąg znaków kodu.
-- Kod jest blokowany (rezerwowany) na czas płatności, żeby ten sam bon nie opłacił
-- dwóch zamówień równolegle — rezerwacja i wypalenie idą przez funkcje SQL poniżej,
-- bo tylko tam da się to zrobić atomowo (`select … for update`).

-- ---------- kolumny ----------

alter table public.vouchers
  add column if not exists kind              text    not null default 'product',  -- product | amount
  add column if not exists amount_grosze     integer,                             -- nominał bonu (kind='amount')
  add column if not exists batch             text    not null default '',         -- partia: import/generacja
  add column if not exists note              text    not null default '',
  add column if not exists reserved_order_id uuid,                                -- blokada na czas płatności
  add column if not exists reserved_until    timestamptz;

create index if not exists vouchers_kind_idx  on public.vouchers (kind);
create index if not exists vouchers_batch_idx on public.vouchers (batch) where batch <> '';

alter table public.vouchers
  drop constraint if exists vouchers_amount_chk;
alter table public.vouchers
  add constraint vouchers_amount_chk
  check (kind <> 'amount' or (amount_grosze is not null and amount_grosze > 0));

-- Rabat zapisany wprost przy zamówieniu (do tej pory żył tylko w `notes` jako tekst).
alter table public.orders
  add column if not exists subtotal_grosze integer,
  add column if not exists discount_grosze integer not null default 0,
  add column if not exists discount_code   text,
  add column if not exists discount_kind   text;                                  -- promo | voucher

-- ---------- audyt wykorzystania bonów ----------

create table if not exists public.voucher_redemptions (
  id            uuid primary key default gen_random_uuid(),
  voucher_id    uuid not null references public.vouchers(id) on delete cascade,
  order_id      uuid not null references public.orders(id)   on delete cascade,
  amount_grosze integer not null,          -- ile realnie odjęto od zamówienia
  created_at    timestamptz not null default now(),
  unique (order_id),                       -- jedno zamówienie = najwyżej jeden bon
  unique (voucher_id)                      -- bon jednorazowy = najwyżej jedno wykorzystanie
);
alter table public.voucher_redemptions enable row level security;  -- brak polityk = tylko service role

-- ---------- hamulec na zgadywanie kodów ----------
-- Bon jest wart realne pieniądze, więc pole „kod rabatowy" nie może być darmową wyrocznią.
create table if not exists public.code_attempts (
  id   bigserial primary key,
  ip   text not null default '',
  code text not null default '',
  at   timestamptz not null default now()
);
create index if not exists code_attempts_ip_at_idx on public.code_attempts (ip, at desc);
alter table public.code_attempts enable row level security;

-- ---------- funkcje (atomowe operacje na bonie) ----------

-- Rezerwacja bonu dla zamówienia na czas płatności. Rzuca wyjątkiem z czytelnym kodem błędu.
create or replace function public.voucher_reserve(p_code text, p_order uuid, p_subtotal integer)
returns table (v_id uuid, v_code text, v_amount integer, v_applied integer)
language plpgsql security definer set search_path = public as $$
declare v public.vouchers%rowtype;
begin
  select * into v from public.vouchers
   where code = upper(btrim(p_code)) and kind = 'amount'
   for update;
  if not found                                   then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if coalesce(v.amount_grosze, 0) <= 0           then raise exception 'VOUCHER_NO_AMOUNT'; end if;
  if v.status <> 'active'                        then raise exception 'VOUCHER_USED';      end if;
  if v.valid_until < current_date                then raise exception 'VOUCHER_EXPIRED';   end if;
  if exists (select 1 from public.voucher_redemptions r where r.voucher_id = v.id)
                                                 then raise exception 'VOUCHER_USED';      end if;
  if v.reserved_order_id is not null and v.reserved_order_id <> p_order
     and v.reserved_until > now()                then raise exception 'VOUCHER_BUSY';      end if;

  update public.vouchers
     set reserved_order_id = p_order,
         reserved_until    = now() + interval '2 hours'   -- tyle mniej więcej żyje link do bramki
   where id = v.id;

  v_id := v.id; v_code := v.code; v_amount := v.amount_grosze;
  v_applied := least(v.amount_grosze, greatest(coalesce(p_subtotal, 0), 0));
  return next;
end $$;

-- Wypalenie bonu po potwierdzonej płatności (albo od razu przy zamówieniu na 0 zł).
-- Idempotentne: powtórne powiadomienie z Tpay nie zdejmie bonu drugi raz.
create or replace function public.voucher_redeem(p_order uuid)
returns table (v_code text, v_amount integer, v_status text)
language plpgsql security definer set search_path = public as $$
declare
  v   public.vouchers%rowtype;
  r   public.voucher_redemptions%rowtype;
  o   public.orders%rowtype;
  amt integer;
begin
  select * into r from public.voucher_redemptions where order_id = p_order;
  if found then
    select * into v from public.vouchers where id = r.voucher_id;
    v_code := v.code; v_amount := r.amount_grosze; v_status := 'already';
    return next; return;
  end if;

  select * into o from public.orders where id = p_order;
  if not found then v_status := 'no-order'; return next; return; end if;
  if coalesce(o.discount_kind, '') <> 'voucher' or coalesce(o.discount_grosze, 0) <= 0 then
    v_status := 'no-voucher'; return next; return;
  end if;

  -- normalnie bon jest zarezerwowany dla tego zamówienia; gdy rezerwacja zdążyła wygasnąć
  -- (klient zapłacił po dwóch godzinach), bierzemy go po kodzie zapisanym przy zamówieniu
  select * into v from public.vouchers
   where kind = 'amount'
     and (reserved_order_id = p_order or code = upper(coalesce(o.discount_code, '')))
   order by (reserved_order_id = p_order) desc
   limit 1
   for update;
  if not found then v_status := 'not-found'; return next; return; end if;

  if v.status <> 'active'
     or exists (select 1 from public.voucher_redemptions x where x.voucher_id = v.id) then
    -- ktoś w międzyczasie wykorzystał kod: zamówienie i tak jest opłacone, tylko to logujemy
    v_code := v.code; v_status := 'conflict'; return next; return;
  end if;

  amt := least(coalesce(v.amount_grosze, 0), o.discount_grosze);
  insert into public.voucher_redemptions (voucher_id, order_id, amount_grosze)
       values (v.id, p_order, amt);
  update public.vouchers
     set status = 'used', used_at = now(), order_id = p_order,
         reserved_order_id = null, reserved_until = null
   where id = v.id;

  v_code := v.code; v_amount := amt; v_status := 'redeemed';
  return next;
end $$;

-- Zwolnienie rezerwacji (nieudana/porzucona płatność). Wygasłe rezerwacje i tak zwalniają się same.
create or replace function public.voucher_release(p_order uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.vouchers
     set reserved_order_id = null, reserved_until = null
   where reserved_order_id = p_order
     and status = 'active'
     and not exists (select 1 from public.voucher_redemptions r where r.voucher_id = vouchers.id);
  get diagnostics n = row_count;
  return n;
end $$;

-- SECURITY DEFINER omija RLS, więc te funkcje nie mogą być wołalne kluczem publicznym —
-- inaczej ktokolwiek mógłby spalić cudzy bon jednym requestem do /rest/v1/rpc/.
revoke all on function public.voucher_reserve(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.voucher_redeem(uuid)                 from public, anon, authenticated;
revoke all on function public.voucher_release(uuid)                from public, anon, authenticated;
grant execute on function public.voucher_reserve(text, uuid, integer) to service_role;
grant execute on function public.voucher_redeem(uuid)                 to service_role;
grant execute on function public.voucher_release(uuid)                to service_role;
