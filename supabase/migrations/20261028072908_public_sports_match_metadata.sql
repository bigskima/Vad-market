-- Expose only non-sensitive, public fixture display metadata from the server-side sports cache.
-- The cache itself remains private; clients cannot read it directly.
CREATE OR REPLACE FUNCTION public.get_public_sports_match_metadata(
  p_home_team text,
  p_away_team text,
  p_competition text DEFAULT NULL
)
RETURNS TABLE (
  home_team_crest text,
  away_team_crest text,
  starts_at timestamp with time zone,
  match_status text,
  venue text,
  source_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    nullif(pg_catalog.btrim(f.fixture->>'homeTeamCrest'), ''),
    nullif(pg_catalog.btrim(f.fixture->>'awayTeamCrest'), ''),
    nullif(f.fixture->>'startsAt', '')::timestamp with time zone,
    nullif(pg_catalog.btrim(f.fixture->>'status'), ''),
    nullif(pg_catalog.btrim(f.fixture->>'venue'), ''),
    nullif(pg_catalog.btrim(f.fixture->>'sourceName'), '')
  FROM market.sports_fixture_cache AS c
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    CASE
      WHEN pg_catalog.jsonb_typeof(c.payload->'fixtures') = 'array' THEN c.payload->'fixtures'
      ELSE '[]'::jsonb
    END
  ) AS f(fixture)
  WHERE
    pg_catalog.lower(pg_catalog.btrim(coalesce(p_home_team, ''))) <> ''
    AND pg_catalog.lower(pg_catalog.btrim(coalesce(p_away_team, ''))) <> ''
    AND pg_catalog.lower(pg_catalog.btrim(coalesce(f.fixture->>'homeTeam', ''))) = pg_catalog.lower(pg_catalog.btrim(p_home_team))
    AND pg_catalog.lower(pg_catalog.btrim(coalesce(f.fixture->>'awayTeam', ''))) = pg_catalog.lower(pg_catalog.btrim(p_away_team))
    AND (
      nullif(pg_catalog.btrim(coalesce(p_competition, '')), '') IS NULL
      OR pg_catalog.lower(pg_catalog.btrim(coalesce(f.fixture->>'competitionName', ''))) = pg_catalog.lower(pg_catalog.btrim(p_competition))
    )
  ORDER BY
    (c.expires_at > pg_catalog.statement_timestamp()) DESC NULLS LAST,
    c.fetched_at DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_public_sports_match_metadata(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_sports_match_metadata(text, text, text) TO authenticated;
