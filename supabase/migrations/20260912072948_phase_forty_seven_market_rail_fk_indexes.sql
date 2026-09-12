create index if not exists featured_market_settings_updated_by_idx
  on public.featured_market_settings(updated_by)
  where updated_by is not null;

create index if not exists vad_market_curations_published_by_idx
  on public.vad_market_curations(published_by)
  where published_by is not null;
