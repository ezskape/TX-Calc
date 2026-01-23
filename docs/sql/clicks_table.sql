create table if not exists clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  source text,
  zip_code text,
  tdu text,
  plan_type text,
  pc text,
  user_agent text,
  referrer text
);
