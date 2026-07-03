-- TVinBio — map our resources to their Livepeer ids so the key-holder proxy can
-- owner-scope per-resource reads/mutations (suspend, record toggle, key reveal).
-- Without this, an authenticated creator could act on another creator's stream
-- id. The proxy checks creator_id ownership against these columns.

alter table streams add column if not exists livepeer_id text;
alter table videos  add column if not exists livepeer_id text;

create index if not exists streams_livepeer_idx on streams(livepeer_id);
create index if not exists videos_livepeer_idx  on videos(livepeer_id);
