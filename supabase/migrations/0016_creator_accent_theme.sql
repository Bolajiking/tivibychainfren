-- Tier-1 creator theming (design framework §8).
-- The creator's brand leads on their page: accent + constrained theme variant.
-- Customization is deliberately limited to these two columns plus the existing
-- avatar/header art — no fonts, no layout overrides.

alter table public.creators
  add column if not exists accent_color text,
  add column if not exists theme_variant text;

-- Constrain the variant to the three shipped themes; anything else is rejected
-- at the database rather than silently rendering an unknown skin.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creators_theme_variant_check'
  ) then
    alter table public.creators
      add constraint creators_theme_variant_check
      check (theme_variant is null or theme_variant in ('midnight', 'dim', 'voltage'));
  end if;
end $$;

-- Accent must be a 6-digit hex; the app additionally contrast-guards it and
-- rotates reserved hues (live-red / earn-green) out at render time.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creators_accent_color_check'
  ) then
    alter table public.creators
      add constraint creators_accent_color_check
      check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$');
  end if;
end $$;

-- Existing channels default to the shipped accent so no page renders unthemed.
update public.creators
set accent_color = '#FFB43D'
where accent_color is null;

update public.creators
set theme_variant = 'midnight'
where theme_variant is null;
