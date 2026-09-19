do $block$
declare
  v_definition text;
  v_old text := $text$v_category:=upper(regexp_replace(coalesce(nullif(btrim(p_output->>'category'),''),nullif(btrim(v_proposal.normalized_payload->>'submitted_category'),''),'GENERAL'),'[^A-Za-z0-9]+','_','g'));$text$;
  v_new text := $text$v_category:=upper(regexp_replace(coalesce(nullif(btrim(v_proposal.normalized_payload->>'submitted_category'),''),nullif(btrim(p_output->>'category'),''),'GENERAL'),'[^A-Za-z0-9]+','_','g'));$text$;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='internal_apply_market_admission_result_unchecked'
  limit 1;

  if v_definition is null then
    raise exception 'Market admission function was not found';
  end if;
  if position(v_old in v_definition)=0 then
    raise exception 'Expected market category assignment was not found';
  end if;

  execute replace(v_definition,v_old,v_new);
end
$block$;