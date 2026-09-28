-- Kilka kodów w jednym zamówieniu.
--
-- Do tej pory na zamówienie działał jeden kod (procentowy albo bon). Teraz w koszyku można
-- wpisać do 5 kodów i rabaty się sumują:
--   * kody procentowe dodają się procentami od sumy koszyka (FAST 10% + LATO 5% = −15%);
--   * bony kwotowe odejmują się potem, każdy do wysokości tego, co zostało do zapłaty,
--     i każdy wypala się w całości (reszta nominału przepada — jak dotąd);
--   * rabat nigdy nie przekracza sumy koszyka.
--
-- Pełna lista zastosowanych kodów ląduje w `orders.discounts` (jsonb):
--   [{ "kind": "promo"|"voucher", "code": "FAST", "percent": 10, "amount": 30000, "discount": 2490 }, …]
-- Stare kolumny zostają dla zgodności: `discount_grosze` = suma rabatów, `discount_code` = kody
-- po przecinku, `discount_kind` = 'voucher', gdy jest choć jeden bon (od tego zależy wypalanie
-- i zwalnianie rezerwacji), inaczej 'promo'.

alter table public.orders
  add column if not exists discounts jsonb;

-- Jedno zamówienie może teraz wypalić kilka bonów. Bon nadal jest jednorazowy (unique voucher_id).
alter table public.voucher_redemptions
  drop constraint if exists voucher_redemptions_order_id_key;
create index if not exists voucher_redemptions_order_idx on public.voucher_redemptions (order_id);

-- Wypalenie WSZYSTKICH bonów zamówienia po potwierdzonej płatności. Jeden wiersz na bon.
-- Idempotentne: gdy zamówienie ma już wpisy w audycie, zwraca je ze statusem 'already'
-- (całość idzie w jednej transakcji, więc nie ma stanu „połowa bonów wypalona").
create or replace function public.voucher_redeem(p_order uuid)
returns table (v_code text, v_amount integer, v_status text)
language plpgsql security definer set search_path = public as $$
declare
  o   public.orders%rowtype;
  v   public.vouchers%rowtype;
  e   jsonb;
  amt integer;
begin
  if exists (select 1 from public.voucher_redemptions where order_id = p_order) then
    return query
      select x.code, r.amount_grosze, 'already'::text
        from public.voucher_redemptions r join public.vouchers x on x.id = r.voucher_id
       where r.order_id = p_order;
    return;
  end if;

  select * into o from public.orders where id = p_order;
  if not found then v_status := 'no-order'; return next; return; end if;

  -- lista bonów: z `discounts`, a dla zamówień sprzed tej migracji — z pojedynczego kodu
  for e in
    select d from jsonb_array_elements(coalesce(o.discounts, '[]'::jsonb)) d where d->>'kind' = 'voucher'
    union all
    select jsonb_build_object('code', o.discount_code, 'discount', o.discount_grosze)
     where o.discounts is null and coalesce(o.discount_kind, '') = 'voucher' and coalesce(o.discount_grosze, 0) > 0
  loop
    -- normalnie bon jest zarezerwowany dla tego zamówienia; gdy rezerwacja wygasła
    -- (klient zapłacił po dwóch godzinach), bierzemy go po samym kodzie
    select * into v from public.vouchers
     where kind = 'amount' and code = upper(coalesce(e->>'code', ''))
     for update;
    if not found then
      v_code := e->>'code'; v_amount := null; v_status := 'not-found'; return next; continue;
    end if;

    if v.status <> 'active'
       or exists (select 1 from public.voucher_redemptions x where x.voucher_id = v.id) then
      -- ktoś w międzyczasie wykorzystał kod: zamówienie i tak jest opłacone, tylko to logujemy
      v_code := v.code; v_amount := null; v_status := 'conflict'; return next; continue;
    end if;

    amt := least(coalesce(v.amount_grosze, 0), greatest(coalesce((e->>'discount')::integer, 0), 0));
    insert into public.voucher_redemptions (voucher_id, order_id, amount_grosze)
         values (v.id, p_order, amt);
    update public.vouchers
       set status = 'used', used_at = now(), order_id = p_order,
           reserved_order_id = null, reserved_until = null
     where id = v.id;

    v_code := v.code; v_amount := amt; v_status := 'redeemed';
    return next;
  end loop;

  if not found then v_status := 'no-voucher'; return next; end if;
end $$;

revoke all on function public.voucher_redeem(uuid) from public, anon, authenticated;
grant execute on function public.voucher_redeem(uuid) to service_role;
