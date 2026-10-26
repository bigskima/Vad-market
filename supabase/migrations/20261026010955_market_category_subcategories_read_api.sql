begin;

-- Public, read-only database-backed taxonomy for category/subcategory rails.
-- Clients can read active labels and handlers without hardcoding category maps.
create or replace function public.get_market_category_subcategories()
returns table(
  category_code text,
  code text,
  name text,
  description text,
  display_order integer,
  handler_code text,
  metadata jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select t.category_code,
         t.code,
         t.name,
         t.description,
         t.display_order,
         t.handler_code,
         t.metadata
  from market.guided_market_types t
  join market.guided_categories c on c.code = t.category_code
  where t.status = 'ACTIVE'
    and c.status = 'ACTIVE'
  order by c.display_order, t.display_order, t.name;
$function$;

revoke all on function public.get_market_category_subcategories() from public, anon;
grant execute on function public.get_market_category_subcategories() to anon, authenticated;

commit;
