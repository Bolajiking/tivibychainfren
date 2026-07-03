-- ⚠️ DEV / LOCAL ONLY — DO NOT RUN AGAINST PRODUCTION ⚠️
-- This inserts demo creators/streams/etc. with deterministic mock wallet keys.
-- The production project (hlxthfkegttxkduvyosl) was intentionally purged of this
-- seed; re-running it there would re-pollute real-user data. Use only when
-- spinning up a fresh dev/local Supabase project.
--
-- TVinBio — seed data (mirrors src/lib/mock/seed.ts for dev/demo parity).
-- Wallet addresses are the app's deterministic mock keys (lowercase).

-- creators
insert into creators (creator_id, username, display_name, bio, avatar_color, subscriber_count, social_links, category) values
('0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','adaplays','Ada Plays','Late night just chatting — ask me anything.','#2b2b2b',12400,'[{"kind":"twitter","url":"https://x.com/adaplays"}]','Gaming'),
('0xtundetundetundetundetundetundetundetunde','tundefm','Tunde FM','Friday mix sessions, every week.','#242424',8800,'[]','Music'),
('0xstudkstudkstudkstudkstudkstudkstudkstudk','studiok','Studio K','Build in public.','#202020',4100,'[]','Learn'),
('0xkemikemikemikemikemikemikemikemikemikemi','kemicooks','Kemi Cooks','Lagos kitchen, live.','#211f29',18200,'[]','Learn'),
('0xseyiseyiseyiseyiseyiseyiseyiseyiseyiseyi','seyitalkstech','Seyi Talks Tech','Tech, simply.','#1d2230',9400,'[]','Learn'),
('0xlagoslagoslagoslagoslagoslagoslagoslagos','thelagospod','The Lagos Pod','Culture, weekly.','#262028',31000,'[]','Music'),
('0xfitadafitadafitadafitadafitadafitadafita','fitwithada','Fit With Ada','Move daily.','#1f2622',6100,'[]','Learn'),
('0xlolalolalolalolalolalolalolalolalolalola','lolawrites','Lola Writes','Morning pages.','#262626',2300,'[]','Learn')
on conflict (creator_id) do nothing;

-- streams
insert into streams (playback_id, creator_id, title, description, view_mode, amount, is_active, viewer_count, thumb_color, started_at, donation_presets, record) values
('live-ada','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','Late night just chatting','Late night just chatting — ask me anything','monthly',9,true,1240,'#1c2230',now() - interval '32 minutes','{1,5,10,20}',true),
('live-tunde','0xtundetundetundetundetundetundetundetunde','Friday mix session',null,'free',0,true,840,'#26222c',now(),'{2,5,10,25}',true),
('live-studiok','0xstudkstudkstudkstudkstudkstudkstudkstudk','Build in public',null,'free',0,true,320,'#22202a',now(),'{1,5,10,20}',false),
('live-lola','0xlolalolalolalolalolalolalolalolalolalola','Morning pages',null,'one-time',3,true,95,'#1f242a',now(),'{1,3,5,10}',true)
on conflict (playback_id) do nothing;

-- videos
insert into videos (playback_id, creator_id, asset_name, title, view_mode, amount, views, duration_sec, published_at, thumb_color, status) values
('vod-ada-1','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','clawgame','Clawgame stream replay','one-time',7,312,724,'2026-02-24T20:00:00Z','#1c2230','ready'),
('vod-ada-2','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','citywalk','City walk & chat','free',0,1100,291,'2026-02-16T18:00:00Z','#24222c','ready')
on conflict (playback_id) do nothing;

-- products
insert into products (id, playback_id, creator_id, name, description, price, image_color, product_type, inventory, subs_only, status) values
('prod-hoodie','live-ada','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','Tour hoodie','Heavyweight cotton, screen-printed in Lagos. Ships worldwide. Limited run for the Q1 tour.',40,'#2b2b2b','merch',50,false,'active'),
('prod-poster','live-ada','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','Signed poster',null,25,'#26222c','merch',20,true,'active'),
('prod-stickers','live-ada','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','Sticker pack',null,12,'#211f29','merch',200,false,'active'),
('prod-cap','live-ada','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','Cap',null,30,'#1d2230','merch',75,false,'active')
on conflict (id) do nothing;

-- featured products (live shopping)
insert into featured_products (playback_id, product_id, creator_id, sort_order, is_highlighted) values
('live-ada','prod-hoodie','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa',0,true)
on conflict (playback_id, product_id) do nothing;

-- chats (live-ada)
insert into chats (stream_id, sender, wallet_address, message, kind, amount, role, name_color, created_at) values
('live-ada','kemi','0xkemikemikemikemikemikemikemikemikemikemi','go best, Ada!','donation',5,null,'#9fd3ff',now() - interval '220 seconds'),
('live-ada','tobi','0xtobitobitobitobitobitobitobitobitobitobi','this set is unreal','message',null,'viewer','#5acdff',now() - interval '180 seconds'),
('live-ada','zee','0xzeezeezeezeezeezeezeezeezeezeezeezeezeez','where''s the hoodie from','message',null,'viewer','#c8eb6d',now() - interval '120 seconds'),
('live-ada','ada','0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','linking it now!','message',null,'host','#8daaff',now() - interval '60 seconds'),
('live-ada','dami','0xdamidamidamidamidamidamidamidamidamidami','keep it kind in here','message',null,'mod','#c8eb6d',now() - interval '30 seconds');

-- notifications (Ada's inbox)
insert into notifications (creator_id, type, title, message, wallet_address, amount, created_at) values
('0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','donation','New tip','kemi tipped $5','0xkemikemikemikemikemikemikemikemikemikemi',5,now() - interval '300 seconds'),
('0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','subscription','New subscriber','seyi subscribed','0xseyiseyiseyiseyiseyiseyiseyiseyiseyiseyi',null,now() - interval '600 seconds'),
('0xadaadaadaadaadaadaadaadaadaadaadaadaadaa','order','New order','tobi bought Tour hoodie','0xtobitobitobitobitobitobitobitobitobitobi',40,now() - interval '900 seconds');

-- a demo invite code for creator onboarding
insert into creator_invite_codes (code, is_active, max_uses) values ('TVINBIO', true, 1000)
on conflict (code) do nothing;
