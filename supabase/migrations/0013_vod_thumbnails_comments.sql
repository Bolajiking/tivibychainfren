-- TVinBio — VOD thumbnails and comments.
-- Comments are public-read but server-written: signed-in viewers post through
-- /api/videos/[playbackId]/comments, which verifies Privy ownership of the
-- wallet before inserting with the service-role client.

alter table videos add column if not exists thumbnail_url text;

create table if not exists video_comments (
  id             uuid primary key default gen_random_uuid(),
  playback_id    text not null references videos(playback_id) on delete cascade,
  wallet_address text not null,
  sender         text not null,
  message        text not null,
  created_at     timestamptz not null default now()
);
create index if not exists video_comments_playback_idx on video_comments(playback_id, created_at);

alter table video_comments enable row level security;

drop policy if exists p_read on video_comments;
create policy p_read on video_comments for select using (true);

do $$ begin
  alter publication supabase_realtime add table video_comments;
exception when duplicate_object then null; end $$;

grant select on video_comments to anon, authenticated;
grant all privileges on video_comments to service_role;
