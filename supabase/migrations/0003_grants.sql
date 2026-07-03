-- TVinBio — table privileges for the anon/authenticated API roles.
-- RLS decides WHICH rows; these GRANTs decide whether the role may touch the
-- table at all. Reads are public; the only anon writes are live-chat post/delete.
-- Money/access tables get no anon grant — server service-role owns them.

grant usage on schema public to anon, authenticated;

grant select on
  creators, streams, videos, products, featured_products, chats, subscriptions
  to anon, authenticated;

grant insert, delete on chats to anon, authenticated;
