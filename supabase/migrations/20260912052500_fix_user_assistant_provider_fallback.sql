-- Keep the user-facing assistant provider chain resilient.
-- Cloudflare remains the primary provider; Gemini is the configured fallback.

update integration.providers
set status = 'ACTIVE',
    updated_at = statement_timestamp()
where code = 'GEMINI'
  and provider_type = 'AI';

update ai.providers
set status = 'ACTIVE',
    model_code = 'gemini-2.5-flash',
    updated_at = statement_timestamp()
where integration_provider_id = (
  select id
  from integration.providers
  where code = 'GEMINI'
    and provider_type = 'AI'
  limit 1
)
  and capabilities @> '["USER_ASSISTANT"]'::jsonb;
