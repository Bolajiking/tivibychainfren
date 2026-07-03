-- TVinBio — store Livepeer's own playback id alongside our resource PK.
-- Our streams.playback_id is the app's stable channel key; Livepeer assigns its
-- own playbackId at stream creation. Viewers resolve real HLS against the
-- Livepeer playback id, so we keep it next to the livepeer_id (stream id) used
-- for owner-scoped mutations. Null until a creator provisions live ingest.

alter table streams add column if not exists livepeer_playback_id text;
alter table videos  add column if not exists livepeer_playback_id text;
