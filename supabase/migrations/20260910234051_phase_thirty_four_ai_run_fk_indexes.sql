create index if not exists ai_runs_provider_id_idx on ai.runs(provider_id);
create index if not exists ai_runs_prompt_version_id_idx on ai.runs(prompt_version_id);
create index if not exists ai_runs_user_id_idx on ai.runs(user_id);
