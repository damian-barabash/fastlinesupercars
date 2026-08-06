-- FASTLINESUPERCARS initial schema
create extension if not exists pgcrypto;

-- CMS content: flat key/value like FIQ (_lists/_hidden/_blocks model on top)
create table public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
create policy "content public read" on public.site_content for select using (true);

-- Products (cars + packages + voucher)
create table public.products (
  id text primary key,                -- slug: porsche-911, alpine-a110...
  name text not null,
  subtitle text default '',
  category text[] not null default '{}',
  short_specs jsonb not null default '[]',   -- [{label,value}]
  full_specs jsonb not null default '[]',
  description text default '',
  long_description text default '',
  images jsonb not null default '[]',        -- ["/img/....webp"]
  cover text default '',
  price_from integer not null default 0,     -- grosze
  variants jsonb not null default '[]',      -- [{laps:"1 okrążenie", price:24900}]
  voucher_template text default '',          -- storage path templates/<file>.jpg
  tracks text[] not null default '{}',
  sort integer not null default 100,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "products public read" on public.products for select using (active = true);

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  customer_name text not null,
  customer_email text not null,
  customer_phone text default '',
  gift_for text default '',                 -- imię obdarowanego (na voucher); pusty = kupujący
  items jsonb not null default '[]',        -- [{product_id,name,variant,price,qty}]
  total integer not null default 0,         -- grosze
  status text not null default 'pending',   -- pending | paid | cancelled
  payment_method text default 'tpay',
  paid_at timestamptz,
  voucher_id uuid,
  notes text default '',
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;

-- Vouchers
create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid references public.orders(id) on delete set null,
  recipient text not null default '',
  items_text text not null default '',      -- lines printed on the voucher
  template text not null default '',        -- storage path of the JPG used
  pdf_path text default '',                 -- storage path of generated PDF
  valid_until date not null,
  status text not null default 'active',    -- active | used | expired | cancelled
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vouchers enable row level security;
create index vouchers_code_idx on public.vouchers (code);
create index vouchers_order_idx on public.vouchers (order_id);

-- Admins
create table public.admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  pass_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Settings (RLS locked: resend key etc.)
create table public.settings (
  key text primary key,
  value text not null default ''
);
alter table public.settings enable row level security;

-- Admin sessions (token-based, like FIQ admin)
create table public.admin_sessions (
  token text primary key,
  username text not null,
  expires_at timestamptz not null
);
alter table public.admin_sessions enable row level security;
