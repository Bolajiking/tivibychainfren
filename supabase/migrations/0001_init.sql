-- TVinBio — initial schema
-- Identity is the lowercase EVM wallet address (creator_id). Snake_case columns;
-- the app's data layer (src/lib/db/map.ts) maps these to camelCase domain types.
-- View modes: free | one-time | monthly. Money settles in USDC on Base.

-- ── Enums ───────────────────────────────────────────────────────────
do $$ begin
  create type view_mode as enum ('free', 'one-time', 'monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_type as enum ('physical', 'digital', 'merch', 'ad');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_status as enum ('active', 'sold_out', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'completed', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_kind as enum ('message', 'donation', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_status as enum ('ready', 'processing', 'not_found');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum ('payment', 'subscription', 'donation', 'order', 'other');
exception when duplicate_object then null; end $$;

-- ── creators (profiles / channels) ──────────────────────────────────
create table if not exists creators (
  creator_id        text primary key,                 -- lowercase wallet
  username          text unique not null,
  display_name      text not null,
  bio               text,
  avatar_color      text,
  avatar_url        text,
  subscriber_count  integer not null default 0,
  social_links      jsonb not null default '[]',      -- [{kind,url}]
  category          text,
  created_at        timestamptz not null default now()
);

-- ── streams (livestreams) ───────────────────────────────────────────
create table if not exists streams (
  playback_id       text primary key,
  creator_id        text not null references creators(creator_id) on delete cascade,
  title             text not null,
  description       text,
  view_mode         view_mode not null default 'free',
  amount            numeric not null default 0,
  is_active         boolean not null default false,
  viewer_count      integer not null default 0,
  thumb_color       text,
  started_at        timestamptz,
  paid_users        text[] not null default '{}',     -- wallets that unlocked
  donation_presets  numeric[] not null default '{}',
  record            boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists streams_creator_idx on streams(creator_id);
create index if not exists streams_active_idx on streams(is_active);

-- ── videos (VOD) ────────────────────────────────────────────────────
create table if not exists videos (
  playback_id   text primary key,
  creator_id    text not null references creators(creator_id) on delete cascade,
  asset_name    text,
  title         text not null,
  view_mode     view_mode not null default 'free',
  amount        numeric not null default 0,
  views         integer not null default 0,
  duration_sec  integer not null default 0,
  published_at  timestamptz not null default now(),
  thumb_color   text,
  paid_users    text[] not null default '{}',
  disabled      boolean not null default false,
  status        asset_status not null default 'ready',
  created_at    timestamptz not null default now()
);
create index if not exists videos_creator_idx on videos(creator_id);

-- ── products (store) ────────────────────────────────────────────────
create table if not exists products (
  id            text primary key,
  playback_id   text,
  creator_id    text not null references creators(creator_id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric not null default 0,
  currency      text not null default 'USDC',
  image_color   text,
  image_url     text,
  product_type  product_type not null default 'merch',
  inventory     integer not null default 0,
  subs_only     boolean not null default false,
  status        product_status not null default 'active',
  created_at    timestamptz not null default now()
);
create index if not exists products_creator_idx on products(creator_id);
create index if not exists products_channel_idx on products(playback_id);

-- ── featured_products (live shopping pins) ──────────────────────────
create table if not exists featured_products (
  playback_id    text not null,
  product_id     text not null references products(id) on delete cascade,
  creator_id     text not null,
  sort_order     integer not null default 0,
  is_highlighted boolean not null default false,
  highlighted_at timestamptz,
  created_at     timestamptz not null default now(),
  primary key (playback_id, product_id)
);

-- ── chats (persisted live chat mirror) ──────────────────────────────
create table if not exists chats (
  id             uuid primary key default gen_random_uuid(),
  stream_id      text not null,
  sender         text not null,
  wallet_address text not null,
  message        text not null,
  kind           chat_kind not null default 'message',
  amount         numeric,
  role           text,
  name_color     text,
  created_at     timestamptz not null default now()
);
create index if not exists chats_stream_idx on chats(stream_id, created_at);

-- ── subscriptions (per-subscriber access records) ──────────────────
create table if not exists subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          text not null,                  -- the channel owner
  subscriber_address  text not null,
  view_mode           view_mode not null,
  amount              numeric not null default 0,
  tx_hash             text,
  subscribed_at       timestamptz not null default now(),
  expires_at          timestamptz                     -- null = perpetual/one-time
);
create index if not exists subs_creator_idx on subscriptions(creator_id);
create index if not exists subs_subscriber_idx on subscriptions(subscriber_address);

-- ── orders ──────────────────────────────────────────────────────────
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  product_id        text not null,
  buyer_address     text not null,
  seller_address    text not null,
  amount            numeric not null default 0,
  tx_hash           text,
  status            order_status not null default 'pending',
  product_snapshot  jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create index if not exists orders_buyer_idx on orders(buyer_address);
create index if not exists orders_seller_idx on orders(seller_address);

-- ── notifications (creator inbox) ──────────────────────────────────
create table if not exists notifications (
  id             uuid primary key default gen_random_uuid(),
  creator_id     text not null,
  type           notification_type not null default 'other',
  title          text not null,
  message        text not null,
  wallet_address text,
  tx_hash        text,
  amount         numeric,
  read           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_creator_idx on notifications(creator_id, created_at);

-- ── creator invites (gated onboarding) ──────────────────────────────
create table if not exists creator_invite_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  is_active   boolean not null default true,
  max_uses    integer,
  used_count  integer not null default 0,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists creator_access_grants (
  creator_id   text primary key,
  invite_code  text references creator_invite_codes(code),
  granted_at   timestamptz not null default now()
);
