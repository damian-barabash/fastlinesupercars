-- 010 — Black Week: kod BLACK = „1+1" (drugi taki sam voucher gratis).
-- Kod nie daje rabatu — przy zamówieniu z BLACK powstają DWA vouchery na te same pozycje:
-- zwykły (`orders.voucher_id`) i gratisowy (`orders.bonus_voucher_id`) z osobnym imieniem.

alter table orders
  add column if not exists bonus_code       text,   -- 'BLACK' | null (zwykłe zamówienie)
  add column if not exists bonus_for        text,   -- dla kogo drugi voucher (imię na PDF)
  add column if not exists bonus_voucher_id uuid references vouchers(id) on delete set null;

create index if not exists orders_bonus_idx on orders (created_at desc) where bonus_code is not null;

-- włącznik kodu w panelu (zakładka Black Week): '1' = działa, wszystko inne = wyłączony
insert into settings (key, value) values ('black_active', '0')
on conflict (key) do nothing;
