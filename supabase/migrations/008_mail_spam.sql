-- Kwarantanna spamu dla poczty przychodzącej (rezerwacje@ → biuro).
--
-- Funkcja `mail-forward` ocenia każdy list filtrem (supabase/functions/mail-forward/spam.ts).
-- Spam nie trafia do skrzynki biura — zapisujemy go tutaj, a panel (zakładka „Spam")
-- pozwala go przejrzeć i w razie pomyłki przekazać jednym kliknięciem.
-- Treść listu zostaje w Resend (ok. 30 dni) — tu tylko metadane i początek tekstu.
-- Wpisy starsze niż 90 dni kasuje sama funkcja.
--
-- Listy zaufanych / blokowanych nadawców: `settings.mail_allow` / `settings.mail_block`
-- (adresy albo domeny, po linii).

create table if not exists public.mail_spam (
  email_id    text primary key,              -- id listu w Resend (emails/receiving/{id})
  received_at timestamptz not null default now(),
  from_addr   text,
  to_addr     text,
  subject     text,
  snippet     text,                          -- początek treści (do 600 znaków)
  score       int,
  reasons     text[],
  status      text not null default 'held' check (status in ('held', 'released')),
  released_at timestamptz,
  released_by text
);

create index if not exists mail_spam_received_idx on public.mail_spam (received_at desc);

-- Tylko service role (funkcje edge). Żadnych polityk = anon nie widzi nic.
alter table public.mail_spam enable row level security;
