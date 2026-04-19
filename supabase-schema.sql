create extension if not exists "pgcrypto";

create table if not exists public.creators (
  id uuid primary key,
  name text not null,
  handle text not null unique,
  x_avatar_url text,
  x_bio text,
  x_followers integer not null default 0,
  x_following integer not null default 0,
  x_tweet_count integer not null default 0,
  x_location text,
  x_verified boolean not null default false,
  x_collected_at timestamptz,
  x_pinned_tweet text,
  x_notable_followers text,
  bio text,
  region text,
  categories text[] not null default '{}',
  skill_type text,
  video_styles text[] not null default '{}',
  min_rate integer,
  max_rate integer,
  availability text,
  contact text,
  example text,
  sorsa_score integer not null default 50,
  verified_campaign boolean not null default false,
  portfolio jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creators add column if not exists x_avatar_url text;
alter table public.creators add column if not exists x_bio text;
alter table public.creators add column if not exists x_following integer not null default 0;
alter table public.creators add column if not exists x_tweet_count integer not null default 0;
alter table public.creators add column if not exists x_location text;
alter table public.creators add column if not exists x_verified boolean not null default false;
alter table public.creators add column if not exists x_collected_at timestamptz;
alter table public.creators add column if not exists x_pinned_tweet text;
alter table public.creators add column if not exists x_notable_followers text;

create table if not exists public.brands (
  id uuid primary key,
  project_name text,
  email text,
  contact text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_name text not null,
  category text,
  region text,
  budget_min integer,
  budget_max integer,
  skill_type text,
  urgency text,
  video_styles text[] not null default '{}',
  notes text,
  content_scope text,
  draft_file jsonb,
  status text not null default 'Received',
  created_at timestamptz not null default now()
);

alter table public.campaigns add column if not exists draft_file jsonb;

create table if not exists public.campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  unique (campaign_id, creator_id)
);

create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  creator_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.project_access_codes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  contact text not null,
  contact_key text not null,
  tracking_code text not null,
  project_name text,
  created_at timestamptz not null default now(),
  unique (contact_key, tracking_code)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-drafts',
  'campaign-drafts',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_creators_updated_at on public.creators;
create trigger set_creators_updated_at
before update on public.creators
for each row
execute function public.set_updated_at();

alter table public.creators enable row level security;
alter table public.brands enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_creators enable row level security;
alter table public.shortlists enable row level security;
alter table public.project_access_codes enable row level security;

drop policy if exists "Creators are publicly readable" on public.creators;
create policy "Creators are publicly readable"
on public.creators
for select
using (true);

drop policy if exists "Creators can insert own row" on public.creators;
create policy "Creators can insert own row"
on public.creators
for insert
with check (auth.uid() = id);

drop policy if exists "Creators can update own row" on public.creators;
create policy "Creators can update own row"
on public.creators
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Creators can delete own row" on public.creators;
create policy "Creators can delete own row"
on public.creators
for delete
using (auth.uid() = id);

drop policy if exists "Brands can read own row" on public.brands;
create policy "Brands can read own row"
on public.brands
for select
using (auth.uid() = id);

drop policy if exists "Brands can insert own row" on public.brands;
create policy "Brands can insert own row"
on public.brands
for insert
with check (auth.uid() = id);

drop policy if exists "Brands can update own row" on public.brands;
create policy "Brands can update own row"
on public.brands
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Brands can delete own row" on public.brands;
create policy "Brands can delete own row"
on public.brands
for delete
using (auth.uid() = id);

drop policy if exists "Brands can read own campaigns" on public.campaigns;
create policy "Brands can read own campaigns"
on public.campaigns
for select
using (brand_id = auth.uid());

drop policy if exists "Shortlisted creators can read campaign summaries" on public.campaigns;
create policy "Shortlisted creators can read campaign summaries"
on public.campaigns
for select
using (
  exists (
    select 1
    from public.campaign_creators
    where campaign_creators.campaign_id = campaigns.id
      and campaign_creators.creator_id = auth.uid()
  )
);

drop policy if exists "Brands can insert own campaigns" on public.campaigns;
create policy "Brands can insert own campaigns"
on public.campaigns
for insert
with check (brand_id = auth.uid());

drop policy if exists "Brands can update own campaigns" on public.campaigns;
create policy "Brands can update own campaigns"
on public.campaigns
for update
using (brand_id = auth.uid())
with check (brand_id = auth.uid());

drop policy if exists "Brands can delete own campaigns" on public.campaigns;
create policy "Brands can delete own campaigns"
on public.campaigns
for delete
using (brand_id = auth.uid());

drop policy if exists "Brands can read campaign creator links" on public.campaign_creators;
create policy "Brands can read campaign creator links"
on public.campaign_creators
for select
using (
  exists (
    select 1
    from public.campaigns
    where campaigns.id = campaign_creators.campaign_id
      and campaigns.brand_id = auth.uid()
  )
);

drop policy if exists "Creators can read own campaign creator links" on public.campaign_creators;
create policy "Creators can read own campaign creator links"
on public.campaign_creators
for select
using (creator_id = auth.uid());

drop policy if exists "Brands can insert campaign creator links" on public.campaign_creators;
create policy "Brands can insert campaign creator links"
on public.campaign_creators
for insert
with check (
  exists (
    select 1
    from public.campaigns
    where campaigns.id = campaign_creators.campaign_id
      and campaigns.brand_id = auth.uid()
  )
);

drop policy if exists "Brands can update campaign creator links" on public.campaign_creators;
create policy "Brands can update campaign creator links"
on public.campaign_creators
for update
using (
  exists (
    select 1
    from public.campaigns
    where campaigns.id = campaign_creators.campaign_id
      and campaigns.brand_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.campaigns
    where campaigns.id = campaign_creators.campaign_id
      and campaigns.brand_id = auth.uid()
  )
);

drop policy if exists "Brands can delete campaign creator links" on public.campaign_creators;
create policy "Brands can delete campaign creator links"
on public.campaign_creators
for delete
using (
  exists (
    select 1
    from public.campaigns
    where campaigns.id = campaign_creators.campaign_id
      and campaigns.brand_id = auth.uid()
  )
);

drop policy if exists "Brands can read own shortlists" on public.shortlists;
create policy "Brands can read own shortlists"
on public.shortlists
for select
using (brand_id = auth.uid());

drop policy if exists "Brands can insert own shortlists" on public.shortlists;
create policy "Brands can insert own shortlists"
on public.shortlists
for insert
with check (brand_id = auth.uid());

drop policy if exists "Brands can update own shortlists" on public.shortlists;
create policy "Brands can update own shortlists"
on public.shortlists
for update
using (brand_id = auth.uid())
with check (brand_id = auth.uid());

drop policy if exists "Brands can delete own shortlists" on public.shortlists;
create policy "Brands can delete own shortlists"
on public.shortlists
for delete
using (brand_id = auth.uid());

drop policy if exists "Brands can read own tracking codes" on public.project_access_codes;
create policy "Brands can read own tracking codes"
on public.project_access_codes
for select
using (brand_id = auth.uid());

drop policy if exists "Brands can insert own tracking codes" on public.project_access_codes;
create policy "Brands can insert own tracking codes"
on public.project_access_codes
for insert
with check (brand_id = auth.uid());

drop policy if exists "Brands can update own tracking codes" on public.project_access_codes;
create policy "Brands can update own tracking codes"
on public.project_access_codes
for update
using (brand_id = auth.uid())
with check (brand_id = auth.uid());

create index if not exists creators_handle_idx on public.creators (handle);
create index if not exists campaigns_brand_id_idx on public.campaigns (brand_id);
create index if not exists campaign_creators_campaign_id_idx on public.campaign_creators (campaign_id);
create index if not exists campaign_creators_creator_id_idx on public.campaign_creators (creator_id);
create index if not exists shortlists_brand_id_idx on public.shortlists (brand_id);
create index if not exists project_access_codes_brand_id_idx on public.project_access_codes (brand_id);
create index if not exists project_access_codes_lookup_idx on public.project_access_codes (contact_key, tracking_code);
