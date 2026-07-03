-- TVinBio — channel profile header image. Populates the stage card when the
-- creator is OFFLINE; when the stream goes live the card switches to playback.
alter table creators add column if not exists header_url text;
