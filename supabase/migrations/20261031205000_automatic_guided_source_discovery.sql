-- Guided VAD public-event, transfer and sports-evidence fallback markets
-- must not require administrators to pre-enter an authoritative source URL/name.
-- The shared automatic resolver performs public source discovery after the
-- published result-checking time. Existing outcome, timing, policy, dispute and
-- settlement controls remain unchanged.

BEGIN;

DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_create_guided_market(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  ) INTO v_definition;

  -- A source name is a hint, not a settlement prerequisite. For both guided
  -- AUTOMATIC and legacy VERIFIED selections, absent source metadata uses the
  -- same public-source discovery pipeline. No manual reviewer is introduced.
  v_old := $old$  if v_checking='AUTOMATIC' and v_source_name='' then
    v_source_name:='Automatic public-source discovery';
  end if;$old$;
  v_new := $new$  if v_source_name='' then
    v_source_name:='Automatic public-source discovery';
  end if;$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find guided-market automatic source-hint default.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  -- Remove the four source-name hard stops for the VAD_REVIEW_V1 public-evidence
  -- adapter. Resolver instructions and outcome identity still remain required.
  v_old := $old$      if v_source_name='' and v_checking<>'AUTOMATIC' then
        raise exception 'Add the official result source VAD should use to verify this match.' using errcode='22023';
      end if;
$old$;
  v_definition:=replace(v_definition,v_old,'');

  v_old := $old$    if v_source_name='' and v_checking<>'AUTOMATIC' then
      raise exception 'Add the official source VAD should use to verify the transfer.' using errcode='22023';
    end if;
$old$;
  v_definition:=replace(v_definition,v_old,'');

  v_old := $old$    if v_source_name='' and v_checking<>'AUTOMATIC' then
      raise exception 'Add the official election result source VAD should use.' using errcode='22023';
    end if;
$old$;
  v_definition:=replace(v_definition,v_old,'');

  v_old := $old$    if v_source_name='' and v_checking<>'AUTOMATIC' then
      raise exception 'Add the authoritative result source VAD should use.' using errcode='22023';
    end if;
$old$;
  v_definition:=replace(v_definition,v_old,'');

  IF position('v_source_name='''' and v_checking<>''AUTOMATIC''' IN v_definition)>0 THEN
    RAISE EXCEPTION 'Guided source-name hard stops remain; refusing to install a partial resolver patch.';
  END IF;

  -- Make the generated contract honest about the shared automatic resolver.
  v_definition:=replace(
    v_definition,
    'Verify the final result from the configured authoritative source.',
    'Automatically verify the final result from a direct public record and independent corroborating evidence.'
  );
  v_definition:=replace(
    v_definition,
    'Verify the transfer from the configured authoritative source.',
    'Automatically verify the transfer from a direct public record and independent corroborating evidence.'
  );
  v_definition:=replace(
    v_definition,
    'Verify the final declared election result from the configured authoritative source.',
    'Automatically verify the declared election result from a direct public record and independent corroborating evidence.'
  );
  v_definition:=replace(
    v_definition,
    'Verify the outcome from the configured authoritative source.',
    'Automatically verify the outcome from a direct public record and independent corroborating evidence.'
  );

  EXECUTE v_definition;
END;
$patch$;

COMMIT;
